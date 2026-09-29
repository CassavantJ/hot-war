/**
 * An original, procedurally played soundtrack: driving drums, distorted power chords, bass
 * and a lead line, in three tracks. Patterns are 16 steps (sixteenth notes) per bar.
 *
 * Riff strings: each character is one step. Digits and a/b/c are semitones above the root
 * (a = 10, b = 11, c = 12), '-' holds the previous note, '.' is a rest.
 * Drum strings: 'x' hits, 'X' hits hard, '.' rests.
 */

interface Section {
  bars: number;
  riff?: string[];
  bass?: string[];
  lead?: string[];
  kick: string;
  snare: string;
  hat: string;
  crash?: boolean;
}

interface Track {
  name: string;
  tempo: number;
  /** MIDI note of the riff's root. */
  root: number;
  sections: Section[];
}

const FOUR = 'x...x...x...x...';
const DRIVE = 'x.x...x.x.x...x.';
const GALLOP = 'x.xxx.xxx.xxx.xx';
const BACK = '....X.......X...';
const EIGHTHS = 'x.x.x.x.x.x.x.x.';
const SIXTEENTHS = 'xxxxxxxxxxxxxxxx';
const HALF = '........X.......';

const TRACKS: Track[] = [
  {
    name: 'Iron Rain',
    tempo: 132,
    root: 40,
    sections: [
      { bars: 4, bass: ['0.0.0.0.0.0.0.0.'], kick: FOUR, snare: '................', hat: EIGHTHS },
      {
        bars: 8,
        riff: ['0.00..3.0.5.3.0.', '0.00..3.0.7-6-5-', '0.00..3.0.5.3.0.', '0.00..a-a-8-7-5-'],
        bass: ['0.00..3.0.5.3.0.', '0.00..3.0.7-6-5-', '0.00..3.0.5.3.0.', '0.00..a-a-8-7-5-'],
        kick: DRIVE,
        snare: BACK,
        hat: EIGHTHS,
        crash: true,
      },
      {
        bars: 8,
        riff: ['0-0-0-0-3-3-3-3-', '5-5-5-5-3-3-2-2-'],
        bass: ['0.0.0.0.3.3.3.3.', '5.5.5.5.3.3.2.2.'],
        lead: ['c---f---e---c---', 'a---c---7-------', 'c---f---h---f---', 'e---c---a-------'],
        kick: DRIVE,
        snare: BACK,
        hat: SIXTEENTHS,
        crash: true,
      },
      {
        bars: 4,
        riff: ['0---------------', '3-------5-------'],
        bass: ['0---------------', '3-------5-------'],
        kick: 'x...............',
        snare: HALF,
        hat: 'x...x...x...x...',
      },
    ],
  },
  {
    name: 'Border Line',
    tempo: 146,
    root: 38,
    sections: [
      { bars: 4, riff: ['0.0.0.0.0.0.0.0.'], kick: FOUR, snare: '............X.X.', hat: EIGHTHS },
      {
        bars: 8,
        riff: ['0.000.000.000.00', '3.333.333.555.55', '0.000.000.000.00', 'a.aaa.888.777.55'],
        bass: ['0.000.000.000.00', '3.333.333.555.55', '0.000.000.000.00', 'a.aaa.888.777.55'],
        kick: GALLOP,
        snare: BACK,
        hat: EIGHTHS,
        crash: true,
      },
      {
        bars: 8,
        riff: ['0.000.000.000.00', '5.555.555.333.33'],
        bass: ['0.000.000.000.00', '5.555.555.333.33'],
        lead: ['7-------8---7---', '5-------3-------', '7-------a---c---', 'a-------8---7---'],
        kick: GALLOP,
        snare: BACK,
        hat: SIXTEENTHS,
        crash: true,
      },
    ],
  },
  {
    name: 'Concrete Winter',
    tempo: 118,
    root: 33,
    sections: [
      {
        bars: 4,
        bass: ['0-------0-------'],
        kick: 'x.......x.x.....',
        snare: HALF,
        hat: 'x...x...x...x...',
      },
      {
        bars: 8,
        riff: ['0-.0-.0-3-.2-.0-', '0-.0-.0-5-.3-.2-'],
        bass: ['0-.0-.0-3-.2-.0-', '0-.0-.0-5-.3-.2-'],
        kick: 'x..x..x.x..x..x.',
        snare: BACK,
        hat: EIGHTHS,
        crash: true,
      },
      {
        bars: 8,
        riff: ['0-.0-.0-3-.2-.0-', '8-.8-.7-5-.3-.2-'],
        bass: ['0-.0-.0-3-.2-.0-', '8-.8-.7-5-.3-.2-'],
        lead: ['c-------c-e-f---', 'e-------c-------', 'f-------e-c-a---', 'c---------------'],
        kick: 'x..x..x.x..x..x.',
        snare: BACK,
        hat: SIXTEENTHS,
        crash: true,
      },
    ],
  },
];

const OFFSETS: Record<string, number> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  a: 10,
  b: 11,
  c: 12,
  e: 15,
  f: 17,
  h: 19,
};

function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** How many steps a note starting at `step` lasts (counting its '-' holds). */
function length(pattern: string, step: number): number {
  let n = 1;
  while (pattern[step + n] === '-') n++;
  return n;
}

export class Music {
  private readonly context: AudioContext;
  private readonly bus: GainNode;
  private readonly guitar: AudioNode;
  private readonly noise: AudioBuffer;
  private timer = 0;
  private track = 0;
  private section = 0;
  private bar = 0;
  private step = 0;
  private next = 0;
  private barsPlayed = 0;

  constructor(context: AudioContext, destination: AudioNode, noise: AudioBuffer, track = 0) {
    this.context = context;
    this.noise = noise;
    this.track = track % TRACKS.length;
    this.bus = context.createGain();
    this.bus.gain.value = 0.5;
    this.bus.connect(destination);
    // Power chords go through distortion, then a filter to take the fizz off.
    const drive = context.createWaveShaper();
    const curve = new Float32Array(1024);
    const k = 60;
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    drive.curve = curve;
    drive.oversample = '2x';
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    const level = context.createGain();
    level.gain.value = 0.22;
    drive.connect(tone).connect(level).connect(this.bus);
    this.guitar = drive;
  }

  get title(): string {
    return TRACKS[this.track]?.name ?? '';
  }

  setVolume(volume: number): void {
    this.bus.gain.setTargetAtTime(volume, this.context.currentTime, 0.1);
  }

  start(): void {
    if (this.timer) return;
    this.next = this.context.currentTime + 0.1;
    this.timer = window.setInterval(() => {
      this.schedule();
    }, 25);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.bus.gain.setTargetAtTime(0, this.context.currentTime, 0.2);
  }

  private schedule(): void {
    const context = this.context;
    while (this.next < context.currentTime + 0.15) {
      const track = TRACKS[this.track];
      const section = track?.sections[this.section];
      if (!track || !section) return;
      const sixteenth = 60 / track.tempo / 4;
      this.play(track, section, this.next);
      this.next += sixteenth;
      this.step++;
      if (this.step < 16) continue;
      this.step = 0;
      this.bar++;
      this.barsPlayed++;
      if (this.bar < section.bars) continue;
      this.bar = 0;
      this.section++;
      if (this.section >= track.sections.length) {
        this.section = 1;
        // Move on to the next track every few minutes.
        if (this.barsPlayed > 72) {
          this.barsPlayed = 0;
          this.section = 0;
          this.track = (this.track + 1) % TRACKS.length;
        }
      }
    }
  }

  private play(track: Track, section: Section, t: number): void {
    const step = this.step;
    const beat = 60 / track.tempo / 4;
    if (section.kick[step] !== '.' && section.kick[step] !== undefined)
      this.kick(t, section.kick[step] === 'X' ? 1 : 0.85);
    const snare = section.snare[step];
    if (snare === 'x' || snare === 'X') this.snare(t, snare === 'X' ? 0.8 : 0.5);
    if (section.hat[step] === 'x') this.hat(t, step % 4 === 2 ? 0.16 : 0.1);
    if (section.crash && this.bar === 0 && step === 0) this.crash(t);
    const riff = section.riff?.[this.bar % section.riff.length];
    const note = riff?.[step];
    if (riff && note && note in OFFSETS) {
      this.power(t, track.root + (OFFSETS[note] ?? 0), length(riff, step) * beat);
    }
    const bass = section.bass?.[this.bar % section.bass.length];
    const bassNote = bass?.[step];
    if (bass && bassNote && bassNote in OFFSETS) {
      this.bass(t, track.root - 12 + (OFFSETS[bassNote] ?? 0), length(bass, step) * beat);
    }
    const lead = section.lead?.[this.bar % section.lead.length];
    const leadNote = lead?.[step];
    if (lead && leadNote && leadNote in OFFSETS) {
      this.lead(t, track.root + 24 + (OFFSETS[leadNote] ?? 0), length(lead, step) * beat);
    }
  }

  private envelope(t: number, peak: number, attack: number, decay: number): GainNode {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return gain;
  }

  private kick(t: number, level: number): void {
    const osc = this.context.createOscillator();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const gain = this.envelope(t, level, 0.003, 0.28);
    osc.connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  private noiseHit(
    t: number,
    type: BiquadFilterType,
    frequency: number,
    level: number,
    decay: number,
  ): void {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = this.envelope(t, level, 0.002, decay);
    source.connect(filter).connect(gain).connect(this.bus);
    source.start(t, Math.random() * 0.5);
    source.stop(t + decay + 0.05);
  }

  private snare(t: number, level: number): void {
    this.noiseHit(t, 'bandpass', 1900, level, 0.18);
    const osc = this.context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const gain = this.envelope(t, level * 0.6, 0.002, 0.1);
    osc.connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  private hat(t: number, level: number): void {
    this.noiseHit(t, 'highpass', 8000, level, 0.04);
  }

  private crash(t: number): void {
    this.noiseHit(t, 'highpass', 5000, 0.22, 1.4);
  }

  /** A distorted power chord: root, fifth and octave. */
  private power(t: number, midi: number, duration: number): void {
    const context = this.context;
    const muted = duration < 0.2;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(muted ? 0.05 : 0.5, t + (muted ? 0.09 : duration * 0.6));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.03);
    gain.connect(this.guitar);
    for (const [interval, detune] of [
      [0, -6],
      [7, 5],
      [12, 3],
    ] as const) {
      const osc = context.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = frequency(midi + interval);
      osc.detune.value = detune;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + duration + 0.05);
    }
  }

  private bass(t: number, midi: number, duration: number): void {
    const context = this.context;
    const osc = context.createOscillator();
    osc.type = 'square';
    osc.frequency.value = frequency(midi);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.envelope(t, 0.32, 0.004, Math.max(0.08, duration * 0.95));
    osc.connect(filter).connect(gain).connect(this.bus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private lead(t: number, midi: number, duration: number): void {
    const context = this.context;
    const osc = context.createOscillator();
    osc.type = 'square';
    osc.frequency.value = frequency(midi);
    const vibrato = context.createOscillator();
    vibrato.frequency.value = 5.5;
    const depth = context.createGain();
    depth.gain.value = 6;
    vibrato.connect(depth).connect(osc.detune);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.8;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    gain.gain.setValueAtTime(0.16, t + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.05);
    osc.connect(filter).connect(gain).connect(this.bus);
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + duration + 0.1);
    vibrato.stop(t + duration + 0.1);
  }
}
