import {
  Color3,
  Color4,
  ImportMeshAsync,
  MeshBuilder,
  ParticleSystem,
  PBRMaterial,
  PointLight,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import { createFlameTexture, createSmokeTexture } from '../engine/ProceduralTextures';
import type { GearLabel, VehiclePhysicsState } from '../physics/VehiclePhysics';
import { buildAudiR8Mesh, buildMercedesAmgGtMesh, buildNissanGtrR34Mesh } from './BrandCarBuilders';
import { buildTsuruB13Mesh, type TsuruRig } from './TsuruMeshBuilder';
import {
  PAINT_PRESETS,
  UNDERGLOW_COLORS,
  type TuningConfig,
  type VehicleModelId,
} from './VehicleConfig';

type ProceduralCarId = Exclude<VehicleModelId, 'CONCEPT_GT'>;

/**
 * Administra la flota de vehículos del jugador (Nissan Tsuru B13, Nissan Skyline GT-R R34,
 * Audi R8 V10 Plus, Mercedes-AMG GT R y Concept GT .glb), aplicando tuning en vivo,
 * movimiento de ruedas, suspensión, humo de derrape y flamas de contraexplosión (backfire).
 */
export class Vehicle {
  public readonly root: TransformNode;
  private readonly scene: Scene;
  private readonly proceduralRigs = new Map<ProceduralCarId, TsuruRig>();
  private readonly conceptPivot: TransformNode;
  private readonly conceptUnderglowRails: AbstractMesh[] = [];
  private readonly conceptUnderglowMat: PBRMaterial;
  private readonly conceptUnderglowLight: PointLight;
  private readonly smokeSystems: ParticleSystem[] = [];
  private readonly smokeAnchors: TransformNode[] = [];
  private readonly flameSystems: ParticleSystem[] = [];
  private readonly flameAnchors: TransformNode[] = [];
  private readonly onAssetLoaded?: () => void;
  private conceptLoaded = false;
  private conceptLoading = false;
  private conceptPaintMaterials: PBRMaterial[] = [];
  private conceptMeshes: AbstractMesh[] = [];
  private currentTuning: TuningConfig;
  private wheelSpinAngle = 0;
  private particleScale = 1.0;
  private lastGear: GearLabel = 'N';
  private backfireTimer = 0;

  public constructor(scene: Scene, initialTuning: TuningConfig, onAssetLoaded?: () => void) {
    this.scene = scene;
    this.currentTuning = initialTuning;
    this.root = new TransformNode('player-vehicle-root', scene);

    this.conceptPivot = new TransformNode('concept-gt-pivot', scene);
    this.conceptPivot.parent = this.root;
    this.conceptPivot.setEnabled(false);

    this.conceptUnderglowMat = new PBRMaterial('concept-underglow-pbr', scene);
    this.conceptUnderglowLight = new PointLight(
      'concept-underglow-light',
      new Vector3(0, 0.22, 0),
      scene,
    );
    this.conceptUnderglowLight.parent = this.conceptPivot;
    this.conceptUnderglowLight.intensity = 0;
    this.conceptUnderglowLight.range = 8.5;

    for (const side of [-0.88, 0.88] as const) {
      const rail = MeshBuilder.CreateBox(
        `concept-underglow-rail-${side}`,
        { width: 0.06, height: 0.035, depth: 2.5 },
        scene,
      );
      rail.parent = this.conceptPivot;
      rail.position.set(side, 0.14, 0);
      rail.material = this.conceptUnderglowMat;
      rail.setEnabled(false);
      this.conceptUnderglowRails.push(rail);
    }

    this.initDriftSmoke();
    this.initExhaustFlames();
    this.applyTuning(initialTuning);
    this.onAssetLoaded = onAssetLoaded;
  }

  public getReflectableMeshes(): AbstractMesh[] {
    const meshes: AbstractMesh[] = [...this.conceptMeshes];
    for (const rig of this.proceduralRigs.values()) {
      meshes.push(...rig.reflectables);
    }
    return meshes;
  }

  public getShadowCasters(): AbstractMesh[] {
    const meshes: AbstractMesh[] = [...this.conceptMeshes];
    for (const rig of this.proceduralRigs.values()) {
      meshes.push(...rig.shadowCasters);
    }
    return meshes;
  }

  public getGlowMeshes(): AbstractMesh[] {
    const meshes: AbstractMesh[] = [...this.conceptUnderglowRails];
    for (const rig of this.proceduralRigs.values()) {
      meshes.push(...rig.glowMeshes);
    }
    return meshes;
  }

  public getPosition(): Vector3 {
    return this.root.position;
  }

  public applyTuning(tuning: TuningConfig): void {
    this.currentTuning = tuning;
    this.setActiveVehicleModel(tuning.vehicleId);

    for (const rig of this.proceduralRigs.values()) {
      rig.applyTuning(tuning);
    }
    this.applyConceptTuning(tuning);
  }

  public setParticleScale(scale: number): void {
    this.particleScale = Math.max(0.1, Math.min(1.5, scale));
  }

  public syncFromPhysics(state: VehiclePhysicsState, dt: number): void {
    this.root.position.set(state.x, 0, state.z);
    this.root.rotation.y = state.heading;

    // Detecta cambio ascendente de marcha para disparar llamarada de contraexplosión
    if (state.gear !== this.lastGear) {
      const prevNum = Number(this.lastGear);
      const nextNum = Number(state.gear);
      if (Number.isFinite(prevNum) && Number.isFinite(nextNum) && nextNum > prevNum) {
        this.backfireTimer = 0.22;
      }
      this.lastGear = state.gear;
    }
    if (this.backfireTimer > 0) {
      this.backfireTimer = Math.max(0, this.backfireTimer - dt);
    }

    const wheelRadius = 0.33;
    this.wheelSpinAngle += (state.forwardSpeed * dt) / wheelRadius;

    if (this.currentTuning.vehicleId !== 'CONCEPT_GT') {
      const activeRig = this.proceduralRigs.get(this.currentTuning.vehicleId);
      if (activeRig) {
        activeRig.bodyPivot.rotation.x = state.pitchAngle;
        activeRig.bodyPivot.rotation.z = state.rollAngle;
        activeRig.setBraking(state.isBraking);
        activeRig.wheelPivots.forEach((pivot, idx) => {
          if (idx < 2) {
            pivot.rotation.y = state.steerAngle;
          }
        });
        for (const spinner of activeRig.wheelSpinners) {
          spinner.rotation.x = this.wheelSpinAngle;
        }
      }
    } else {
      this.conceptPivot.rotation.x = state.pitchAngle;
      this.conceptPivot.rotation.z = state.rollAngle;
    }

    this.smokeSystems.forEach((ps, idx) => {
      const anchor = this.smokeAnchors[idx];
      if (anchor) {
        ps.emitter = anchor.getAbsolutePosition();
      }
      ps.emitRate =
        state.isDrifting && Math.abs(state.speedMs) > 6 ? Math.round(90 * this.particleScale) : 0;
    });

    const showFlames = state.isNitroActive || this.backfireTimer > 0;
    this.flameSystems.forEach((ps, idx) => {
      const anchor = this.flameAnchors[idx];
      if (anchor) {
        ps.emitter = anchor.getAbsolutePosition();
      }
      const dirX = -Math.sin(state.heading) * 3.5;
      const dirZ = -Math.cos(state.heading) * 3.5;
      ps.direction1.set(dirX - 0.3, 0.1, dirZ - 0.3);
      ps.direction2.set(dirX + 0.3, 0.3, dirZ + 0.3);
      ps.emitRate = showFlames ? Math.round(75 * this.particleScale) : 0;
    });
  }

  public dispose(): void {
    for (const ps of this.smokeSystems) {
      ps.stop();
      ps.dispose();
    }
    for (const ps of this.flameSystems) {
      ps.stop();
      ps.dispose();
    }
    this.smokeSystems.length = 0;
    this.flameSystems.length = 0;
    for (const rig of this.proceduralRigs.values()) {
      rig.dispose();
    }
    this.proceduralRigs.clear();
    this.root.dispose();
  }

  private getOrCreateProceduralRig(id: ProceduralCarId): TsuruRig {
    const existing = this.proceduralRigs.get(id);
    if (existing) {
      return existing;
    }

    let rig: TsuruRig;
    switch (id) {
      case 'NISSAN_GTR_R34':
        rig = buildNissanGtrR34Mesh(this.scene, this.currentTuning);
        break;
      case 'AUDI_R8':
        rig = buildAudiR8Mesh(this.scene, this.currentTuning);
        break;
      case 'MERCEDES_AMG_GT':
        rig = buildMercedesAmgGtMesh(this.scene, this.currentTuning);
        break;
      case 'NISSAN_TSURU':
      default:
        rig = buildTsuruB13Mesh(this.scene, this.currentTuning);
        break;
    }

    rig.root.parent = this.root;
    this.proceduralRigs.set(id, rig);
    this.onAssetLoaded?.();
    return rig;
  }

  private setActiveVehicleModel(vehicleId: VehicleModelId): void {
    for (const rig of this.proceduralRigs.values()) {
      rig.root.setEnabled(false);
    }

    if (vehicleId === 'CONCEPT_GT') {
      this.conceptPivot.setEnabled(true);
      if (!this.conceptLoaded && !this.conceptLoading) {
        void this.loadConceptGlb();
      }
      return;
    }

    this.conceptPivot.setEnabled(false);
    const activeRig = this.getOrCreateProceduralRig(vehicleId);
    activeRig.root.setEnabled(true);
  }

  private async loadConceptGlb(): Promise<void> {
    this.conceptLoading = true;
    try {
      const result = await ImportMeshAsync('/assets/vehicles/CarConcept.glb', this.scene);
      const containerNode = new TransformNode('car-concept-glb-container', this.scene);
      containerNode.parent = this.conceptPivot;

      result.meshes.forEach((mesh) => {
        if (!mesh.parent) {
          mesh.parent = containerNode;
        }
        this.conceptMeshes.push(mesh);
        if (mesh.material instanceof PBRMaterial) {
          const matName = mesh.material.name.toLowerCase();
          if (matName.includes('paint') || matName.includes('body') || matName.includes('car')) {
            if (!this.conceptPaintMaterials.includes(mesh.material)) {
              this.conceptPaintMaterials.push(mesh.material);
            }
          }
        }
      });

      const bounds = containerNode.getHierarchyBoundingVectors(true);
      const size = bounds.max.subtract(bounds.min);
      const maxDim = Math.max(size.x, size.z, 0.001);
      const targetLength = 4.45;
      const scale = targetLength / maxDim;
      containerNode.scaling.setAll(scale);

      const scaledBounds = containerNode.getHierarchyBoundingVectors(true);
      const centerX = (scaledBounds.min.x + scaledBounds.max.x) / 2;
      const centerZ = (scaledBounds.min.z + scaledBounds.max.z) / 2;
      containerNode.position.set(-centerX, -scaledBounds.min.y, -centerZ);

      this.conceptLoaded = true;
      this.applyConceptTuning(this.currentTuning);
      this.onAssetLoaded?.();
    } catch (error) {
      console.error('No se pudo cargar /assets/vehicles/CarConcept.glb:', error);
      const fallback = this.getOrCreateProceduralRig('NISSAN_TSURU');
      fallback.root.setEnabled(true);
      this.conceptPivot.setEnabled(false);
    } finally {
      this.conceptLoading = false;
    }
  }

  private applyConceptTuning(tuning: TuningConfig): void {
    const paint = PAINT_PRESETS[tuning.paintPreset];
    const color = Color3.FromHexString(paint.primaryHex);
    for (const mat of this.conceptPaintMaterials) {
      mat.albedoColor = color;
      mat.metallic = paint.metallic;
      mat.roughness = paint.roughness;
    }

    const underglow = UNDERGLOW_COLORS[tuning.underglow];
    const hasGlow = underglow.hex !== null && tuning.vehicleId === 'CONCEPT_GT';
    for (const rail of this.conceptUnderglowRails) {
      rail.setEnabled(hasGlow);
    }
    if (hasGlow && underglow.hex) {
      const glowColor = Color3.FromHexString(underglow.hex);
      this.conceptUnderglowMat.albedoColor = glowColor;
      this.conceptUnderglowMat.emissiveColor = glowColor.scale(2.4);
      this.conceptUnderglowLight.diffuse = glowColor;
      this.conceptUnderglowLight.intensity = 15;
    } else {
      this.conceptUnderglowLight.intensity = 0;
    }

    this.conceptPivot.position.y =
      tuning.stance === 'DRIFT_SPEC' ? -0.05 : tuning.stance === 'LOWERED' ? -0.035 : 0;
  }

  private initDriftSmoke(): void {
    const smokeTex = createSmokeTexture(this.scene);
    const wheelOffsets: readonly Vector3[] = [
      new Vector3(-0.8, 0.14, -1.32),
      new Vector3(0.8, 0.14, -1.32),
    ];

    wheelOffsets.forEach((offset, idx) => {
      const anchor = new TransformNode(`player-smoke-anchor-${idx}`, this.scene);
      anchor.parent = this.root;
      anchor.position.copyFrom(offset);
      this.smokeAnchors.push(anchor);

      const ps = new ParticleSystem(`player-drift-smoke-${idx}`, 160, this.scene);
      ps.particleTexture = smokeTex;
      ps.emitter = anchor.getAbsolutePosition();
      ps.minEmitBox = new Vector3(-0.18, 0, -0.18);
      ps.maxEmitBox = new Vector3(0.18, 0.1, 0.18);

      ps.color1 = new Color4(0.84, 0.88, 0.94, 0.38);
      ps.color2 = new Color4(0.66, 0.72, 0.82, 0.2);
      ps.colorDead = new Color4(0.45, 0.5, 0.62, 0.0);

      ps.minSize = 0.45;
      ps.maxSize = 1.65;
      ps.minLifeTime = 0.45;
      ps.maxLifeTime = 1.1;
      ps.emitRate = 0;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.gravity = new Vector3(0, 0.55, 0);
      ps.direction1 = new Vector3(-0.5, 0.3, -1.2);
      ps.direction2 = new Vector3(0.5, 0.9, -0.4);
      ps.minEmitPower = 0.6;
      ps.maxEmitPower = 1.3;
      ps.start();

      this.smokeSystems.push(ps);
    });
  }

  private initExhaustFlames(): void {
    const flameTex = createFlameTexture(this.scene);
    const pipeOffsets: readonly Vector3[] = [
      new Vector3(-0.55, 0.26, -2.3),
      new Vector3(0.55, 0.26, -2.3),
    ];

    pipeOffsets.forEach((offset, idx) => {
      const anchor = new TransformNode(`player-flame-anchor-${idx}`, this.scene);
      anchor.parent = this.root;
      anchor.position.copyFrom(offset);
      this.flameAnchors.push(anchor);

      const ps = new ParticleSystem(`player-exhaust-flame-${idx}`, 80, this.scene);
      ps.particleTexture = flameTex;
      ps.emitter = anchor.getAbsolutePosition();
      ps.minEmitBox = new Vector3(-0.04, -0.02, -0.04);
      ps.maxEmitBox = new Vector3(0.04, 0.02, 0.04);

      ps.color1 = new Color4(1.0, 0.78, 0.24, 0.95);
      ps.color2 = new Color4(0.45, 0.72, 1.0, 0.85);
      ps.colorDead = new Color4(1.0, 0.25, 0.04, 0.0);

      ps.minSize = 0.22;
      ps.maxSize = 0.55;
      ps.minLifeTime = 0.06;
      ps.maxLifeTime = 0.14;
      ps.emitRate = 0;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.minEmitPower = 1.2;
      ps.maxEmitPower = 2.4;
      ps.start();

      this.flameSystems.push(ps);
    });
  }
}
