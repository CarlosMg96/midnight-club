import {
  Color3,
  Color4,
  MeshBuilder,
  ParticleSystem,
  PBRMaterial,
  PointLight,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import { NOCTURNAL_COLORS, type RgbTuple } from '../config/GameConfig';
import { createSmokeTexture } from '../engine/ProceduralTextures';

function toColor3(rgb: RgbTuple): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

/**
 * Construye el superdeportivo protagonista en ángulo de derrape con alerón trasero,
 * detalles aerodinámicos naranja, neón inferior (underglow), barra LED trasera y
 * sistema de partículas de humo de neumáticos.
 */
export class HeroVehicleShowcase {
  private readonly scene: Scene;
  private readonly root: TransformNode;
  private readonly reflectables: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private readonly smokeSystems: ParticleSystem[] = [];

  public constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode('hero-supercar-root', scene);
    this.root.position.set(-0.6, 0, 4.5);
    // Ángulo de derrape lateral mirando hacia adelante-izquierda
    this.root.rotation.y = -0.62;

    this.buildChassisAndAero();
    this.buildWheels();
    this.buildUnderglowAndLights();
    this.buildDriftSmoke();
  }

  public getReflectableMeshes(): readonly AbstractMesh[] {
    return this.reflectables;
  }

  public getShadowCasters(): readonly AbstractMesh[] {
    return this.shadowCasters;
  }

  public setParticleScale(scale: number): void {
    const clamped = Math.max(0.1, Math.min(1.5, scale));
    for (const system of this.smokeSystems) {
      system.emitRate = Math.round(95 * clamped);
    }
  }

  public dispose(): void {
    for (const system of this.smokeSystems) {
      system.stop();
      system.dispose();
    }
    this.smokeSystems.length = 0;
  }

  private buildChassisAndAero(): void {
    const graphiteMat = new PBRMaterial('hero-graphite-pbr', this.scene);
    graphiteMat.albedoColor = new Color3(0.22, 0.25, 0.3);
    graphiteMat.metallic = 0.86;
    graphiteMat.roughness = 0.18;
    graphiteMat.clearCoat.isEnabled = true;
    graphiteMat.clearCoat.intensity = 1.0;
    graphiteMat.clearCoat.roughness = 0.05;

    const carbonMat = new PBRMaterial('hero-carbon-pbr', this.scene);
    carbonMat.albedoColor = new Color3(0.05, 0.055, 0.065);
    carbonMat.metallic = 0.25;
    carbonMat.roughness = 0.38;

    const orangeAccentMat = new PBRMaterial('hero-orange-accent-pbr', this.scene);
    orangeAccentMat.albedoColor = new Color3(1.0, 0.42, 0.08);
    orangeAccentMat.metallic = 0.45;
    orangeAccentMat.roughness = 0.22;
    orangeAccentMat.clearCoat.isEnabled = true;
    orangeAccentMat.clearCoat.intensity = 0.9;

    const glassMat = new PBRMaterial('hero-canopy-glass-pbr', this.scene);
    glassMat.albedoColor = new Color3(0.02, 0.03, 0.06);
    glassMat.metallic = 0.35;
    glassMat.roughness = 0.04;
    glassMat.clearCoat.isEnabled = true;
    glassMat.clearCoat.intensity = 1.0;

    // Carrocería principal baja y ancha
    const lowerBody = MeshBuilder.CreateBox(
      'hero-lower-body',
      { width: 2.08, height: 0.46, depth: 4.58 },
      this.scene,
    );
    lowerBody.parent = this.root;
    lowerBody.position.set(0, 0.48, 0);
    lowerBody.material = graphiteMat;

    // Morros y salpicaderas esculpidas
    const rearDeck = MeshBuilder.CreateBox(
      'hero-rear-deck',
      { width: 2.02, height: 0.26, depth: 1.8 },
      this.scene,
    );
    rearDeck.parent = this.root;
    rearDeck.position.set(0, 0.78, -1.25);
    rearDeck.material = graphiteMat;

    const hoodSlope = MeshBuilder.CreateBox(
      'hero-hood-slope',
      { width: 1.92, height: 0.2, depth: 1.5 },
      this.scene,
    );
    hoodSlope.parent = this.root;
    hoodSlope.position.set(0, 0.71, 1.38);
    hoodSlope.rotation.x = 0.14;
    hoodSlope.material = graphiteMat;

    // Cabina aerodinámica tipo burbuja
    const cabin = MeshBuilder.CreateBox(
      'hero-cabin',
      { width: 1.56, height: 0.44, depth: 2.05 },
      this.scene,
    );
    cabin.parent = this.root;
    cabin.position.set(0, 0.92, 0.05);
    cabin.material = glassMat;

    // Faldones laterales y arco naranja característico
    for (const side of [-1, 1] as const) {
      const skirt = MeshBuilder.CreateBox(
        `hero-skirt-${side}`,
        { width: 0.1, height: 0.14, depth: 2.7 },
        this.scene,
      );
      skirt.parent = this.root;
      skirt.position.set(side * 1.03, 0.26, 0.02);
      skirt.material = orangeAccentMat;

      const intakeArc = MeshBuilder.CreateBox(
        `hero-intake-arc-${side}`,
        { width: 0.08, height: 0.44, depth: 0.85 },
        this.scene,
      );
      intakeArc.parent = this.root;
      intakeArc.position.set(side * 1.04, 0.56, -0.45);
      intakeArc.rotation.x = -0.35;
      intakeArc.material = orangeAccentMat;
      this.reflectables.push(skirt, intakeArc);
    }

    // Splitter frontal y difusor trasero
    const splitter = MeshBuilder.CreateBox(
      'hero-front-splitter',
      { width: 2.1, height: 0.08, depth: 0.4 },
      this.scene,
    );
    splitter.parent = this.root;
    splitter.position.set(0, 0.2, 2.22);
    splitter.material = carbonMat;

    const diffuser = MeshBuilder.CreateBox(
      'hero-rear-diffuser',
      { width: 1.98, height: 0.22, depth: 0.28 },
      this.scene,
    );
    diffuser.parent = this.root;
    diffuser.position.set(0, 0.28, -2.24);
    diffuser.material = carbonMat;

    // Alerón GT elevado sobre soportes gemelos
    const wingBlade = MeshBuilder.CreateBox(
      'hero-gt-wing',
      { width: 2.16, height: 0.07, depth: 0.44 },
      this.scene,
    );
    wingBlade.parent = this.root;
    wingBlade.position.set(0, 1.32, -2.08);
    wingBlade.rotation.x = -0.14;
    wingBlade.material = carbonMat;

    for (const side of [-0.62, 0.62] as const) {
      const pylon = MeshBuilder.CreateBox(
        `hero-wing-pylon-${side}`,
        { width: 0.07, height: 0.44, depth: 0.22 },
        this.scene,
      );
      pylon.parent = this.root;
      pylon.position.set(side, 1.08, -2.02);
      pylon.material = carbonMat;

      const endplate = MeshBuilder.CreateBox(
        `hero-wing-endplate-${side}`,
        { width: 0.05, height: 0.26, depth: 0.52 },
        this.scene,
      );
      endplate.parent = this.root;
      endplate.position.set(side * 1.72, 1.32, -2.08);
      endplate.material = graphiteMat;
      this.reflectables.push(pylon, endplate);
      this.shadowCasters.push(pylon);
    }

    this.reflectables.push(lowerBody, rearDeck, hoodSlope, cabin, splitter, diffuser, wingBlade);
    this.shadowCasters.push(lowerBody, rearDeck, cabin, wingBlade);
  }

  private buildWheels(): void {
    const tireMat = new PBRMaterial('hero-tire-pbr', this.scene);
    tireMat.albedoColor = new Color3(0.035, 0.038, 0.045);
    tireMat.metallic = 0.08;
    tireMat.roughness = 0.8;

    const rimMat = new PBRMaterial('hero-rim-pbr', this.scene);
    rimMat.albedoColor = new Color3(0.78, 0.82, 0.9);
    rimMat.metallic = 0.94;
    rimMat.roughness = 0.16;

    const caliperMat = new PBRMaterial('hero-caliper-pbr', this.scene);
    caliperMat.albedoColor = new Color3(0.95, 0.12, 0.14);
    caliperMat.metallic = 0.4;
    caliperMat.roughness = 0.25;

    const wheelSpecs: ReadonlyArray<{ x: number; z: number; isFront: boolean }> = [
      { x: -1.02, z: 1.44, isFront: true },
      { x: 1.02, z: 1.44, isFront: true },
      { x: -1.04, z: -1.42, isFront: false },
      { x: 1.04, z: -1.42, isFront: false },
    ];

    wheelSpecs.forEach((spec, idx) => {
      const wheelPivot = new TransformNode(`hero-wheel-pivot-${idx}`, this.scene);
      wheelPivot.parent = this.root;
      wheelPivot.position.set(spec.x, 0.36, spec.z);
      // Ruedas delanteras en contravolante acorde al derrape
      if (spec.isFront) {
        wheelPivot.rotation.y = 0.36;
      }

      const tire = MeshBuilder.CreateCylinder(
        `hero-tire-${idx}`,
        { diameter: 0.72, height: 0.34, tessellation: 24 },
        this.scene,
      );
      tire.parent = wheelPivot;
      tire.rotation.z = Math.PI / 2;
      tire.material = tireMat;

      const rim = MeshBuilder.CreateCylinder(
        `hero-rim-${idx}`,
        { diameter: 0.5, height: 0.35, tessellation: 16 },
        this.scene,
      );
      rim.parent = wheelPivot;
      rim.rotation.z = Math.PI / 2;
      rim.material = rimMat;

      const caliper = MeshBuilder.CreateBox(
        `hero-caliper-${idx}`,
        { width: 0.12, height: 0.18, depth: 0.14 },
        this.scene,
      );
      caliper.parent = wheelPivot;
      caliper.position.set(spec.x > 0 ? -0.04 : 0.04, 0.04, -0.14);
      caliper.material = caliperMat;

      this.reflectables.push(tire, rim);
      this.shadowCasters.push(tire);
    });
  }

  private buildUnderglowAndLights(): void {
    const underglowMat = new PBRMaterial('hero-underglow-pbr', this.scene);
    underglowMat.albedoColor = new Color3(1.0, 0.52, 0.1);
    underglowMat.emissiveColor = toColor3(NOCTURNAL_COLORS.heroUnderglow).scale(2.8);

    const taillightMat = new PBRMaterial('hero-taillight-led-pbr', this.scene);
    taillightMat.albedoColor = new Color3(1.0, 0.1, 0.12);
    taillightMat.emissiveColor = toColor3(NOCTURNAL_COLORS.heroTaillight).scale(3.4);

    const headlightMat = new PBRMaterial('hero-headlight-led-pbr', this.scene);
    headlightMat.albedoColor = new Color3(0.95, 0.98, 1.0);
    headlightMat.emissiveColor = new Color3(2.4, 2.8, 3.2);

    const exhaustFlameMat = new PBRMaterial('hero-exhaust-blue-pbr', this.scene);
    exhaustFlameMat.albedoColor = new Color3(0.4, 0.85, 1.0);
    exhaustFlameMat.emissiveColor = new Color3(0.45, 1.2, 2.5);

    // Barras de neón inferior bajo los faldones
    for (const side of [-0.94, 0.94] as const) {
      const neonRail = MeshBuilder.CreateBox(
        `hero-underglow-rail-${side}`,
        { width: 0.08, height: 0.04, depth: 2.6 },
        this.scene,
      );
      neonRail.parent = this.root;
      neonRail.position.set(side, 0.14, 0);
      neonRail.material = underglowMat;
      this.reflectables.push(neonRail);
    }

    // Barra LED trasera continua de freno
    const rearLedBar = MeshBuilder.CreateBox(
      'hero-rear-led-bar',
      { width: 1.88, height: 0.11, depth: 0.08 },
      this.scene,
    );
    rearLedBar.parent = this.root;
    rearLedBar.position.set(0, 0.66, -2.31);
    rearLedBar.material = taillightMat;
    this.reflectables.push(rearLedBar);

    for (const side of [-0.72, 0.72] as const) {
      const headlight = MeshBuilder.CreateBox(
        `hero-headlight-${side}`,
        { width: 0.36, height: 0.1, depth: 0.08 },
        this.scene,
      );
      headlight.parent = this.root;
      headlight.position.set(side, 0.56, 2.28);
      headlight.material = headlightMat;

      const exhaust = MeshBuilder.CreateCylinder(
        `hero-exhaust-${side}`,
        { diameter: 0.14, height: 0.16, tessellation: 12 },
        this.scene,
      );
      exhaust.parent = this.root;
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(side * 0.45, 0.3, -2.32);
      exhaust.material = exhaustFlameMat;
      this.reflectables.push(headlight, exhaust);
    }

    // Luz naranja de neón bajo el coche reflejándose sobre el charco
    const underglowLight = new PointLight(
      'hero-underglow-light',
      new Vector3(0, 0.25, 0),
      this.scene,
    );
    underglowLight.parent = this.root;
    underglowLight.diffuse = toColor3(NOCTURNAL_COLORS.heroUnderglow);
    underglowLight.specular = new Color3(1.0, 0.62, 0.18);
    underglowLight.intensity = 18;
    underglowLight.range = 9;

    // Luz roja trasera proyectada hacia el asfalto mojado detrás del coche
    const taillightGlow = new PointLight(
      'hero-taillight-glow',
      new Vector3(0, 0.65, -3.1),
      this.scene,
    );
    taillightGlow.parent = this.root;
    taillightGlow.diffuse = toColor3(NOCTURNAL_COLORS.heroTaillight);
    taillightGlow.specular = new Color3(1.0, 0.2, 0.22);
    taillightGlow.intensity = 22;
    taillightGlow.range = 14;
  }

  private buildDriftSmoke(): void {
    const smokeTex = createSmokeTexture(this.scene);
    const emitters: ReadonlyArray<{ name: string; pos: Vector3 }> = [
      { name: 'smoke-rear-left', pos: new Vector3(-0.98, 0.18, -1.55) },
      { name: 'smoke-rear-right', pos: new Vector3(0.98, 0.18, -1.55) },
    ];

    emitters.forEach((cfg) => {
      const ps = new ParticleSystem(cfg.name, 220, this.scene);
      ps.particleTexture = smokeTex;
      const worldPos = Vector3.TransformCoordinates(cfg.pos, this.root.computeWorldMatrix(true));
      ps.emitter = worldPos;

      ps.minEmitBox = new Vector3(-0.22, 0, -0.25);
      ps.maxEmitBox = new Vector3(0.22, 0.15, 0.25);

      ps.color1 = new Color4(0.84, 0.88, 0.94, 0.42);
      ps.color2 = new Color4(0.68, 0.72, 0.82, 0.26);
      ps.colorDead = new Color4(0.45, 0.5, 0.62, 0.0);

      ps.minSize = 0.65;
      ps.maxSize = 2.1;
      ps.minLifeTime = 0.7;
      ps.maxLifeTime = 1.6;
      ps.emitRate = 65;
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.gravity = new Vector3(0.8, 0.45, -0.4);
      ps.direction1 = new Vector3(2.8, 0.6, -2.6);
      ps.direction2 = new Vector3(5.2, 1.5, -1.1);
      ps.minEmitPower = 0.8;
      ps.maxEmitPower = 1.8;
      ps.minAngularSpeed = -0.6;
      ps.maxAngularSpeed = 0.6;

      ps.start();
      this.smokeSystems.push(ps);
    });
  }
}
