import {
  Color3,
  MeshBuilder,
  PBRMaterial,
  TransformNode,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import type { DynamicNpcCollider, VehiclePhysicsState } from '../physics/VehiclePhysics';
import type { RaceAudioEvent } from '../engine/AudioManager';

export type StreetRaceId = 'REFORMA_SPRINT' | 'RETO_MARQUESA' | 'CIRCUITO_ZMVM';
export type RacePhase = 'IDLE' | 'COUNTDOWN' | 'RACING' | 'FINISHED';

export interface RaceCheckpoint {
  readonly x: number;
  readonly z: number;
}

export interface StreetRaceSpec {
  readonly id: StreetRaceId;
  readonly name: string;
  readonly totalLaps: number;
  readonly spawn: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly heading: number;
  };
  readonly checkpoints: readonly RaceCheckpoint[];
}

export interface RaceSnapshot {
  readonly phase: RacePhase;
  readonly raceId: StreetRaceId;
  readonly raceName: string;
  readonly countdownSec: number;
  readonly raceElapsedSec: number;
  readonly currentLap: number;
  readonly totalLaps: number;
  readonly currentCheckpointIndex: number;
  readonly totalCheckpoints: number;
  readonly playerPosition: number;
  readonly finishPosition: number;
  readonly totalRacers: number;
  readonly activeCheckpoint: RaceCheckpoint | null;
  readonly rivalPositions: readonly RaceCheckpoint[];
  readonly audioEvent: RaceAudioEvent;
}

interface RivalAgent {
  readonly baseSpeed: number;
  readonly root: TransformNode | null;
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  speed: number;
  lap: number;
  cpIndex: number;
  finished: boolean;
  finishElapsedSec: number;
}

const STREET_RACES: readonly StreetRaceSpec[] = [
  {
    id: 'REFORMA_SPRINT',
    name: 'Sprint Reforma · Ángel – Centro',
    totalLaps: 2,
    spawn: { x: 13.5, y: 0, z: -40, heading: 0 },
    checkpoints: [
      { x: 13.5, z: 35 },
      { x: 85, z: 66 },
      { x: 240, z: 66 },
      { x: 372, z: 150 },
      { x: 180, z: 225 },
      { x: -11.5, z: 165 },
      { x: -11.5, z: -20 },
    ],
  },
  {
    id: 'RETO_MARQUESA',
    name: 'Reto La Marquesa · Curvas Abiertas',
    totalLaps: 2,
    spawn: { x: -389, y: 0, z: 40, heading: Math.PI },
    checkpoints: [
      { x: -455, z: -35 },
      { x: -395, z: -122 },
      { x: -455, z: -210 },
      { x: -380, z: -295 },
      { x: -372, z: -120 },
      { x: -372, z: 20 },
    ],
  },
  {
    id: 'CIRCUITO_ZMVM',
    name: 'Gran Premio Metropolitano CDMX – Edomex',
    totalLaps: 1,
    spawn: { x: 13.5, y: 0, z: -12, heading: 0 },
    checkpoints: [
      { x: 0, z: 220 },
      { x: 0, z: 375 },
      { x: -250, z: 375 },
      { x: -380, z: 240 },
      { x: -380, z: -180 },
      { x: -240, z: -320 },
      { x: 10, z: -320 },
      { x: 13.5, z: -40 },
    ],
  },
];

const RIVAL_COLORS: readonly string[] = ['#00e5ff', '#ff2a85', '#52ff00', '#ffb700', '#a64dff'];
const RIVAL_BASE_SPEEDS: readonly number[] = [25.5, 27.5, 29.0, 30.8, 32.5];
const CHECKPOINT_TRIGGER_RADIUS_M = 24;

function parseHexColor3(hex: string): Color3 {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  return new Color3(r, g, b);
}

function getEventPriority(event: RaceAudioEvent): number {
  switch (event) {
    case 'FINISH_WIN':
    case 'FINISH_LOSE':
      return 5;
    case 'COUNTDOWN_GO':
      return 4;
    case 'CHECKPOINT':
      return 3;
    case 'COUNTDOWN_TICK':
      return 2;
    case 'NONE':
      return 0;
  }
}

/**
 * Orquesta carreras callejeras por checkpoints en CDMX y Estado de México contra 5 rivales IA,
 * incluyendo conteo regresivo, posición en tiempo real, arcos neón 3D y cálculo de meta.
 */
export class RaceManager {
  private readonly scene: Scene | null;
  private readonly glowMeshes: AbstractMesh[] = [];
  private readonly gateRoot: TransformNode | null;
  private readonly nextBeaconRoot: TransformNode | null;
  private readonly rivals: RivalAgent[] = [];

  private activeRaceIndex = 0;
  private phase: RacePhase = 'IDLE';
  private countdownSec = 0;
  private raceElapsedSec = 0;
  private playerLap = 1;
  private playerCpIndex = 0;
  private playerPosition = 1;
  private finishPosition = 1;
  private gateSpinRad = 0;
  private queuedAudioEvent: RaceAudioEvent = 'NONE';
  private lastStepAudioEvent: RaceAudioEvent = 'NONE';

  public constructor(scene: Scene | null = null) {
    this.scene = scene;

    if (this.scene) {
      this.gateRoot = this.buildCheckpointGate(this.scene);
      this.nextBeaconRoot = this.buildNextBeacon(this.scene);
      for (let i = 0; i < RIVAL_COLORS.length; i += 1) {
        const colorHex = RIVAL_COLORS[i] ?? '#00e5ff';
        const baseSpeed = RIVAL_BASE_SPEEDS[i] ?? 28;
        this.rivals.push({
          baseSpeed,
          root: this.buildRivalCar(this.scene, i, colorHex),
          x: 0,
          z: 0,
          vx: 0,
          vz: 0,
          heading: 0,
          speed: 0,
          lap: 1,
          cpIndex: 0,
          finished: false,
          finishElapsedSec: 0,
        });
      }
      this.setVisualsVisible(false);
    } else {
      this.gateRoot = null;
      this.nextBeaconRoot = null;
      for (let i = 0; i < RIVAL_COLORS.length; i += 1) {
        this.rivals.push({
          baseSpeed: RIVAL_BASE_SPEEDS[i] ?? 28,
          root: null,
          x: 0,
          z: 0,
          vx: 0,
          vz: 0,
          heading: 0,
          speed: 0,
          lap: 1,
          cpIndex: 0,
          finished: false,
          finishElapsedSec: 0,
        });
      }
    }
  }

  public getGlowMeshes(): readonly AbstractMesh[] {
    return this.glowMeshes;
  }

  public startNextRace(): StreetRaceSpec {
    if (this.phase !== 'IDLE') {
      this.activeRaceIndex = (this.activeRaceIndex + 1) % STREET_RACES.length;
    }

    const spec = this.getActiveSpec();
    this.phase = 'COUNTDOWN';
    this.countdownSec = 3.0;
    this.raceElapsedSec = 0;
    this.playerLap = 1;
    this.playerCpIndex = 0;
    this.playerPosition = 6;
    this.finishPosition = 1;
    this.queuedAudioEvent = 'COUNTDOWN_TICK';
    this.lastStepAudioEvent = 'COUNTDOWN_TICK';

    this.resetRivalsOnGrid(spec);
    this.setVisualsVisible(true);
    this.syncCheckpointVisuals(spec, 0);

    return spec;
  }

  public stopRace(): void {
    this.phase = 'IDLE';
    this.countdownSec = 0;
    this.raceElapsedSec = 0;
    this.queuedAudioEvent = 'NONE';
    this.lastStepAudioEvent = 'NONE';
    this.setVisualsVisible(false);
  }

  public isCountdownFrozen(): boolean {
    return this.phase === 'COUNTDOWN';
  }

  public getRivalColliders(): readonly DynamicNpcCollider[] {
    if (this.phase !== 'COUNTDOWN' && this.phase !== 'RACING') {
      return [];
    }
    return this.rivals.map((rival) => ({
      x: rival.x,
      z: rival.z,
      vx: rival.vx,
      vz: rival.vz,
      kind: 'SEDAN',
      elevated: false,
    }));
  }

  public update(dt: number, playerState: VehiclePhysicsState): RaceSnapshot {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    const spec = this.getActiveSpec();
    let stepEvent: RaceAudioEvent = 'NONE';

    if (this.phase === 'COUNTDOWN') {
      const prevCeil = Math.ceil(this.countdownSec);
      this.countdownSec = Math.max(0, this.countdownSec - safeDt);
      const nextCeil = Math.ceil(this.countdownSec);
      if (this.countdownSec <= 0) {
        this.phase = 'RACING';
        stepEvent = 'COUNTDOWN_GO';
      } else if (nextCeil < prevCeil && nextCeil > 0) {
        stepEvent = 'COUNTDOWN_TICK';
      }
      this.syncCheckpointVisuals(spec, safeDt);
    } else if (this.phase === 'RACING') {
      this.raceElapsedSec += safeDt;
      const playerProgress = this.computeRacerProgress(
        this.playerLap,
        this.playerCpIndex,
        playerState.x,
        playerState.z,
        spec,
      );

      this.updateRivals(safeDt, spec, playerProgress);
      stepEvent = this.updatePlayerProgress(spec, playerState.x, playerState.z);
      this.playerPosition = this.computePlayerRank(playerState.x, playerState.z, spec);
      this.syncCheckpointVisuals(spec, safeDt);
    }

    if (stepEvent !== 'NONE') {
      this.lastStepAudioEvent = stepEvent;
      if (getEventPriority(stepEvent) >= getEventPriority(this.queuedAudioEvent)) {
        this.queuedAudioEvent = stepEvent;
      }
    } else {
      this.lastStepAudioEvent = 'NONE';
    }

    return this.buildSnapshot(spec, this.lastStepAudioEvent);
  }

  public getSnapshot(consumeAudio = true): RaceSnapshot {
    const spec = this.getActiveSpec();
    const audioEvent = this.queuedAudioEvent;
    if (consumeAudio) {
      this.queuedAudioEvent = 'NONE';
    }
    return this.buildSnapshot(spec, audioEvent);
  }

  public dispose(): void {
    this.gateRoot?.dispose();
    this.nextBeaconRoot?.dispose();
    for (const rival of this.rivals) {
      rival.root?.dispose();
    }
    this.glowMeshes.length = 0;
  }

  private getActiveSpec(): StreetRaceSpec {
    return STREET_RACES[this.activeRaceIndex] ?? STREET_RACES[0];
  }

  private resetRivalsOnGrid(spec: StreetRaceSpec): void {
    const sinH = Math.sin(spec.spawn.heading);
    const cosH = Math.cos(spec.spawn.heading);
    const rightX = cosH;
    const rightZ = -sinH;

    const forwardOffsets: readonly number[] = [7, 7, 14, 14, 21];
    const rightOffsets: readonly number[] = [-3.8, 0.2, -3.8, 0.2, -3.8];

    this.rivals.forEach((rival, idx) => {
      const fwd = forwardOffsets[idx] ?? 8;
      const lat = rightOffsets[idx] ?? 0;
      rival.x = spec.spawn.x + sinH * fwd + rightX * lat;
      rival.z = spec.spawn.z + cosH * fwd + rightZ * lat;
      rival.vx = 0;
      rival.vz = 0;
      rival.heading = spec.spawn.heading;
      rival.speed = 0;
      rival.lap = 1;
      rival.cpIndex = 0;
      rival.finished = false;
      rival.finishElapsedSec = 0;
      rival.root?.position.set(rival.x, 0, rival.z);
      if (rival.root) {
        rival.root.rotation.y = rival.heading;
      }
    });
  }

  private updateRivals(safeDt: number, spec: StreetRaceSpec, playerProgress: number): void {
    const totalCps = spec.checkpoints.length;

    for (const rival of this.rivals) {
      if (rival.finished) {
        rival.speed = Math.max(0, rival.speed - 14 * safeDt);
        rival.vx = Math.sin(rival.heading) * rival.speed;
        rival.vz = Math.cos(rival.heading) * rival.speed;
        rival.x += rival.vx * safeDt;
        rival.z += rival.vz * safeDt;
        rival.root?.position.set(rival.x, 0, rival.z);
        continue;
      }

      const cp = spec.checkpoints[rival.cpIndex] ?? spec.checkpoints[0];
      const dx = cp.x - rival.x;
      const dz = cp.z - rival.z;
      const dist = Math.hypot(dx, dz);

      const desiredHeading = Math.atan2(dx, dz);
      let angleDiff = desiredHeading - rival.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const maxTurn = 2.8 * safeDt;
      rival.heading += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));

      const rivalProgress = this.computeRacerProgress(
        rival.lap,
        rival.cpIndex,
        rival.x,
        rival.z,
        spec,
      );
      const rubberBand = Math.max(-3.5, Math.min(3.5, (playerProgress - rivalProgress) * 2.2));
      const cornerFactor = Math.abs(angleDiff) > 0.65 ? 0.72 : 1.0;
      const targetSpeed = Math.max(22, Math.min(36, (rival.baseSpeed + rubberBand) * cornerFactor));

      const accel = targetSpeed >= rival.speed ? 12.0 : 18.0;
      const deltaV = targetSpeed - rival.speed;
      const maxStep = accel * safeDt;
      rival.speed =
        Math.abs(deltaV) <= maxStep ? targetSpeed : rival.speed + Math.sign(deltaV) * maxStep;

      rival.vx = Math.sin(rival.heading) * rival.speed;
      rival.vz = Math.cos(rival.heading) * rival.speed;
      rival.x += rival.vx * safeDt;
      rival.z += rival.vz * safeDt;

      if (dist < 22) {
        rival.cpIndex += 1;
        if (rival.cpIndex >= totalCps) {
          if (rival.lap < spec.totalLaps) {
            rival.lap += 1;
            rival.cpIndex = 0;
          } else {
            rival.finished = true;
            rival.finishElapsedSec = this.raceElapsedSec;
          }
        }
      }

      rival.root?.position.set(rival.x, 0, rival.z);
      if (rival.root) {
        rival.root.rotation.y = rival.heading;
      }
    }
  }

  private updatePlayerProgress(
    spec: StreetRaceSpec,
    playerX: number,
    playerZ: number,
  ): RaceAudioEvent {
    const activeCp = spec.checkpoints[this.playerCpIndex];
    if (!activeCp) {
      return 'NONE';
    }

    const dist = Math.hypot(activeCp.x - playerX, activeCp.z - playerZ);
    if (dist >= CHECKPOINT_TRIGGER_RADIUS_M) {
      return 'NONE';
    }

    this.playerCpIndex += 1;
    if (this.playerCpIndex >= spec.checkpoints.length) {
      if (this.playerLap < spec.totalLaps) {
        this.playerLap += 1;
        this.playerCpIndex = 0;
        return 'CHECKPOINT';
      }
      this.finishPosition = this.computePlayerRank(playerX, playerZ, spec);
      this.playerPosition = this.finishPosition;
      this.phase = 'FINISHED';
      return this.finishPosition === 1 ? 'FINISH_WIN' : 'FINISH_LOSE';
    }

    return 'CHECKPOINT';
  }

  private computeRacerProgress(
    lap: number,
    cpIndex: number,
    x: number,
    z: number,
    spec: StreetRaceSpec,
  ): number {
    const cp = spec.checkpoints[cpIndex] ?? spec.checkpoints[0];
    const distToNext = Math.hypot(cp.x - x, cp.z - z);
    return (lap - 1) * spec.checkpoints.length + cpIndex - distToNext / 1000;
  }

  private computePlayerRank(playerX: number, playerZ: number, spec: StreetRaceSpec): number {
    if (this.phase === 'FINISHED') {
      return this.finishPosition;
    }

    const playerProgress = this.computeRacerProgress(
      this.playerLap,
      this.playerCpIndex,
      playerX,
      playerZ,
      spec,
    );

    let aheadCount = 0;
    for (const rival of this.rivals) {
      if (rival.finished) {
        aheadCount += 1;
        continue;
      }
      const rivalProgress = this.computeRacerProgress(
        rival.lap,
        rival.cpIndex,
        rival.x,
        rival.z,
        spec,
      );
      if (rivalProgress > playerProgress) {
        aheadCount += 1;
      }
    }
    return 1 + aheadCount;
  }

  private buildSnapshot(spec: StreetRaceSpec, audioEvent: RaceAudioEvent): RaceSnapshot {
    const activeCp =
      this.phase === 'COUNTDOWN' || this.phase === 'RACING'
        ? (spec.checkpoints[this.playerCpIndex] ?? null)
        : null;

    const rivalPositions: RaceCheckpoint[] =
      this.phase === 'COUNTDOWN' || this.phase === 'RACING'
        ? this.rivals.map((r) => ({ x: r.x, z: r.z }))
        : [];

    return {
      phase: this.phase,
      raceId: spec.id,
      raceName: spec.name,
      countdownSec: this.countdownSec,
      raceElapsedSec: this.raceElapsedSec,
      currentLap: this.playerLap,
      totalLaps: spec.totalLaps,
      currentCheckpointIndex: this.playerCpIndex,
      totalCheckpoints: spec.checkpoints.length,
      playerPosition: this.playerPosition,
      finishPosition: this.finishPosition,
      totalRacers: 1 + this.rivals.length,
      activeCheckpoint: activeCp,
      rivalPositions,
      audioEvent,
    };
  }

  private syncCheckpointVisuals(spec: StreetRaceSpec, dt: number): void {
    if (!this.gateRoot || !this.nextBeaconRoot) {
      return;
    }
    const visible = this.phase === 'COUNTDOWN' || this.phase === 'RACING';
    this.gateRoot.setEnabled(visible);
    this.nextBeaconRoot.setEnabled(visible);
    if (!visible) {
      return;
    }

    const activeCp = spec.checkpoints[this.playerCpIndex] ?? spec.checkpoints[0];
    const nextCpIndex = (this.playerCpIndex + 1) % spec.checkpoints.length;
    const nextCp = spec.checkpoints[nextCpIndex] ?? activeCp;

    this.gateRoot.position.set(activeCp.x, 0, activeCp.z);
    this.gateRoot.rotation.y = Math.atan2(nextCp.x - activeCp.x, nextCp.z - activeCp.z);
    this.nextBeaconRoot.position.set(nextCp.x, 0, nextCp.z);

    this.gateSpinRad += dt * 1.4;
    const ring = this.gateRoot.getChildMeshes()[0];
    if (ring) {
      ring.rotation.y = this.gateSpinRad;
    }
  }

  private setVisualsVisible(visible: boolean): void {
    this.gateRoot?.setEnabled(visible);
    this.nextBeaconRoot?.setEnabled(visible);
    for (const rival of this.rivals) {
      rival.root?.setEnabled(visible);
    }
  }

  private buildCheckpointGate(scene: Scene): TransformNode {
    const root = new TransformNode('race-checkpoint-gate', scene);

    const cyanMat = new PBRMaterial('race-gate-cyan-pbr', scene);
    cyanMat.albedoColor = new Color3(0.15, 0.9, 1.0);
    cyanMat.emissiveColor = new Color3(0.45, 2.2, 2.8);
    cyanMat.roughness = 0.25;

    const goldMat = new PBRMaterial('race-gate-gold-pbr', scene);
    goldMat.albedoColor = new Color3(1.0, 0.82, 0.25);
    goldMat.emissiveColor = new Color3(2.4, 1.7, 0.3);
    goldMat.roughness = 0.25;

    const ring = MeshBuilder.CreateTorus(
      'race-gate-ring',
      { diameter: 14.5, thickness: 0.55, tessellation: 32 },
      scene,
    );
    ring.parent = root;
    ring.position.set(0, 8.2, 0);
    ring.material = goldMat;
    this.glowMeshes.push(ring);

    for (const sideX of [-9.5, 9.5] as const) {
      const pillar = MeshBuilder.CreateCylinder(
        `race-gate-pillar-${sideX}`,
        { height: 11.5, diameter: 0.72, tessellation: 12 },
        scene,
      );
      pillar.parent = root;
      pillar.position.set(sideX, 5.75, 0);
      pillar.material = cyanMat;
      this.glowMeshes.push(pillar);
    }

    const crossbar = MeshBuilder.CreateBox(
      'race-gate-crossbar',
      { width: 19.6, height: 0.75, depth: 0.75 },
      scene,
    );
    crossbar.parent = root;
    crossbar.position.set(0, 11.4, 0);
    crossbar.material = cyanMat;
    this.glowMeshes.push(crossbar);

    return root;
  }

  private buildNextBeacon(scene: Scene): TransformNode {
    const root = new TransformNode('race-next-beacon', scene);
    const amberMat = new PBRMaterial('race-next-amber-pbr', scene);
    amberMat.albedoColor = new Color3(1.0, 0.65, 0.12);
    amberMat.emissiveColor = new Color3(1.8, 0.95, 0.14);
    amberMat.roughness = 0.35;

    const beam = MeshBuilder.CreateCylinder(
      'race-next-beacon-pillar',
      { height: 9.0, diameter: 0.5, tessellation: 10 },
      scene,
    );
    beam.parent = root;
    beam.position.set(0, 4.5, 0);
    beam.material = amberMat;
    this.glowMeshes.push(beam);
    return root;
  }

  private buildRivalCar(scene: Scene, index: number, hexColor: string): TransformNode {
    const root = new TransformNode(`race-rival-${index}`, scene);
    const bodyColor = parseHexColor3(hexColor);

    const bodyMat = new PBRMaterial(`race-rival-body-${index}`, scene);
    bodyMat.albedoColor = bodyColor;
    bodyMat.metallic = 0.82;
    bodyMat.roughness = 0.18;
    bodyMat.clearCoat.isEnabled = true;
    bodyMat.clearCoat.intensity = 0.9;

    const glassMat = new PBRMaterial(`race-rival-glass-${index}`, scene);
    glassMat.albedoColor = new Color3(0.03, 0.04, 0.08);
    glassMat.metallic = 0.35;
    glassMat.roughness = 0.08;

    const neonMat = new PBRMaterial(`race-rival-neon-${index}`, scene);
    neonMat.albedoColor = bodyColor;
    neonMat.emissiveColor = bodyColor.scale(2.4);

    const tireMat = new PBRMaterial(`race-rival-tire-${index}`, scene);
    tireMat.albedoColor = new Color3(0.05, 0.05, 0.06);
    tireMat.roughness = 0.85;

    const chassis = MeshBuilder.CreateBox(
      `race-rival-chassis-${index}`,
      { width: 1.92, height: 0.64, depth: 4.45 },
      scene,
    );
    chassis.parent = root;
    chassis.position.set(0, 0.56, 0);
    chassis.material = bodyMat;

    const cabin = MeshBuilder.CreateBox(
      `race-rival-cabin-${index}`,
      { width: 1.56, height: 0.48, depth: 2.0 },
      scene,
    );
    cabin.parent = root;
    cabin.position.set(0, 1.06, -0.15);
    cabin.material = glassMat;

    const spoiler = MeshBuilder.CreateBox(
      `race-rival-spoiler-${index}`,
      { width: 1.84, height: 0.12, depth: 0.38 },
      scene,
    );
    spoiler.parent = root;
    spoiler.position.set(0, 1.04, -1.96);
    spoiler.material = bodyMat;

    const underglow = MeshBuilder.CreateBox(
      `race-rival-underglow-${index}`,
      { width: 1.74, height: 0.08, depth: 3.85 },
      scene,
    );
    underglow.parent = root;
    underglow.position.set(0, 0.16, 0);
    underglow.material = neonMat;
    this.glowMeshes.push(underglow);

    const wheelCoords: readonly [number, number][] = [
      [-0.95, 1.38],
      [0.95, 1.38],
      [-0.95, -1.38],
      [0.95, -1.38],
    ];
    wheelCoords.forEach(([wx, wz], wIdx) => {
      const wheel = MeshBuilder.CreateCylinder(
        `race-rival-wheel-${index}-${wIdx}`,
        { height: 0.28, diameter: 0.68, tessellation: 12 },
        scene,
      );
      wheel.parent = root;
      wheel.position.set(wx, 0.34, wz);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = tireMat;
    });

    return root;
  }
}
