export type PerformanceStatus = 'OPTIMAL' | 'ACCEPTABLE' | 'LOW';

export interface PerformanceSnapshot {
  readonly instantFps: number;
  readonly averageFps: number;
  readonly frameTimeMs: number;
  readonly minFps: number;
  readonly maxFps: number;
  readonly sampleCount: number;
  readonly status: PerformanceStatus;
}

/**
 * Registra tiempos de renderizado y calcula métricas estables en ventana móvil
 * para evaluar los objetivos de 60 FPS (Quality) y 30 FPS (Balanced/Performance).
 */
export class PerformanceManager {
  private readonly samplesMs: number[] = [];
  private readonly maxSamples: number;
  private lastFrameMs = 0;

  public constructor(windowSize = 60) {
    if (!Number.isInteger(windowSize) || windowSize <= 0) {
      throw new RangeError('windowSize debe ser un entero positivo.');
    }
    this.maxSamples = windowSize;
  }

  public recordFrame(deltaTimeMs: number): void {
    if (!Number.isFinite(deltaTimeMs) || deltaTimeMs <= 0) {
      return;
    }

    this.lastFrameMs = deltaTimeMs;
    this.samplesMs.push(deltaTimeMs);
    if (this.samplesMs.length > this.maxSamples) {
      this.samplesMs.shift();
    }
  }

  public getSnapshot(): PerformanceSnapshot {
    if (this.samplesMs.length === 0) {
      return {
        instantFps: 0,
        averageFps: 0,
        frameTimeMs: 0,
        minFps: 0,
        maxFps: 0,
        sampleCount: 0,
        status: 'LOW',
      };
    }

    let sumMs = 0;
    let minMs = Number.POSITIVE_INFINITY;
    let maxMs = 0;

    for (const sample of this.samplesMs) {
      sumMs += sample;
      if (sample < minMs) minMs = sample;
      if (sample > maxMs) maxMs = sample;
    }

    const avgMs = sumMs / this.samplesMs.length;
    const averageFps = 1000 / avgMs;
    const instantFps = 1000 / this.lastFrameMs;
    const minFps = 1000 / maxMs;
    const maxFps = 1000 / minMs;

    return {
      instantFps,
      averageFps,
      frameTimeMs: avgMs,
      minFps,
      maxFps,
      sampleCount: this.samplesMs.length,
      status: PerformanceManager.classifyStatus(averageFps),
    };
  }

  public reset(): void {
    this.samplesMs.length = 0;
    this.lastFrameMs = 0;
  }

  private static classifyStatus(averageFps: number): PerformanceStatus {
    if (averageFps >= 55) {
      return 'OPTIMAL';
    }
    if (averageFps >= 28) {
      return 'ACCEPTABLE';
    }
    return 'LOW';
  }
}
