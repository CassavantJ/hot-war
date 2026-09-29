import type { SoundId } from '../sim/rules';

export type Effect =
  | SoundId
  | 'explosion'
  | 'bigExplosion'
  | 'build'
  | 'sell'
  | 'deploy'
  | 'capture'
  | 'warp'
  | 'crate'
  | 'promoted'
  | 'select'
  | 'move'
  | 'attack'
  | 'error'
  | 'click'
  | 'chime';

/** Minimum gap between two plays of the same sound, so a big battle doesn't deafen. */
const GAP: Partial<Record<Effect, number>> = {
  rifle: 0.05,
  mg: 0.07,
  explosion: 0.06,
  bigExplosion: 0.12,
  flak: 0.08,
  missile: 0.08,
  cannon: 0.06,
  bigcannon: 0.08,
};

/** Every sound is synthesised here; nothing is loaded from files. */
export class Audio {
  volume = 0.55;
  voice = true;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly last = new Map<Effect, number>();
  private speaking = false;
  private readonly spoken: string[] = [];

  /** Browsers only allow sound after a click or key press. */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    try {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(context.destination);
      const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    } catch {
      this.context = null;
    }
  }

  setVoice(on: boolean): void {
    this.voice = on;
    if (!on && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
  }

  close(): void {
    void this.context?.close();
    this.context = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Plays an effect; `level` 0–1 for distance, `pan` -1–1 for left/right. */
  play(effect: Effect, level = 1, pan = 0): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || level <= 0.02 || this.volume <= 0) return;
    const now = context.currentTime;
    const gap = GAP[effect] ?? 0.03;
    if (now - (this.last.get(effect) ?? -1) < gap) return;
    this.last.set(effect, now);
    const out = context.createGain();
    out.gain.value = level;
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(master);
    const t = now;
    switch (effect) {
      case 'rifle':
        this.burst(out, t, 0.05, 'bandpass', 1800, 0.5);
        break;
      case 'mg':
        for (let i = 0; i < 3; i++) this.burst(out, t + i * 0.06, 0.04, 'bandpass', 1500, 0.4);
        break;
      case 'pistol':
        this.burst(out, t, 0.035, 'highpass', 2500, 0.6);
        break;
      case 'cannon':
        this.thump(out, t, 110, 45, 0.25, 0.7);
        this.burst(out, t, 0.18, 'lowpass', 1200, 0.5);
        break;
      case 'bigcannon':
        this.thump(out, t, 80, 30, 0.4, 0.9);
        this.burst(out, t, 0.3, 'lowpass', 900, 0.6);
        break;
      case 'flak':
        this.burst(out, t, 0.1, 'bandpass', 700, 0.5);
        this.burst(out, t + 0.07, 0.08, 'bandpass', 900, 0.35);
        break;
      case 'missile':
        this.sweep(out, t, 0.35, 900, 2600, 0.35);
        break;
      case 'rocket':
        this.sweep(out, t, 0.9, 400, 1800, 0.5);
        this.thump(out, t, 70, 40, 0.5, 0.4);
        break;
      case 'beam':
        this.tone(out, t, 'sawtooth', 1400, 250, 0.35, 0.18);
        this.tone(out, t, 'sine', 700, 180, 0.4, 0.25);
        this.burst(out, t, 0.25, 'highpass', 3000, 0.15);
        break;
      case 'flame':
        this.burst(out, t, 0.4, 'lowpass', 1100, 0.45);
        break;
      case 'bite':
        this.tone(out, t, 'sawtooth', 160, 90, 0.18, 0.3);
        break;
      case 'bomb':
        this.tone(out, t, 'sine', 1600, 500, 0.5, 0.1);
        break;
      case 'explosion':
        this.thump(out, t, 90, 30, 0.45, 0.8);
        this.burst(out, t, 0.6, 'lowpass', 900, 0.7);
        break;
      case 'bigExplosion':
        this.thump(out, t, 70, 22, 0.9, 1);
        this.burst(out, t, 1.3, 'lowpass', 700, 0.9);
        break;
      case 'build':
        this.thump(out, t, 140, 60, 0.15, 0.6);
        for (let i = 0; i < 4; i++)
          this.burst(out, t + 0.12 + i * 0.07, 0.03, 'highpass', 3000, 0.3);
        break;
      case 'sell':
        this.tone(out, t, 'square', 1300, 1300, 0.07, 0.12);
        this.tone(out, t + 0.09, 'square', 1700, 1700, 0.1, 0.12);
        break;
      case 'deploy':
        this.sweep(out, t, 0.4, 3000, 700, 0.3);
        this.thump(out, t + 0.35, 120, 50, 0.15, 0.5);
        break;
      case 'capture':
      case 'promoted':
      case 'crate':
        [523, 659, 784, 1047].forEach((f, i) => {
          this.tone(out, t + i * 0.07, 'triangle', f, f, 0.12, 0.25);
        });
        break;
      case 'warp':
        this.tone(out, t, 'sine', 300, 1800, 0.45, 0.3);
        this.tone(out, t, 'triangle', 600, 2400, 0.45, 0.15);
        break;
      case 'select':
        this.tone(out, t, 'square', 880, 880, 0.04, 0.12);
        this.tone(out, t + 0.05, 'square', 1320, 1320, 0.05, 0.1);
        break;
      case 'move':
        this.tone(out, t, 'square', 660, 990, 0.08, 0.12);
        break;
      case 'attack':
        this.tone(out, t, 'square', 520, 330, 0.1, 0.14);
        break;
      case 'error':
        this.tone(out, t, 'sawtooth', 140, 120, 0.18, 0.2);
        break;
      case 'click':
        this.tone(out, t, 'square', 1500, 1500, 0.02, 0.1);
        break;
      case 'chime':
        [660, 880, 990].forEach((f, i) => {
          this.tone(out, t + i * 0.08, 'sine', f, f, 0.14, 0.18);
        });
        break;
    }
  }

  /** Reads an announcement aloud with the browser's own speech voice. */
  say(text: string): void {
    if (!this.voice || !('speechSynthesis' in window)) return;
    if (this.spoken.length > 2) return;
    this.spoken.push(text);
    if (!this.speaking) this.speakNext();
  }

  private speakNext(): void {
    const text = this.spoken.shift();
    if (!text) {
      this.speaking = false;
      return;
    }
    this.speaking = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.08;
    utterance.pitch = 0.75;
    utterance.volume = Math.min(1, this.volume * 1.4);
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter((voice) => voice.lang.startsWith('en'));
    const pick =
      english.find((voice) => /female|zira|samantha|serena|aria|jenny/i.test(voice.name)) ??
      english[0];
    if (pick) utterance.voice = pick;
    utterance.onend = () => {
      this.speakNext();
    };
    utterance.onerror = () => {
      this.speakNext();
    };
    window.speechSynthesis.speak(utterance);
  }

  private burst(
    out: AudioNode,
    t: number,
    length: number,
    type: BiquadFilterType,
    frequency: number,
    gain: number,
  ): void {
    const context = this.context;
    if (!context || !this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, t);
    envelope.gain.exponentialRampToValueAtTime(0.001, t + length);
    source.connect(filter).connect(envelope).connect(out);
    source.start(t, Math.random() * 0.5);
    source.stop(t + length + 0.02);
  }

  private thump(
    out: AudioNode,
    t: number,
    from: number,
    to: number,
    length: number,
    gain: number,
  ): void {
    this.tone(out, t, 'sine', from, to, length, gain);
  }

  private tone(
    out: AudioNode,
    t: number,
    type: OscillatorType,
    from: number,
    to: number,
    length: number,
    gain: number,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, t);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + length);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);
    oscillator.connect(envelope).connect(out);
    oscillator.start(t);
    oscillator.stop(t + length + 0.02);
  }

  private sweep(
    out: AudioNode,
    t: number,
    length: number,
    from: number,
    to: number,
    gain: number,
  ): void {
    const context = this.context;
    if (!context || !this.noise) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(to, t + length);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(gain, t + length * 0.2);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);
    source.connect(filter).connect(envelope).connect(out);
    source.start(t, Math.random() * 0.4);
    source.stop(t + length + 0.02);
  }
}
