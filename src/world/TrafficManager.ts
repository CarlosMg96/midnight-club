import {
  Color3,
  MeshBuilder,
  PBRMaterial,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import { resolveIntersectionSignalState } from '../config/GameConfig';
import type { DynamicNpcCollider } from '../physics/VehiclePhysics';

type RoadAxis = 'NS' | 'EW';
export type TrafficNpcKind = 'SEDAN' | 'METROBUS' | 'PATROL' | 'TRAM' | 'METRO';

interface TrafficAgentSpec {
  readonly kind: TrafficNpcKind;
  readonly axis: RoadAxis;
  readonly direction: 1 | -1;
  readonly laneCoord: number;
  readonly initialPosAlong: number;
  readonly minBound: number;
  readonly maxBound: number;
  readonly cruiseSpeed: number;
  readonly collisionRadius: number;
  readonly paintColor: Color3;
  readonly secondaryColor?: Color3;
  readonly elevationY?: number;
  readonly ignoreSignals?: boolean;
}

interface TrafficVehicleAgent {
  readonly kind: TrafficNpcKind;
  readonly root: TransformNode;
  readonly wheelHubs: TransformNode[];
  readonly tailLamps: AbstractMesh[];
  readonly axis: RoadAxis;
  readonly direction: 1 | -1;
  readonly laneCoord: number;
  readonly minBound: number;
  readonly maxBound: number;
  readonly cruiseSpeed: number;
  readonly collisionRadius: number;
  readonly wheelRadius: number;
  readonly elevationY: number;
  readonly ignoreSignals: boolean;
  readonly stopLines: readonly number[];
  posAlong: number;
  currentSpeed: number;
  knockVx: number;
  knockVz: number;
  knockSpin: number;
  knockOffsetX: number;
  knockOffsetZ: number;
  knockAngle: number;
  pursuitX: number;
  pursuitZ: number;
  pursuitHeading: number;
  isChasingPlayer: boolean;
}

interface PedestrianSpec {
  readonly axis: RoadAxis;
  readonly direction: 1 | -1;
  readonly fixedCoord: number;
  readonly initialPosAlong: number;
  readonly minBound: number;
  readonly maxBound: number;
  readonly walkSpeed: number;
  readonly phaseOffset: number;
  readonly isCrosswalkWalker: boolean;
  readonly jacketColor: Color3;
}

interface PedestrianAgent {
  readonly root: TransformNode;
  readonly leftLegHub: TransformNode;
  readonly rightLegHub: TransformNode;
  readonly leftArmHub: TransformNode;
  readonly rightArmHub: TransformNode;
  readonly axis: RoadAxis;
  readonly fixedCoord: number;
  readonly minBound: number;
  readonly maxBound: number;
  readonly walkSpeed: number;
  readonly phaseOffset: number;
  readonly isCrosswalkWalker: boolean;
  direction: 1 | -1;
  posAlong: number;
}

const SEDAN_WHEEL_RADIUS_M = 0.32;
const BUS_WHEEL_RADIUS_M = 0.43;

const NS_POS_STOPLINES: readonly number[] = [-348, 44, 352];
const NS_NEG_STOPLINES: readonly number[] = [408, 106, -292];
const EW_POS_STOPLINES: readonly number[] = [-408, -28, 352];
const EW_NEG_STOPLINES: readonly number[] = [408, 28, -352];

export interface TrafficCoordEntry extends DynamicNpcCollider {
  x: number;
  z: number;
  vx: number;
  vz: number;
  readonly kind: TrafficNpcKind;
  readonly elevated: boolean;
  readonly onImpact: (impulseVx: number, impulseVz: number, spinDelta: number) => void;
}

export const METROPOLITAN_TRAFFIC_COORDS: TrafficCoordEntry[] = [];

/**
 * Pobla CDMX y Estado de México con automóviles, taxis, Metrobuses/Mexibuses,
 * patrullas con torretas rojo/azul animadas y peatones animados caminando por
 * banquetas y pasos peatonales sincronizados con los semáforos.
 */
export class TrafficManager {
  private readonly scene: Scene;
  private readonly agents: TrafficVehicleAgent[] = [];
  private readonly pedestrians: PedestrianAgent[] = [];

  private readonly taillightCruiseMat: PBRMaterial;
  private readonly taillightBrakeMat: PBRMaterial;
  private readonly sirenRedMat: PBRMaterial;
  private readonly sirenBlueMat: PBRMaterial;
  private readonly glassMat: PBRMaterial;
  private readonly tireMat: PBRMaterial;
  private readonly headlightMat: PBRMaterial;

  private readonly reflectables: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private readonly glowMeshes: AbstractMesh[] = [];
  private lastSirenPhase: boolean | null = null;

  public constructor(scene: Scene) {
    this.scene = scene;

    this.taillightCruiseMat = new PBRMaterial('traffic-taillight-cruise-pbr', this.scene);
    this.taillightCruiseMat.albedoColor = new Color3(0.85, 0.08, 0.1);
    this.taillightCruiseMat.emissiveColor = new Color3(1.4, 0.1, 0.12);

    this.taillightBrakeMat = new PBRMaterial('traffic-taillight-brake-pbr', this.scene);
    this.taillightBrakeMat.albedoColor = new Color3(1.0, 0.14, 0.14);
    this.taillightBrakeMat.emissiveColor = new Color3(3.2, 0.18, 0.18);

    this.sirenRedMat = new PBRMaterial('patrol-siren-red-pbr', this.scene);
    this.sirenRedMat.albedoColor = new Color3(1.0, 0.12, 0.16);
    this.sirenRedMat.emissiveColor = new Color3(3.4, 0.12, 0.16);

    this.sirenBlueMat = new PBRMaterial('patrol-siren-blue-pbr', this.scene);
    this.sirenBlueMat.albedoColor = new Color3(0.14, 0.55, 1.0);
    this.sirenBlueMat.emissiveColor = new Color3(0.03, 0.08, 0.22);

    this.glassMat = new PBRMaterial('traffic-glass-pbr', this.scene);
    this.glassMat.albedoColor = new Color3(0.02, 0.03, 0.06);
    this.glassMat.metallic = 0.3;
    this.glassMat.roughness = 0.06;

    this.tireMat = new PBRMaterial('traffic-tire-pbr', this.scene);
    this.tireMat.albedoColor = new Color3(0.04, 0.04, 0.05);
    this.tireMat.roughness = 0.85;

    this.headlightMat = new PBRMaterial('traffic-headlight-pbr', this.scene);
    this.headlightMat.albedoColor = new Color3(1, 1, 1);
    this.headlightMat.emissiveColor = new Color3(2.4, 2.6, 2.8);

    this.populateTraffic();
    this.populatePedestrians();
    this.updateSirens(0, false);
  }

  public getReflectableMeshes(): readonly AbstractMesh[] {
    return this.reflectables;
  }

  public getShadowCasters(): readonly AbstractMesh[] {
    return this.shadowCasters;
  }

  public getGlowMeshes(): readonly AbstractMesh[] {
    return this.glowMeshes;
  }

  public update(
    dt: number,
    elapsedSec: number,
    playerState?: {
      readonly x: number;
      readonly z: number;
      readonly heading?: number;
      readonly isPolicePursuit?: boolean;
    },
  ): void {
    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    if (safeDt <= 0) {
      return;
    }

    const signal = resolveIntersectionSignalState(elapsedSec);
    const isPursuit = Boolean(playerState?.isPolicePursuit);
    this.updateSirens(elapsedSec, isPursuit);
    this.updateTrafficVehicles(safeDt, signal.ns, signal.ew, playerState);
    this.updatePedestrians(safeDt, elapsedSec, signal.ns);
  }

  private updateSirens(elapsedSec: number, isPursuit: boolean): void {
    const flashRate = isPursuit ? 12 : 6;
    const redPhase = Math.floor(elapsedSec * flashRate) % 2 === 0;
    if (this.lastSirenPhase === redPhase) {
      return;
    }
    this.lastSirenPhase = redPhase;

    if (redPhase) {
      this.sirenRedMat.emissiveColor = new Color3(isPursuit ? 4.2 : 3.4, 0.12, 0.16);
      this.sirenBlueMat.emissiveColor = new Color3(0.03, 0.08, 0.22);
    } else {
      this.sirenRedMat.emissiveColor = new Color3(0.15, 0.03, 0.04);
      this.sirenBlueMat.emissiveColor = new Color3(0.14, 0.55, isPursuit ? 4.4 : 3.6);
    }
  }

  private ensureNearPatrolSpawn(playerX: number, playerZ: number, playerHeading: number): void {
    let closestPatrol: TrafficVehicleAgent | null = null;
    let minPatrolDist = Number.POSITIVE_INFINITY;

    for (const candidate of this.agents) {
      if (candidate.kind !== 'PATROL') {
        continue;
      }
      const cx = candidate.isChasingPlayer
        ? candidate.pursuitX
        : (candidate.axis === 'NS' ? candidate.laneCoord : candidate.posAlong) +
          candidate.knockOffsetX;
      const cz = candidate.isChasingPlayer
        ? candidate.pursuitZ
        : (candidate.axis === 'NS' ? candidate.posAlong : candidate.laneCoord) +
          candidate.knockOffsetZ;
      const dist = Math.hypot(playerX - cx, playerZ - cz);
      if (dist < minPatrolDist) {
        minPatrolDist = dist;
        closestPatrol = candidate;
      }
    }

    if (closestPatrol && minPatrolDist > 160) {
      closestPatrol.isChasingPlayer = true;
      closestPatrol.pursuitX = playerX - Math.sin(playerHeading) * 48;
      closestPatrol.pursuitZ = playerZ - Math.cos(playerHeading) * 48;
      closestPatrol.pursuitHeading = playerHeading;
      closestPatrol.currentSpeed = Math.max(closestPatrol.currentSpeed, 18);
      closestPatrol.knockVx = 0;
      closestPatrol.knockVz = 0;
      closestPatrol.knockSpin = 0;
      closestPatrol.knockOffsetX = 0;
      closestPatrol.knockOffsetZ = 0;
      closestPatrol.knockAngle = 0;
    }
  }

  private stepPursuitPatrol(
    agent: TrafficVehicleAgent,
    coordEntry: TrafficCoordEntry | undefined,
    safeDt: number,
    playerX: number,
    playerZ: number,
  ): void {
    if (!agent.isChasingPlayer) {
      const routeX = agent.axis === 'NS' ? agent.laneCoord : agent.posAlong;
      const routeZ = agent.axis === 'NS' ? agent.posAlong : agent.laneCoord;
      agent.pursuitX = routeX + agent.knockOffsetX;
      agent.pursuitZ = routeZ + agent.knockOffsetZ;
      agent.pursuitHeading = this.resolveHeading(agent.axis, agent.direction) + agent.knockAngle;
      agent.knockOffsetX = 0;
      agent.knockOffsetZ = 0;
      agent.knockAngle = 0;
      agent.isChasingPlayer = true;
    }

    const dx = playerX - agent.pursuitX;
    const dz = playerZ - agent.pursuitZ;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let angleDiff = targetHeading - agent.pursuitHeading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const maxTurn = 3.2 * safeDt;
    agent.pursuitHeading += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));

    const turnPenalty = Math.abs(angleDiff) > 0.7 ? 0.68 : 1.0;
    const desiredSpeed = (dist < 2.2 ? 10 : 26.5) * turnPenalty;
    const accelRate = desiredSpeed >= agent.currentSpeed ? 14.0 : 20.0;
    const deltaV = desiredSpeed - agent.currentSpeed;
    const maxStep = accelRate * safeDt;
    agent.currentSpeed =
      Math.abs(deltaV) <= maxStep ? desiredSpeed : agent.currentSpeed + Math.sign(deltaV) * maxStep;

    const baseVx = Math.sin(agent.pursuitHeading) * agent.currentSpeed;
    const baseVz = Math.cos(agent.pursuitHeading) * agent.currentSpeed;

    agent.pursuitX += (baseVx + agent.knockVx) * safeDt;
    agent.pursuitZ += (baseVz + agent.knockVz) * safeDt;
    const newDist = Math.hypot(agent.pursuitX - playerX, agent.pursuitZ - playerZ);
    if (newDist < 3.65 && newDist > 0.001) {
      const pushNx = (agent.pursuitX - playerX) / newDist;
      const pushNz = (agent.pursuitZ - playerZ) / newDist;
      agent.pursuitX = playerX + pushNx * 3.65;
      agent.pursuitZ = playerZ + pushNz * 3.65;
      agent.currentSpeed *= 0.5;
    }
    agent.knockAngle += agent.knockSpin * safeDt;

    const damp = Math.exp(-4.5 * safeDt);
    agent.knockVx *= damp;
    agent.knockVz *= damp;
    agent.knockSpin *= damp;
    agent.knockAngle *= Math.exp(-3.0 * safeDt);

    agent.root.position.set(agent.pursuitX, agent.elevationY, agent.pursuitZ);
    agent.root.rotation.y = agent.pursuitHeading + agent.knockAngle;

    if (coordEntry) {
      coordEntry.x = agent.pursuitX;
      coordEntry.z = agent.pursuitZ;
      coordEntry.vx = baseVx + agent.knockVx;
      coordEntry.vz = baseVz + agent.knockVz;
    }

    const wheelSpin = (agent.currentSpeed * safeDt) / agent.wheelRadius;
    for (const hub of agent.wheelHubs) {
      hub.rotation.x += wheelSpin;
    }
    const isBraking = desiredSpeed < agent.currentSpeed - 0.8;
    const lampMat = isBraking ? this.taillightBrakeMat : this.taillightCruiseMat;
    for (const lamp of agent.tailLamps) {
      lamp.material = lampMat;
    }
  }

  private updateTrafficVehicles(
    safeDt: number,
    nsSignal: 'GREEN' | 'YELLOW' | 'RED',
    ewSignal: 'GREEN' | 'YELLOW' | 'RED',
    playerPos?: {
      readonly x: number;
      readonly z: number;
      readonly heading?: number;
      readonly isPolicePursuit?: boolean;
    },
  ): void {
    const isPursuit = Boolean(playerPos?.isPolicePursuit);
    if (isPursuit && playerPos) {
      this.ensureNearPatrolSpawn(playerPos.x, playerPos.z, playerPos.heading ?? 0);
    }

    for (let i = 0; i < this.agents.length; i += 1) {
      const agent = this.agents[i];
      if (!agent) {
        continue;
      }

      const coordEntry = METROPOLITAN_TRAFFIC_COORDS[i];

      if (agent.kind === 'PATROL' && isPursuit && playerPos) {
        this.stepPursuitPatrol(agent, coordEntry, safeDt, playerPos.x, playerPos.z);
        continue;
      }

      if (agent.isChasingPlayer) {
        agent.isChasingPlayer = false;
        const routeX = agent.axis === 'NS' ? agent.laneCoord : agent.posAlong;
        const routeZ = agent.axis === 'NS' ? agent.posAlong : agent.laneCoord;
        const offX = agent.pursuitX - routeX;
        const offZ = agent.pursuitZ - routeZ;
        if (Math.hypot(offX, offZ) > 90) {
          agent.knockOffsetX = 0;
          agent.knockOffsetZ = 0;
          agent.knockAngle = 0;
        } else {
          agent.knockOffsetX = offX;
          agent.knockOffsetZ = offZ;
          agent.knockAngle =
            agent.pursuitHeading - this.resolveHeading(agent.axis, agent.direction);
        }
      }

      let targetSpeed = agent.cruiseSpeed;
      const axisColor = agent.axis === 'NS' ? nsSignal : ewSignal;
      const mustStopForLight = !agent.ignoreSignals && axisColor !== 'GREEN';

      if (mustStopForLight) {
        const stopBuffer = agent.kind === 'METROBUS' || agent.kind === 'TRAM' ? 7.2 : 3.5;
        for (const stopLine of agent.stopLines) {
          const distToStop = (stopLine - agent.posAlong) * agent.direction;
          if (distToStop > 0.5 && distToStop < 26) {
            if (distToStop <= stopBuffer) {
              targetSpeed = 0;
            } else {
              const slowFactor = (distToStop - stopBuffer) / (26 - stopBuffer);
              targetSpeed = Math.min(targetSpeed, agent.cruiseSpeed * slowFactor);
            }
            break;
          }
        }
      }

      // Espaciado y fila respetando la longitud mayor de Metrobús/Tranvía en el mismo plano
      for (let j = 0; j < this.agents.length; j += 1) {
        if (i === j) {
          continue;
        }
        const other = this.agents[j];
        if (
          !other ||
          other.axis !== agent.axis ||
          other.direction !== agent.direction ||
          Math.abs(other.elevationY - agent.elevationY) > 2.0 ||
          Math.abs(other.laneCoord - agent.laneCoord) >= 2.2
        ) {
          continue;
        }
        const involvesLong =
          agent.kind === 'METROBUS' ||
          agent.kind === 'TRAM' ||
          other.kind === 'METROBUS' ||
          other.kind === 'TRAM';
        const minStopGap = involvesLong ? 15.5 : 7.5;
        const slowDownDist = involvesLong ? 24.0 : 15.0;
        const gap = (other.posAlong - agent.posAlong) * agent.direction;
        if (gap > 0 && gap < slowDownDist) {
          if (gap < minStopGap) {
            targetSpeed = 0;
          } else {
            targetSpeed = Math.min(targetSpeed, other.currentSpeed);
          }
        }
      }

      if (playerPos && agent.elevationY <= 2.0) {
        const playerLane = agent.axis === 'NS' ? playerPos.x : playerPos.z;
        const playerAlong = agent.axis === 'NS' ? playerPos.z : playerPos.x;
        if (Math.abs(playerLane - agent.laneCoord) < 2.8) {
          const playerMinGap = agent.kind === 'METROBUS' || agent.kind === 'TRAM' ? 10.6 : 6.8;
          const gapToPlayer = (playerAlong - agent.posAlong) * agent.direction;
          if (gapToPlayer > 0 && gapToPlayer < playerMinGap + 6) {
            targetSpeed =
              gapToPlayer < playerMinGap ? 0 : Math.min(targetSpeed, agent.cruiseSpeed * 0.35);
          }
        }
      }

      const isBraking = targetSpeed < agent.currentSpeed - 0.5 || agent.currentSpeed < 0.8;
      const rate = targetSpeed >= agent.currentSpeed ? 8.0 : 18.0;
      const deltaV = targetSpeed - agent.currentSpeed;
      const maxStep = rate * safeDt;
      if (Math.abs(deltaV) <= maxStep) {
        agent.currentSpeed = targetSpeed;
      } else {
        agent.currentSpeed += Math.sign(deltaV) * maxStep;
      }

      agent.posAlong += agent.currentSpeed * agent.direction * safeDt;
      if (agent.direction === 1 && agent.posAlong > agent.maxBound) {
        agent.posAlong = agent.minBound;
      } else if (agent.direction === -1 && agent.posAlong < agent.minBound) {
        agent.posAlong = agent.maxBound;
      }

      const routeX = agent.axis === 'NS' ? agent.laneCoord : agent.posAlong;
      const routeZ = agent.axis === 'NS' ? agent.posAlong : agent.laneCoord;

      agent.knockOffsetX += agent.knockVx * safeDt;
      agent.knockOffsetZ += agent.knockVz * safeDt;
      agent.knockAngle += agent.knockSpin * safeDt;

      const knockDamp = Math.exp(-4.5 * safeDt);
      agent.knockVx *= knockDamp;
      agent.knockVz *= knockDamp;
      agent.knockSpin *= knockDamp;

      if (Math.hypot(agent.knockVx, agent.knockVz) < 0.35) {
        const recover = Math.exp(-2.2 * safeDt);
        agent.knockOffsetX *= recover;
        agent.knockOffsetZ *= recover;
        agent.knockAngle *= recover;
      }

      const worldX = routeX + agent.knockOffsetX;
      const worldZ = routeZ + agent.knockOffsetZ;
      agent.root.position.set(worldX, agent.elevationY, worldZ);
      agent.root.rotation.y = this.resolveHeading(agent.axis, agent.direction) + agent.knockAngle;

      const laneVx = agent.axis === 'EW' ? agent.currentSpeed * agent.direction : 0;
      const laneVz = agent.axis === 'NS' ? agent.currentSpeed * agent.direction : 0;

      if (coordEntry) {
        coordEntry.x = worldX;
        coordEntry.z = worldZ;
        coordEntry.vx = laneVx + agent.knockVx;
        coordEntry.vz = laneVz + agent.knockVz;
      }

      const wheelSpin = (agent.currentSpeed * safeDt) / agent.wheelRadius;
      for (const hub of agent.wheelHubs) {
        hub.rotation.x += wheelSpin;
      }

      const lampMat = isBraking ? this.taillightBrakeMat : this.taillightCruiseMat;
      for (const lamp of agent.tailLamps) {
        lamp.material = lampMat;
      }
    }
  }

  private updatePedestrians(
    safeDt: number,
    elapsedSec: number,
    nsSignal: 'GREEN' | 'YELLOW' | 'RED',
  ): void {
    const crosswalkAllowed = nsSignal === 'RED';

    for (const ped of this.pedestrians) {
      let speedMultiplier = 1.0;

      if (ped.isCrosswalkWalker && !crosswalkAllowed) {
        const onSidewalk = Math.abs(ped.posAlong) >= 20.6;
        if (onSidewalk) {
          speedMultiplier = 0;
        } else {
          // Si ya está en la cebra cuando cambia el semáforo, termina de cruzar rápido hacia la banqueta
          speedMultiplier = 1.45;
          ped.direction = ped.posAlong >= 0 ? 1 : -1;
          ped.root.rotation.y = this.resolveHeading(ped.axis, ped.direction);
        }
      }

      if (speedMultiplier > 0) {
        ped.posAlong += ped.walkSpeed * speedMultiplier * ped.direction * safeDt;
        if (ped.direction === 1 && ped.posAlong >= ped.maxBound) {
          ped.posAlong = ped.maxBound;
          ped.direction = -1;
          ped.root.rotation.y = this.resolveHeading(ped.axis, ped.direction);
        } else if (ped.direction === -1 && ped.posAlong <= ped.minBound) {
          ped.posAlong = ped.minBound;
          ped.direction = 1;
          ped.root.rotation.y = this.resolveHeading(ped.axis, ped.direction);
        }

        const worldX = ped.axis === 'NS' ? ped.fixedCoord : ped.posAlong;
        const worldZ = ped.axis === 'NS' ? ped.posAlong : ped.fixedCoord;
        ped.root.position.set(worldX, 0, worldZ);

        const swing = Math.sin(elapsedSec * 7.5 + ped.phaseOffset) * 0.48;
        ped.leftLegHub.rotation.x = swing;
        ped.rightLegHub.rotation.x = -swing;
        ped.leftArmHub.rotation.x = -swing * 0.85;
        ped.rightArmHub.rotation.x = swing * 0.85;
      } else {
        ped.leftLegHub.rotation.x = 0;
        ped.rightLegHub.rotation.x = 0;
        ped.leftArmHub.rotation.x = 0;
        ped.rightArmHub.rotation.x = 0;
      }
    }
  }

  private populateTraffic(): void {
    const specs: readonly TrafficAgentSpec[] = [
      // Paseo de la Reforma / Insurgentes (Norte-Sur, CDMX; entre chicanas Sur -245 y Norte 260)
      {
        kind: 'SEDAN',
        axis: 'NS',
        direction: -1,
        laneCoord: -13.8,
        initialPosAlong: 34,
        minBound: -245,
        maxBound: 260,
        cruiseSpeed: 16.5,
        collisionRadius: 2.35,
        paintColor: new Color3(0.08, 0.1, 0.14),
      },
      {
        kind: 'SEDAN',
        axis: 'NS',
        direction: -1,
        laneCoord: -13.8,
        initialPosAlong: 136,
        minBound: -245,
        maxBound: 260,
        cruiseSpeed: 17.5,
        collisionRadius: 2.35,
        paintColor: new Color3(0.84, 0.16, 0.45), // Taxi CDMX Rosa
      },
      {
        kind: 'METROBUS',
        axis: 'NS',
        direction: -1,
        laneCoord: -13.8,
        initialPosAlong: 240,
        minBound: -245,
        maxBound: 260,
        cruiseSpeed: 13.8,
        collisionRadius: 3.4,
        paintColor: new Color3(0.84, 0.09, 0.12), // Metrobús Línea 7 Rojo
        secondaryColor: new Color3(0.94, 0.95, 0.98),
      },
      {
        kind: 'PATROL',
        axis: 'NS',
        direction: -1,
        laneCoord: -13.8,
        initialPosAlong: -95,
        minBound: -245,
        maxBound: 260,
        cruiseSpeed: 19.5,
        collisionRadius: 2.4,
        paintColor: new Color3(0.05, 0.09, 0.2), // Patrulla SSC-CDMX
      },
      {
        kind: 'SEDAN',
        axis: 'NS',
        direction: 1,
        laneCoord: 13.8,
        initialPosAlong: 132,
        minBound: -245,
        maxBound: 260,
        cruiseSpeed: 18.0,
        collisionRadius: 2.35,
        paintColor: new Color3(0.14, 0.16, 0.22),
      },
      {
        kind: 'METROBUS',
        axis: 'NS',
        direction: 1,
        laneCoord: 13.8,
        initialPosAlong: -145,
        minBound: -245,
        maxBound: 260,
        cruiseSpeed: 14.0,
        collisionRadius: 3.4,
        paintColor: new Color3(0.84, 0.09, 0.12), // Metrobús Insurgentes
        secondaryColor: new Color3(0.94, 0.95, 0.98),
      },
      {
        kind: 'PATROL',
        axis: 'NS',
        direction: 1,
        laneCoord: 13.8,
        initialPosAlong: 205,
        minBound: -245,
        maxBound: 260,
        cruiseSpeed: 19.5,
        collisionRadius: 2.4,
        paintColor: new Color3(0.05, 0.09, 0.2),
      },

      // Eje Central / Av. Juárez / Chimalhuacán (Este-Oeste: Santa Fe -> Reforma -> Zócalo -> Neza)
      {
        kind: 'SEDAN',
        axis: 'EW',
        direction: 1,
        laneCoord: 64,
        initialPosAlong: -42,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 15.5,
        collisionRadius: 2.35,
        paintColor: new Color3(0.84, 0.16, 0.45),
      },
      {
        kind: 'METROBUS',
        axis: 'EW',
        direction: 1,
        laneCoord: 64,
        initialPosAlong: -120,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 13.5,
        collisionRadius: 3.4,
        paintColor: new Color3(0.84, 0.09, 0.12), // Metrobús Línea 4 Centro Histórico
        secondaryColor: new Color3(0.94, 0.95, 0.98),
      },
      {
        kind: 'SEDAN',
        axis: 'EW',
        direction: 1,
        laneCoord: 64,
        initialPosAlong: 195,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 17.0,
        collisionRadius: 2.35,
        paintColor: new Color3(0.14, 0.18, 0.24),
      },
      {
        kind: 'SEDAN',
        axis: 'EW',
        direction: -1,
        laneCoord: 86,
        initialPosAlong: 48,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 16.0,
        collisionRadius: 2.35,
        paintColor: new Color3(0.18, 0.22, 0.28),
      },
      {
        kind: 'PATROL',
        axis: 'EW',
        direction: -1,
        laneCoord: 86,
        initialPosAlong: 155,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 19.0,
        collisionRadius: 2.4,
        paintColor: new Color3(0.05, 0.09, 0.2), // Patrulla Zócalo
      },
      {
        kind: 'METROBUS',
        axis: 'EW',
        direction: -1,
        laneCoord: 86,
        initialPosAlong: 225,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 14.2,
        collisionRadius: 3.4,
        paintColor: new Color3(0.94, 0.95, 0.98), // Mexibús Nezahualcóyotl
        secondaryColor: new Color3(0.14, 0.68, 0.36),
      },
      {
        kind: 'SEDAN',
        axis: 'EW',
        direction: -1,
        laneCoord: 86,
        initialPosAlong: -180,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 17.5,
        collisionRadius: 2.35,
        paintColor: new Color3(0.12, 0.15, 0.2),
      },

      // Periférico Poniente (Satélite · Santa Fe; al norte de curvas cerradas de La Marquesa)
      {
        kind: 'PATROL',
        axis: 'NS',
        direction: 1,
        laneCoord: -370.5,
        initialPosAlong: 175,
        minBound: 95,
        maxBound: 420,
        cruiseSpeed: 19.5,
        collisionRadius: 2.4,
        paintColor: new Color3(0.05, 0.09, 0.2), // Patrulla Satélite Edomex
      },
      {
        kind: 'SEDAN',
        axis: 'NS',
        direction: 1,
        laneCoord: -370.5,
        initialPosAlong: 295,
        minBound: 95,
        maxBound: 420,
        cruiseSpeed: 18.5,
        collisionRadius: 2.35,
        paintColor: new Color3(0.86, 0.9, 0.92),
      },
      {
        kind: 'SEDAN',
        axis: 'NS',
        direction: -1,
        laneCoord: -389.5,
        initialPosAlong: 135,
        minBound: 95,
        maxBound: 420,
        cruiseSpeed: 19.0,
        collisionRadius: 2.35,
        paintColor: new Color3(0.12, 0.14, 0.19),
      },

      // Periférico Norte Edomex (Satélite · Tlalnepantla · Ecatepec)
      {
        kind: 'PATROL',
        axis: 'EW',
        direction: 1,
        laneCoord: 370,
        initialPosAlong: -55,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 20.0,
        collisionRadius: 2.4,
        paintColor: new Color3(0.05, 0.09, 0.2), // Patrulla Tlalnepantla
      },
      {
        kind: 'METROBUS',
        axis: 'EW',
        direction: 1,
        laneCoord: 370,
        initialPosAlong: 115,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 14.0,
        collisionRadius: 3.4,
        paintColor: new Color3(0.94, 0.95, 0.98), // Mexibús Vía Morelos / Ecatepec
        secondaryColor: new Color3(0.84, 0.1, 0.14),
      },
      {
        kind: 'SEDAN',
        axis: 'EW',
        direction: -1,
        laneCoord: 390,
        initialPosAlong: 280,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 18.0,
        collisionRadius: 2.35,
        paintColor: new Color3(0.12, 0.72, 0.36),
      },

      // Circuito Mexiquense Oriente (Ecatepec · Nezahualcóyotl · Iztapalapa)
      {
        kind: 'PATROL',
        axis: 'NS',
        direction: 1,
        laneCoord: 389.5,
        initialPosAlong: -65,
        minBound: -340,
        maxBound: 420,
        cruiseSpeed: 19.5,
        collisionRadius: 2.4,
        paintColor: new Color3(0.05, 0.09, 0.2), // Patrulla Neza Edomex
      },
      {
        kind: 'SEDAN',
        axis: 'NS',
        direction: 1,
        laneCoord: 389.5,
        initialPosAlong: -195,
        minBound: -340,
        maxBound: 420,
        cruiseSpeed: 18.0,
        collisionRadius: 2.35,
        paintColor: new Color3(0.86, 0.9, 0.92),
      },
      {
        kind: 'SEDAN',
        axis: 'NS',
        direction: -1,
        laneCoord: 370.5,
        initialPosAlong: 265,
        minBound: -340,
        maxBound: 420,
        cruiseSpeed: 17.0,
        collisionRadius: 2.35,
        paintColor: new Color3(0.14, 0.16, 0.2),
      },

      // Periférico Sur · Viaducto (San Ángel · Coyoacán CU · Tasqueña–Xochimilco)
      {
        kind: 'TRAM',
        axis: 'EW',
        direction: 1,
        laneCoord: -329,
        initialPosAlong: -185,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 15.0,
        collisionRadius: 3.6,
        paintColor: new Color3(0.08, 0.44, 0.86), // Tren Ligero STE Azul/Blanco
        secondaryColor: new Color3(0.94, 0.96, 0.98),
      },
      {
        kind: 'SEDAN',
        axis: 'EW',
        direction: 1,
        laneCoord: -329,
        initialPosAlong: 60,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 18.0,
        collisionRadius: 2.35,
        paintColor: new Color3(0.84, 0.16, 0.45),
      },
      {
        kind: 'TRAM',
        axis: 'EW',
        direction: -1,
        laneCoord: -311,
        initialPosAlong: 185,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 15.0,
        collisionRadius: 3.6,
        paintColor: new Color3(0.92, 0.24, 0.56), // Ajolotren STE Xochimilco
        secondaryColor: new Color3(0.96, 0.94, 0.96),
      },
      {
        kind: 'SEDAN',
        axis: 'EW',
        direction: -1,
        laneCoord: -311,
        initialPosAlong: 310,
        minBound: -465,
        maxBound: 465,
        cruiseSpeed: 17.5,
        collisionRadius: 2.35,
        paintColor: new Color3(0.18, 0.2, 0.24),
      },

      // Blvd. Puerto Aéreo · AICM (Tranvía, Metrobús Línea 4 y Viaducto Elevado STC Metro)
      {
        kind: 'TRAM',
        axis: 'EW',
        direction: 1,
        laneCoord: 216,
        initialPosAlong: 48,
        minBound: 24,
        maxBound: 356,
        cruiseSpeed: 14.5,
        collisionRadius: 3.6,
        paintColor: new Color3(0.08, 0.44, 0.86), // Tranvía STE Circuito Interior / AICM
        secondaryColor: new Color3(0.94, 0.96, 0.98),
      },
      {
        kind: 'METROBUS',
        axis: 'EW',
        direction: -1,
        laneCoord: 234,
        initialPosAlong: 280,
        minBound: 24,
        maxBound: 356,
        cruiseSpeed: 15.0,
        collisionRadius: 3.4,
        paintColor: new Color3(0.84, 0.09, 0.12), // Metrobús Línea 4 AICM T1/T2
        secondaryColor: new Color3(0.94, 0.95, 0.98),
      },
      {
        kind: 'METRO',
        axis: 'EW',
        direction: 1,
        laneCoord: 194.8,
        initialPosAlong: 85,
        minBound: 52,
        maxBound: 325,
        cruiseSpeed: 21.0,
        collisionRadius: 3.8,
        paintColor: new Color3(0.96, 0.42, 0.06), // STC Metro Limusina Naranja (Viaducto Elevado)
        secondaryColor: new Color3(0.86, 0.9, 0.94),
        elevationY: 9.25,
        ignoreSignals: true,
      },
      {
        kind: 'METRO',
        axis: 'EW',
        direction: -1,
        laneCoord: 197.2,
        initialPosAlong: 295,
        minBound: 52,
        maxBound: 325,
        cruiseSpeed: 21.0,
        collisionRadius: 3.8,
        paintColor: new Color3(0.96, 0.42, 0.06), // STC Metro sentido poniente
        secondaryColor: new Color3(0.86, 0.9, 0.94),
        elevationY: 9.25,
        ignoreSignals: true,
      },
    ];

    METROPOLITAN_TRAFFIC_COORDS.length = 0;

    specs.forEach((spec, idx) => {
      const worldX = spec.axis === 'NS' ? spec.laneCoord : spec.initialPosAlong;
      const worldZ = spec.axis === 'NS' ? spec.initialPosAlong : spec.laneCoord;
      const elevationY = spec.elevationY ?? 0;

      const built =
        spec.kind === 'METRO'
          ? this.buildMetroTrain(idx, spec)
          : spec.kind === 'TRAM'
            ? this.buildTramVehicle(idx, spec)
            : spec.kind === 'METROBUS'
              ? this.buildMetrobusVehicle(idx, spec)
              : spec.kind === 'PATROL'
                ? this.buildPatrolVehicle(idx, spec)
                : this.buildSedanVehicle(idx, spec);

      const initialHeading = this.resolveHeading(spec.axis, spec.direction);
      built.root.position.set(worldX, elevationY, worldZ);
      built.root.rotation.y = initialHeading;

      const agent: TrafficVehicleAgent = {
        kind: spec.kind,
        root: built.root,
        wheelHubs: built.wheelHubs,
        tailLamps: built.tailLamps,
        axis: spec.axis,
        direction: spec.direction,
        laneCoord: spec.laneCoord,
        minBound: spec.minBound,
        maxBound: spec.maxBound,
        cruiseSpeed: spec.cruiseSpeed,
        collisionRadius: spec.collisionRadius,
        wheelRadius: built.wheelRadius,
        elevationY,
        ignoreSignals: spec.ignoreSignals ?? false,
        stopLines: this.resolveStopLines(spec.axis, spec.direction),
        posAlong: spec.initialPosAlong,
        currentSpeed: spec.cruiseSpeed * 0.6,
        knockVx: 0,
        knockVz: 0,
        knockSpin: 0,
        knockOffsetX: 0,
        knockOffsetZ: 0,
        knockAngle: 0,
        pursuitX: worldX,
        pursuitZ: worldZ,
        pursuitHeading: initialHeading,
        isChasingPlayer: false,
      };
      this.agents.push(agent);

      METROPOLITAN_TRAFFIC_COORDS.push({
        x: worldX,
        z: worldZ,
        vx: spec.axis === 'EW' ? spec.cruiseSpeed * 0.6 * spec.direction : 0,
        vz: spec.axis === 'NS' ? spec.cruiseSpeed * 0.6 * spec.direction : 0,
        kind: spec.kind,
        elevated: elevationY > 2.0,
        onImpact: (impulseVx: number, impulseVz: number, spinDelta: number): void => {
          if (agent.elevationY > 2.0) {
            return;
          }
          agent.knockVx += impulseVx;
          agent.knockVz += impulseVz;
          agent.knockSpin += spinDelta;
        },
      });
    });
  }

  private buildSedanVehicle(
    idx: number,
    spec: TrafficAgentSpec,
  ): {
    root: TransformNode;
    wheelHubs: TransformNode[];
    tailLamps: AbstractMesh[];
    wheelRadius: number;
  } {
    const sedanProfile = [
      new Vector3(0, 0.22, -2.15),
      new Vector3(0, 0.78, -2.08),
      new Vector3(0, 0.84, -1.35),
      new Vector3(0, 1.36, -0.78),
      new Vector3(0, 1.38, 0.42),
      new Vector3(0, 0.86, 1.05),
      new Vector3(0, 0.72, 2.02),
      new Vector3(0, 0.24, 2.15),
    ];

    const root = new TransformNode(`traffic-sedan-${idx}`, this.scene);

    const bodyMat = new PBRMaterial(`traffic-body-pbr-${idx}`, this.scene);
    bodyMat.albedoColor = spec.paintColor;
    bodyMat.metallic = 0.78;
    bodyMat.roughness = 0.2;
    bodyMat.clearCoat.isEnabled = true;
    bodyMat.clearCoat.intensity = 0.85;

    const shell = MeshBuilder.CreateRibbon(
      `traffic-shell-${idx}`,
      {
        pathArray: [
          sedanProfile.map((p) => new Vector3(-0.88, p.y, p.z)),
          sedanProfile.map((p) => new Vector3(-0.62, p.y + (p.y > 1.0 ? 0.04 : 0), p.z)),
          sedanProfile.map((p) => new Vector3(0.62, p.y + (p.y > 1.0 ? 0.04 : 0), p.z)),
          sedanProfile.map((p) => new Vector3(0.88, p.y, p.z)),
        ],
        closePath: true,
      },
      this.scene,
    );
    shell.parent = root;
    shell.material = bodyMat;

    const greenhouse = MeshBuilder.CreateBox(
      `traffic-cabin-${idx}`,
      { width: 1.48, height: 0.42, depth: 1.75 },
      this.scene,
    );
    greenhouse.parent = root;
    greenhouse.position.set(0, 1.12, -0.18);
    greenhouse.material = this.glassMat;

    this.reflectables.push(shell, greenhouse);
    this.shadowCasters.push(shell);

    const wheelHubs = this.attachWheels(root, idx, SEDAN_WHEEL_RADIUS_M, 0.84, [1.32, -1.32]);
    const tailLamps = this.attachHeadAndTailLights(root, idx, 0.62, 0.56, 0.64, 2.13);

    return { root, wheelHubs, tailLamps, wheelRadius: SEDAN_WHEEL_RADIUS_M };
  }

  private buildMetrobusVehicle(
    idx: number,
    spec: TrafficAgentSpec,
  ): {
    root: TransformNode;
    wheelHubs: TransformNode[];
    tailLamps: AbstractMesh[];
    wheelRadius: number;
  } {
    const root = new TransformNode(`traffic-metrobus-${idx}`, this.scene);

    const busMat = new PBRMaterial(`metrobus-body-pbr-${idx}`, this.scene);
    busMat.albedoColor = spec.paintColor;
    busMat.metallic = 0.28;
    busMat.roughness = 0.34;

    const stripeMat = new PBRMaterial(`metrobus-stripe-pbr-${idx}`, this.scene);
    stripeMat.albedoColor = spec.secondaryColor ?? new Color3(0.94, 0.95, 0.98);
    stripeMat.metallic = 0.15;
    stripeMat.roughness = 0.4;

    const windowLitMat = new PBRMaterial(`metrobus-window-lit-pbr-${idx}`, this.scene);
    windowLitMat.albedoColor = new Color3(0.24, 0.22, 0.18);
    windowLitMat.emissiveColor = new Color3(0.42, 0.36, 0.22);
    windowLitMat.metallic = 0.2;
    windowLitMat.roughness = 0.14;

    const ledSignMat = new PBRMaterial(`metrobus-led-pbr-${idx}`, this.scene);
    ledSignMat.albedoColor = new Color3(1.0, 0.45, 0.08);
    ledSignMat.emissiveColor = new Color3(1.8, 0.68, 0.08);

    const body = MeshBuilder.CreateBox(
      `metrobus-chassis-${idx}`,
      { width: 2.45, height: 2.95, depth: 10.4 },
      this.scene,
    );
    body.parent = root;
    body.position.set(0, 1.88, 0);
    body.material = busMat;

    const roofBand = MeshBuilder.CreateBox(
      `metrobus-roof-${idx}`,
      { width: 2.38, height: 0.28, depth: 10.2 },
      this.scene,
    );
    roofBand.parent = root;
    roofBand.position.set(0, 3.45, 0);
    roofBand.material = stripeMat;

    const acPod = MeshBuilder.CreateBox(
      `metrobus-ac-${idx}`,
      { width: 1.55, height: 0.32, depth: 3.4 },
      this.scene,
    );
    acPod.parent = root;
    acPod.position.set(0, 3.74, -0.5);
    acPod.material = stripeMat;

    const sideWindows = MeshBuilder.CreateBox(
      `metrobus-windows-${idx}`,
      { width: 2.48, height: 1.05, depth: 9.4 },
      this.scene,
    );
    sideWindows.parent = root;
    sideWindows.position.set(0, 2.38, -0.1);
    sideWindows.material = windowLitMat;

    const windshield = MeshBuilder.CreateBox(
      `metrobus-windshield-${idx}`,
      { width: 2.15, height: 1.35, depth: 0.14 },
      this.scene,
    );
    windshield.parent = root;
    windshield.position.set(0, 2.15, 5.18);
    windshield.material = this.glassMat;

    const routeSign = MeshBuilder.CreateBox(
      `metrobus-route-led-${idx}`,
      { width: 1.55, height: 0.26, depth: 0.1 },
      this.scene,
    );
    routeSign.parent = root;
    routeSign.position.set(0, 3.08, 5.21);
    routeSign.material = ledSignMat;

    this.reflectables.push(body, roofBand, sideWindows, windshield);
    this.glowMeshes.push(routeSign);
    this.shadowCasters.push(body);

    const wheelHubs = this.attachWheels(root, idx, BUS_WHEEL_RADIUS_M, 1.12, [3.35, -1.65, -3.55]);
    const tailLamps = this.attachHeadAndTailLights(root, idx, 0.88, 0.85, 0.92, 5.22);

    return { root, wheelHubs, tailLamps, wheelRadius: BUS_WHEEL_RADIUS_M };
  }

  private buildPatrolVehicle(
    idx: number,
    spec: TrafficAgentSpec,
  ): {
    root: TransformNode;
    wheelHubs: TransformNode[];
    tailLamps: AbstractMesh[];
    wheelRadius: number;
  } {
    const sedanBuilt = this.buildSedanVehicle(idx, spec);
    const root = sedanBuilt.root;

    const doorMat = new PBRMaterial(`patrol-white-pbr-${idx}`, this.scene);
    doorMat.albedoColor = new Color3(0.92, 0.94, 0.98);
    doorMat.metallic = 0.45;
    doorMat.roughness = 0.24;

    const pushBarMat = new PBRMaterial(`patrol-pushbar-pbr-${idx}`, this.scene);
    pushBarMat.albedoColor = new Color3(0.06, 0.06, 0.08);
    pushBarMat.metallic = 0.75;
    pushBarMat.roughness = 0.4;

    // Puertas blancas laterales y toldo policial
    const whiteDoors = MeshBuilder.CreateBox(
      `patrol-doors-${idx}`,
      { width: 1.8, height: 0.5, depth: 1.85 },
      this.scene,
    );
    whiteDoors.parent = root;
    whiteDoors.position.set(0, 0.56, -0.15);
    whiteDoors.material = doorMat;

    const whiteRoof = MeshBuilder.CreateBox(
      `patrol-roof-${idx}`,
      { width: 1.42, height: 0.08, depth: 1.38 },
      this.scene,
    );
    whiteRoof.parent = root;
    whiteRoof.position.set(0, 1.38, -0.18);
    whiteRoof.material = doorMat;

    // Tumbaburros delantero
    const pushBar = MeshBuilder.CreateBox(
      `patrol-pushbar-${idx}`,
      { width: 1.15, height: 0.36, depth: 0.22 },
      this.scene,
    );
    pushBar.parent = root;
    pushBar.position.set(0, 0.46, 2.22);
    pushBar.material = pushBarMat;

    // Barra de luces de torreta rojo/azul sobre el toldo
    const lightbarBase = MeshBuilder.CreateBox(
      `patrol-bar-base-${idx}`,
      { width: 1.18, height: 0.08, depth: 0.26 },
      this.scene,
    );
    lightbarBase.parent = root;
    lightbarBase.position.set(0, 1.44, -0.22);
    lightbarBase.material = pushBarMat;

    const sirenRed = MeshBuilder.CreateBox(
      `patrol-siren-red-${idx}`,
      { width: 0.5, height: 0.14, depth: 0.24 },
      this.scene,
    );
    sirenRed.parent = root;
    sirenRed.position.set(-0.29, 1.52, -0.22);
    sirenRed.material = this.sirenRedMat;

    const sirenBlue = MeshBuilder.CreateBox(
      `patrol-siren-blue-${idx}`,
      { width: 0.5, height: 0.14, depth: 0.24 },
      this.scene,
    );
    sirenBlue.parent = root;
    sirenBlue.position.set(0.29, 1.52, -0.22);
    sirenBlue.material = this.sirenBlueMat;

    this.reflectables.push(whiteDoors, whiteRoof, pushBar, lightbarBase);
    this.glowMeshes.push(sirenRed, sirenBlue);

    return sedanBuilt;
  }

  private buildMetroTrain(
    idx: number,
    spec: TrafficAgentSpec,
  ): {
    root: TransformNode;
    wheelHubs: TransformNode[];
    tailLamps: AbstractMesh[];
    wheelRadius: number;
  } {
    const root = new TransformNode(`stc-metro-train-${idx}`, this.scene);

    const orangeMat = new PBRMaterial(`metro-orange-pbr-${idx}`, this.scene);
    orangeMat.albedoColor = spec.paintColor;
    orangeMat.metallic = 0.25;
    orangeMat.roughness = 0.34;

    const silverMat = new PBRMaterial(`metro-silver-pbr-${idx}`, this.scene);
    silverMat.albedoColor = spec.secondaryColor ?? new Color3(0.86, 0.9, 0.94);
    silverMat.metallic = 0.62;
    silverMat.roughness = 0.28;

    const windowLitMat = new PBRMaterial(`metro-window-lit-pbr-${idx}`, this.scene);
    windowLitMat.albedoColor = new Color3(0.26, 0.24, 0.18);
    windowLitMat.emissiveColor = new Color3(0.55, 0.45, 0.24);
    windowLitMat.roughness = 0.14;

    const ledMat = new PBRMaterial(`metro-led-pbr-${idx}`, this.scene);
    ledMat.albedoColor = new Color3(1.0, 0.52, 0.08);
    ledMat.emissiveColor = new Color3(2.2, 0.95, 0.12);

    const bogieMat = new PBRMaterial(`metro-bogie-pbr-${idx}`, this.scene);
    bogieMat.albedoColor = new Color3(0.08, 0.09, 0.11);
    bogieMat.metallic = 0.7;
    bogieMat.roughness = 0.45;

    const carOffsets = [-7.0, 0, 7.0] as const;
    for (const carZ of carOffsets) {
      const carBody = MeshBuilder.CreateBox(
        `metro-car-body-${idx}-${carZ}`,
        { width: 2.15, height: 2.7, depth: 6.4 },
        this.scene,
      );
      carBody.parent = root;
      carBody.position.set(0, 1.72, carZ);
      carBody.material = orangeMat;

      const roofBand = MeshBuilder.CreateBox(
        `metro-car-roof-${idx}-${carZ}`,
        { width: 2.1, height: 0.28, depth: 6.3 },
        this.scene,
      );
      roofBand.parent = root;
      roofBand.position.set(0, 3.16, carZ);
      roofBand.material = silverMat;

      const windows = MeshBuilder.CreateBox(
        `metro-car-windows-${idx}-${carZ}`,
        { width: 2.18, height: 0.96, depth: 5.7 },
        this.scene,
      );
      windows.parent = root;
      windows.position.set(0, 2.08, carZ);
      windows.material = windowLitMat;

      const underframe = MeshBuilder.CreateBox(
        `metro-car-bogie-${idx}-${carZ}`,
        { width: 1.85, height: 0.42, depth: 5.8 },
        this.scene,
      );
      underframe.parent = root;
      underframe.position.set(0, 0.28, carZ);
      underframe.material = bogieMat;

      this.reflectables.push(carBody, roofBand, windows, underframe);
    }

    for (const gangwayZ of [-3.5, 3.5]) {
      const bellows = MeshBuilder.CreateBox(
        `metro-bellows-${idx}-${gangwayZ}`,
        { width: 1.85, height: 2.45, depth: 0.85 },
        this.scene,
      );
      bellows.parent = root;
      bellows.position.set(0, 1.65, gangwayZ);
      bellows.material = bogieMat;
      this.reflectables.push(bellows);
    }

    const frontCabGlass = MeshBuilder.CreateBox(
      `metro-front-cab-${idx}`,
      { width: 1.85, height: 1.15, depth: 0.14 },
      this.scene,
    );
    frontCabGlass.parent = root;
    frontCabGlass.position.set(0, 2.0, 10.22);
    frontCabGlass.material = this.glassMat;

    const frontRouteBand = MeshBuilder.CreateBox(
      `metro-route-led-${idx}`,
      { width: 1.45, height: 0.25, depth: 0.12 },
      this.scene,
    );
    frontRouteBand.parent = root;
    frontRouteBand.position.set(0, 2.86, 10.24);
    frontRouteBand.material = ledMat;
    this.glowMeshes.push(frontRouteBand);

    const wheelHubs = this.attachWheels(
      root,
      idx,
      SEDAN_WHEEL_RADIUS_M,
      0.86,
      [-8.6, -5.4, 0, 5.4, 8.6],
    );
    const tailLamps = this.attachHeadAndTailLights(root, idx, 0.7, 1.0, 1.0, 10.25);

    return { root, wheelHubs, tailLamps, wheelRadius: SEDAN_WHEEL_RADIUS_M };
  }

  private buildTramVehicle(
    idx: number,
    spec: TrafficAgentSpec,
  ): {
    root: TransformNode;
    wheelHubs: TransformNode[];
    tailLamps: AbstractMesh[];
    wheelRadius: number;
  } {
    const root = new TransformNode(`ste-tram-vehicle-${idx}`, this.scene);

    const primaryMat = new PBRMaterial(`tram-primary-pbr-${idx}`, this.scene);
    primaryMat.albedoColor = spec.paintColor;
    primaryMat.metallic = 0.28;
    primaryMat.roughness = 0.34;

    const trimMat = new PBRMaterial(`tram-trim-pbr-${idx}`, this.scene);
    trimMat.albedoColor = spec.secondaryColor ?? new Color3(0.94, 0.96, 0.98);
    trimMat.metallic = 0.2;
    trimMat.roughness = 0.36;

    const windowLitMat = new PBRMaterial(`tram-window-lit-pbr-${idx}`, this.scene);
    windowLitMat.albedoColor = new Color3(0.24, 0.26, 0.3);
    windowLitMat.emissiveColor = new Color3(0.38, 0.42, 0.44);
    windowLitMat.roughness = 0.14;

    const ledMat = new PBRMaterial(`tram-led-pbr-${idx}`, this.scene);
    ledMat.albedoColor = new Color3(0.2, 0.95, 0.85);
    ledMat.emissiveColor = new Color3(0.35, 2.1, 1.85);

    const pantographMat = new PBRMaterial(`tram-pantograph-pbr-${idx}`, this.scene);
    pantographMat.albedoColor = new Color3(0.55, 0.62, 0.7);
    pantographMat.metallic = 0.82;
    pantographMat.roughness = 0.28;

    const body = MeshBuilder.CreateBox(
      `tram-body-${idx}`,
      { width: 2.35, height: 2.85, depth: 12.6 },
      this.scene,
    );
    body.parent = root;
    body.position.set(0, 1.82, 0);
    body.material = primaryMat;

    const whiteSkirt = MeshBuilder.CreateBox(
      `tram-white-band-${idx}`,
      { width: 2.38, height: 0.72, depth: 12.5 },
      this.scene,
    );
    whiteSkirt.parent = root;
    whiteSkirt.position.set(0, 0.85, 0);
    whiteSkirt.material = trimMat;

    const sideWindows = MeshBuilder.CreateBox(
      `tram-windows-${idx}`,
      { width: 2.4, height: 1.08, depth: 11.4 },
      this.scene,
    );
    sideWindows.parent = root;
    sideWindows.position.set(0, 2.24, 0);
    sideWindows.material = windowLitMat;

    const frontWindshield = MeshBuilder.CreateBox(
      `tram-front-glass-${idx}`,
      { width: 2.05, height: 1.35, depth: 0.14 },
      this.scene,
    );
    frontWindshield.parent = root;
    frontWindshield.position.set(0, 2.05, 6.28);
    frontWindshield.material = this.glassMat;

    const routeSign = MeshBuilder.CreateBox(
      `tram-route-led-${idx}`,
      { width: 1.5, height: 0.26, depth: 0.1 },
      this.scene,
    );
    routeSign.parent = root;
    routeSign.position.set(0, 2.98, 6.31);
    routeSign.material = ledMat;

    // Pantógrafo eléctrico superior del Tren Ligero / Tranvía STE
    const pantoArmA = MeshBuilder.CreateBox(
      `tram-panto-arm-a-${idx}`,
      { width: 0.14, height: 0.9, depth: 0.14 },
      this.scene,
    );
    pantoArmA.parent = root;
    pantoArmA.position.set(0, 3.6, 0.25);
    pantoArmA.rotation.x = 0.55;
    pantoArmA.material = pantographMat;

    const pantoArmB = MeshBuilder.CreateBox(
      `tram-panto-arm-b-${idx}`,
      { width: 0.14, height: 0.9, depth: 0.14 },
      this.scene,
    );
    pantoArmB.parent = root;
    pantoArmB.position.set(0, 3.6, -0.25);
    pantoArmB.rotation.x = -0.55;
    pantoArmB.material = pantographMat;

    const pantoCollector = MeshBuilder.CreateBox(
      `tram-panto-collector-${idx}`,
      { width: 1.35, height: 0.12, depth: 0.35 },
      this.scene,
    );
    pantoCollector.parent = root;
    pantoCollector.position.set(0, 4.02, 0);
    pantoCollector.material = pantographMat;

    this.reflectables.push(
      body,
      whiteSkirt,
      sideWindows,
      frontWindshield,
      pantoArmA,
      pantoArmB,
      pantoCollector,
    );
    this.glowMeshes.push(routeSign);
    this.shadowCasters.push(body);

    const wheelHubs = this.attachWheels(root, idx, BUS_WHEEL_RADIUS_M, 1.05, [4.2, 0, -4.2]);
    const tailLamps = this.attachHeadAndTailLights(root, idx, 0.82, 0.85, 0.9, 6.32);

    return { root, wheelHubs, tailLamps, wheelRadius: BUS_WHEEL_RADIUS_M };
  }

  private attachWheels(
    root: TransformNode,
    idx: number,
    wheelRadius: number,
    halfTrack: number,
    axleZCoords: readonly number[],
  ): TransformNode[] {
    const wheelHubs: TransformNode[] = [];
    for (const wz of axleZCoords) {
      for (const side of [-1, 1] as const) {
        const wx = side * halfTrack;
        const wheelHub = new TransformNode(`traffic-wheel-hub-${idx}-${wx}-${wz}`, this.scene);
        wheelHub.parent = root;
        wheelHub.position.set(wx, wheelRadius, wz);

        const wheel = MeshBuilder.CreateCylinder(
          `traffic-wheel-${idx}-${wx}-${wz}`,
          { diameter: wheelRadius * 2, height: 0.26, tessellation: 14 },
          this.scene,
        );
        wheel.parent = wheelHub;
        wheel.rotation.z = Math.PI / 2;
        wheel.material = this.tireMat;
        wheelHubs.push(wheelHub);
        this.reflectables.push(wheel);
      }
    }
    return wheelHubs;
  }

  private attachHeadAndTailLights(
    root: TransformNode,
    idx: number,
    lampOffsetX: number,
    headY: number,
    tailY: number,
    frontBackZ: number,
  ): AbstractMesh[] {
    const tailLamps: AbstractMesh[] = [];
    for (const side of [-1, 1] as const) {
      const lx = side * lampOffsetX;
      const head = MeshBuilder.CreateBox(
        `traffic-head-${idx}-${side}`,
        { width: 0.36, height: 0.16, depth: 0.08 },
        this.scene,
      );
      head.parent = root;
      head.position.set(lx, headY, frontBackZ);
      head.material = this.headlightMat;

      const tail = MeshBuilder.CreateBox(
        `traffic-tail-${idx}-${side}`,
        { width: 0.36, height: 0.16, depth: 0.08 },
        this.scene,
      );
      tail.parent = root;
      tail.position.set(lx, tailY, -frontBackZ);
      tail.material = this.taillightCruiseMat;
      tailLamps.push(tail);

      this.reflectables.push(head, tail);
      this.glowMeshes.push(head, tail);
    }
    return tailLamps;
  }

  private populatePedestrians(): void {
    const skinMat = new PBRMaterial('pedestrian-skin-pbr', this.scene);
    skinMat.albedoColor = new Color3(0.68, 0.48, 0.36);
    skinMat.roughness = 0.72;

    const pantsMat = new PBRMaterial('pedestrian-pants-pbr', this.scene);
    pantsMat.albedoColor = new Color3(0.11, 0.14, 0.2);
    pantsMat.roughness = 0.85;

    const specs: readonly PedestrianSpec[] = [
      // Banquetas de Paseo de la Reforma Sur (CDMX)
      {
        axis: 'NS',
        direction: 1,
        fixedCoord: -23.8,
        initialPosAlong: -28,
        minBound: -48,
        maxBound: 48,
        walkSpeed: 1.55,
        phaseOffset: 0.2,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.16, 0.48, 0.84),
      },
      {
        axis: 'NS',
        direction: -1,
        fixedCoord: -24.4,
        initialPosAlong: 22,
        minBound: -48,
        maxBound: 48,
        walkSpeed: 1.45,
        phaseOffset: 1.8,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.76, 0.2, 0.32),
      },
      {
        axis: 'NS',
        direction: 1,
        fixedCoord: 23.8,
        initialPosAlong: -14,
        minBound: -48,
        maxBound: 48,
        walkSpeed: 1.6,
        phaseOffset: 2.9,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.84, 0.62, 0.16),
      },
      {
        axis: 'NS',
        direction: -1,
        fixedCoord: 24.4,
        initialPosAlong: 34,
        minBound: -48,
        maxBound: 48,
        walkSpeed: 1.5,
        phaseOffset: 4.1,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.16, 0.64, 0.48),
      },
      // Banquetas de Paseo de la Reforma Norte
      {
        axis: 'NS',
        direction: 1,
        fixedCoord: -23.8,
        initialPosAlong: 118,
        minBound: 102,
        maxBound: 190,
        walkSpeed: 1.5,
        phaseOffset: 0.9,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.68, 0.26, 0.72),
      },
      {
        axis: 'NS',
        direction: -1,
        fixedCoord: 23.8,
        initialPosAlong: 146,
        minBound: 102,
        maxBound: 190,
        walkSpeed: 1.62,
        phaseOffset: 3.3,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.2, 0.24, 0.3),
      },
      // Peatones en paso de cebra de Reforma (Z = 25.5 / 26.8: esperan en verde, cruzan en rojo)
      {
        axis: 'EW',
        direction: 1,
        fixedCoord: 25.5,
        initialPosAlong: -21.2,
        minBound: -21.5,
        maxBound: 21.5,
        walkSpeed: 2.2,
        phaseOffset: 0.5,
        isCrosswalkWalker: true,
        jacketColor: new Color3(0.92, 0.46, 0.14),
      },
      {
        axis: 'EW',
        direction: -1,
        fixedCoord: 26.8,
        initialPosAlong: 21.2,
        minBound: -21.5,
        maxBound: 21.5,
        walkSpeed: 2.15,
        phaseOffset: 2.4,
        isCrosswalkWalker: true,
        jacketColor: new Color3(0.14, 0.78, 0.88),
      },
      {
        axis: 'EW',
        direction: 1,
        fixedCoord: 26.2,
        initialPosAlong: -20.9,
        minBound: -21.5,
        maxBound: 21.5,
        walkSpeed: 2.05,
        phaseOffset: 4.5,
        isCrosswalkWalker: true,
        jacketColor: new Color3(0.86, 0.22, 0.52),
      },
      // Centro Histórico / Zócalo (CDMX)
      {
        axis: 'EW',
        direction: 1,
        fixedCoord: 97,
        initialPosAlong: 152,
        minBound: 146,
        maxBound: 186,
        walkSpeed: 1.48,
        phaseOffset: 1.1,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.22, 0.56, 0.82),
      },
      {
        axis: 'EW',
        direction: -1,
        fixedCoord: 126,
        initialPosAlong: 178,
        minBound: 146,
        maxBound: 186,
        walkSpeed: 1.56,
        phaseOffset: 3.7,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.86, 0.26, 0.26),
      },
      // Polanco / Santa Fe (CDMX)
      {
        axis: 'NS',
        direction: 1,
        fixedCoord: -358,
        initialPosAlong: 112,
        minBound: 100,
        maxBound: 175,
        walkSpeed: 1.52,
        phaseOffset: 2.0,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.18, 0.68, 0.58),
      },
      {
        axis: 'NS',
        direction: -1,
        fixedCoord: -402,
        initialPosAlong: 150,
        minBound: 100,
        maxBound: 175,
        walkSpeed: 1.6,
        phaseOffset: 0.7,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.76, 0.54, 0.2),
      },
      // Coyoacán / Ciudad Universitaria UNAM (CDMX)
      {
        axis: 'EW',
        direction: 1,
        fixedCoord: -343,
        initialPosAlong: -52,
        minBound: -68,
        maxBound: -24,
        walkSpeed: 1.5,
        phaseOffset: 1.5,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.18, 0.42, 0.78),
      },
      {
        axis: 'EW',
        direction: -1,
        fixedCoord: -341.5,
        initialPosAlong: -30,
        minBound: -68,
        maxBound: -24,
        walkSpeed: 1.42,
        phaseOffset: 3.9,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.84, 0.66, 0.14),
      },
      // Torres de Satélite · Naucalpan (Estado de México)
      {
        axis: 'NS',
        direction: 1,
        fixedCoord: -402,
        initialPosAlong: 318,
        minBound: 300,
        maxBound: 356,
        walkSpeed: 1.58,
        phaseOffset: 0.4,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.86, 0.34, 0.18),
      },
      {
        axis: 'NS',
        direction: -1,
        fixedCoord: -358,
        initialPosAlong: 344,
        minBound: 300,
        maxBound: 356,
        walkSpeed: 1.48,
        phaseOffset: 2.6,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.24, 0.64, 0.88),
      },
      // Vía Morelos · Ecatepec (Estado de México)
      {
        axis: 'NS',
        direction: 1,
        fixedCoord: 357,
        initialPosAlong: 312,
        minBound: 298,
        maxBound: 354,
        walkSpeed: 1.55,
        phaseOffset: 1.2,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.16, 0.72, 0.44),
      },
      {
        axis: 'NS',
        direction: -1,
        fixedCoord: 403,
        initialPosAlong: 342,
        minBound: 298,
        maxBound: 354,
        walkSpeed: 1.62,
        phaseOffset: 3.1,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.78, 0.24, 0.36),
      },
      // Cd. Nezahualcóyotl · Glorieta del Coyote (Estado de México)
      {
        axis: 'EW',
        direction: 1,
        fixedCoord: 52,
        initialPosAlong: 408,
        minBound: 402,
        maxBound: 446,
        walkSpeed: 1.5,
        phaseOffset: 0.8,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.88, 0.28, 0.28),
      },
      {
        axis: 'EW',
        direction: -1,
        fixedCoord: 97,
        initialPosAlong: 438,
        minBound: 402,
        maxBound: 446,
        walkSpeed: 1.56,
        phaseOffset: 4.0,
        isCrosswalkWalker: false,
        jacketColor: new Color3(0.2, 0.58, 0.84),
      },
    ];

    specs.forEach((spec, idx) => {
      const jacketMat = new PBRMaterial(`pedestrian-jacket-pbr-${idx}`, this.scene);
      jacketMat.albedoColor = spec.jacketColor;
      jacketMat.roughness = 0.78;

      const root = new TransformNode(`pedestrian-npc-${idx}`, this.scene);
      const worldX = spec.axis === 'NS' ? spec.fixedCoord : spec.initialPosAlong;
      const worldZ = spec.axis === 'NS' ? spec.initialPosAlong : spec.fixedCoord;
      root.position.set(worldX, 0, worldZ);
      root.rotation.y = this.resolveHeading(spec.axis, spec.direction);

      const torso = MeshBuilder.CreateBox(
        `ped-torso-${idx}`,
        { width: 0.42, height: 0.56, depth: 0.24 },
        this.scene,
      );
      torso.parent = root;
      torso.position.set(0, 1.12, 0);
      torso.material = jacketMat;

      const head = MeshBuilder.CreateSphere(
        `ped-head-${idx}`,
        { diameter: 0.26, segments: 8 },
        this.scene,
      );
      head.parent = root;
      head.position.set(0, 1.54, 0);
      head.material = skinMat;

      const leftLegHub = new TransformNode(`ped-lleg-hub-${idx}`, this.scene);
      leftLegHub.parent = root;
      leftLegHub.position.set(-0.1, 0.84, 0);
      const leftLeg = MeshBuilder.CreateBox(
        `ped-lleg-${idx}`,
        { width: 0.15, height: 0.78, depth: 0.16 },
        this.scene,
      );
      leftLeg.parent = leftLegHub;
      leftLeg.position.set(0, -0.39, 0);
      leftLeg.material = pantsMat;

      const rightLegHub = new TransformNode(`ped-rleg-hub-${idx}`, this.scene);
      rightLegHub.parent = root;
      rightLegHub.position.set(0.1, 0.84, 0);
      const rightLeg = MeshBuilder.CreateBox(
        `ped-rleg-${idx}`,
        { width: 0.15, height: 0.78, depth: 0.16 },
        this.scene,
      );
      rightLeg.parent = rightLegHub;
      rightLeg.position.set(0, -0.39, 0);
      rightLeg.material = pantsMat;

      const leftArmHub = new TransformNode(`ped-larm-hub-${idx}`, this.scene);
      leftArmHub.parent = root;
      leftArmHub.position.set(-0.29, 1.34, 0);
      const leftArm = MeshBuilder.CreateBox(
        `ped-larm-${idx}`,
        { width: 0.12, height: 0.54, depth: 0.13 },
        this.scene,
      );
      leftArm.parent = leftArmHub;
      leftArm.position.set(0, -0.25, 0);
      leftArm.material = jacketMat;

      const rightArmHub = new TransformNode(`ped-rarm-hub-${idx}`, this.scene);
      rightArmHub.parent = root;
      rightArmHub.position.set(0.29, 1.34, 0);
      const rightArm = MeshBuilder.CreateBox(
        `ped-rarm-${idx}`,
        { width: 0.12, height: 0.54, depth: 0.13 },
        this.scene,
      );
      rightArm.parent = rightArmHub;
      rightArm.position.set(0, -0.25, 0);
      rightArm.material = jacketMat;

      this.reflectables.push(torso, head);
      this.shadowCasters.push(torso);

      this.pedestrians.push({
        root,
        leftLegHub,
        rightLegHub,
        leftArmHub,
        rightArmHub,
        axis: spec.axis,
        direction: spec.direction,
        fixedCoord: spec.fixedCoord,
        posAlong: spec.initialPosAlong,
        minBound: spec.minBound,
        maxBound: spec.maxBound,
        walkSpeed: spec.walkSpeed,
        phaseOffset: spec.phaseOffset,
        isCrosswalkWalker: spec.isCrosswalkWalker,
      });
    });
  }

  private resolveHeading(axis: RoadAxis, direction: 1 | -1): number {
    if (axis === 'NS') {
      return direction === 1 ? 0 : Math.PI;
    }
    return direction === 1 ? Math.PI / 2 : -Math.PI / 2;
  }

  private resolveStopLines(axis: RoadAxis, direction: 1 | -1): readonly number[] {
    if (axis === 'NS') {
      return direction === 1 ? NS_POS_STOPLINES : NS_NEG_STOPLINES;
    }
    return direction === 1 ? EW_POS_STOPLINES : EW_NEG_STOPLINES;
  }
}
