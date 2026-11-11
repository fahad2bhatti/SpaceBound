export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private rumble: GainNode | null = null;
  private osc: OscillatorNode | null = null;
  private droneA: OscillatorNode | null = null;
  private droneB: OscillatorNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  volume = 0.7;
  ambient = true;
  private unlocked = false;

  unlock(): void {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) this.ctx = new Ctx();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.ensure();
    this.unlocked = true;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyGains();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGains();
  }

  setAmbient(on: boolean): void {
    this.ambient = on;
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.ctx || !this.master || !this.music) return;
    const m = this.muted ? 0 : this.volume * this.volume;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.03);
    this.music.gain.setTargetAtTime(this.ambient ? 0.22 : 0, this.ctx.currentTime, 0.05);
  }

  private ensure(): void {
    if (!this.ctx || this.master) return;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.rumble = ctx.createGain();
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.rumble.connect(this.sfx);
    this.master.connect(ctx.destination);
    this.rumble.gain.value = 0;
    this.osc = ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc.frequency.value = 52;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 240;
    this.osc.connect(filter).connect(this.rumble);
    this.osc.start();
    this.droneA = ctx.createOscillator();
    this.droneB = ctx.createOscillator();
    this.droneA.type = "sine";
    this.droneB.type = "sine";
    this.droneA.frequency.value = 55;
    this.droneB.frequency.value = 82.5;
    const dg = ctx.createGain();
    dg.gain.value = 0.08;
    this.droneA.connect(dg);
    this.droneB.connect(dg);
    dg.connect(this.music);
    this.droneA.start();
    this.droneB.start();
    const n = Math.floor(ctx.sampleRate * 0.25);
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    this.applyGains();
  }

  setThrottle(amount: number): void {
    if (!this.ctx || !this.rumble || !this.osc || !this.unlocked) return;
    const a = this.muted ? 0 : Math.max(0, Math.min(1, amount));
    this.rumble.gain.setTargetAtTime(a * a * 0.22, this.ctx.currentTime, 0.06);
    this.osc.frequency.setTargetAtTime(46 + a * 80, this.ctx.currentTime, 0.06);
  }

  beep(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.07): void {
    if (!this.ctx || !this.sfx || !this.unlocked || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(this.sfx);
    o.start(now);
    o.stop(now + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  ui(): void {
    this.beep(880, 0.05, "sine", 0.04);
  }

  countdown(final: boolean): void {
    this.beep(final ? 1180 : 720, final ? 0.28 : 0.09, "square", final ? 0.07 : 0.045);
  }

  alarm(): void {
    this.beep(520, 0.18, "square", 0.05);
  }

  thud(): void {
    this.blip(70, 0.22, 0.2);
  }

  foot(): void {
    this.blip(180 + Math.random() * 80, 0.05, 0.04);
  }

  private blip(freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.sfx || !this.noise || !this.unlocked || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter).connect(g).connect(this.sfx);
    src.start(now);
    src.stop(now + dur);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  dispose(): void {
    try {
      this.osc?.stop();
      this.droneA?.stop();
      this.droneB?.stop();
      void this.ctx?.close();
    } catch {
      /* already stopped */
    }
    this.ctx = null;
  }
}
