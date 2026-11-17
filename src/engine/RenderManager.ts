import type { AbstractEngine } from '@babylonjs/core';
import type { QualityProfile } from '../config/GraphicsConfig';
import { EngineFactory } from './EngineFactory';
import { PerformanceManager, type PerformanceSnapshot } from './PerformanceManager';
import type { SceneManager } from './SceneManager';

export type TelemetryListener = (
  snapshot: PerformanceSnapshot,
  hardwareScalingLevel: number,
) => void;

/**
 * Coordina el bucle de renderizado, redimensionado del viewport y cambio de perfil
 * manteniendo desacoplado el muestreo de métricas de la capa UI.
 */
export class RenderManager {
  private readonly engine: AbstractEngine;
  private readonly sceneManager: SceneManager;
  private readonly performanceManager: PerformanceManager;
  private readonly onTelemetry?: TelemetryListener;
  private readonly handleResize: () => void;
  private lastHudUpdateTime = 0;
  private isRunning = false;

  public constructor(
    engine: AbstractEngine,
    sceneManager: SceneManager,
    performanceManager: PerformanceManager,
    onTelemetry?: TelemetryListener,
  ) {
    this.engine = engine;
    this.sceneManager = sceneManager;
    this.performanceManager = performanceManager;
    this.onTelemetry = onTelemetry;
    this.handleResize = () => {
      this.engine.resize();
    };
  }

  public start(): void {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    window.addEventListener('resize', this.handleResize);

    this.engine.runRenderLoop(() => {
      const deltaMs = this.engine.getDeltaTime();
      this.performanceManager.recordFrame(deltaMs);
      this.sceneManager.render();

      const now = performance.now();
      if (now - this.lastHudUpdateTime >= 250) {
        this.lastHudUpdateTime = now;
        this.onTelemetry?.(
          this.performanceManager.getSnapshot(),
          this.engine.getHardwareScalingLevel(),
        );
      }
    });
  }

  public setQualityProfile(profile: QualityProfile): number {
    const appliedScaling = EngineFactory.applyProfile(this.engine, profile);
    this.sceneManager.applyQualityProfile(profile);
    this.performanceManager.reset();
    return appliedScaling;
  }

  public dispose(): void {
    if (this.isRunning) {
      this.engine.stopRenderLoop();
      window.removeEventListener('resize', this.handleResize);
      this.isRunning = false;
    }
    this.sceneManager.dispose();
    this.engine.dispose();
  }
}
