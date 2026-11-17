import {
  ArcRotateCamera,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  GlowLayer,
  HemisphericLight,
  ImageProcessingConfiguration,
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
import { INITIAL_CAMERA_CONFIG, NOCTURNAL_COLORS, type RgbTuple } from '../config/GameConfig';
import { getGraphicsProfileSettings, type QualityProfile } from '../config/GraphicsConfig';
import { BuildingManager } from '../world/BuildingManager';
import { HeroVehicleShowcase } from '../world/HeroVehicleShowcase';
import { RoadManager } from '../world/RoadManager';
import { TrafficManager } from '../world/TrafficManager';
import { createDuskSkyTexture } from './ProceduralTextures';

function toColor3(rgb: RgbTuple): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

/**
 * Orquesta la escena urbana nocturna de alta fidelidad visual: cielo crepuscular,
 * asfalto mojado con reflejos planares, distrito comercial con neón, skyline CDMX,
 * tráfico, superdeportivo protagonista y postprocesado ACES + Bloom + GlowLayer.
 */
export class SceneManager {
  public readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly ambientLight: HemisphericLight;
  private readonly moonLight: DirectionalLight;
  private readonly roadManager: RoadManager;
  private readonly buildingManager: BuildingManager;
  private readonly trafficManager: TrafficManager;
  private readonly heroVehicle: HeroVehicleShowcase;
  private readonly pipeline: DefaultRenderingPipeline;
  private readonly glowLayer: GlowLayer;
  private readonly reflectableMeshes: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private shadowGenerator: ShadowGenerator | null = null;
  private currentProfile: QualityProfile;

  public constructor(
    engine: AbstractEngine,
    canvas: HTMLCanvasElement,
    initialProfile: QualityProfile,
  ) {
    this.currentProfile = initialProfile;
    this.scene = new Scene(engine);
    this.configureAtmosphereAndColorGrading();

    this.camera = this.createInspectionCamera(canvas);
    this.ambientLight = this.createAmbientLight();
    this.moonLight = this.createMoonLight();

    const skyDome = this.buildSkyDome();

    this.roadManager = new RoadManager(this.scene);
    this.buildingManager = new BuildingManager(this.scene);
    this.trafficManager = new TrafficManager(this.scene);
    this.heroVehicle = new HeroVehicleShowcase(this.scene);

    this.reflectableMeshes.push(
      skyDome,
      ...this.roadManager.getReflectableMeshes(),
      ...this.buildingManager.getReflectableMeshes(),
      ...this.trafficManager.getReflectableMeshes(),
      ...this.heroVehicle.getReflectableMeshes(),
    );

    this.shadowCasters.push(
      ...this.roadManager.getShadowCasters(),
      ...this.buildingManager.getShadowCasters(),
      ...this.trafficManager.getShadowCasters(),
      ...this.heroVehicle.getShadowCasters(),
    );

    this.pipeline = new DefaultRenderingPipeline('cinematic-pipeline', true, this.scene, [
      this.camera,
    ]);
    this.pipeline.imageProcessingEnabled = true;
    this.pipeline.bloomThreshold = 0.65;
    this.pipeline.bloomWeight = 0.42;
    this.pipeline.bloomKernel = 64;
    this.pipeline.bloomScale = 0.5;
    this.pipeline.sharpenEnabled = true;
    this.pipeline.sharpen.edgeAmount = 0.25;

    this.glowLayer = new GlowLayer('neon-glow-layer', this.scene, {
      blurKernelSize: 48,
      mainTextureFixedSize: 512,
    });
    this.glowLayer.intensity = 0.85;

    this.applyQualityProfile(initialProfile);
  }

  public getQualityProfile(): QualityProfile {
    return this.currentProfile;
  }

  public applyQualityProfile(profile: QualityProfile): void {
    this.currentProfile = profile;
    const settings = getGraphicsProfileSettings(profile);

    this.camera.maxZ = settings.maxDrawDistance;
    this.scene.fogDensity = settings.fogDensity;
    this.scene.environmentIntensity = settings.environmentIntensity;
    this.ambientLight.intensity = profile === 'PERFORMANCE' ? 0.44 : 0.56;

    this.roadManager.applyStreetLightBudget(settings.streetLightCount);
    this.roadManager.setPlanarReflection(
      settings.planarReflections,
      settings.reflectionMapSize,
      this.reflectableMeshes,
    );

    this.heroVehicle.setParticleScale(settings.particleScale);

    this.pipeline.bloomEnabled = settings.bloomEnabled;
    this.pipeline.fxaaEnabled = settings.fxaaEnabled;
    this.pipeline.sharpenEnabled = profile !== 'PERFORMANCE';

    this.glowLayer.isEnabled = settings.glowEnabled;
    this.glowLayer.intensity = profile === 'QUALITY' ? 0.92 : 0.72;

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
    this.heroVehicle.dispose();
    this.roadManager.dispose();
    this.shadowGenerator?.dispose();
    this.shadowGenerator = null;
    this.glowLayer.dispose();
    this.pipeline.dispose();
    this.scene.dispose();
  }

  private configureAtmosphereAndColorGrading(): void {
    this.scene.clearColor = new Color4(
      NOCTURNAL_COLORS.skyClear.r,
      NOCTURNAL_COLORS.skyClear.g,
      NOCTURNAL_COLORS.skyClear.b,
      1,
    );
    this.scene.ambientColor = new Color3(0.12, 0.14, 0.24);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = toColor3(NOCTURNAL_COLORS.fog);

    const ipc = this.scene.imageProcessingConfiguration;
    ipc.toneMappingEnabled = true;
    ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ipc.exposure = 1.28;
    ipc.contrast = 1.3;
    ipc.vignetteEnabled = true;
    ipc.vignetteWeight = 1.5;
    ipc.vignetteColor = new Color4(0.02, 0.03, 0.07, 1);
  }

  private createInspectionCamera(canvas: HTMLCanvasElement): ArcRotateCamera {
    const camera = new ArcRotateCamera(
      'inspection-camera',
      INITIAL_CAMERA_CONFIG.alpha,
      INITIAL_CAMERA_CONFIG.beta,
      INITIAL_CAMERA_CONFIG.radius,
      new Vector3(
        INITIAL_CAMERA_CONFIG.target.x,
        INITIAL_CAMERA_CONFIG.target.y,
        INITIAL_CAMERA_CONFIG.target.z,
      ),
      this.scene,
    );
    camera.attachControl(canvas, true);
    camera.minZ = 0.2;
    camera.fov = 0.78;
    camera.inertia = 0.85;
    camera.wheelDeltaPercentage = 0.015;
    camera.lowerBetaLimit = INITIAL_CAMERA_CONFIG.lowerBetaLimit;
    camera.upperBetaLimit = INITIAL_CAMERA_CONFIG.upperBetaLimit;
    camera.lowerRadiusLimit = INITIAL_CAMERA_CONFIG.lowerRadiusLimit;
    camera.upperRadiusLimit = INITIAL_CAMERA_CONFIG.upperRadiusLimit;
    return camera;
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
    light.position = new Vector3(32, 70, -35);
    light.diffuse = toColor3(NOCTURNAL_COLORS.moonLight);
    light.specular = new Color3(0.82, 0.88, 1.0);
    light.intensity = 1.25;
    light.shadowMinZ = 10;
    light.shadowMaxZ = 180;
    return light;
  }

  private buildSkyDome(): AbstractMesh {
    const skyDome = MeshBuilder.CreateSphere(
      'dusk-sky-dome',
      { diameter: 340, segments: 24, sideOrientation: Mesh.BACKSIDE },
      this.scene,
    );
    skyDome.position.set(0, 12, 42);
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
