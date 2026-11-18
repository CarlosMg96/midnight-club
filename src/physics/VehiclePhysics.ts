import {
  type IntersectionSignalState,
  METROPOLITAN_CORRIDORS,
  METROPOLITAN_CURVE_BARRIERS,
  METROPOLITAN_OPEN_CURVES,
  METROPOLITAN_ROUNDABOUTS,
  resolveIntersectionSignalState,
  TEST_AVENUE_CONFIG,
} from '../config/GameConfig';
import type { DrivingInputState } from '../multiplayer/InputManager';
import type { VehicleSpecs } from '../vehicles/VehicleConfig';

export type GearLabel = 'R' | 'N' | '1' | '2' | '3' | '4' | '5' | '6';

/** Descriptor dinámico de un vehículo NPC colisionable a nivel de suelo. */
export interface DynamicNpcCollider {
  readonly x: number;
  readonly z: number;
  readonly vx?: number;
  readonly vz?: number;
  readonly kind?: string;
  readonly elevated?: boolean;
  readonly onImpact?: (impulseVx: number, impulseVz: number, spinDelta: number) => void;
}

export interface SpawnPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

export interface VehiclePhysicsState {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
  readonly heading: number;
  readonly steerAngle: number;
  readonly forwardSpeed: number;
  readonly lateralSpeed: number;
  readonly speedMs: number;
  readonly speedKmh: number;
  readonly rpm: number;
  readonly gear: GearLabel;
  readonly pitchAngle: number;
  readonly rollAngle: number;
  readonly isDrifting: boolean;
  readonly isBraking: boolean;
  readonly isNitroActive: boolean;
  readonly impactIntensity: number;
  readonly damageLevel: number;
  readonly isPolicePursuit: boolean;
  readonly pursuitTimer: number;
  readonly isArrested: boolean;
  readonly arrestProgress: number;
  readonly arrestCount: number;
}

const VEHICLE_RADIUS = 1.15;
const CORRIDOR_CURB_MARGIN = 1.25;
const DEFAULT_PURSUIT_DURATION_SEC = 35;

/**
 * Simulación física arcade-sim de vehículo con paso de tiempo fijo, caja de 6 marchas,
 * transferencia de peso, derrape controlado, detección de altos en rojo y colisiones
 * bidireccionales contra tráfico e infraestructura de CDMX y Estado de México.
 */
export class VehiclePhysics {
  private x: number;
  private z: number;
  private vx = 0;
  private vz = 0;
  private heading: number;
  private steerAngle = 0;
  private pitchAngle = 0;
  private rollAngle = 0;
  private rpm = 900;
  private gear: GearLabel = 'N';
  private isDrifting = false;
  private isBraking = false;
  private isNitroActive = false;
  private impactIntensity = 0;
  private damageLevel = 0;
  private pursuitTimer = 0;
  private isArrested = false;
  private arrestProgress = 0;
  private arrestCount = 0;
  private internalElapsedSec = 0;

  public constructor(spawn: SpawnPose = TEST_AVENUE_CONFIG.playerSpawn) {
    this.x = spawn.x;
    this.z = spawn.z;
    this.heading = spawn.heading;
  }

  public reset(spawn: SpawnPose = TEST_AVENUE_CONFIG.playerSpawn): void {
    this.x = spawn.x;
    this.z = spawn.z;
    this.vx = 0;
    this.vz = 0;
    this.heading = spawn.heading;
    this.steerAngle = 0;
    this.pitchAngle = 0;
    this.rollAngle = 0;
    this.rpm = 900;
    this.gear = 'N';
    this.isDrifting = false;
    this.isBraking = false;
    this.isNitroActive = false;
    this.impactIntensity = 0;
    this.damageLevel = 0;
    this.pursuitTimer = 0;
    this.isArrested = false;
    this.arrestProgress = 0;
    this.internalElapsedSec = 0;
  }

  public triggerPolicePursuit(durationSec = DEFAULT_PURSUIT_DURATION_SEC): void {
    this.pursuitTimer = Math.max(this.pursuitTimer, durationSec);
  }

  public clearPolicePursuit(): void {
    this.pursuitTimer = 0;
  }

  public step(
    dt: number,
    input: DrivingInputState,
    specs: VehicleSpecs,
    npcPositions?: readonly DynamicNpcCollider[],
    signalOverride?: IntersectionSignalState,
  ): VehiclePhysicsState {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    if (safeDt <= 0) {
      return this.getState();
    }

    if (this.isArrested) {
      this.vx = 0;
      this.vz = 0;
      this.rpm = 900;
      this.gear = 'N';
      this.isNitroActive = false;
      this.isDrifting = false;
      this.isBraking = true;
      return this.getState();
    }

    this.internalElapsedSec += safeDt;
    this.impactIntensity = Math.max(0, this.impactIntensity - safeDt * 2.4);
    this.pursuitTimer = Math.max(0, this.pursuitTimer - safeDt);

    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    // Descompone velocidad global en ejes locales (forward = +Z local, right = +X local)
    let forwardSpeed = this.vx * sinH + this.vz * cosH;
    let lateralSpeed = this.vx * cosH - this.vz * sinH;

    // Dirección suave con reducción progresiva de ángulo a altas velocidades
    const speedRatio = Math.min(1, Math.abs(forwardSpeed) / Math.max(specs.maxSpeedMs, 1));
    const effectiveMaxSteer = specs.maxSteerAngleRad * (1 - 0.52 * speedRatio);
    const targetSteer = input.steer * effectiveMaxSteer;
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, safeDt * 11);

    // Aceleración, frenado, reversa y nitro
    this.isNitroActive = input.nitro && input.throttle > 0.1 && forwardSpeed > 1;
    const nitroBoost = this.isNitroActive ? specs.nitroMultiplier : 1.0;

    let longAccel = 0;
    this.isBraking = false;

    if (input.throttle > 0.01) {
      if (forwardSpeed < -1.0) {
        longAccel += specs.brakeDeceleration * input.throttle;
        this.isBraking = true;
      } else {
        const powerFalloff = Math.max(
          0.22,
          1 - (Math.max(0, forwardSpeed) / (specs.maxSpeedMs * nitroBoost)) * 0.72,
        );
        longAccel += specs.maxEngineAcceleration * nitroBoost * input.throttle * powerFalloff;
      }
    }

    if (input.brake > 0.01) {
      this.isBraking = true;
      if (forwardSpeed > 1.2) {
        longAccel -= specs.brakeDeceleration * input.brake;
      } else if (forwardSpeed > -18) {
        longAccel -= specs.reverseAcceleration * input.brake;
      }
    }

    if (input.handbrake) {
      this.isBraking = true;
      longAccel -= Math.sign(forwardSpeed) * specs.brakeDeceleration * 0.45;
    }

    // Resistencia aerodinámica y de rodadura
    if (Math.abs(forwardSpeed) > 0.05) {
      longAccel -= specs.aeroDrag * forwardSpeed * Math.abs(forwardSpeed);
      longAccel -= Math.sign(forwardSpeed) * specs.rollingResistance;
    } else if (input.throttle < 0.02 && input.brake < 0.02) {
      forwardSpeed = 0;
    }

    forwardSpeed += longAccel * safeDt;
    const maxAllowedForward = specs.maxSpeedMs * (this.isNitroActive ? 1.18 : 1.0);
    forwardSpeed = Math.max(-18, Math.min(maxAllowedForward, forwardSpeed));

    // Giro del vehículo acoplado a velocidad longitudinal y dirección
    if (Math.abs(forwardSpeed) > 0.25) {
      const steerSign = forwardSpeed >= 0 ? 1 : -1;
      const yawFactor = Math.min(1.15, Math.abs(forwardSpeed) / 9);
      const driftTurnBoost = input.handbrake ? 1.35 : 1.0;
      const yawRate = this.steerAngle * 3.1 * yawFactor * steerSign * driftTurnBoost;
      this.heading += yawRate * safeDt;
    }

    // Adherencia lateral y derrape controlado
    const isSliding =
      input.handbrake || (Math.abs(lateralSpeed) > 3.6 && Math.abs(forwardSpeed) > 10);
    const grip = isSliding ? specs.driftLateralGrip : specs.lateralGrip;
    lateralSpeed *= Math.exp(-grip * safeDt);
    this.isDrifting =
      (input.handbrake || Math.abs(lateralSpeed) > 2.4) && Math.abs(forwardSpeed) > 6;

    // Reconstruye vector global desde el nuevo rumbo
    const newSin = Math.sin(this.heading);
    const newCos = Math.cos(this.heading);
    this.vx = forwardSpeed * newSin + lateralSpeed * newCos;
    this.vz = forwardSpeed * newCos - lateralSpeed * newSin;

    const prevX = this.x;
    const prevZ = this.z;
    this.x += this.vx * safeDt;
    this.z += this.vz * safeDt;

    const wasPursuitActive = this.pursuitTimer > 0;
    const closestPatrolDist = this.resolveCollisions(npcPositions, wasPursuitActive);

    const activeSignal = signalOverride ?? resolveIntersectionSignalState(this.internalElapsedSec);
    this.checkRedLightViolation(prevX, prevZ, this.x, this.z, activeSignal);

    if (this.pursuitTimer > 0) {
      const speedNow = Math.hypot(this.vx, this.vz);
      if (closestPatrolDist <= 5.2 || (closestPatrolDist <= 14 && speedNow < 12.5)) {
        this.arrestProgress = Math.min(1, this.arrestProgress + safeDt * 1.15);
      } else if (closestPatrolDist > 18 && speedNow >= 14) {
        this.arrestProgress = Math.max(0, this.arrestProgress - safeDt * 0.35);
      }

      if (this.arrestProgress >= 1) {
        this.isArrested = true;
        this.arrestProgress = 1;
        this.arrestCount += 1;
        this.vx = 0;
        this.vz = 0;
        this.rpm = 900;
        this.gear = 'N';
        this.isDrifting = false;
        this.isBraking = true;
        this.isNitroActive = false;
        return this.getState();
      }
    } else {
      this.arrestProgress = 0;
    }

    // Transferencia de peso (cabceo y balanceo de suspensión)
    const targetPitch = Math.max(-0.045, Math.min(0.045, -longAccel * 0.0022));
    const targetRoll = Math.max(
      -0.055,
      Math.min(
        0.055,
        lateralSpeed * 0.009 + this.steerAngle * Math.min(1, Math.abs(forwardSpeed) / 25) * 0.05,
      ),
    );
    this.pitchAngle += (targetPitch - this.pitchAngle) * Math.min(1, safeDt * 10);
    this.rollAngle += (targetRoll - this.rollAngle) * Math.min(1, safeDt * 10);

    this.updateGearboxAndRpm(forwardSpeed, specs.maxSpeedMs, input.throttle);

    return this.getState();
  }

  public getState(): VehiclePhysicsState {
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    const forwardSpeed = this.vx * sinH + this.vz * cosH;
    const lateralSpeed = this.vx * cosH - this.vz * sinH;
    const speedMs = Math.hypot(this.vx, this.vz);

    return {
      x: this.x,
      z: this.z,
      vx: this.vx,
      vz: this.vz,
      heading: this.heading,
      steerAngle: this.steerAngle,
      forwardSpeed,
      lateralSpeed,
      speedMs,
      speedKmh: speedMs * 3.6,
      rpm: this.rpm,
      gear: this.gear,
      pitchAngle: this.pitchAngle,
      rollAngle: this.rollAngle,
      isDrifting: this.isDrifting,
      isBraking: this.isBraking,
      isNitroActive: this.isNitroActive,
      impactIntensity: this.impactIntensity,
      damageLevel: this.damageLevel,
      isPolicePursuit: this.pursuitTimer > 0 || this.isArrested,
      pursuitTimer: this.pursuitTimer,
      isArrested: this.isArrested,
      arrestProgress: this.arrestProgress,
      arrestCount: this.arrestCount,
    };
  }

  private updateGearboxAndRpm(forwardSpeed: number, maxSpeedMs: number, throttle: number): void {
    if (forwardSpeed < -0.8) {
      this.gear = 'R';
      this.rpm = Math.min(7200, 1200 + Math.abs(forwardSpeed) * 280);
      return;
    }
    if (Math.abs(forwardSpeed) < 0.6 && throttle < 0.05) {
      this.gear = 'N';
      this.rpm = 900;
      return;
    }

    const gearCount = 6;
    const normalized = Math.min(0.999, Math.max(0, forwardSpeed / Math.max(maxSpeedMs, 1)));
    const gearIndex = Math.min(gearCount, Math.floor(normalized * gearCount) + 1);
    this.gear = String(gearIndex) as GearLabel;

    const gearSpan = 1 / gearCount;
    const localProgress = (normalized - (gearIndex - 1) * gearSpan) / gearSpan;
    const baseRpm = 2200 + localProgress * 5100 + throttle * 450;
    this.rpm = Math.round(Math.max(1000, Math.min(7800, baseRpm)));
  }

  private recordImpact(closingSpeed: number, triggerPursuit: boolean): void {
    const intensity = Math.min(1, Math.max(0.08, closingSpeed / 22));
    this.impactIntensity = Math.max(this.impactIntensity, intensity);
    if (closingSpeed > 1.8) {
      const damageDelta = Math.min(28, closingSpeed * 0.9);
      this.damageLevel = Math.min(100, this.damageLevel + damageDelta);
    }
    if (triggerPursuit) {
      this.triggerPolicePursuit(DEFAULT_PURSUIT_DURATION_SEC);
    }
  }

  private applyImpactChassisShock(
    closingSpeed: number,
    nx: number,
    nz: number,
    deflectHeading: boolean,
  ): void {
    const intensity = Math.min(1, closingSpeed / 22);
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    const localFront = nx * forwardX + nz * forwardZ;
    const localSide = nx * rightX + nz * rightZ;

    this.pitchAngle = Math.max(
      -0.18,
      Math.min(0.18, this.pitchAngle + localFront * intensity * 0.14),
    );
    this.rollAngle = Math.max(-0.22, Math.min(0.22, this.rollAngle + localSide * intensity * 0.18));

    if (deflectHeading) {
      const cross = forwardX * nz - forwardZ * nx;
      this.heading += cross * intensity * 0.14;
    }
  }

  private checkRedLightViolation(
    prevX: number,
    prevZ: number,
    nextX: number,
    nextZ: number,
    signal: IntersectionSignalState,
  ): void {
    // Corredores Norte-Sur: Insurgentes/Reforma (x≈0), Periférico (-380), Zaragoza (+380)
    const inNsCorridor =
      Math.abs(nextX) < 22 || Math.abs(nextX + 380) < 22 || Math.abs(nextX - 380) < 22;
    if (inNsCorridor && signal.ns === 'RED') {
      if (this.vz > 2.5 && nextZ > prevZ) {
        for (const stopZ of [-348, 44, 352]) {
          if (prevZ < stopZ && nextZ >= stopZ) {
            this.triggerPolicePursuit(DEFAULT_PURSUIT_DURATION_SEC);
            return;
          }
        }
      } else if (this.vz < -2.5 && nextZ < prevZ) {
        for (const stopZ of [-292, 106, 408]) {
          if (prevZ > stopZ && nextZ <= stopZ) {
            this.triggerPolicePursuit(DEFAULT_PURSUIT_DURATION_SEC);
            return;
          }
        }
      }
    }

    // Corredores Este-Oeste: Chapultepec (z≈75), Xola (225), Viaducto/Valles (380), Taxqueña (-320)
    const inEwCorridor =
      Math.abs(nextZ - 75) < 22 ||
      Math.abs(nextZ - 225) < 22 ||
      Math.abs(nextZ - 380) < 22 ||
      Math.abs(nextZ + 320) < 22;
    if (inEwCorridor && signal.ew === 'RED') {
      if (this.vx > 2.5 && nextX > prevX) {
        for (const stopX of [-408, -28, 352]) {
          if (prevX < stopX && nextX >= stopX) {
            this.triggerPolicePursuit(DEFAULT_PURSUIT_DURATION_SEC);
            return;
          }
        }
      } else if (this.vx < -2.5 && nextX < prevX) {
        for (const stopX of [-352, 28, 408]) {
          if (prevX > stopX && nextX <= stopX) {
            this.triggerPolicePursuit(DEFAULT_PURSUIT_DURATION_SEC);
            return;
          }
        }
      }
    }
  }

  private resolveCollisions(
    npcPositions?: readonly DynamicNpcCollider[],
    wasPursuitActive = false,
  ): number {
    let closestPatrolDist = Number.POSITIVE_INFINITY;

    // 0. Colisión bidireccional con vehículos NPC a nivel de suelo (ignora Metro en viaducto elevado)
    if (npcPositions) {
      const npcMinDist = VEHICLE_RADIUS * 3.15;
      for (const npc of npcPositions) {
        if (npc.elevated) {
          continue;
        }
        const dx = this.x - npc.x;
        const dz = this.z - npc.z;
        const dist = Math.hypot(dx, dz);
        if (npc.kind === 'PATROL') {
          closestPatrolDist = Math.min(closestPatrolDist, dist);
        }
        if (dist < npcMinDist && dist > 0.0001) {
          const nx = dx / dist;
          const nz = dz / dist;
          this.x = npc.x + nx * npcMinDist;
          this.z = npc.z + nz * npcMinDist;

          if (npc.kind === 'PATROL') {
            this.triggerPolicePursuit(DEFAULT_PURSUIT_DURATION_SEC);
            if (wasPursuitActive) {
              this.arrestProgress = Math.min(1, this.arrestProgress + 0.56);
              this.vx *= 0.35;
              this.vz *= 0.35;
            } else {
              this.arrestProgress = Math.max(this.arrestProgress, 0.38);
              this.vx *= 0.5;
              this.vz *= 0.5;
            }
          }

          const relVx = this.vx - (npc.vx ?? 0);
          const relVz = this.vz - (npc.vz ?? 0);
          const vn = relVx * nx + relVz * nz;
          if (vn < 0) {
            const closingSpeed = -vn;
            const isHeavyNpc = npc.kind === 'METROBUS' || npc.kind === 'TRAM';
            const playerShare = isHeavyNpc ? 0.8 : 0.5;
            const npcShare = isHeavyNpc ? 0.2 : 0.5;
            const restitution = isHeavyNpc ? 0.4 : 0.45;
            const impulseMag = (1 + restitution) * closingSpeed;
            const playerDeltaV = impulseMag * playerShare;
            const npcDeltaV = impulseMag * npcShare * 1.15;

            this.vx += playerDeltaV * nx;
            this.vz += playerDeltaV * nz;
            this.vx *= 0.86;
            this.vz *= 0.86;

            this.applyImpactChassisShock(closingSpeed, nx, nz, true);

            const rawSpin = ((nx * relVz - nz * relVx) / npcMinDist) * 0.9;
            const spinDelta = Math.max(-4.5, Math.min(4.5, rawSpin));
            npc.onImpact?.(-npcDeltaV * nx, -npcDeltaV * nz, spinDelta);

            const triggerPursuit = npc.kind === 'PATROL' || closingSpeed > 7.5;
            this.recordImpact(closingSpeed, triggerPursuit);
          }
        }
      }
    }

    // 1. Colisión con las glorietas metropolitanas (Ángel, Torres de Satélite, El Coyote)
    for (const roundabout of METROPOLITAN_ROUNDABOUTS) {
      const dx = this.x - roundabout.x;
      const dz = this.z - roundabout.z;
      const dist = Math.hypot(dx, dz);
      const minDist = roundabout.collisionRadius + VEHICLE_RADIUS;

      if (dist < minDist && dist > 0.0001) {
        const nx = dx / dist;
        const nz = dz / dist;
        this.x = roundabout.x + nx * minDist;
        this.z = roundabout.z + nz * minDist;

        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          this.vx -= 1.35 * vn * nx;
          this.vz -= 1.35 * vn * nz;
          this.vx *= 0.86;
          this.vz *= 0.86;
          this.applyImpactChassisShock(-vn, nx, nz, false);
          this.recordImpact(-vn, false);
        }
      }
    }

    // 1b. Colisión con las islas deflectoras de curvas cerradas y chicanas
    for (const barrier of METROPOLITAN_CURVE_BARRIERS) {
      const dx = this.x - barrier.x;
      const dz = this.z - barrier.z;
      const dist = Math.hypot(dx, dz);
      const minDist = barrier.radius + VEHICLE_RADIUS;

      if (dist < minDist && dist > 0.0001) {
        const nx = dx / dist;
        const nz = dz / dist;
        this.x = barrier.x + nx * minDist;
        this.z = barrier.z + nz * minDist;

        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          this.vx -= 1.3 * vn * nx;
          this.vz -= 1.3 * vn * nz;
          this.vx *= 0.84;
          this.vz *= 0.84;
          this.applyImpactChassisShock(-vn, nx, nz, false);
          this.recordImpact(-vn, false);
        }
      }
    }

    // 2. Colisión con los camellones centrales de Reforma (sur y norte, dejando libre el Ángel)
    const inMedianZ = (this.z > -58 && this.z < 52) || (this.z > 98 && this.z < 205);
    const medianHalfWidth = 0.9 + VEHICLE_RADIUS * 0.85;
    if (inMedianZ && Math.abs(this.x) < medianHalfWidth) {
      const side = this.x >= 0 ? 1 : -1;
      this.x = side * medianHalfWidth;
      if (this.vx * side < 0) {
        const closing = Math.abs(this.vx);
        this.vx = -this.vx * 0.3;
        this.vz *= 0.92;
        this.applyImpactChassisShock(closing, side, 0, false);
        this.recordImpact(closing, false);
      }
    }

    // 3. Proyección a la unión continua de corredores viales CDMX + Estado de México
    let minDistSq = Number.POSITIVE_INFINITY;
    let bestX = this.x;
    let bestZ = this.z;

    for (const corridor of METROPOLITAN_CORRIDORS) {
      const clampedX = Math.max(
        corridor.minX + CORRIDOR_CURB_MARGIN,
        Math.min(corridor.maxX - CORRIDOR_CURB_MARGIN, this.x),
      );
      const clampedZ = Math.max(
        corridor.minZ + CORRIDOR_CURB_MARGIN,
        Math.min(corridor.maxZ - CORRIDOR_CURB_MARGIN, this.z),
      );
      const dx = this.x - clampedX;
      const dz = this.z - clampedZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        bestX = clampedX;
        bestZ = clampedZ;
        if (distSq === 0) {
          return closestPatrolDist;
        }
      }
    }

    for (const curve of METROPOLITAN_OPEN_CURVES) {
      const dx = this.x - curve.cx;
      const dz = this.z - curve.cz;
      const r = Math.hypot(dx, dz);
      const rawTheta = Math.atan2(dz, dx);
      const midAngle = 0.5 * (curve.startAngle + curve.endAngle);
      const halfSpan = 0.5 * (curve.endAngle - curve.startAngle);
      let delta = rawTheta - midAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const clampedTheta = midAngle + Math.max(-halfSpan, Math.min(halfSpan, delta));
      const clampedR = Math.max(
        curve.innerRadius + CORRIDOR_CURB_MARGIN,
        Math.min(curve.outerRadius - CORRIDOR_CURB_MARGIN, r),
      );
      const clampedX = curve.cx + Math.cos(clampedTheta) * clampedR;
      const clampedZ = curve.cz + Math.sin(clampedTheta) * clampedR;
      const cdx = this.x - clampedX;
      const cdz = this.z - clampedZ;
      const distSq = cdx * cdx + cdz * cdz;

      if (distSq < minDistSq) {
        minDistSq = distSq;
        bestX = clampedX;
        bestZ = clampedZ;
        if (distSq < 0.0001) {
          return closestPatrolDist;
        }
      }
    }

    if (minDistSq > 0) {
      if (Math.abs(this.x - bestX) > 0.001) {
        const pushingOutX = (this.x < bestX && this.vx < 0) || (this.x > bestX && this.vx > 0);
        const normalX = this.x < bestX ? 1 : -1;
        this.x = bestX;
        if (pushingOutX) {
          const closing = Math.abs(this.vx);
          this.vx = -this.vx * 0.35;
          this.vz *= 0.9;
          this.applyImpactChassisShock(closing, normalX, 0, false);
          this.recordImpact(closing, false);
        }
      }
      if (Math.abs(this.z - bestZ) > 0.001) {
        const pushingOutZ = (this.z < bestZ && this.vz < 0) || (this.z > bestZ && this.vz > 0);
        const normalZ = this.z < bestZ ? 1 : -1;
        this.z = bestZ;
        if (pushingOutZ) {
          const closing = Math.abs(this.vz);
          this.vz = -this.vz * 0.35;
          this.vx *= 0.9;
          this.applyImpactChassisShock(closing, 0, normalZ, false);
          this.recordImpact(closing, false);
        }
      }
    }

    return closestPatrolDist;
  }
}
