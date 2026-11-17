import {
  Color3,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  Vector3,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import { NOCTURNAL_COLORS, type RgbTuple } from '../config/GameConfig';
import {
  createBuildingWindowTexture,
  createNeonSignTexture,
  type NeonSignOptions,
} from '../engine/ProceduralTextures';

function toColor3(rgb: RgbTuple): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

/**
 * Construye edificios comerciales realistas, letreros de neón acotados y torres
 * emblemáticas de Paseo de la Reforma con perfiles cilíndricos, octogonales y escalonados.
 * Solo los letreros de neón se incluyen en getGlowMeshes() para evitar muros blancos brillantes.
 */
export class BuildingManager {
  private readonly scene: Scene;
  private readonly reflectables: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private readonly glowMeshes: AbstractMesh[] = [];

  public constructor(scene: Scene) {
    this.scene = scene;
    this.buildReformaTowers();
    this.buildCommercialBlocks();
    this.buildNeonSignage();
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

  private createArchitecturalMaterial(
    name: string,
    seed: number,
    facadeTint: string,
    emissiveLevel: number,
    uScale = 1,
    vScale = 2,
  ): PBRMaterial {
    const tex = createBuildingWindowTexture(this.scene, seed, facadeTint, uScale, vScale);
    const mat = new PBRMaterial(name, this.scene);
    mat.albedoTexture = tex.albedoTexture;
    mat.emissiveTexture = tex.emissiveTexture;
    mat.emissiveColor = new Color3(emissiveLevel, emissiveLevel, emissiveLevel);
    mat.metallic = 0.42;
    mat.roughness = 0.36;
    return mat;
  }

  private buildReformaTowers(): void {
    const steelMat = new PBRMaterial('tower-steel-pbr', this.scene);
    steelMat.albedoColor = new Color3(0.09, 0.11, 0.15);
    steelMat.metallic = 0.78;
    steelMat.roughness = 0.32;

    const glassTowerA = this.createArchitecturalMaterial('reforma-glass-a', 501, '#11192b', 0.42, 2, 4);
    const glassTowerB = this.createArchitecturalMaterial('reforma-glass-b', 502, '#131d2d', 0.38, 2, 4);
    const stoneTowerMat = this.createArchitecturalMaterial(
      'reforma-stone-c',
      503,
      '#1a1c24',
      0.34,
      2,
      3,
    );

    // Torre estilizada tipo Torre Mayor (cuerpo curvo/octogonal escalonado a la izquierda de la glorieta)
    const torreMayorBase = MeshBuilder.CreateCylinder(
      'torre-mayor-body',
      { height: 84, diameterTop: 22, diameterBottom: 26, tessellation: 12 },
      this.scene,
    );
    torreMayorBase.position.set(-40, 42, 108);
    torreMayorBase.material = glassTowerA;

    const torreMayorCrown = MeshBuilder.CreateCylinder(
      'torre-mayor-crown',
      { height: 12, diameterTop: 15, diameterBottom: 22, tessellation: 12 },
      this.scene,
    );
    torreMayorCrown.position.set(-40, 90, 108);
    torreMayorCrown.material = steelMat;
    this.reflectables.push(torreMayorBase, torreMayorCrown);

    // Torre tipo BBVA (prisma facetado diagonal a la derecha)
    const torreBbva = MeshBuilder.CreateCylinder(
      'torre-bbva-body',
      { height: 92, diameter: 24, tessellation: 6 },
      this.scene,
    );
    torreBbva.position.set(42, 46, 118);
    torreBbva.rotation.y = Math.PI / 6;
    torreBbva.material = glassTowerB;

    const torreBbvaRoof = MeshBuilder.CreateCylinder(
      'torre-bbva-roof',
      { height: 8, diameterTop: 16, diameterBottom: 24, tessellation: 6 },
      this.scene,
    );
    torreBbvaRoof.position.set(42, 96, 118);
    torreBbvaRoof.rotation.y = Math.PI / 6;
    torreBbvaRoof.material = steelMat;
    this.reflectables.push(torreBbva, torreBbvaRoof);

    // Torre Reforma (torre triangular escalonada en el fondo izquierdo)
    const torreReforma = MeshBuilder.CreateCylinder(
      'torre-reforma-body',
      { height: 98, diameterTop: 18, diameterBottom: 24, tessellation: 3 },
      this.scene,
    );
    torreReforma.position.set(-34, 49, 165);
    torreReforma.rotation.y = 0.45;
    torreReforma.material = stoneTowerMat;
    this.reflectables.push(torreReforma);

    // Rascacielos corporativos en el horizonte norte de Paseo de la Reforma
    const skylineSpecs: ReadonlyArray<{
      x: number;
      z: number;
      diam: number;
      h: number;
      sides: number;
      mat: PBRMaterial;
    }> = [
      { x: -16, z: 185, diam: 20, h: 72, sides: 8, mat: glassTowerA },
      { x: 18, z: 192, diam: 22, h: 78, sides: 10, mat: glassTowerB },
      { x: 46, z: 170, diam: 20, h: 66, sides: 8, mat: stoneTowerMat },
      { x: -56, z: 150, diam: 20, h: 58, sides: 8, mat: glassTowerB },
    ];

    skylineSpecs.forEach((spec, idx) => {
      const tower = MeshBuilder.CreateCylinder(
        `reforma-skyline-${idx}`,
        { height: spec.h, diameter: spec.diam, tessellation: spec.sides },
        this.scene,
      );
      tower.position.set(spec.x, spec.h / 2, spec.z);
      tower.material = spec.mat;
      this.reflectables.push(tower);
    });
  }

  private buildCommercialBlocks(): void {
    const facadeMatA = this.createArchitecturalMaterial('com-facade-a', 701, '#181a24', 0.36, 2, 1);
    const facadeMatB = this.createArchitecturalMaterial('com-facade-b', 702, '#1d181e', 0.34, 2, 1);
    const trimMat = new PBRMaterial('com-trim-pbr', this.scene);
    trimMat.albedoColor = new Color3(0.08, 0.09, 0.12);
    trimMat.metallic = 0.3;
    trimMat.roughness = 0.65;

    const glassFrontMat = new PBRMaterial('storefront-glass-pbr', this.scene);
    glassFrontMat.albedoColor = new Color3(0.08, 0.11, 0.16);
    glassFrontMat.emissiveColor = new Color3(0.24, 0.18, 0.1);
    glassFrontMat.metallic = 0.5;
    glassFrontMat.roughness = 0.12;

    const blockSpecs: ReadonlyArray<{ x: number; z: number; h: number; d: number; side: -1 | 1 }> = [
      { x: -30.5, z: -4, h: 16, d: 28, side: -1 },
      { x: -31.0, z: 32, h: 20, d: 28, side: -1 },
      { x: -32.0, z: 72, h: 24, d: 34, side: -1 },
      { x: 30.5, z: 0, h: 18, d: 30, side: 1 },
      { x: 31.5, z: 38, h: 22, d: 28, side: 1 },
      { x: 32.0, z: 76, h: 26, d: 34, side: 1 },
    ];

    blockSpecs.forEach((b, idx) => {
      const building = MeshBuilder.CreateBox(
        `reforma-block-${idx}`,
        { width: 13, height: b.h, depth: b.d },
        this.scene,
      );
      building.position.set(b.x, b.h / 2, b.z);
      building.material = idx % 2 === 0 ? facadeMatA : facadeMatB;

      // Cornisa superior y marquesina a nivel de calle para romper la silueta plana
      const cornice = MeshBuilder.CreateBox(
        `reforma-cornice-${idx}`,
        { width: 13.8, height: 0.9, depth: b.d + 0.8 },
        this.scene,
      );
      cornice.position.set(b.x, b.h + 0.4, b.z);
      cornice.material = trimMat;

      const awning = MeshBuilder.CreateBox(
        `reforma-awning-${idx}`,
        { width: 2.4, height: 0.25, depth: b.d - 2 },
        this.scene,
      );
      awning.position.set(b.x - b.side * 7.2, 3.6, b.z);
      awning.material = trimMat;

      const storefront = MeshBuilder.CreateBox(
        `reforma-storefront-${idx}`,
        { width: 0.2, height: 3.1, depth: b.d - 4 },
        this.scene,
      );
      storefront.position.set(b.x - b.side * 6.55, 1.7, b.z);
      storefront.material = glassFrontMat;

      this.reflectables.push(building, cornice, storefront);
      this.shadowCasters.push(building);
    });
  }

  private buildNeonSignage(): void {
    this.createNeonBillboard(
      {
        name: 'neon-the-gemini',
        text: 'THE GEMINI',
        primaryColor: '#2de6ff',
        secondaryColor: '#00a8ff',
        backgroundColor: '#06101f',
        width: 512,
        height: 136,
      },
      new Vector3(-23.7, 5.4, 2),
      Math.PI / 2,
      8.5,
      2.1,
      new Color3(0.08, 0.85, 1.0),
    );

    this.createNeonBillboard(
      {
        name: 'neon-reforma-club',
        text: 'REFORMA',
        primaryColor: '#ff369b',
        secondaryColor: '#ff70c0',
        backgroundColor: '#160616',
        vertical: true,
        width: 170,
        height: 512,
      },
      new Vector3(-23.2, 9.2, 30),
      Math.PI / 2,
      1.6,
      5.2,
      toColor3(NOCTURNAL_COLORS.neonMagenta),
    );

    this.createNeonBillboard(
      {
        name: 'neon-cdmx-247',
        text: '24/7',
        primaryColor: '#2aff9b',
        secondaryColor: '#00d8ff',
        backgroundColor: '#061612',
        width: 320,
        height: 128,
      },
      new Vector3(23.7, 5.2, 4),
      -Math.PI / 2,
      4.2,
      1.7,
      toColor3(NOCTURNAL_COLORS.neonGreen),
    );

    this.createNeonBillboard(
      {
        name: 'neon-arcade-right',
        text: 'ARCADE',
        primaryColor: '#ff4268',
        secondaryColor: '#ffb72b',
        backgroundColor: '#17060d',
        vertical: true,
        width: 176,
        height: 480,
      },
      new Vector3(23.5, 9.0, 38),
      -Math.PI / 2,
      1.6,
      4.8,
      toColor3(NOCTURNAL_COLORS.neonAmber),
    );

    const leftNeonWash = new PointLight('left-cyan-wash', new Vector3(-19, 4.5, 4), this.scene);
    leftNeonWash.diffuse = toColor3(NOCTURNAL_COLORS.neonCyan);
    leftNeonWash.intensity = 22;
    leftNeonWash.range = 24;

    const rightNeonWash = new PointLight('right-amber-wash', new Vector3(19, 4.5, 34), this.scene);
    rightNeonWash.diffuse = toColor3(NOCTURNAL_COLORS.neonMagenta);
    rightNeonWash.intensity = 20;
    rightNeonWash.range = 24;
  }

  private createNeonBillboard(
    options: NeonSignOptions,
    position: Vector3,
    rotationY: number,
    width: number,
    height: number,
    emissiveBoost: Color3,
  ): void {
    const tex = createNeonSignTexture(this.scene, options);
    const mat = new PBRMaterial(`${options.name}-mat`, this.scene);
    mat.albedoTexture = tex;
    mat.emissiveTexture = tex;
    mat.emissiveColor = emissiveBoost.scale(1.45);
    mat.metallic = 0.1;
    mat.roughness = 0.25;

    const mesh = MeshBuilder.CreateBox(options.name, { width, height, depth: 0.2 }, this.scene);
    mesh.position.copyFrom(position);
    mesh.rotation.y = rotationY;
    mesh.material = mat;

    this.reflectables.push(mesh);
    this.glowMeshes.push(mesh);
  }
}
