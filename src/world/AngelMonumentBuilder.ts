import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  TransformNode,
  Vector3,
  VertexData,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import { NOCTURNAL_COLORS, TEST_AVENUE_CONFIG, type RgbTuple } from '../config/GameConfig';
import { createAngelColumnTricolorTexture } from '../engine/ProceduralTextures';

function toColor3(rgb: RgbTuple): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

/**
 * Construye el monumento de El Ángel de la Independencia en la glorieta de
 * Paseo de la Reforma mediante perfiles torneados (CreateLathe) y alas curvadas (CreateRibbon).
 */
export class AngelMonumentBuilder {
  private readonly scene: Scene;
  private readonly root: TransformNode;
  private readonly reflectables: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private readonly glowMeshes: AbstractMesh[] = [];

  public constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode('angel-independencia-root', scene);
    this.root.position.set(
      TEST_AVENUE_CONFIG.angelPosition.x,
      0,
      TEST_AVENUE_CONFIG.angelPosition.z,
    );

    this.buildMonument();
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

  private buildMonument(): void {
    const canteraMat = new PBRMaterial('angel-cantera-pbr', this.scene);
    canteraMat.albedoColor = new Color3(0.42, 0.39, 0.36);
    canteraMat.metallic = 0.04;
    canteraMat.roughness = 0.78;

    const tricolorTex = createAngelColumnTricolorTexture(this.scene);
    const marbleMat = new PBRMaterial('angel-marble-tricolor-pbr', this.scene);
    marbleMat.albedoTexture = tricolorTex.albedoTexture;
    marbleMat.emissiveTexture = tricolorTex.emissiveTexture;
    marbleMat.emissiveColor = new Color3(0.75, 0.75, 0.75);
    marbleMat.metallic = 0.08;
    marbleMat.roughness = 0.48;

    const bronzeMat = new PBRMaterial('angel-bronze-pbr', this.scene);
    bronzeMat.albedoColor = new Color3(0.18, 0.16, 0.13);
    bronzeMat.metallic = 0.82;
    bronzeMat.roughness = 0.34;

    const goldMat = new PBRMaterial('angel-gold-pbr', this.scene);
    goldMat.albedoColor = toColor3(NOCTURNAL_COLORS.angelGold);
    goldMat.metallic = 1.0;
    goldMat.roughness = 0.14;
    goldMat.clearCoat.isEnabled = true;
    goldMat.clearCoat.intensity = 0.9;
    goldMat.emissiveColor = new Color3(0.24, 0.16, 0.04);

    // 1. Escalinata circular y basamento de cantera (Lathe)
    const steppedBaseProfile = [
      new Vector3(8.4, 0, 0),
      new Vector3(8.4, 0.35, 0),
      new Vector3(7.9, 0.35, 0),
      new Vector3(7.9, 0.7, 0),
      new Vector3(7.4, 0.7, 0),
      new Vector3(7.4, 1.05, 0),
      new Vector3(6.9, 1.05, 0),
      new Vector3(6.9, 1.4, 0),
      new Vector3(6.4, 1.4, 0),
      new Vector3(6.4, 1.85, 0),
      new Vector3(5.6, 1.85, 0),
      new Vector3(5.3, 2.3, 0),
      new Vector3(4.8, 2.3, 0),
      new Vector3(4.8, 6.2, 0),
      new Vector3(5.2, 6.5, 0),
      new Vector3(4.3, 6.9, 0),
      new Vector3(3.9, 10.2, 0),
      new Vector3(4.4, 10.6, 0),
      new Vector3(3.1, 11.2, 0),
      new Vector3(0.01, 11.2, 0),
    ];

    const pedestal = MeshBuilder.CreateLathe(
      'angel-pedestal-lathe',
      { shape: steppedBaseProfile, tessellation: 24 },
      this.scene,
    );
    pedestal.parent = this.root;
    pedestal.material = canteraMat;
    pedestal.receiveShadows = true;

    // 2. Cuatro esculturas alegóricas en bronce en las esquinas del basamento
    const statueProfile = [
      new Vector3(0.01, 0, 0),
      new Vector3(0.75, 0, 0),
      new Vector3(0.62, 0.6, 0),
      new Vector3(0.48, 1.4, 0),
      new Vector3(0.58, 2.1, 0),
      new Vector3(0.32, 2.6, 0),
      new Vector3(0.25, 3.0, 0),
      new Vector3(0.01, 3.15, 0),
    ];

    const corners: ReadonlyArray<readonly [number, number]> = [
      [-4.2, -4.2],
      [4.2, -4.2],
      [-4.2, 4.2],
      [4.2, 4.2],
    ];
    corners.forEach(([cx, cz], idx) => {
      const statue = MeshBuilder.CreateLathe(
        `angel-corner-bronze-${idx}`,
        { shape: statueProfile, tessellation: 14 },
        this.scene,
      );
      statue.parent = this.root;
      statue.position.set(cx, 2.25, cz);
      statue.material = bronzeMat;
      this.reflectables.push(statue);
      this.shadowCasters.push(statue);
    });

    // 3. Columna conmemorativa estriada y capitel corintio
    const columnProfile = [
      new Vector3(3.0, 11.2, 0),
      new Vector3(2.45, 12.0, 0),
      new Vector3(2.15, 12.5, 0),
      new Vector3(2.02, 22.0, 0),
      new Vector3(1.88, 32.0, 0),
      new Vector3(2.35, 33.4, 0),
      new Vector3(2.75, 34.4, 0),
      new Vector3(2.95, 34.9, 0),
      new Vector3(2.2, 35.3, 0),
      new Vector3(1.4, 36.2, 0),
      new Vector3(0.01, 36.2, 0),
    ];

    const column = MeshBuilder.CreateLathe(
      'angel-column-lathe',
      { shape: columnProfile, tessellation: 28 },
      this.scene,
    );
    column.parent = this.root;
    column.material = marbleMat;
    column.receiveShadows = true;

    // 4. Estatua dorada de la Victoria Alada (El Ángel) en la cima
    const angelBodyProfile = [
      new Vector3(0.01, 0, 0),
      new Vector3(0.75, 0, 0),
      new Vector3(0.62, 1.3, 0),
      new Vector3(0.42, 2.4, 0),
      new Vector3(0.54, 3.2, 0),
      new Vector3(0.32, 3.85, 0),
      new Vector3(0.28, 4.35, 0),
      new Vector3(0.01, 4.55, 0),
    ];

    const angelBody = MeshBuilder.CreateLathe(
      'angel-victoria-body',
      { shape: angelBodyProfile, tessellation: 18 },
      this.scene,
    );
    angelBody.parent = this.root;
    angelBody.position.set(0, 36.2, 0);
    angelBody.material = goldMat;

    // Alas doradas desplegadas con superficie curvada (Ribbon)
    for (const side of [-1, 1] as const) {
      const wing = this.createGoldenWing(side, goldMat);
      wing.parent = this.root;
      wing.position.set(side * 0.25, 39.2, -0.2);
      this.reflectables.push(wing);
      this.shadowCasters.push(wing);
    }

    // Brazo alzado y corona de laurel dorada
    const raisedArm = MeshBuilder.CreateCylinder(
      'angel-raised-arm',
      { height: 2.1, diameterTop: 0.18, diameterBottom: 0.24, tessellation: 10 },
      this.scene,
    );
    raisedArm.parent = this.root;
    raisedArm.position.set(0.32, 40.6, 0.32);
    raisedArm.rotation.z = -0.28;
    raisedArm.rotation.x = 0.22;
    raisedArm.material = goldMat;

    const laurelWreath = MeshBuilder.CreateTorus(
      'angel-laurel-wreath',
      { diameter: 0.95, thickness: 0.14, tessellation: 18 },
      this.scene,
    );
    laurelWreath.parent = this.root;
    laurelWreath.position.set(0.6, 41.7, 0.56);
    laurelWreath.rotation.x = Math.PI / 3;
    laurelWreath.material = goldMat;

    // Reflectores arquitectónicos iluminando la columna y al Ángel dorado
    const baseFloodMat = new PBRMaterial('angel-flood-lens', this.scene);
    baseFloodMat.albedoColor = new Color3(1, 0.88, 0.65);
    baseFloodMat.emissiveColor = new Color3(1.6, 1.1, 0.5);

    const floodAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
    floodAngles.forEach((angle, idx) => {
      const fx = Math.cos(angle) * 6.0;
      const fz = Math.sin(angle) * 6.0;
      const lamp = MeshBuilder.CreateCylinder(
        `angel-uplight-${idx}`,
        { height: 0.22, diameter: 0.45, tessellation: 10 },
        this.scene,
      );
      lamp.parent = this.root;
      lamp.position.set(fx, 1.95, fz);
      lamp.material = baseFloodMat;
      this.glowMeshes.push(lamp);
    });

    const monumentBaseGlow = new PointLight(
      'angel-base-uplight',
      new Vector3(0, 8, -7.2),
      this.scene,
    );
    monumentBaseGlow.parent = this.root;
    monumentBaseGlow.diffuse = new Color3(0.18, 0.95, 0.52);
    monumentBaseGlow.intensity = 52;
    monumentBaseGlow.range = 34;

    const columnRedGlow = new PointLight(
      'angel-capital-red-light',
      new Vector3(0, 32, -5.5),
      this.scene,
    );
    columnRedGlow.parent = this.root;
    columnRedGlow.diffuse = new Color3(0.95, 0.16, 0.28);
    columnRedGlow.intensity = 42;
    columnRedGlow.range = 28;

    const angelTopGlow = new PointLight('angel-crown-light', new Vector3(0, 41, -4.5), this.scene);
    angelTopGlow.parent = this.root;
    angelTopGlow.diffuse = new Color3(1.0, 0.86, 0.52);
    angelTopGlow.intensity = 46;
    angelTopGlow.range = 28;

    this.reflectables.push(pedestal, column, angelBody, raisedArm, laurelWreath);
    this.shadowCasters.push(pedestal, column, angelBody, raisedArm);
  }

  private createGoldenWing(side: -1 | 1, material: PBRMaterial): Mesh {
    const paths: Vector3[][] = [];
    const spanSteps = 6;
    const chordSteps = 4;

    for (let u = 0; u <= spanSteps; u += 1) {
      const t = u / spanSteps;
      const path: Vector3[] = [];
      const x = side * (0.2 + t * 3.15);
      const yBase = Math.sin(t * Math.PI * 0.85) * 1.45 + t * 1.2;
      const zCurve = -0.3 - t * 0.9;
      const chord = (1 - t * 0.65) * 1.45;

      for (let v = 0; v <= chordSteps; v += 1) {
        const s = v / chordSteps;
        const y = yBase - s * chord;
        const z = zCurve - Math.sin(s * Math.PI) * 0.22;
        path.push(new Vector3(x, y, z));
      }
      paths.push(path);
    }

    const wing = MeshBuilder.CreateRibbon(
      `angel-wing-${side < 0 ? 'left' : 'right'}`,
      { pathArray: paths, sideOrientation: Mesh.DOUBLESIDE, updatable: false },
      this.scene,
    );

    const positions = wing.getVerticesData('position');
    const indices = wing.getIndices();
    if (positions && indices) {
      const normals: number[] = [];
      VertexData.ComputeNormals(positions, indices, normals);
      wing.setVerticesData('normal', normals);
    }

    wing.material = material;
    return wing;
  }
}
