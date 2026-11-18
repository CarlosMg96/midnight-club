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
import { METROPOLITAN_OPEN_CURVES, NOCTURNAL_COLORS, type RgbTuple } from '../config/GameConfig';
import {
  createBbvaTowerTexture,
  createBuildingWindowTexture,
  createNeonSignTexture,
  createStRegisTowerTexture,
  createTorreReformaTexture,
  type NeonSignOptions,
} from '../engine/ProceduralTextures';

function toColor3(rgb: RgbTuple): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

/**
 * Construye los rascacielos emblemáticos de Paseo de la Reforma (Torre BBVA tricolor,
 * Hotel St. Regis, Torre Reforma en punta de cincel y Torre Mayor) junto con edificios
 * comerciales cálidos estilo Midnight Club 3 y letreros neón controlados en GlowLayer.
 */
export class BuildingManager {
  private readonly scene: Scene;
  private readonly reflectables: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private readonly glowMeshes: AbstractMesh[] = [];

  public constructor(scene: Scene) {
    this.scene = scene;
    this.buildReformaLandmarks();
    this.buildMetropolitanLandmarks();
    this.buildMetropolitanUrbanCorridors();
    this.buildCommercialDistrict();
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

  private buildReformaLandmarks(): void {
    const steelMat = new PBRMaterial('tower-steel-pbr', this.scene);
    steelMat.albedoColor = new Color3(0.08, 0.1, 0.14);
    steelMat.metallic = 0.82;
    steelMat.roughness = 0.28;

    // 1. Torre BBVA (izquierda del Ángel, iluminada en tricolor verde/blanco/rojo + letrero BBVA)
    const bbvaTex = createBbvaTowerTexture(this.scene);
    const bbvaMat = new PBRMaterial('torre-bbva-pbr', this.scene);
    bbvaMat.albedoTexture = bbvaTex.albedoTexture;
    bbvaMat.emissiveTexture = bbvaTex.emissiveTexture;
    bbvaMat.emissiveColor = new Color3(0.85, 0.85, 0.85);
    bbvaMat.metallic = 0.52;
    bbvaMat.roughness = 0.28;

    const torreBbva = MeshBuilder.CreateBox(
      'torre-bbva-main',
      { width: 22, height: 96, depth: 20 },
      this.scene,
    );
    torreBbva.position.set(-38, 48, 126);
    torreBbva.rotation.y = 0.18;
    torreBbva.material = bbvaMat;

    const bbvaCrown = MeshBuilder.CreateBox(
      'torre-bbva-crown',
      { width: 22.4, height: 8, depth: 20.4 },
      this.scene,
    );
    bbvaCrown.position.set(-38, 98, 126);
    bbvaCrown.rotation.y = 0.18;
    bbvaCrown.material = steelMat;

    this.createNeonBillboard(
      {
        name: 'sign-bbva-crown',
        text: 'BBVA',
        primaryColor: '#40a9ff',
        secondaryColor: '#0066cc',
        backgroundColor: '#04122e',
        width: 320,
        height: 112,
        showBorder: false,
      },
      new Vector3(-35.5, 98, 115.6),
      0.18,
      14,
      4.5,
      new Color3(0.18, 0.58, 1.0),
    );
    this.reflectables.push(torreBbva, bbvaCrown);

    // 2. Torre Reforma (derecha del Ángel, silueta prismática en punta de cincel + balizas rojas)
    const reformaTex = createTorreReformaTexture(this.scene);
    const reformaMat = new PBRMaterial('torre-reforma-pbr', this.scene);
    reformaMat.albedoTexture = reformaTex.albedoTexture;
    reformaMat.emissiveTexture = reformaTex.emissiveTexture;
    reformaMat.emissiveColor = new Color3(0.7, 0.7, 0.7);
    reformaMat.metallic = 0.25;
    reformaMat.roughness = 0.55;

    const torreReforma = MeshBuilder.CreateRibbon(
      'torre-reforma-wedge',
      {
        pathArray: [
          [
            new Vector3(29, 0, 142),
            new Vector3(43, 0, 134),
            new Vector3(51, 0, 152),
            new Vector3(33, 0, 158),
            new Vector3(29, 0, 142),
          ],
          [
            new Vector3(31, 92, 143),
            new Vector3(41, 92, 137),
            new Vector3(49, 106, 150),
            new Vector3(35, 108, 154),
            new Vector3(31, 92, 143),
          ],
        ],
        closePath: true,
        sideOrientation: Mesh.DOUBLESIDE,
      },
      this.scene,
    );
    const rPos = torreReforma.getVerticesData('position');
    const rIdx = torreReforma.getIndices();
    if (rPos && rIdx) {
      const normals: number[] = [];
      VertexData.ComputeNormals(rPos, rIdx, normals);
      torreReforma.setVerticesData('normal', normals);
    }
    torreReforma.material = reformaMat;
    this.reflectables.push(torreReforma);

    const beaconMat = new PBRMaterial('aviation-red-beacon', this.scene);
    beaconMat.albedoColor = new Color3(1, 0.1, 0.1);
    beaconMat.emissiveColor = new Color3(2.8, 0.12, 0.12);
    const beacon = MeshBuilder.CreateSphere(
      'torre-reforma-beacon',
      { diameter: 1.1, segments: 8 },
      this.scene,
    );
    beacon.position.set(37, 108.5, 152);
    beacon.material = beaconMat;
    this.glowMeshes.push(beacon);

    // 3. Hotel St. Regis (a la derecha, fachada curva horizontal + letrero ST REGIS)
    const stRegisTex = createStRegisTowerTexture(this.scene);
    const stRegisMat = new PBRMaterial('stregis-pbr', this.scene);
    stRegisMat.albedoTexture = stRegisTex.albedoTexture;
    stRegisMat.emissiveTexture = stRegisTex.emissiveTexture;
    stRegisMat.emissiveColor = new Color3(0.6, 0.6, 0.65);
    stRegisMat.metallic = 0.55;
    stRegisMat.roughness = 0.25;

    const stRegis = MeshBuilder.CreateCylinder(
      'hotel-st-regis',
      { height: 78, diameter: 24, tessellation: 16 },
      this.scene,
    );
    stRegis.position.set(44, 39, 120);
    stRegis.material = stRegisMat;

    this.createNeonBillboard(
      {
        name: 'sign-st-regis',
        text: 'ST REGIS',
        primaryColor: '#eef6ff',
        secondaryColor: '#98c4f5',
        backgroundColor: '#0e1624',
        width: 380,
        height: 96,
        showBorder: false,
      },
      new Vector3(40, 74, 108),
      -0.25,
      11.5,
      2.6,
      new Color3(0.65, 0.78, 0.95),
    );
    this.reflectables.push(stRegis);

    // 4. Torre Mayor y rascacielos del fondo de Paseo de la Reforma
    const mayorMat = this.createArchitecturalMaterial(
      'reforma-mayor-mat',
      511,
      '#101828',
      0.4,
      2,
      4,
    );
    const extraGlassMat = this.createArchitecturalMaterial(
      'reforma-extra-mat',
      512,
      '#141c2c',
      0.38,
      2,
      4,
    );

    const skylineSpecs: ReadonlyArray<{
      x: number;
      z: number;
      diam: number;
      h: number;
      sides: number;
      mat: PBRMaterial;
    }> = [
      { x: -56, z: 112, diam: 24, h: 74, sides: 8, mat: extraGlassMat },
      { x: -46, z: 178, diam: 24, h: 86, sides: 10, mat: mayorMat },
      { x: 46, z: 190, diam: 22, h: 72, sides: 8, mat: extraGlassMat },
      { x: 56, z: 162, diam: 24, h: 68, sides: 8, mat: mayorMat },
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

  private buildCommercialDistrict(): void {
    const facadeMatA = this.createArchitecturalMaterial('com-facade-a', 701, '#261a18', 0.34, 2, 1);
    const facadeMatB = this.createArchitecturalMaterial('com-facade-b', 702, '#1c1d28', 0.32, 2, 1);
    const trimMat = new PBRMaterial('com-trim-pbr', this.scene);
    trimMat.albedoColor = new Color3(0.09, 0.1, 0.13);
    trimMat.metallic = 0.25;
    trimMat.roughness = 0.65;

    const glassFrontMat = new PBRMaterial('storefront-glass-pbr', this.scene);
    glassFrontMat.albedoColor = new Color3(0.1, 0.12, 0.18);
    glassFrontMat.emissiveColor = new Color3(0.28, 0.2, 0.11);
    glassFrontMat.metallic = 0.45;
    glassFrontMat.roughness = 0.14;

    const blockSpecs: ReadonlyArray<{ x: number; z: number; h: number; d: number; side: -1 | 1 }> =
      [
        { x: -33.0, z: -6, h: 16, d: 30, side: -1 },
        { x: -33.5, z: 32, h: 19, d: 28, side: -1 },
        { x: -34.5, z: 112, h: 22, d: 28, side: -1 },
        { x: 33.0, z: -2, h: 17, d: 30, side: 1 },
        { x: 33.5, z: 34, h: 20, d: 28, side: 1 },
        { x: 34.5, z: 114, h: 24, d: 28, side: 1 },
      ];

    blockSpecs.forEach((b, idx) => {
      const building = MeshBuilder.CreateBox(
        `reforma-block-${idx}`,
        { width: 13, height: b.h, depth: b.d },
        this.scene,
      );
      building.position.set(b.x, b.h / 2, b.z);
      building.material = idx % 2 === 0 ? facadeMatA : facadeMatB;

      const cornice = MeshBuilder.CreateBox(
        `reforma-cornice-${idx}`,
        { width: 13.8, height: 0.9, depth: b.d + 0.8 },
        this.scene,
      );
      cornice.position.set(b.x, b.h + 0.4, b.z);
      cornice.material = trimMat;

      const awning = MeshBuilder.CreateBox(
        `reforma-awning-${idx}`,
        { width: 2.6, height: 0.25, depth: b.d - 2 },
        this.scene,
      );
      awning.position.set(b.x - b.side * 7.2, 3.8, b.z);
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
        name: 'neon-roxy-cdmx',
        text: 'ROXY',
        primaryColor: '#ffbf3f',
        secondaryColor: '#ff6f1f',
        backgroundColor: '#190f07',
        width: 420,
        height: 128,
      },
      new Vector3(-26.1, 5.2, 0),
      Math.PI / 2,
      7.2,
      2.0,
      toColor3(NOCTURNAL_COLORS.neonAmber),
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
      new Vector3(-25.8, 9.2, 30),
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
      new Vector3(26.1, 5.2, 4),
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
      new Vector3(25.9, 9.0, 38),
      -Math.PI / 2,
      1.6,
      4.8,
      toColor3(NOCTURNAL_COLORS.neonAmber),
    );

    const leftNeonWash = new PointLight('left-amber-wash', new Vector3(-20, 4.8, 4), this.scene);
    leftNeonWash.diffuse = toColor3(NOCTURNAL_COLORS.neonAmber);
    leftNeonWash.intensity = 22;
    leftNeonWash.range = 24;

    const rightNeonWash = new PointLight(
      'right-magenta-wash',
      new Vector3(20, 4.8, 34),
      this.scene,
    );
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
    mat.emissiveColor = emissiveBoost.scale(1.4);
    mat.metallic = 0.1;
    mat.roughness = 0.25;

    const frameMat = this.createSolidMat(
      `${options.name}-frame-mat`,
      new Color3(0.1, 0.12, 0.16),
      new Color3(0, 0, 0),
      0.78,
      0.38,
    );

    const holder = new TransformNode(`${options.name}-holder`, this.scene);
    holder.position.copyFrom(position);
    holder.rotation.y = rotationY;

    const cabinet = MeshBuilder.CreateBox(
      `${options.name}-cabinet`,
      { width: width + 0.24, height: height + 0.24, depth: 0.2 },
      this.scene,
    );
    cabinet.parent = holder;
    cabinet.material = frameMat;

    const frontFace = MeshBuilder.CreatePlane(
      `${options.name}-front`,
      { width, height },
      this.scene,
    );
    frontFace.parent = holder;
    frontFace.position.z = -0.11;
    frontFace.material = mat;

    const backFace = MeshBuilder.CreatePlane(`${options.name}-back`, { width, height }, this.scene);
    backFace.parent = holder;
    backFace.position.z = 0.11;
    backFace.rotation.y = Math.PI;
    backFace.material = mat;

    if (position.y < 30) {
      const legHeight = Math.max(0.5, position.y - height / 2);
      const legSpan = Math.min(width * 0.34, Math.max(0.5, width / 2 - 0.5));
      const legOffsets = width >= 4 ? [-legSpan, legSpan] : [0];
      for (const lx of legOffsets) {
        const leg = MeshBuilder.CreateCylinder(
          `${options.name}-leg-${lx}`,
          { height: legHeight, diameter: 0.26, tessellation: 8 },
          this.scene,
        );
        leg.parent = holder;
        leg.position.set(lx, -(height / 2 + legHeight / 2), 0);
        leg.material = frameMat;
        this.reflectables.push(leg);
      }
    }

    this.reflectables.push(cabinet, frontFace, backFace);
    this.glowMeshes.push(frontFace, backFace);
  }

  private createSolidMat(
    name: string,
    albedo: Color3,
    emissive = new Color3(0, 0, 0),
    metallic = 0.2,
    roughness = 0.65,
  ): PBRMaterial {
    const mat = new PBRMaterial(name, this.scene);
    mat.albedoColor = albedo;
    mat.emissiveColor = emissive;
    mat.metallic = metallic;
    mat.roughness = roughness;
    return mat;
  }

  private buildMetropolitanLandmarks(): void {
    const steelMat = this.createSolidMat(
      'metro-steel-pbr',
      new Color3(0.18, 0.22, 0.28),
      new Color3(0.02, 0.03, 0.04),
      0.8,
      0.35,
    );

    // 1. TORRES DE SATÉLITE (Naucalpan, Estado de México — centro (-380, 380))
    const sateliteSpecs: readonly {
      dx: number;
      dz: number;
      h: number;
      diam: number;
      rotY: number;
      color: Color3;
      emissive: Color3;
    }[] = [
      {
        dx: -3.9,
        dz: -2.0,
        h: 32,
        diam: 3.1,
        rotY: 0.35,
        color: new Color3(0.92, 0.24, 0.08),
        emissive: new Color3(0.16, 0.04, 0.01),
      },
      {
        dx: -1.9,
        dz: 1.4,
        h: 38,
        diam: 3.2,
        rotY: 0.9,
        color: new Color3(0.96, 0.78, 0.1),
        emissive: new Color3(0.16, 0.12, 0.02),
      },
      {
        dx: 0.3,
        dz: -1.6,
        h: 44,
        diam: 3.4,
        rotY: 0.2,
        color: new Color3(0.92, 0.94, 0.96),
        emissive: new Color3(0.12, 0.13, 0.15),
      },
      {
        dx: 2.2,
        dz: 1.8,
        h: 48,
        diam: 3.3,
        rotY: 0.75,
        color: new Color3(0.9, 0.92, 0.95),
        emissive: new Color3(0.12, 0.13, 0.15),
      },
      {
        dx: 4.1,
        dz: -0.5,
        h: 54,
        diam: 3.4,
        rotY: 0.45,
        color: new Color3(0.12, 0.42, 0.88),
        emissive: new Color3(0.03, 0.09, 0.2),
      },
    ];

    sateliteSpecs.forEach((tower, idx) => {
      const mat = this.createSolidMat(
        `satelite-tower-mat-${idx}`,
        tower.color,
        tower.emissive,
        0.12,
        0.55,
      );
      const prism = MeshBuilder.CreateCylinder(
        `torre-satelite-${idx}`,
        { height: tower.h, diameter: tower.diam, tessellation: 3 },
        this.scene,
      );
      prism.position.set(-380 + tower.dx, tower.h / 2 + 0.3, 380 + tower.dz);
      prism.rotation.y = tower.rotY;
      prism.material = mat;
      this.reflectables.push(prism);
    });

    this.createNeonBillboard(
      {
        name: 'sign-satelite-edomex',
        text: 'TORRES DE SATÉLITE · EDOMEX',
        primaryColor: '#ff7a38',
        secondaryColor: '#ffd242',
        backgroundColor: '#160d08',
        width: 520,
        height: 112,
      },
      new Vector3(-405, 16, 355),
      Math.PI / 4,
      11.5,
      2.6,
      toColor3(NOCTURNAL_COLORS.neonAmber),
    );

    // 2. ESCULTURA "EL COYOTE DE NEZA" (Cd. Nezahualcóyotl, Edomex — centro (380, 75))
    const coyoteMat = this.createSolidMat(
      'neza-coyote-crimson-pbr',
      new Color3(0.85, 0.08, 0.12),
      new Color3(0.42, 0.04, 0.06),
      0.55,
      0.32,
    );
    const coyoteParts: readonly {
      name: string;
      w: number;
      h: number;
      d: number;
      x: number;
      y: number;
      z: number;
      rz?: number;
      rx?: number;
    }[] = [
      { name: 'plinth', w: 7.4, h: 1.8, d: 6.2, x: 380, y: 1.1, z: 75 },
      { name: 'rear-leg', w: 2.8, h: 11.5, d: 3.4, x: 381.6, y: 6.8, z: 75, rz: 0.16 },
      { name: 'front-chest', w: 3.4, h: 13.5, d: 3.8, x: 379.0, y: 7.4, z: 75, rz: -0.22 },
      { name: 'neck-spire', w: 2.9, h: 11.2, d: 3.2, x: 379.2, y: 15.8, z: 75, rz: 0.24 },
      { name: 'snout-upper', w: 6.8, h: 2.2, d: 2.6, x: 376.4, y: 21.8, z: 75, rz: 0.36 },
      { name: 'snout-lower', w: 5.4, h: 1.6, d: 2.4, x: 376.8, y: 19.4, z: 75, rz: -0.18 },
      { name: 'ear-left', w: 1.2, h: 4.8, d: 0.9, x: 380.4, y: 24.4, z: 73.7, rz: -0.12, rx: -0.1 },
      { name: 'ear-right', w: 1.2, h: 4.8, d: 0.9, x: 380.4, y: 24.4, z: 76.3, rz: -0.12, rx: 0.1 },
    ];
    for (const part of coyoteParts) {
      const beam = MeshBuilder.CreateBox(
        `coyote-neza-${part.name}`,
        { width: part.w, height: part.h, depth: part.d },
        this.scene,
      );
      beam.position.set(part.x, part.y, part.z);
      beam.rotation.z = part.rz ?? 0;
      beam.rotation.x = part.rx ?? 0;
      beam.material = coyoteMat;
      this.reflectables.push(beam);
    }

    this.createNeonBillboard(
      {
        name: 'sign-neza-edomex',
        text: 'CD. NEZAHUALCÓYOTL · EDOMEX',
        primaryColor: '#ff4268',
        secondaryColor: '#ff9642',
        backgroundColor: '#1a060b',
        width: 520,
        height: 112,
      },
      new Vector3(406, 15, 50),
      -Math.PI / 4,
      11.5,
      2.6,
      toColor3(NOCTURNAL_COLORS.neonMagenta),
    );

    // 3. MEXICABLE Y PUENTE DE FIERRO (Ecatepec de Morelos, Edomex — (380, 380))
    const pylonCoords: readonly [number, number][] = [
      [355, 354],
      [405, 408],
      [354, 408],
    ];
    pylonCoords.forEach(([px, pz], idx) => {
      const mast = MeshBuilder.CreateCylinder(
        `ecatepec-mexicable-pylon-${idx}`,
        { height: 30, diameterTop: 0.7, diameterBottom: 1.5, tessellation: 8 },
        this.scene,
      );
      mast.position.set(px, 15, pz);
      mast.material = steelMat;

      const crossArm = MeshBuilder.CreateBox(
        `ecatepec-mexicable-arm-${idx}`,
        { width: 6.2, height: 0.65, depth: 0.85 },
        this.scene,
      );
      crossArm.position.set(px, 28.8, pz);
      crossArm.rotation.y = Math.PI / 4;
      crossArm.material = steelMat;
      this.reflectables.push(mast, crossArm);
    });

    const createCableSpan = (
      name: string,
      p1: Vector3,
      p2: Vector3,
      colorMat: PBRMaterial,
    ): void => {
      const length = Vector3.Distance(p1, p2);
      const cable = MeshBuilder.CreateCylinder(
        name,
        { height: length, diameter: 0.2, tessellation: 6 },
        this.scene,
      );
      cable.position.copyFrom(Vector3.Center(p1, p2));
      cable.lookAt(p2);
      cable.rotate(Vector3.Right(), Math.PI / 2);
      cable.material = colorMat;
      this.reflectables.push(cable);
    };

    createCableSpan(
      'mexicable-span-diagonal',
      new Vector3(355, 28.4, 354),
      new Vector3(405, 28.4, 408),
      steelMat,
    );
    createCableSpan(
      'mexicable-span-north',
      new Vector3(405, 28.4, 408),
      new Vector3(354, 28.4, 408),
      steelMat,
    );

    const cabinRedMat = this.createSolidMat(
      'mexicable-cabin-red',
      new Color3(0.92, 0.18, 0.24),
      new Color3(0.45, 0.08, 0.12),
      0.35,
      0.35,
    );
    const cabinGreenMat = this.createSolidMat(
      'mexicable-cabin-green',
      new Color3(0.14, 0.78, 0.42),
      new Color3(0.08, 0.42, 0.2),
      0.35,
      0.35,
    );
    const cabinSpots: readonly { x: number; z: number; green: boolean }[] = [
      { x: 367, z: 367, green: true },
      { x: 380, z: 381, green: false },
      { x: 393, z: 395, green: true },
      { x: 378, z: 408, green: false },
    ];
    cabinSpots.forEach((spot, idx) => {
      const hanger = MeshBuilder.CreateCylinder(
        `mexicable-hanger-${idx}`,
        { height: 5.5, diameter: 0.14, tessellation: 6 },
        this.scene,
      );
      hanger.position.set(spot.x, 25.5, spot.z);
      hanger.material = steelMat;

      const cabin = MeshBuilder.CreateBox(
        `mexicable-cabin-${idx}`,
        { width: 2.4, height: 2.3, depth: 2.8 },
        this.scene,
      );
      cabin.position.set(spot.x, 22.0, spot.z);
      cabin.material = spot.green ? cabinGreenMat : cabinRedMat;
      this.reflectables.push(hanger, cabin);
      this.glowMeshes.push(cabin);
    });

    // Puente de Fierro lateral (arcos metálicos icónicos en Ecatepec)
    const archPillarA = MeshBuilder.CreateBox(
      'ecatepec-puente-fierro-a',
      { width: 2.4, height: 14, depth: 18 },
      this.scene,
    );
    archPillarA.position.set(408, 7, 353);
    archPillarA.material = coyoteMat;
    const archTop = MeshBuilder.CreateBox(
      'ecatepec-puente-fierro-top',
      { width: 3.0, height: 2.2, depth: 22 },
      this.scene,
    );
    archTop.position.set(408, 14.5, 353);
    archTop.material = coyoteMat;
    this.reflectables.push(archPillarA, archTop);

    this.createNeonBillboard(
      {
        name: 'sign-ecatepec-mexicable',
        text: 'ECATEPEC · MEXICABLE',
        primaryColor: '#2aff9b',
        secondaryColor: '#00d8ff',
        backgroundColor: '#061412',
        width: 440,
        height: 112,
      },
      new Vector3(354, 15, 354),
      (3 * Math.PI) / 4,
      10.5,
      2.4,
      toColor3(NOCTURNAL_COLORS.neonGreen),
    );

    // 4. TORRE LATINOAMERICANA Y ZÓCALO (Centro Histórico CDMX — (210, 112))
    const latinoMat = this.createArchitecturalMaterial(
      'torre-latino-glass-mat',
      601,
      '#0e1d36',
      0.55,
      2,
      5,
    );
    const whiteTrimMat = this.createSolidMat(
      'latino-mirador-white',
      new Color3(0.86, 0.9, 0.96),
      new Color3(0.24, 0.28, 0.34),
      0.4,
      0.3,
    );
    const tier1 = MeshBuilder.CreateBox(
      'torre-latino-tier1',
      { width: 22, height: 52, depth: 22 },
      this.scene,
    );
    tier1.position.set(210, 26, 112);
    tier1.material = latinoMat;

    const tier2 = MeshBuilder.CreateBox(
      'torre-latino-tier2',
      { width: 17, height: 22, depth: 17 },
      this.scene,
    );
    tier2.position.set(210, 63, 112);
    tier2.material = latinoMat;

    const mirador = MeshBuilder.CreateBox(
      'torre-latino-mirador',
      { width: 14.5, height: 4.0, depth: 14.5 },
      this.scene,
    );
    mirador.position.set(210, 76, 112);
    mirador.material = whiteTrimMat;

    const tier3 = MeshBuilder.CreateBox(
      'torre-latino-tier3',
      { width: 11, height: 10, depth: 11 },
      this.scene,
    );
    tier3.position.set(210, 83, 112);
    tier3.material = latinoMat;

    const spire = MeshBuilder.CreateCylinder(
      'torre-latino-spire',
      { height: 16, diameterTop: 0.25, diameterBottom: 1.4, tessellation: 8 },
      this.scene,
    );
    spire.position.set(210, 96, 112);
    spire.material = steelMat;

    const latinoBeaconMat = this.createSolidMat(
      'latino-beacon-mat',
      new Color3(1, 0.15, 0.15),
      new Color3(2.8, 0.15, 0.15),
    );
    const latinoBeacon = MeshBuilder.CreateSphere(
      'torre-latino-beacon',
      { diameter: 1.2, segments: 8 },
      this.scene,
    );
    latinoBeacon.position.set(210, 104.5, 112);
    latinoBeacon.material = latinoBeaconMat;
    this.glowMeshes.push(latinoBeacon);

    // Explanada del Zócalo + Asta Bandera Monumental en (165, 112)
    const zocaloStoneMat = this.createSolidMat(
      'zocalo-plaza-stone',
      new Color3(0.22, 0.21, 0.2),
      new Color3(0, 0, 0),
      0.04,
      0.9,
    );
    const zocaloPlaza = MeshBuilder.CreateBox(
      'zocalo-plaza-floor',
      { width: 34, height: 0.3, depth: 28 },
      this.scene,
    );
    zocaloPlaza.position.set(165, 0.15, 112);
    zocaloPlaza.material = zocaloStoneMat;

    const flagpole = MeshBuilder.CreateCylinder(
      'zocalo-flagpole',
      { height: 34, diameterTop: 0.35, diameterBottom: 0.75, tessellation: 10 },
      this.scene,
    );
    flagpole.position.set(165, 17, 112);
    flagpole.material = steelMat;

    const flagStripes: readonly { dx: number; color: Color3; emissive: Color3 }[] = [
      { dx: -4.4, color: new Color3(0.06, 0.45, 0.22), emissive: new Color3(0.04, 0.25, 0.12) },
      { dx: -8.0, color: new Color3(0.92, 0.94, 0.96), emissive: new Color3(0.22, 0.24, 0.26) },
      { dx: -11.6, color: new Color3(0.82, 0.1, 0.16), emissive: new Color3(0.32, 0.05, 0.08) },
    ];
    flagStripes.forEach((stripe, idx) => {
      const cloth = MeshBuilder.CreateBox(
        `zocalo-flag-${idx}`,
        { width: 3.6, height: 6.2, depth: 0.2 },
        this.scene,
      );
      cloth.position.set(165 + stripe.dx, 30.2, 112);
      cloth.material = this.createSolidMat(`zocalo-flag-mat-${idx}`, stripe.color, stripe.emissive);
      this.reflectables.push(cloth);
    });

    this.createNeonBillboard(
      {
        name: 'sign-zocalo-latino',
        text: 'ZÓCALO · LATINO',
        primaryColor: '#48e5ff',
        secondaryColor: '#ffd15c',
        backgroundColor: '#071222',
        width: 380,
        height: 112,
      },
      new Vector3(196, 16, 98),
      0,
      9.6,
      2.4,
      toColor3(NOCTURNAL_COLORS.neonCyan),
    );
    this.reflectables.push(tier1, tier2, mirador, tier3, spire, zocaloPlaza, flagpole);

    // 5. TORRE ARCOS BOSQUES ("EL PANTALÓN") Y SANTA FE / HUIXQUILUCAN ((-380, 118))
    const pantalonMat = this.createArchitecturalMaterial(
      'santafe-pantalon-mat',
      602,
      '#1a2232',
      0.46,
      2,
      4,
    );
    const colWest = MeshBuilder.CreateBox(
      'arcos-bosques-west',
      { width: 16, height: 56, depth: 18 },
      this.scene,
    );
    colWest.position.set(-414, 28, 118);
    colWest.material = pantalonMat;

    const colEast = MeshBuilder.CreateBox(
      'arcos-bosques-east',
      { width: 16, height: 56, depth: 18 },
      this.scene,
    );
    colEast.position.set(-346, 28, 118);
    colEast.material = pantalonMat;

    const archLintel = MeshBuilder.CreateBox(
      'arcos-bosques-lintel',
      { width: 84, height: 22, depth: 18 },
      this.scene,
    );
    archLintel.position.set(-380, 66, 118);
    archLintel.material = pantalonMat;

    const santaFeCurvedA = MeshBuilder.CreateCylinder(
      'santafe-skyline-a',
      { height: 70, diameter: 24, tessellation: 14 },
      this.scene,
    );
    santaFeCurvedA.position.set(-422, 35, 162);
    santaFeCurvedA.material = latinoMat;

    const santaFeCurvedB = MeshBuilder.CreateCylinder(
      'santafe-skyline-b',
      { height: 62, diameter: 20, tessellation: 12 },
      this.scene,
    );
    santaFeCurvedB.position.set(-338, 31, 162);
    santaFeCurvedB.material = pantalonMat;

    this.createNeonBillboard(
      {
        name: 'sign-santafe-huixquilucan',
        text: 'SANTA FE · HUIXQUILUCAN',
        primaryColor: '#4be39a',
        secondaryColor: '#38d6f5',
        backgroundColor: '#071419',
        width: 480,
        height: 112,
      },
      new Vector3(-348, 16, 101),
      0,
      10.5,
      2.4,
      toColor3(NOCTURNAL_COLORS.neonCyan),
    );
    this.reflectables.push(colWest, colEast, archLintel, santaFeCurvedA, santaFeCurvedB);

    // 6. BIBLIOTECA CENTRAL Y RECTORÍA UNAM (Coyoacán / CU — (-46, -356))
    const muralMat = this.createSolidMat(
      'unam-biblioteca-mural',
      new Color3(0.68, 0.44, 0.22),
      new Color3(0.18, 0.11, 0.05),
      0.08,
      0.8,
    );
    const plinthMat = this.createSolidMat(
      'unam-plinth-stone',
      new Color3(0.15, 0.16, 0.19),
      new Color3(0, 0, 0),
      0.04,
      0.9,
    );
    const cuPlinth = MeshBuilder.CreateBox(
      'cu-biblioteca-plinth',
      { width: 38, height: 5, depth: 22 },
      this.scene,
    );
    cuPlinth.position.set(-46, 2.5, -356);
    cuPlinth.material = plinthMat;

    const cuLibrary = MeshBuilder.CreateBox(
      'cu-biblioteca-central',
      { width: 32, height: 24, depth: 16 },
      this.scene,
    );
    cuLibrary.position.set(-46, 17, -356);
    cuLibrary.material = muralMat;

    const cuMuralBlue = MeshBuilder.CreateBox(
      'cu-biblioteca-band-blue',
      { width: 32.4, height: 6, depth: 16.4 },
      this.scene,
    );
    cuMuralBlue.position.set(-46, 21, -356);
    cuMuralBlue.material = this.createSolidMat(
      'unam-mural-blue',
      new Color3(0.14, 0.36, 0.72),
      new Color3(0.06, 0.14, 0.32),
    );

    const cuMuralRed = MeshBuilder.CreateBox(
      'cu-biblioteca-band-red',
      { width: 32.4, height: 4.5, depth: 16.4 },
      this.scene,
    );
    cuMuralRed.position.set(-46, 12, -356);
    cuMuralRed.material = this.createSolidMat(
      'unam-mural-red',
      new Color3(0.74, 0.16, 0.14),
      new Color3(0.22, 0.05, 0.04),
    );

    const rectoria = MeshBuilder.CreateBox(
      'cu-torre-rectoria',
      { width: 16, height: 44, depth: 14 },
      this.scene,
    );
    rectoria.position.set(-76, 22, -356);
    rectoria.material = latinoMat;

    this.createNeonBillboard(
      {
        name: 'sign-cu-coyoacan',
        text: 'CU · COYOACÁN',
        primaryColor: '#ffbf3f',
        secondaryColor: '#38d6f5',
        backgroundColor: '#0e1424',
        width: 360,
        height: 112,
      },
      new Vector3(-28, 14, -342),
      Math.PI,
      8.8,
      2.2,
      toColor3(NOCTURNAL_COLORS.neonAmber),
    );
    this.reflectables.push(cuPlinth, cuLibrary, cuMuralBlue, cuMuralRed, rectoria);

    // 7. AEROPUERTO INTERNACIONAL BENITO JUÁREZ CDMX (AICM T1, T2, Torre, Aerotrén y Pista)
    this.buildAicmAirportAndMetroViaduct(steelMat, latinoMat);
  }

  private buildAicmAirportAndMetroViaduct(steelMat: PBRMaterial, glassMat: PBRMaterial): void {
    const terminalConcreteMat = this.createSolidMat(
      'aicm-terminal-concrete',
      new Color3(0.76, 0.78, 0.82),
      new Color3(0.06, 0.07, 0.09),
      0.15,
      0.55,
    );
    const roofCanopyMat = this.createSolidMat(
      'aicm-roof-canopy',
      new Color3(0.9, 0.92, 0.96),
      new Color3(0.12, 0.14, 0.18),
      0.3,
      0.35,
    );
    const aicmGlassMat = this.createSolidMat(
      'aicm-curtain-glass',
      new Color3(0.12, 0.24, 0.36),
      new Color3(0.18, 0.3, 0.45),
      0.65,
      0.15,
    );
    const runwayAsphaltMat = this.createSolidMat(
      'aicm-runway-asphalt',
      new Color3(0.1, 0.11, 0.13),
      new Color3(0, 0, 0),
      0.04,
      0.86,
    );
    const runwayBeaconMat = this.createSolidMat(
      'aicm-runway-beacon-mat',
      new Color3(0.3, 1.0, 0.6),
      new Color3(0.4, 2.2, 0.9),
    );
    const amberBeaconMat = this.createSolidMat(
      'aicm-amber-edge-mat',
      new Color3(1.0, 0.72, 0.15),
      new Color3(2.1, 1.35, 0.2),
    );

    // Terminal 1 AICM (herradura horizontal frente a Blvd. Puerto Aéreo)
    const t1Body = MeshBuilder.CreateBox(
      'aicm-terminal-1-body',
      { width: 68, height: 15, depth: 18 },
      this.scene,
    );
    t1Body.position.set(215, 7.5, 264);
    t1Body.material = terminalConcreteMat;

    const t1Facade = MeshBuilder.CreateBox(
      'aicm-terminal-1-glass',
      { width: 64, height: 11, depth: 0.4 },
      this.scene,
    );
    t1Facade.position.set(215, 7.8, 254.9);
    t1Facade.material = aicmGlassMat;

    const t1Canopy = MeshBuilder.CreateBox(
      'aicm-terminal-1-canopy',
      { width: 72, height: 1.2, depth: 22 },
      this.scene,
    );
    t1Canopy.position.set(215, 15.4, 264);
    t1Canopy.material = roofCanopyMat;

    for (const jx of [192, 215, 238]) {
      const jetway = MeshBuilder.CreateBox(
        `aicm-jetway-${jx}`,
        { width: 3.4, height: 3.2, depth: 10 },
        this.scene,
      );
      jetway.position.set(jx, 6.2, 278);
      jetway.material = roofCanopyMat;
      this.reflectables.push(jetway);
    }

    this.createNeonBillboard(
      {
        name: 'sign-aicm-t1',
        text: 'AICM · TERMINAL 1 · CDMX',
        primaryColor: '#48e5ff',
        secondaryColor: '#eef6ff',
        backgroundColor: '#071422',
        width: 480,
        height: 104,
      },
      new Vector3(215, 17, 253),
      0,
      14,
      2.8,
      toColor3(NOCTURNAL_COLORS.neonCyan),
    );

    // Torre de Control AICM ((264, 0, 264))
    const towerShaft = MeshBuilder.CreateCylinder(
      'aicm-control-tower-shaft',
      { height: 44, diameterTop: 4.5, diameterBottom: 5.6, tessellation: 14 },
      this.scene,
    );
    towerShaft.position.set(264, 22, 264);
    towerShaft.material = roofCanopyMat;

    const towerCab = MeshBuilder.CreateCylinder(
      'aicm-control-tower-cab',
      { height: 5.5, diameterTop: 10.2, diameterBottom: 7.4, tessellation: 10 },
      this.scene,
    );
    towerCab.position.set(264, 46, 264);
    towerCab.material = aicmGlassMat;

    const towerCap = MeshBuilder.CreateCylinder(
      'aicm-control-tower-cap',
      { height: 1.4, diameter: 10.6, tessellation: 10 },
      this.scene,
    );
    towerCap.position.set(264, 49.4, 264);
    towerCap.material = roofCanopyMat;

    const towerBeacon = MeshBuilder.CreateSphere(
      'aicm-control-tower-beacon',
      { diameter: 1.5, segments: 8 },
      this.scene,
    );
    towerBeacon.position.set(264, 52, 264);
    towerBeacon.material = runwayBeaconMat;
    this.glowMeshes.push(towerBeacon);

    // Terminal 2 AICM y Aerotrén elevado entre T1 y T2
    const t2Body = MeshBuilder.CreateBox(
      'aicm-terminal-2-body',
      { width: 42, height: 14, depth: 16 },
      this.scene,
    );
    t2Body.position.set(312, 7, 266);
    t2Body.material = glassMat;

    const aerotrenBeam = MeshBuilder.CreateBox(
      'aicm-aerotren-guideway',
      { width: 62, height: 1.4, depth: 3.0 },
      this.scene,
    );
    aerotrenBeam.position.set(276, 8.5, 258);
    aerotrenBeam.material = roofCanopyMat;

    this.createNeonBillboard(
      {
        name: 'sign-aicm-t2',
        text: 'AICM · TERMINAL 2 · AEROTRÉN',
        primaryColor: '#38d6f5',
        secondaryColor: '#ffb84d',
        backgroundColor: '#091322',
        width: 480,
        height: 96,
      },
      new Vector3(312, 16, 257),
      0,
      12.5,
      2.5,
      toColor3(NOCTURNAL_COLORS.neonCyan),
    );

    // Pista 05R/23L iluminada y avión comercial 3D en plataforma
    const runway = MeshBuilder.CreateBox(
      'aicm-runway-05r',
      { width: 148, height: 0.08, depth: 18 },
      this.scene,
    );
    runway.position.set(230, 0.04, 294);
    runway.material = runwayAsphaltMat;

    for (let rx = 162; rx <= 298; rx += 14) {
      const mark = MeshBuilder.CreateBox(
        `aicm-runway-dash-${rx}`,
        { width: 6.5, height: 0.1, depth: 0.6 },
        this.scene,
      );
      mark.position.set(rx, 0.06, 294);
      mark.material = roofCanopyMat;

      for (const rz of [285.6, 302.4]) {
        const edgeLight = MeshBuilder.CreateSphere(
          `aicm-runway-light-${rx}-${rz}`,
          { diameter: 0.45, segments: 6 },
          this.scene,
        );
        edgeLight.position.set(rx, 0.25, rz);
        edgeLight.material = amberBeaconMat;
        this.glowMeshes.push(edgeLight);
      }
    }

    // Avión comercial 3D estacionado en pista 05R ((230, 2.5, 294))
    const planeFuselage = MeshBuilder.CreateCylinder(
      'aicm-plane-fuselage',
      { height: 26, diameter: 3.6, tessellation: 14 },
      this.scene,
    );
    planeFuselage.position.set(230, 2.5, 294);
    planeFuselage.rotation.z = Math.PI / 2;
    planeFuselage.material = roofCanopyMat;

    const planeNose = MeshBuilder.CreateSphere(
      'aicm-plane-nose',
      { diameter: 3.55, segments: 10 },
      this.scene,
    );
    planeNose.position.set(243, 2.5, 294);
    planeNose.scaling.set(1.5, 0.96, 0.96);
    planeNose.material = roofCanopyMat;

    const planeWings = MeshBuilder.CreateBox(
      'aicm-plane-wings',
      { width: 6.2, height: 0.36, depth: 24 },
      this.scene,
    );
    planeWings.position.set(229, 2.1, 294);
    planeWings.material = terminalConcreteMat;

    const planeTail = MeshBuilder.CreateBox(
      'aicm-plane-tailfin',
      { width: 4.5, height: 5.5, depth: 0.4 },
      this.scene,
    );
    planeTail.position.set(219, 5.4, 294);
    planeTail.rotation.z = 0.28;
    planeTail.material = aicmGlassMat;

    const planeHStab = MeshBuilder.CreateBox(
      'aicm-plane-hstab',
      { width: 2.8, height: 0.25, depth: 9.2 },
      this.scene,
    );
    planeHStab.position.set(218, 3.2, 294);
    planeHStab.material = terminalConcreteMat;

    for (const tz of [-5.2, 5.2]) {
      const turbine = MeshBuilder.CreateCylinder(
        `aicm-plane-turbine-${tz}`,
        { height: 3.4, diameter: 1.5, tessellation: 10 },
        this.scene,
      );
      turbine.position.set(231.5, 1.35, 294 + tz);
      turbine.rotation.z = Math.PI / 2;
      turbine.material = steelMat;
      this.reflectables.push(turbine);
    }

    // Viaducto Elevado del STC Metro CDMX (Z = 196, paralelo al sur de Blvd. Puerto Aéreo)
    const viaductConcreteMat = this.createSolidMat(
      'metro-viaduct-concrete',
      new Color3(0.28, 0.3, 0.34),
      new Color3(0, 0, 0),
      0.06,
      0.85,
    );
    const metroStationMat = this.createSolidMat(
      'metro-station-orange-pbr',
      new Color3(0.92, 0.42, 0.08),
      new Color3(0.28, 0.12, 0.02),
      0.25,
      0.45,
    );

    const viaductDeck = MeshBuilder.CreateBox(
      'metro-elevated-viaduct-deck',
      { width: 300, height: 1.5, depth: 5.2 },
      this.scene,
    );
    viaductDeck.position.set(190, 8.4, 196);
    viaductDeck.material = viaductConcreteMat;

    for (const railOffsetZ of [-1.1, 1.1]) {
      const rail = MeshBuilder.CreateBox(
        `metro-elevated-rail-${railOffsetZ}`,
        { width: 300, height: 0.16, depth: 0.22 },
        this.scene,
      );
      rail.position.set(190, 9.22, 196 + railOffsetZ);
      rail.material = steelMat;
      this.reflectables.push(rail);
    }

    for (let px = 55; px <= 305; px += 50) {
      const pillar = MeshBuilder.CreateCylinder(
        `metro-viaduct-pillar-${px}`,
        { height: 8.2, diameterTop: 2.0, diameterBottom: 2.4, tessellation: 10 },
        this.scene,
      );
      pillar.position.set(px, 4.1, 196);
      pillar.material = viaductConcreteMat;
      this.reflectables.push(pillar);
    }

    const stationRoof = MeshBuilder.CreateBox(
      'metro-terminal-aerea-roof',
      { width: 36, height: 1.0, depth: 8.4 },
      this.scene,
    );
    stationRoof.position.set(190, 14.2, 196);
    stationRoof.material = metroStationMat;

    for (const sx of [175, 205]) {
      const support = MeshBuilder.CreateBox(
        `metro-station-support-${sx}`,
        { width: 1.1, height: 5.8, depth: 7.4 },
        this.scene,
      );
      support.position.set(sx, 11.2, 196);
      support.material = steelMat;
      this.reflectables.push(support);
    }

    this.createNeonBillboard(
      {
        name: 'sign-metro-terminal-aerea',
        text: 'M METRO CDMX · TERMINAL AÉREA',
        primaryColor: '#ff7b1c',
        secondaryColor: '#ffd242',
        backgroundColor: '#1f0b02',
        width: 500,
        height: 96,
      },
      new Vector3(190, 14.3, 200.4),
      Math.PI,
      14,
      2.6,
      toColor3(NOCTURNAL_COLORS.neonAmber),
    );

    this.reflectables.push(
      t1Body,
      t1Facade,
      t1Canopy,
      towerShaft,
      towerCab,
      towerCap,
      t2Body,
      aerotrenBeam,
      runway,
      planeFuselage,
      planeNose,
      planeWings,
      planeTail,
      planeHStab,
      viaductDeck,
      stationRoof,
    );
  }

  private buildMetropolitanUrbanCorridors(): void {
    const templateMatA = this.createArchitecturalMaterial(
      'metro-corridor-mat-a',
      811,
      '#181c28',
      0.34,
      2,
      2,
    );
    const templateMatB = this.createArchitecturalMaterial(
      'metro-corridor-mat-b',
      812,
      '#22191c',
      0.36,
      2,
      2,
    );

    const templateA = MeshBuilder.CreateBox(
      'metro-corridor-template-a',
      { width: 18, height: 26, depth: 24 },
      this.scene,
    );
    templateA.material = templateMatA;
    templateA.isVisible = false;

    const templateB = MeshBuilder.CreateBox(
      'metro-corridor-template-b',
      { width: 20, height: 34, depth: 22 },
      this.scene,
    );
    templateB.material = templateMatB;
    templateB.isVisible = false;

    const placements: Array<{ x: number; z: number; hScale: number; bVariant: boolean }> = [];

    // Insurgentes Sur & Norte
    for (const z of [-445, -395, -245, -180, -110, 290, 455, 515]) {
      for (const side of [-1, 1] as const) {
        placements.push({ x: side * 39, z, hScale: z > 200 ? 1.15 : 0.9, bVariant: z % 20 === 0 });
      }
    }

    // Periférico Norte (Tlalnepantla / Vía Morelos)
    for (const x of [-315, -245, -175, -105, 85, 165, 245, 315]) {
      for (const z of [340, 420]) {
        placements.push({ x, z, hScale: 0.95, bVariant: x < 0 });
      }
    }

    // Nezahualcóyotl / Circuito Mexiquense Oriente (sin invadir Blvd. Puerto Aéreo Z=207..243 ni T2)
    for (const z of [-240, -145, -45, 165]) {
      for (const x of [340, 422]) {
        placements.push({ x, z, hScale: 0.78, bVariant: x > 380 });
      }
    }
    placements.push({ x: 422, z: 285, hScale: 0.78, bVariant: true });

    // Iztapalapa / Periférico Sur
    for (const x of [-315, -225, -145, 95, 185, 275]) {
      for (const z of [-360, -280]) {
        placements.push({ x, z, hScale: 0.85, bVariant: x > 0 });
      }
    }

    const isInsideOpenCurveBuffer = (px: number, pz: number): boolean => {
      for (const curve of METROPOLITAN_OPEN_CURVES) {
        const dx = px - curve.cx;
        const dz = pz - curve.cz;
        const r = Math.hypot(dx, dz);
        if (r < curve.innerRadius - 18 || r > curve.outerRadius + 18) {
          continue;
        }
        const rawTheta = Math.atan2(dz, dx);
        const midAngle = 0.5 * (curve.startAngle + curve.endAngle);
        const halfSpan = 0.5 * (curve.endAngle - curve.startAngle);
        let delta = rawTheta - midAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        if (Math.abs(delta) <= halfSpan + 0.15) {
          return true;
        }
      }
      return false;
    };

    placements.forEach((p, idx) => {
      if (isInsideOpenCurveBuffer(p.x, p.z)) {
        return;
      }
      const tpl = p.bVariant ? templateB : templateA;
      const baseH = p.bVariant ? 34 : 26;
      const instance = tpl.createInstance(`metro-corridor-bldg-${idx}`);
      instance.scaling.set(1, p.hScale, 1);
      instance.position.set(p.x, (baseH * p.hScale) / 2, p.z);
    });
  }
}
