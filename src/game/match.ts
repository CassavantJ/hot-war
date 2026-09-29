import { DT } from '../sim/entities';
import { WEAPONS } from '../sim/rules';
import { createMission, type MissionDef } from '../sim/mission';
import { createGame } from '../sim/setup';
import type { GameEvent, GameSettings, Tone, World } from '../sim/world';
import { GameView } from '../view/GameView';
import { drawHud } from '../view/hud';
import { Audio, type Effect } from './audio';
import { Controller } from './controller';
import { bindInput } from './input';

export interface Message {
  id: number;
  text: string;
  tone: Tone;
  time: number;
}

export const SPEEDS = [
  { label: 'Slow', value: 0.7 },
  { label: 'Normal', value: 1 },
  { label: 'Fast', value: 1.4 },
  { label: 'Fastest', value: 2 },
] as const;

/** One skirmish: the simulation, plus its view, input and sound once it's on screen. */
export class Match {
  readonly world: World;
  readonly audio: Audio;
  readonly settings: GameSettings | null;
  readonly mission: MissionDef | null;
  view: GameView | null = null;
  controller: Controller | null = null;
  speed = 1;
  paused = false;
  messages: Message[] = [];
  /** Bumped whenever the interface should redraw. */
  version = 0;
  private hud: CanvasRenderingContext2D | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private readonly listeners = new Set<() => void>();
  private frame = 0;
  private last = 0;
  private accumulator = 0;
  private uiTimer = 0;
  private messageId = 0;
  private running = false;
  private unbind: (() => void) | null = null;
  private tabHandler: (tab: number | 'next') => void = () => undefined;
  private menuHandler: () => void = () => undefined;

  constructor(
    source: { settings: GameSettings } | { mission: MissionDef } | { world: World },
    audio: Audio,
  ) {
    if ('world' in source) {
      // A saved battle, carrying on where it was left.
      this.world = source.world;
      this.mission = source.world.mission?.def ?? null;
      this.settings = this.mission ? null : source.world.settings;
    } else if ('mission' in source) {
      this.settings = null;
      this.mission = source.mission;
      this.world = createMission(source.mission);
      // Missions open on the briefing, paused.
      this.paused = true;
    } else {
      this.settings = source.settings;
      this.mission = null;
      this.world = createGame(source.settings);
    }
    this.audio = audio;
    this.speed = 1;
  }

  /** Puts the battle on screen inside `container` and starts the clock. */
  attach(container: HTMLElement, canvas: HTMLCanvasElement, overlay: HTMLCanvasElement): void {
    const view = new GameView(canvas, this.world, this.world.local);
    if (this.mission) view.focus.set(this.mission.camera.x, this.mission.camera.z);
    const controller = new Controller(this.world, view, this.world.local);
    controller.onCue = (cue) => {
      this.audio.play(cue);
    };
    controller.onTab = this.tabHandler;
    controller.onMenu = this.menuHandler;
    this.view = view;
    this.controller = controller;
    this.overlay = overlay;
    this.hud = overlay.getContext('2d');
    this.unbind = bindInput(container, canvas, this);
    this.running = true;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
    this.notify();
    if (import.meta.env.DEV) (window as unknown as { hotwar?: Match }).hotwar = this;
  }

  detach(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.unbind?.();
    this.unbind = null;
    this.view?.dispose();
    this.view = null;
    this.controller = null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  /** Tells the interface something changed. */
  notify(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  resize(width: number, height: number, dpr: number): void {
    this.view?.resize(width, height, dpr);
    if (this.overlay) {
      this.overlay.width = Math.round(width * dpr);
      this.overlay.height = Math.round(height * dpr);
    }
    this.hud?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.notify();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /** What Q/W/E/R and Tab do: switch the sidebar's tabs. */
  setTabHandler(handler: (tab: number | 'next') => void): void {
    this.tabHandler = handler;
    if (this.controller) this.controller.onTab = handler;
  }

  /** What Escape does with nothing selected: open the menu. */
  setMenuHandler(handler: () => void): void {
    this.menuHandler = handler;
    if (this.controller) this.controller.onMenu = handler;
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    const view = this.view;
    const controller = this.controller;
    if (!view || !controller) return;
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.accumulator += real * this.speed;
      let steps = 0;
      while (this.accumulator >= DT && steps < 10) {
        this.world.tick();
        this.drain();
        this.accumulator -= DT;
        steps++;
      }
      if (steps === 10) this.accumulator = 0;
    }
    controller.update(real);
    view.render(
      this.paused ? 1 : this.accumulator / DT,
      this.paused ? 0 : real * this.speed,
      controller.placement,
    );
    if (this.hud) drawHud(this.hud, view, controller, now / 1000);
    this.uiTimer += real;
    if (this.uiTimer >= 0.12) {
      this.uiTimer = 0;
      const time = this.world.time;
      this.messages = this.messages.filter((message) => time - message.time < 9);
      this.notify();
    }
  };

  /** Loudness and stereo position for a sound at a spot on the map. */
  private place(x: number, z: number): [number, number] {
    const view = this.view;
    if (!view) return [0, 0];
    const p = view.project(x, 0, z);
    const w = view.width;
    const h = view.height;
    const outside = Math.max(0, -p.x, p.x - w, -p.y, p.y - h);
    const level = outside === 0 ? 1 : Math.max(0, 0.4 - outside / 1500);
    const pan = ((p.x / Math.max(1, w)) * 2 - 1) * 0.6;
    return [level, pan];
  }

  private sound(effect: Effect, x: number, z: number, loudness = 1): void {
    const [level, pan] = this.place(x, z);
    this.audio.play(effect, level * loudness, pan);
  }

  private drain(): void {
    const events = this.world.events;
    if (events.length === 0) return;
    this.world.events = [];
    for (const event of events) {
      this.view?.handle(event);
      this.react(event);
    }
  }

  private react(event: GameEvent): void {
    const local = this.world.local;
    switch (event.kind) {
      case 'shot':
        if (this.visible(event.from.x, event.from.z)) {
          this.sound(WEAPONS[event.weapon].sound, event.from.x, event.from.z, 0.7);
        }
        break;
      case 'impact': {
        const weapon = WEAPONS[event.weapon];
        if (!this.visible(event.at.x, event.at.z)) break;
        if (weapon.projectile === 'artillery' || weapon.projectile === 'bomb') {
          this.sound('bigExplosion', event.at.x, event.at.z, 0.8);
        } else {
          this.sound('explosion', event.at.x, event.at.z, 0.35);
        }
        break;
      }
      case 'explode':
        if (this.visible(event.at.x, event.at.z)) {
          this.sound(event.size >= 1 ? 'bigExplosion' : 'explosion', event.at.x, event.at.z, 0.8);
        }
        break;
      case 'destroyed':
        if (this.visible(event.x, event.z)) this.sound('bigExplosion', event.x, event.z);
        break;
      case 'sound':
        this.sound(event.sound, event.x, event.z);
        break;
      case 'warp':
        this.sound('warp', event.to.x, event.to.z, 0.7);
        break;
      case 'promoted': {
        const unit = this.world.unit(event.id);
        if (unit?.owner === local) this.sound('promoted', unit.x, unit.z);
        break;
      }
      case 'crate':
        if (event.player === local) {
          this.sound('crate', event.x, event.z);
          this.say(`Crate: ${event.text}`, 'good', false);
        }
        break;
      case 'eva':
        if (event.player !== local) break;
        if (event.at && this.controller) this.controller.alert = event.at;
        this.say(event.text, event.tone, true);
        break;
      default:
        break;
    }
  }

  private say(text: string, tone: Tone, aloud: boolean): void {
    this.messages = [
      ...this.messages,
      { id: ++this.messageId, text, tone, time: this.world.time },
    ].slice(-6);
    if (aloud) {
      this.audio.play('chime', 0.5);
      this.audio.say(text.replace(/\.$/, ''));
    }
  }

  private visible(x: number, z: number): boolean {
    return this.view?.visibleCell(x, z) ?? false;
  }
}
