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
import { createSmokeTexture } from '../engine/ProceduralTextures';
import type { VehiclePhysicsState } from '../physics/VehiclePhysics';
import { buildTsuruB13Mesh, type TsuruRig } from './TsuruMeshBuilder';
import {
  PAINT_PRESETS,
  UNDERGLOW_COLORS,
  type TuningConfig,
  type VehicleModelId,
} from './VehicleConfig';

/**
 * Administra la representación 3D del vehículo del jugador (Nissan Tsuru B13 o
 * superdeportivo CarConcept.glb), aplicando tuning en vivo, movimiento de ruedas,
 * inclinación de suspensión y humo de derrape.
 */
export class Vehicle {
  public readonly root: TransformNode;
  private readonly scene: Scene;
  private readonly tsuruRig: TsuruRig;
  private readonly conceptPivot: TransformNode;
  private readonly conceptUnderglowRails: AbstractMesh[] = [];
  private readonly conceptUnderglowMat: PBRMaterial;
  private readonly conceptUnderglowLight: PointLight;
  private readonly smokeSystems: ParticleSystem[] = [];
  private readonly smokeAnchors: TransformNode[] = [];
  private conceptLoaded = false;
  private conceptLoading = false;
  private conceptPaintMaterials: PBRMaterial[] = [];
  private conceptMeshes: AbstractMesh[] = [];
  private currentTuning: TuningConfig;
  private wheelSpinAngle = 0;

  public constructor(scene: Scene, initialTuning: TuningConfig) {
    this.scene = scene;
    this.currentTuning = initialTuning;
    this.root = new TransformNode('player-vehicle-root', scene);

    this.tsuruRig = buildTsuruB13Mesh(scene, initialTuning);
    this.tsuruRig.root.parent = this.root;

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
    this.applyTuning(initialTuning);
  }

  public getReflectableMeshes(): AbstractMesh[] {
    return [...this.tsuruRig.reflectables, ...this.conceptMeshes];
  }

  public getShadowCasters(): AbstractMesh[] {
    return [...this.tsuruRig.shadowCasters, ...this.conceptMeshes];
  }

  public getGlowMeshes(): AbstractMesh[] {
    return [...this.tsuruRig.glowMeshes, ...this.conceptUnderglowRails];
  }

  public getPosition(): Vector3 {
    return this.root.position;
  }

  public applyTuning(tuning: TuningConfig): void {
    this.currentTuning = tuning;
    this.setActiveVehicleModel(tuning.vehicleId);
    this.tsuruRig.applyTuning(tuning);
    this.applyConceptTuning(tuning);
  }

  public setParticleScale(scale: number): void {
    const clamped = Math.max(0.1, Math.min(1.5, scale));
    for (const ps of this.smokeSystems) {
      ps.userData = clamped;
    }
  }

  public syncFromPhysics(state: VehiclePhysicsState, dt: number): void {
    this.root.position.set(state.x, 0, state.z);
    this.root.rotation.y = state.heading;

    // Transferencia de peso (cabceo en aceleración/frenado y balanceo en curva)
    const targetPitch = state.pitchAngle;
    const targetRoll = state.rollAngle;

    this.tsuruRig.bodyPivot.rotation.x = targetPitch;
    this.tsuruRig.bodyPivot.rotation.z = targetRoll;
    this.tsuruRig.setBraking(state.isBraking);

    this.conceptPivot.rotation.x = targetPitch;
    this.conceptPivot.rotation.z = targetRoll;

    // Giro y dirección de las 4 ruedas
    const wheelRadius = 0.31;
    this.wheelSpinAngle += (state.forwardSpeed * dt) / wheelRadius;

    this.tsuruRig.wheelPivots.forEach((pivot, idx) => {
      if (idx < 2) {
        pivot.rotation.y = state.steerAngle;
      }
    });
    for (const spinner of this.tsuruRig.wheelSpinners) {
      spinner.rotation.x = this.wheelSpinAngle;
    }

    // Actualización dinámica del humo de neumáticos en derrape
    this.smokeSystems.forEach((ps, idx) => {
      const anchor = this.smokeAnchors[idx];
      if (anchor) {
        ps.emitter = anchor.getAbsolutePosition();
      }
      const scaleFactor = typeof ps.userData === 'number' ? ps.userData : 1.0;
      ps.emitRate = state.isDrifting && Math.abs(state.speedMs) > 6 ? Math.round(90 * scaleFactor) : 0;
    });
  }

  public dispose(): void {
    for (const ps of this.smokeSystems) {
      ps.stop();
      ps.dispose();
    }
    this.smokeSystems.length = 0;
    this.tsuruRig.dispose();
    this.root.dispose();
  }

  private setActiveVehicleModel(vehicleId: VehicleModelId): void {
    const showTsuru = vehicleId === 'TSURU_B13';
    this.tsuruRig.root.setEnabled(showTsuru);
    this.conceptPivot.setEnabled(!showTsuru);

    if (!showTsuru && !this.conceptLoaded && !this.conceptLoading) {
      void this.loadConceptGlb();
    }
  }

  private async loadConceptGlb(): Promise<void> {
    this.conceptLoading = true;
    try {
      const result = await ImportMeshAsync('/assets/vehicles/CarConcept.glb', this.scene);
      const containerNode = new TransformNode('car-concept-glb-container', this.scene);
      containerNode.parent = this.conceptPivot;

      // Normaliza escala y orientación del GLB para alinearlo con el eje +Z
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
    } catch (error) {
      console.error('No se pudo cargar /assets/vehicles/CarConcept.glb:', error);
      // En caso de fallo de carga, mantiene visible el Tsuru B13 para nunca dejar al jugador sin coche
      this.tsuruRig.root.setEnabled(true);
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
      new Vector3(-0.78, 0.14, -1.28),
      new Vector3(0.78, 0.14, -1.28),
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
      ps.userData = 1.0;
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
}
