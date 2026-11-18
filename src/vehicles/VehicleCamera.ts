import { ArcRotateCamera, Vector3, type Scene } from '@babylonjs/core';
import { INITIAL_CAMERA_CONFIG } from '../config/GameConfig';
import type { VehiclePhysicsState } from '../physics/VehiclePhysics';

export type CameraMode = 'CHASE_CLOSE' | 'CHASE_FAR' | 'HOOD_CAM';

const CAMERA_MODE_ORDER: readonly CameraMode[] = ['CHASE_CLOSE', 'CHASE_FAR', 'HOOD_CAM'];

const CAMERA_PRESETS: Readonly<
  Record<
    CameraMode,
    { radius: number; beta: number; targetY: number; lookAhead: number; fov: number }
  >
> = {
  CHASE_CLOSE: { radius: 6.4, beta: 1.28, targetY: 1.15, lookAhead: 1.2, fov: 0.82 },
  CHASE_FAR: { radius: 9.2, beta: 1.2, targetY: 1.35, lookAhead: 1.6, fov: 0.78 },
  HOOD_CAM: { radius: 3.8, beta: 1.5, targetY: 1.38, lookAhead: 4.3, fov: 0.92 },
};

/**
 * Cámara de persecución en tercera persona con seguimiento suave e interpolado,
 * rotación orbital opcional y modo en primera persona (cofre).
 */
export class VehicleCamera {
  public readonly camera: ArcRotateCamera;
  private mode: CameraMode = 'CHASE_CLOSE';
  private userOrbitTimeout = 0;

  public constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new ArcRotateCamera(
      'vehicle-chase-camera',
      INITIAL_CAMERA_CONFIG.alpha,
      INITIAL_CAMERA_CONFIG.beta,
      CAMERA_PRESETS.CHASE_CLOSE.radius,
      new Vector3(
        INITIAL_CAMERA_CONFIG.target.x,
        INITIAL_CAMERA_CONFIG.target.y,
        INITIAL_CAMERA_CONFIG.target.z,
      ),
      scene,
    );
    this.camera.attachControl(canvas, true);
    this.camera.minZ = 0.2;
    this.camera.fov = CAMERA_PRESETS.CHASE_CLOSE.fov;
    this.camera.inertia = 0.72;
    this.camera.wheelDeltaPercentage = 0.015;
    this.camera.lowerBetaLimit = 0.22;
    this.camera.upperBetaLimit = Math.PI / 2 - 0.04;
    this.camera.lowerRadiusLimit = 0.4;
    this.camera.upperRadiusLimit = 36;
    this.camera.keysLeft = [];
    this.camera.keysRight = [];
    this.camera.keysUp = [];
    this.camera.keysDown = [];

    canvas.addEventListener('pointerdown', () => {
      this.userOrbitTimeout = 2.5;
    });
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public cycleMode(): CameraMode {
    const nextIdx = (CAMERA_MODE_ORDER.indexOf(this.mode) + 1) % CAMERA_MODE_ORDER.length;
    this.mode = CAMERA_MODE_ORDER[nextIdx] ?? 'CHASE_CLOSE';
    const preset = CAMERA_PRESETS[this.mode];
    this.camera.radius = preset.radius;
    this.camera.beta = preset.beta;
    this.camera.fov = preset.fov;
    this.userOrbitTimeout = 0;
    return this.mode;
  }

  public setMaxDrawDistance(maxZ: number): void {
    this.camera.maxZ = maxZ;
  }

  public update(state: VehiclePhysicsState, dt: number): void {
    const preset = CAMERA_PRESETS[this.mode];
    const sinH = Math.sin(state.heading);
    const cosH = Math.cos(state.heading);

    const desiredTargetX = state.x + sinH * preset.lookAhead;
    const desiredTargetZ = state.z + cosH * preset.lookAhead;
    const desiredTargetY = preset.targetY;

    const lerpFactor = Math.min(1, dt * (this.mode === 'HOOD_CAM' ? 24 : 9));
    this.camera.target.x += (desiredTargetX - this.camera.target.x) * lerpFactor;
    this.camera.target.y += (desiredTargetY - this.camera.target.y) * lerpFactor;
    this.camera.target.z += (desiredTargetZ - this.camera.target.z) * lerpFactor;

    if (state.impactIntensity > 0.05) {
      const shakeAmp = state.impactIntensity * (this.mode === 'HOOD_CAM' ? 0.24 : 0.42);
      const t = performance.now() * 0.045;
      this.camera.target.x += Math.sin(t * 2.3) * shakeAmp;
      this.camera.target.y += Math.cos(t * 3.1) * shakeAmp * 0.55;
      this.camera.target.z += Math.cos(t * 1.9) * shakeAmp;
    }

    if (this.userOrbitTimeout > 0) {
      this.userOrbitTimeout = Math.max(0, this.userOrbitTimeout - dt);
    }

    // Cuando el coche acelera o se cumple el tiempo tras orbitar manualmente, alinea detrás del vehículo
    const shouldFollowHeading =
      this.mode === 'HOOD_CAM' || this.userOrbitTimeout <= 0 || Math.abs(state.speedMs) > 2.0;
    if (shouldFollowHeading) {
      const desiredAlpha = -Math.PI / 2 - state.heading;
      const deltaAlpha = normalizeAngleDelta(desiredAlpha - this.camera.alpha);
      const followRate = this.mode === 'HOOD_CAM' ? 20 : 5.5;
      this.camera.alpha += deltaAlpha * Math.min(1, dt * followRate);
      this.camera.beta += (preset.beta - this.camera.beta) * Math.min(1, dt * 4.5);
      this.camera.radius += (preset.radius - this.camera.radius) * Math.min(1, dt * 4.5);
    }
  }
}

function normalizeAngleDelta(angle: number): number {
  let result = angle;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}
