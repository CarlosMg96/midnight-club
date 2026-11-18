import type { VehiclePhysicsState } from '../physics/VehiclePhysics';

export type RaceAudioEvent =
  'NONE' | 'COUNTDOWN_TICK' | 'COUNTDOWN_GO' | 'CHECKPOINT' | 'FINISH_WIN' | 'FINISH_LOSE';

interface WindowWithWebkitAudio extends Window {
  readonly AudioContext?: typeof AudioContext;
  readonly webkitAudioContext?: typeof AudioContext;
}

/**
 * Sintetizador de audio procedural vía Web Audio API sin dependencias de archivos externos.
 * Genera en tiempo real sonido de motor acoplado a RPM, cambios de marcha, derrape de llantas,
 * turbina de nitro, sirena policial, impactos de choque y avisos de carrera.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private screechSource: AudioBufferSourceNode | null = null;
  private screechGain: GainNode | null = null;
  private nitroOsc: OscillatorNode | null = null;
  private nitroGain: GainNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;

  private muted = false;
  private initialized = false;
  private disposed = false;
  private lastGear = 'N';
  private prevImpact = 0;
  private crashCooldown = 0;
  private sirenPhaseSec = 0;
  private wasArrested = false;

  private readonly onUnlockBound: () => void;

  public constructor() {
    this.onUnlockBound = () => {
      this.ensureAudioGraph();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => undefined);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onUnlockBound, { passive: true });
      window.addEventListener('pointerdown', this.onUnlockBound, { passive: true });
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyMasterGain();
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
  }

  public update(state: VehiclePhysicsState, raceEvent: RaceAudioEvent, dt: number): void {
    const safeDt = Math.min(Math.max(dt, 0), 0.1);
    if (this.crashCooldown > 0) {
      this.crashCooldown = Math.max(0, this.crashCooldown - safeDt);
    }

    if (this.disposed) {
      return;
    }

    if (raceEvent !== 'NONE') {
      this.playRaceEvent(raceEvent);
    }

    if (state.isArrested && !this.wasArrested) {
      this.playArrestSound();
    }
    this.wasArrested = state.isArrested;

    if (
      !this.ctx ||
      !this.engineOsc1 ||
      !this.engineOsc2 ||
      !this.engineFilter ||
      !this.engineGain ||
      !this.screechGain ||
      !this.nitroOsc ||
      !this.nitroGain ||
      !this.sirenOsc ||
      !this.sirenGain
    ) {
      this.lastGear = state.gear;
      this.prevImpact = state.impactIntensity;
      return;
    }

    if (this.ctx.state !== 'running') {
      this.lastGear = state.gear;
      this.prevImpact = state.impactIntensity;
      return;
    }

    const now = this.ctx.currentTime;
    const normRpm = Math.max(0, Math.min(1, (state.rpm - 900) / 6900));
    const baseFreq = 42 + normRpm * 198;
    const speedFactor = Math.min(1, state.speedKmh / 180);

    // Motor bicapa (diente de sierra + sub-octava triangular)
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(220 + normRpm * 1650, now, 0.05);
    const targetEngineGain = this.muted ? 0 : 0.045 + normRpm * 0.08 + speedFactor * 0.02;
    this.engineGain.gain.setTargetAtTime(targetEngineGain, now, 0.05);

    // Pop breve de escape al cambiar de marcha
    if (state.gear !== this.lastGear && state.gear !== 'N' && !this.muted) {
      this.playNoiseBurst(160, 0.08, 0.065);
    }
    this.lastGear = state.gear;

    // Chirrido de llantas al derrapar o frenar fuerte a alta velocidad
    let screechLevel = 0;
    if (state.isDrifting) {
      screechLevel = 0.075 + Math.min(0.035, Math.abs(state.lateralSpeed) * 0.004);
    } else if (state.isBraking && state.speedKmh > 35) {
      screechLevel = Math.min(0.055, ((state.speedKmh - 35) / 140) * 0.055);
    }
    this.screechGain.gain.setTargetAtTime(this.muted ? 0 : screechLevel, now, 0.04);

    // Turbina de nitro
    const nitroFreq = 420 + speedFactor * 460;
    this.nitroOsc.frequency.setTargetAtTime(nitroFreq, now, 0.05);
    this.nitroGain.gain.setTargetAtTime(!this.muted && state.isNitroActive ? 0.055 : 0, now, 0.04);

    // Sirena policial LFO (620..1180 Hz)
    this.sirenPhaseSec += safeDt;
    if (!this.muted && state.isPolicePursuit) {
      const sweep = 0.5 * (1 + Math.sin(this.sirenPhaseSec * 9.5));
      this.sirenOsc.frequency.setTargetAtTime(620 + sweep * 560, now, 0.03);
      this.sirenGain.gain.setTargetAtTime(0.045, now, 0.05);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, now, 0.05);
    }

    // Impacto de colisión one-shot al detectar subida brusca de impactIntensity
    if (!this.muted && state.impactIntensity - this.prevImpact > 0.1 && this.crashCooldown <= 0) {
      this.playCrashImpact(state.impactIntensity);
      this.crashCooldown = 0.16;
    }
    this.prevImpact = state.impactIntensity;
  }

  public dispose(): void {
    this.disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onUnlockBound);
      window.removeEventListener('pointerdown', this.onUnlockBound);
    }

    if (this.engineOsc1) {
      this.engineOsc1.stop();
      this.engineOsc1.disconnect();
      this.engineOsc1 = null;
    }
    if (this.engineOsc2) {
      this.engineOsc2.stop();
      this.engineOsc2.disconnect();
      this.engineOsc2 = null;
    }
    if (this.screechSource) {
      this.screechSource.stop();
      this.screechSource.disconnect();
      this.screechSource = null;
    }
    if (this.nitroOsc) {
      this.nitroOsc.stop();
      this.nitroOsc.disconnect();
      this.nitroOsc = null;
    }
    if (this.sirenOsc) {
      this.sirenOsc.stop();
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
    this.initialized = false;
  }

  private ensureAudioGraph(): void {
    if (this.initialized || this.disposed || typeof window === 'undefined') {
      return;
    }
    const win = window as WindowWithWebkitAudio;
    const AudioCtxCtor = win.AudioContext ?? win.webkitAudioContext;
    if (!AudioCtxCtor) {
      return;
    }

    const ctx = new AudioCtxCtor();
    const masterGain = ctx.createGain();
    masterGain.gain.value = this.muted ? 0 : 0.72;
    masterGain.connect(ctx.destination);

    // Canal de motor
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 240;
    engineFilter.Q.value = 2.4;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;

    const engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 46;

    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'triangle';
    engineOsc2.frequency.value = 23;

    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);

    engineOsc1.start();
    engineOsc2.start();

    // Canal de ruido de derrape
    const noiseBuffer = this.createWhiteNoiseBuffer(ctx, 1.5);
    const screechSource = ctx.createBufferSource();
    screechSource.buffer = noiseBuffer;
    screechSource.loop = true;

    const screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 1250;
    screechFilter.Q.value = 6.0;

    const screechGain = ctx.createGain();
    screechGain.gain.value = 0;

    screechSource.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(masterGain);
    screechSource.start();

    // Canal de turbina nitro
    const nitroOsc = ctx.createOscillator();
    nitroOsc.type = 'triangle';
    nitroOsc.frequency.value = 440;

    const nitroFilter = ctx.createBiquadFilter();
    nitroFilter.type = 'bandpass';
    nitroFilter.frequency.value = 950;
    nitroFilter.Q.value = 1.8;

    const nitroGain = ctx.createGain();
    nitroGain.gain.value = 0;

    nitroOsc.connect(nitroFilter);
    nitroFilter.connect(nitroGain);
    nitroGain.connect(masterGain);
    nitroOsc.start();

    // Canal de sirena policial
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 720;

    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;

    sirenOsc.connect(sirenGain);
    sirenGain.connect(masterGain);
    sirenOsc.start();

    this.ctx = ctx;
    this.masterGain = masterGain;
    this.engineOsc1 = engineOsc1;
    this.engineOsc2 = engineOsc2;
    this.engineFilter = engineFilter;
    this.engineGain = engineGain;
    this.screechSource = screechSource;
    this.screechGain = screechGain;
    this.nitroOsc = nitroOsc;
    this.nitroGain = nitroGain;
    this.sirenOsc = sirenOsc;
    this.sirenGain = sirenGain;
    this.initialized = true;
  }

  private applyMasterGain(): void {
    if (!this.ctx || !this.masterGain) {
      return;
    }
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.ctx.currentTime, 0.02);
  }

  private createWhiteNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private playArrestSound(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') {
      return;
    }
    const notes = [587.33, 440, 349.23, 220];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 0.24, 0.14, 'sawtooth', idx * 0.11);
    });
    this.playTone(980, 0.09, 0.11, 'sine', 0.04);
    this.playTone(720, 0.11, 0.11, 'sine', 0.16);
  }

  private playRaceEvent(event: RaceAudioEvent): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') {
      return;
    }
    if (event === 'COUNTDOWN_TICK') {
      this.playTone(440, 0.11, 0.12, 'triangle', 0);
    } else if (event === 'COUNTDOWN_GO') {
      this.playTone(880, 0.26, 0.14, 'sawtooth', 0);
      this.playTone(1320, 0.26, 0.1, 'triangle', 0);
    } else if (event === 'CHECKPOINT') {
      this.playTone(587.33, 0.1, 0.11, 'sine', 0);
      this.playTone(880, 0.18, 0.12, 'sine', 0.08);
    } else if (event === 'FINISH_WIN') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 0.22, 0.13, 'triangle', idx * 0.09);
      });
    } else if (event === 'FINISH_LOSE') {
      const notes = [440, 554.37, 659.25];
      notes.forEach((freq, idx) => {
        this.playTone(freq, 0.24, 0.11, 'sine', idx * 0.07);
      });
    }
  }

  private playTone(
    freq: number,
    durationSec: number,
    volume: number,
    type: OscillatorType,
    delaySec: number,
  ): void {
    if (!this.ctx || !this.masterGain) {
      return;
    }
    const start = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }

  private playCrashImpact(intensity: number): void {
    if (!this.ctx || !this.masterGain) {
      return;
    }
    const level = Math.max(0.2, Math.min(1, intensity));
    const start = this.ctx.currentTime;

    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(135, start);
    thudOsc.frequency.exponentialRampToValueAtTime(36, start + 0.18);

    thudGain.gain.setValueAtTime(0.24 * level, start);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);

    thudOsc.connect(thudGain);
    thudGain.connect(this.masterGain);
    thudOsc.start(start);
    thudOsc.stop(start + 0.2);

    this.playNoiseBurst(520, 0.2, 0.18 * level);
  }

  private playNoiseBurst(cutoffHz: number, durationSec: number, volume: number): void {
    if (!this.ctx || !this.masterGain) {
      return;
    }
    const start = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.createWhiteNoiseBuffer(this.ctx, durationSec);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz, start);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(start);
    src.stop(start + durationSec + 0.02);
  }
}
