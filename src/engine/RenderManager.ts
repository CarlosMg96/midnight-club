import type { AbstractEngine } from '@babylonjs/core';
import { FIXED_TIME_STEP } from '../config/GameConfig';
import type { QualityProfile } from '../config/GraphicsConfig';
import type { InputManager } from '../multiplayer/InputManager';
import type { VehiclePhysicsState } from '../physics/VehiclePhysics';
import { EngineFactory } from './EngineFactory';
import { PerformanceManager, type PerformanceSnapshot } from './PerformanceManager';
import type { SceneManager } from './SceneManager';

export type TelemetryListener = (
  snapshot: PerformanceSnapshot,
  hardwareScalingLevel: number,
  vehicleState: VehiclePhysicsState,
  elapsedSec: number,
) => void;

/**
 * Coordina el bucle de renderizado con paso de tiempo fijo para las físicas
 * independiente de la frecuencia de renderizado, redimensionado y telemetría.
 */
export class RenderManager {
  private readonly engine: AbstractEngine;
  private readonly sceneManager: SceneManager;
  private readonly performanceManager: PerformanceManager;
  private readonly inputManager: InputManager;
  private readonly onTelemetry?: TelemetryListener;
  private readonly handleResize: () => void;
  private physicsAccumulator = 0;
  private elapsedSec = 0;
  private lastHudUpdateTime = 0;
  private isRunning = false;

  public constructor(
    engine: AbstractEngine,
    sceneManager: SceneManager,
    performanceManager: PerformanceManager,
    inputManager: InputManager,
    onTelemetry?: TelemetryListener,
  ) {
    this.engine = engine;
    this.sceneManager = sceneManager;
    this.performanceManager = performanceManager;
    this.inputManager = inputManager;
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

      const frameSec = Math.min(Math.max(deltaMs / 1000, 0), 0.05);
      this.elapsedSec += frameSec;
      this.physicsAccumulator += frameSec;

      const input = this.inputManager.getDrivingInput();
      while (this.physicsAccumulator >= FIXED_TIME_STEP) {
        this.sceneManager.stepPhysics(FIXED_TIME_STEP, input);
        this.physicsAccumulator -= FIXED_TIME_STEP;
      }

      const vehicleState = this.sceneManager.syncVisuals(frameSec);
      this.sceneManager.render();

      const now = performance.now();
      if (now - this.lastHudUpdateTime >= 60) {
        this.lastHudUpdateTime = now;
        this.onTelemetry?.(
          this.performanceManager.getSnapshot(),
          this.engine.getHardwareScalingLevel(),
          vehicleState,
          this.elapsedSec,
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
    this.inputManager.dispose();
    this.sceneManager.dispose();
    this.engine.dispose();
  }
}
