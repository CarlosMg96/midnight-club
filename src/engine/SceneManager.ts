import {
  Color3,
  Color4,
  CubeTexture,
  DefaultRenderingPipeline,
  DirectionalLight,
  GlowLayer,
  HemisphericLight,
  ImageProcessingConfiguration,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  type AbstractEngine,
  type AbstractMesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  getMetropolitanZone,
  NOCTURNAL_COLORS,
  resolveIntersectionSignalState,
  type MetropolitanZoneId,
  type MetropolitanZoneSpec,
  type RgbTuple,
} from '../config/GameConfig';
import { getGraphicsProfileSettings, type QualityProfile } from '../config/GraphicsConfig';
import type { DrivingInputState } from '../multiplayer/InputManager';
import { VehiclePhysics, type VehiclePhysicsState } from '../physics/VehiclePhysics';
import { Vehicle } from '../vehicles/Vehicle';
import { VehicleCamera, type CameraMode } from '../vehicles/VehicleCamera';
import {
  computeEffectiveVehicleSpecs,
  DEFAULT_TUNING_CONFIG,
  type TuningConfig,
} from '../vehicles/VehicleConfig';
import { AngelMonumentBuilder } from '../world/AngelMonumentBuilder';
import { BuildingManager } from '../world/BuildingManager';
import { RaceManager, type RaceSnapshot } from '../world/RaceManager';
import { RoadManager } from '../world/RoadManager';
import { METROPOLITAN_TRAFFIC_COORDS, TrafficManager } from '../world/TrafficManager';
import { createDuskSkyTexture } from './ProceduralTextures';

function toColor3(rgb: RgbTuple): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

/**
 * Orquesta Paseo de la Reforma, el Ángel de la Independencia, el Nissan Tsuru B13 / Concept GT,
 * la física de conducción, cámara de persecución, reflejos IBL/planares y postprocesado ACES.
 */
export class SceneManager {
  public readonly scene: Scene;
  private readonly vehicleCamera: VehicleCamera;
  private readonly ambientLight: HemisphericLight;
  private readonly moonLight: DirectionalLight;
  private readonly roadManager: RoadManager;
  private readonly angelMonument: AngelMonumentBuilder;
  private readonly buildingManager: BuildingManager;
  private readonly trafficManager: TrafficManager;
  private readonly raceManager: RaceManager;
  private readonly playerVehicle: Vehicle;
  private readonly vehiclePhysics: VehiclePhysics;
  private readonly pipeline: DefaultRenderingPipeline;
  private readonly glowLayer: GlowLayer;
  private readonly skyDome: AbstractMesh;
  private readonly reflectableMeshes: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private shadowGenerator: ShadowGenerator | null = null;
  private currentProfile: QualityProfile;
  private currentTuning: TuningConfig = DEFAULT_TUNING_CONFIG;
  private activeZoneId: MetropolitanZoneId = 'REFORMA_ANGEL';
  private elapsedSec = 0;
  private arrestHoldSec = 0;

  public constructor(
    engine: AbstractEngine,
    canvas: HTMLCanvasElement,
    initialProfile: QualityProfile,
  ) {
    this.currentProfile = initialProfile;
    this.scene = new Scene(engine);
    this.configureAtmosphereAndEnvironment();

    this.vehicleCamera = new VehicleCamera(this.scene, canvas);
    this.ambientLight = this.createAmbientLight();
    this.moonLight = this.createMoonLight();

    this.skyDome = this.buildSkyDome();

    this.roadManager = new RoadManager(this.scene);
    this.angelMonument = new AngelMonumentBuilder(this.scene);
    this.buildingManager = new BuildingManager(this.scene);
    this.trafficManager = new TrafficManager(this.scene);
    this.raceManager = new RaceManager(this.scene);
    this.vehiclePhysics = new VehiclePhysics();

    this.pipeline = new DefaultRenderingPipeline('cinematic-pipeline', true, this.scene, [
      this.vehicleCamera.camera,
    ]);
    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.bloomThreshold = 0.72;
    this.pipeline.bloomWeight = 0.34;
    this.pipeline.bloomKernel = 48;
    this.pipeline.bloomScale = 0.5;
    this.pipeline.sharpenEnabled = true;
    this.pipeline.sharpen.edgeAmount = 0.25;

    this.glowLayer = new GlowLayer('neon-glow-layer', this.scene, {
      blurKernelSize: 36,
      mainTextureFixedSize: 512,
    });
    this.glowLayer.intensity = 0.78;

    this.playerVehicle = new Vehicle(this.scene, this.currentTuning, () => {
      this.refreshMeshLists();
    });

    this.reflectableMeshes.push(this.skyDome);
    this.refreshMeshLists();
    this.playerVehicle.syncFromPhysics(this.vehiclePhysics.getState(), 0);
    this.applyQualityProfile(initialProfile);
  }

  public getQualityProfile(): QualityProfile {
    return this.currentProfile;
  }

  public getTuningConfig(): TuningConfig {
    return this.currentTuning;
  }

  public applyTuning(tuning: TuningConfig): void {
    this.currentTuning = tuning;
    this.playerVehicle.applyTuning(tuning);
    this.refreshMeshLists();
  }

  public cycleCameraMode(): CameraMode {
    return this.vehicleCamera.cycleMode();
  }

  public resetVehicle(): void {
    this.arrestHoldSec = 0;
    const zone = getMetropolitanZone(this.activeZoneId);
    this.vehiclePhysics.reset(zone.spawn);
    const state = this.vehiclePhysics.getState();
    this.skyDome.position.set(state.x, 12, state.z);
    this.playerVehicle.syncFromPhysics(state, 0);
    this.vehicleCamera.update(state, 5);
  }

  public startOrCycleRace(): void {
    this.arrestHoldSec = 0;
    const spec = this.raceManager.startNextRace();
    this.vehiclePhysics.reset(spec.spawn);
    const state = this.vehiclePhysics.getState();
    this.skyDome.position.set(state.x, 12, state.z);
    this.playerVehicle.syncFromPhysics(state, 0);
    this.vehicleCamera.update(state, 5);
  }

  public getRaceSnapshot(): RaceSnapshot {
    return this.raceManager.getSnapshot(true);
  }

  public teleportToZone(zoneId: MetropolitanZoneId): MetropolitanZoneSpec {
    this.arrestHoldSec = 0;
    this.raceManager.stopRace();
    this.activeZoneId = zoneId;
    const zone = getMetropolitanZone(zoneId);
    this.vehiclePhysics.reset(zone.spawn);
    const state = this.vehiclePhysics.getState();
    this.skyDome.position.set(state.x, 12, state.z);
    this.playerVehicle.syncFromPhysics(state, 0);
    this.vehicleCamera.update(state, 5);
    return zone;
  }

  public stepPhysics(fixedDt: number, input: DrivingInputState): VehiclePhysicsState {
    this.elapsedSec += fixedDt;
    const playerState = this.vehiclePhysics.getState();
    this.trafficManager.update(fixedDt, this.elapsedSec, playerState);
    const specs = computeEffectiveVehicleSpecs(this.currentTuning);
    const effectiveInput: DrivingInputState = this.raceManager.isCountdownFrozen()
      ? { ...input, throttle: 0, brake: 1 }
      : input;
    const colliders = [...METROPOLITAN_TRAFFIC_COORDS, ...this.raceManager.getRivalColliders()];
    const nextState = this.vehiclePhysics.step(
      fixedDt,
      effectiveInput,
      specs,
      colliders,
      resolveIntersectionSignalState(this.elapsedSec),
    );

    if (nextState.isArrested) {
      this.raceManager.stopRace();
      this.arrestHoldSec += fixedDt;
      if (this.arrestHoldSec >= 4.5) {
        this.resetVehicle();
        return this.vehiclePhysics.getState();
      }
    } else {
      this.arrestHoldSec = 0;
      this.raceManager.update(fixedDt, nextState);
    }

    return nextState;
  }

  public syncVisuals(frameDt: number): VehiclePhysicsState {
    const state = this.vehiclePhysics.getState();
    this.skyDome.position.set(state.x, 12, state.z);
    this.roadManager.updateTrafficSignals(this.elapsedSec);
    this.playerVehicle.syncFromPhysics(state, frameDt);
    this.vehicleCamera.update(state, frameDt);
    return state;
  }

  public applyQualityProfile(profile: QualityProfile): void {
    this.currentProfile = profile;
    const settings = getGraphicsProfileSettings(profile);

    this.vehicleCamera.setMaxDrawDistance(settings.maxDrawDistance);
    this.scene.fogDensity = settings.fogDensity;
    this.scene.environmentIntensity = settings.environmentIntensity;
    this.ambientLight.intensity = profile === 'PERFORMANCE' ? 0.45 : 0.56;

    this.roadManager.applyStreetLightBudget(settings.streetLightCount);
    this.roadManager.setPlanarReflection(
      settings.planarReflections,
      settings.reflectionMapSize,
      this.reflectableMeshes,
    );

    this.playerVehicle.setParticleScale(settings.particleScale);

    this.pipeline.bloomEnabled = settings.bloomEnabled;
    this.pipeline.fxaaEnabled = settings.fxaaEnabled;
    this.pipeline.sharpenEnabled = profile !== 'PERFORMANCE';

    this.glowLayer.isEnabled = settings.glowEnabled;
    this.glowLayer.intensity = profile === 'QUALITY' ? 0.82 : 0.65;

    this.rebuildShadowGenerator(
      settings.shadowsEnabled,
      settings.shadowMapSize,
      settings.softShadows,
    );
  }

  public render(): void {
    this.scene.render();
  }

  public dispose(): void {
    this.raceManager.dispose();
    this.playerVehicle.dispose();
    this.roadManager.dispose();
    this.shadowGenerator?.dispose();
    this.shadowGenerator = null;
    this.glowLayer.dispose();
    this.pipeline.dispose();
    this.scene.dispose();
  }

  private refreshMeshLists(): void {
    if (!this.playerVehicle || !this.glowLayer) {
      return;
    }
    const skyDome = this.scene.getMeshByName('dusk-sky-dome');
    this.reflectableMeshes.length = 0;
    if (skyDome) {
      this.reflectableMeshes.push(skyDome);
    }
    this.reflectableMeshes.push(
      ...this.roadManager.getReflectableMeshes(),
      ...this.angelMonument.getReflectableMeshes(),
      ...this.buildingManager.getReflectableMeshes(),
      ...this.trafficManager.getReflectableMeshes(),
      ...this.playerVehicle.getReflectableMeshes(),
    );

    this.shadowCasters.length = 0;
    this.shadowCasters.push(
      ...this.roadManager.getShadowCasters(),
      ...this.angelMonument.getShadowCasters(),
      ...this.buildingManager.getShadowCasters(),
      ...this.trafficManager.getShadowCasters(),
      ...this.playerVehicle.getShadowCasters(),
    );

    // Solo luces, semáforos y letreros neón entran al GlowLayer (evita edificios blancos)
    const glowOnly: AbstractMesh[] = [
      ...this.roadManager.getGlowMeshes(),
      ...this.angelMonument.getGlowMeshes(),
      ...this.buildingManager.getGlowMeshes(),
      ...this.trafficManager.getGlowMeshes(),
      ...this.raceManager.getGlowMeshes(),
      ...this.playerVehicle.getGlowMeshes(),
    ];
    for (const mesh of glowOnly) {
      if (mesh instanceof Mesh) {
        this.glowLayer.addIncludedOnlyMesh(mesh);
      } else if (mesh instanceof InstancedMesh && mesh.sourceMesh instanceof Mesh) {
        this.glowLayer.addIncludedOnlyMesh(mesh.sourceMesh);
      }
    }

    const settings = getGraphicsProfileSettings(this.currentProfile);
    if (settings.planarReflections) {
      this.roadManager.setPlanarReflection(
        true,
        settings.reflectionMapSize,
        this.reflectableMeshes,
      );
    }

    if (this.shadowGenerator) {
      for (const caster of this.shadowCasters) {
        this.shadowGenerator.addShadowCaster(caster, true);
      }
    }
  }

  private configureAtmosphereAndEnvironment(): void {
    this.scene.clearColor = new Color4(
      NOCTURNAL_COLORS.skyClear.r,
      NOCTURNAL_COLORS.skyClear.g,
      NOCTURNAL_COLORS.skyClear.b,
      1,
    );
    this.scene.ambientColor = new Color3(0.14, 0.16, 0.24);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = toColor3(NOCTURNAL_COLORS.fog);

    // IBL HDR prefiltrado para reflejos metálicos realistas en pintura, cromo y oro del Ángel
    const envTexture = CubeTexture.CreateFromPrefilteredData(
      '/assets/textures/environmentSpecular.env',
      this.scene,
    );
    this.scene.environmentTexture = envTexture;
    this.scene.environmentIntensity = 1.05;

    const ipc = this.scene.imageProcessingConfiguration;
    ipc.toneMappingEnabled = true;
    ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ipc.exposure = 1.18;
    ipc.contrast = 1.24;
    ipc.vignetteEnabled = true;
    ipc.vignetteWeight = 1.35;
    ipc.vignetteColor = new Color4(0.02, 0.03, 0.07, 1);
  }

  private createAmbientLight(): HemisphericLight {
    const light = new HemisphericLight('nocturnal-sky-light', new Vector3(0, 1, 0), this.scene);
    light.diffuse = toColor3(NOCTURNAL_COLORS.ambientSky);
    light.groundColor = toColor3(NOCTURNAL_COLORS.ambientGround);
    light.intensity = 0.56;
    return light;
  }

  private createMoonLight(): DirectionalLight {
    const light = new DirectionalLight(
      'moon-directional-light',
      new Vector3(-0.35, -0.78, 0.48).normalize(),
      this.scene,
    );
    light.position = new Vector3(36, 80, -35);
    light.diffuse = toColor3(NOCTURNAL_COLORS.moonLight);
    light.specular = new Color3(0.84, 0.9, 1.0);
    light.intensity = 1.3;
    light.shadowMinZ = 10;
    light.shadowMaxZ = 210;
    return light;
  }

  private buildSkyDome(): AbstractMesh {
    const skyDome = MeshBuilder.CreateSphere(
      'dusk-sky-dome',
      { diameter: 2800, segments: 24, sideOrientation: Mesh.BACKSIDE },
      this.scene,
    );
    skyDome.position.set(0, 12, 60);
    skyDome.isPickable = false;
    skyDome.applyFog = false;

    const skyMat = new StandardMaterial('dusk-sky-mat', this.scene);
    skyMat.disableLighting = true;
    skyMat.emissiveTexture = createDuskSkyTexture(this.scene);
    skyMat.fogEnabled = false;
    skyDome.material = skyMat;

    return skyDome;
  }

  private rebuildShadowGenerator(enabled: boolean, mapSize: number, softShadows: boolean): void {
    this.shadowGenerator?.dispose();
    this.shadowGenerator = null;

    if (!enabled) {
      return;
    }

    const generator = new ShadowGenerator(mapSize, this.moonLight);
    generator.usePercentageCloserFiltering = softShadows;
    generator.bias = 0.0008;
    generator.normalBias = 0.015;
    for (const mesh of this.shadowCasters) {
      generator.addShadowCaster(mesh, true);
    }
    this.shadowGenerator = generator;
  }
}
