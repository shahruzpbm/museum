/**
 * Audio engine — everything generated with WebAudio (no assets needed):
 * ambient pad, footsteps, UI clicks. Master mute + music toggle.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicGain!: GainNode;
  stepsGain!: GainNode;
  private started = false;
  muted = false;
  musicOn = true;
  stepsOn = true;
  private padNodes: (OscillatorNode | OscillatorNode[])[] = [];
  private filter?: BiquadFilterNode;

  async start() {
    if (this.started) return;
    this.started = true;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    await this.ctx.resume().catch(() => {});

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? 0.32 : 0;
    this.musicGain.connect(this.master);

    this.stepsGain = this.ctx.createGain();
    this.stepsGain.gain.value = 0.55;
    this.stepsGain.connect(this.master);

    this.buildPad();
  }

  /** Slow, soft ambient chord pad. */
  private buildPad() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 620;
    this.filter.Q.value = 0.6;
    this.filter.connect(this.musicGain);

    // three soft chords drifting
    const chords = [
      [174.6, 220, 261.6],
      [196, 246.9, 293.7],
      [164.8, 207.7, 246.9],
    ];
    chords.forEach((chord, ci) => {
      chord.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = ci % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.value = freq / 2;
        const g = ctx.createGain();
        g.gain.value = 0.0;
        osc.connect(g);
        g.connect(this.filter!);
        osc.start();
        this.padNodes.push(osc);
        // slow fade in/out per chord — LFO on gain
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.045 + ci * 0.017;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.055;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        lfo.start();
        this.padNodes.push(lfo);
      });
    });

    // gentle airy noise
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.16;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 480;
    noiseFilter.Q.value = 0.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.045;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.musicGain);
    noise.start();
    this.padNodes.push(noise);
  }

  step(run = false) {
    if (!this.ctx || !this.stepsOn || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // short filtered noise blip
    const len = 0.09;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.018));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = run ? 980 : 720;
    const g = ctx.createGain();
    g.gain.value = run ? 0.4 : 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(this.stepsGain);
    src.start(t);
    src.stop(t + len);
  }

  click(freq = 660) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.32 : 0;
  }

  setSteps(on: boolean) {
    this.stepsOn = on;
    if (this.stepsGain) this.stepsGain.gain.value = on ? 0.55 : 0;
  }
}
