import {
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import {
  METROPOLITAN_CURVE_BARRIERS,
  METROPOLITAN_OPEN_CURVES,
  METROPOLITAN_ROUNDABOUTS,
  NOCTURNAL_COLORS,
  resolveIntersectionSignalState,
  TEST_AVENUE_CONFIG,
  type IntersectionSignalState,
  type RgbTuple,
  type TrafficLightColor,
} from '../config/GameConfig';
import {
  createChevronSignTexture,
  createRoadSignTexture,
  createWetAsphaltTextures,
} from '../engine/ProceduralTextures';

function toColor3(rgb: RgbTuple): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

interface AxisSignalMaterials {
  readonly red: PBRMaterial;
  readonly yellow: PBRMaterial;
  readonly green: PBRMaterial;
}

/**
 * Construye la red vial de CDMX y Estado de México con asfalto urbano PBR sin espejo,
 * glorietas transitables, semáforos congruentes de 3 luces y alumbrado público.
 */
export class RoadManager {
  private readonly scene: Scene;
  private readonly asphaltMat: PBRMaterial;
  private readonly nsSignalMats: AxisSignalMaterials;
  private readonly ewSignalMats: AxisSignalMaterials;
  private lastSignalState: IntersectionSignalState | null = null;
  private readonly streetLights: PointLight[] = [];
  private readonly reflectables: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private readonly glowMeshes: AbstractMesh[] = [];

  public constructor(scene: Scene) {
    this.scene = scene;
    this.nsSignalMats = this.createSignalMaterials('ns');
    this.ewSignalMats = this.createSignalMaterials('ew');
    this.asphaltMat = this.buildWetRoad();
    this.buildRoundaboutIsland();
    this.buildSharpCurvesAndChicanes();
    this.buildSidewalksAndMedians();
    this.buildRoadMarkings();
    this.buildReformaTreesAndHedges();
    this.buildTrafficSignals();
    this.buildStreetLights();
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

  public applyStreetLightBudget(maxLights: number): void {
    this.streetLights.forEach((light, index) => {
      light.setEnabled(index < maxLights);
    });
  }

  public setPlanarReflection(
    enabled: boolean,
    mapSize: number,
    _sceneReflectables: AbstractMesh[],
  ): void {
    void _sceneReflectables;
    this.asphaltMat.reflectionTexture = null;
    this.asphaltMat.clearCoat.isEnabled = false;
    this.asphaltMat.metallic = 0.03;
    this.asphaltMat.roughness = 0.88;
    if (this.asphaltMat.bumpTexture) {
      this.asphaltMat.bumpTexture.level = enabled ? (mapSize >= 1024 ? 1.15 : 0.95) : 0.7;
    }
  }

  public dispose(): void {
    this.asphaltMat.reflectionTexture = null;
  }

  private buildWetRoad(): PBRMaterial {
    const textures = createWetAsphaltTextures(this.scene, 6.0, 140);

    const asphaltMat = new PBRMaterial('wet-asphalt-pbr', this.scene);
    asphaltMat.albedoTexture = textures.albedoTexture;
    asphaltMat.albedoColor = new Color3(0.96, 0.96, 0.98);
    asphaltMat.metallicTexture = textures.metallicRoughnessTexture;
    asphaltMat.useRoughnessFromMetallicTextureGreen = true;
    asphaltMat.useMetallnessFromMetallicTextureBlue = true;
    asphaltMat.bumpTexture = textures.bumpTexture;
    asphaltMat.bumpTexture.level = 1.05;
    asphaltMat.metallic = 0.03;
    asphaltMat.roughness = 0.88;
    asphaltMat.reflectivityColor = new Color3(0.16, 0.16, 0.18);
    asphaltMat.environmentIntensity = 0.22;
    asphaltMat.clearCoat.isEnabled = false;
    asphaltMat.reflectionTexture = null;

    // Explanada urbana base bajo toda la Zona Metropolitana (evita vacío bajo manzanas)
    const metroBaseMat = new PBRMaterial('zmvm-base-terrain-pbr', this.scene);
    metroBaseMat.albedoColor = new Color3(0.04, 0.05, 0.07);
    metroBaseMat.metallic = 0.04;
    metroBaseMat.roughness = 0.92;

    const metroGround = MeshBuilder.CreateGround(
      'zmvm-urban-ground',
      { width: 1200, height: 1200, subdivisions: 4 },
      this.scene,
    );
    metroGround.position.set(0, -0.06, 40);
    metroGround.material = metroBaseMat;
    metroGround.receiveShadows = true;

    // 1. Eje Central Norte-Sur (Insurgentes Sur / Paseo de la Reforma / Indios Verdes)
    const reformaMain = MeshBuilder.CreateGround(
      'reforma-wet-asphalt',
      { width: 40, height: 1040, subdivisions: 12 },
      this.scene,
    );
    reformaMain.position.set(0, 0, 40);
    reformaMain.material = asphaltMat;
    reformaMain.receiveShadows = true;

    // 2. Periférico Poniente (San Ángel · Santa Fe · Naucalpan / Satélite Edomex)
    const perifericoPoniente = MeshBuilder.CreateGround(
      'periferico-poniente-asphalt',
      { width: 36, height: 780, subdivisions: 8 },
      this.scene,
    );
    perifericoPoniente.position.set(-380, 0.001, 40);
    perifericoPoniente.material = asphaltMat;
    perifericoPoniente.receiveShadows = true;

    // 3. Circuito Mexiquense / Oriente (Iztapalapa · Nezahualcóyotl · Ecatepec Edomex)
    const circuitoOriente = MeshBuilder.CreateGround(
      'circuito-mexiquense-asphalt',
      { width: 36, height: 780, subdivisions: 8 },
      this.scene,
    );
    circuitoOriente.position.set(380, 0.001, 40);
    circuitoOriente.material = asphaltMat;
    circuitoOriente.receiveShadows = true;

    // 4. Eje Transversal Central (Santa Fe · Reforma · Centro Histórico / Zócalo · Neza)
    const ejeCentralEw = MeshBuilder.CreateGround(
      'eje-central-juarez-palmas-asphalt',
      { width: 36, height: 960, subdivisions: 10 },
      this.scene,
    );
    ejeCentralEw.position.set(0, 0.002, 75);
    ejeCentralEw.rotation.y = Math.PI / 2;
    ejeCentralEw.material = asphaltMat;
    ejeCentralEw.receiveShadows = true;

    // 5. Periférico Norte Edomex (Satélite · Tlalnepantla · Ecatepec)
    const perifericoNorte = MeshBuilder.CreateGround(
      'periferico-norte-edomex-asphalt',
      { width: 38, height: 960, subdivisions: 10 },
      this.scene,
    );
    perifericoNorte.position.set(0, 0.002, 380);
    perifericoNorte.rotation.y = Math.PI / 2;
    perifericoNorte.material = asphaltMat;
    perifericoNorte.receiveShadows = true;

    // 6. Periférico Sur · Viaducto (San Ángel · Coyoacán / CU · Iztapalapa)
    const perifericoSur = MeshBuilder.CreateGround(
      'periferico-sur-viaducto-asphalt',
      { width: 36, height: 960, subdivisions: 10 },
      this.scene,
    );
    perifericoSur.position.set(0, 0.002, -320);
    perifericoSur.rotation.y = Math.PI / 2;
    perifericoSur.material = asphaltMat;
    perifericoSur.receiveShadows = true;

    // 7. Blvd. Puerto Aéreo · Circuito Interior · AICM CDMX
    const blvdPuertoAereo = MeshBuilder.CreateGround(
      'blvd-puerto-aereo-asphalt',
      { width: 36, height: 418, subdivisions: 8 },
      this.scene,
    );
    blvdPuertoAereo.position.set(189, 0.002, 225);
    blvdPuertoAereo.rotation.y = Math.PI / 2;
    blvdPuertoAereo.material = asphaltMat;
    blvdPuertoAereo.receiveShadows = true;

    // 8. Circuito de Curvas Abiertas de La Marquesa (Poniente / Edomex)
    const laMarquesaAsphalt = MeshBuilder.CreateGround(
      'la-marquesa-curves-asphalt',
      { width: 144, height: 395, subdivisions: 8 },
      this.scene,
    );
    laMarquesaAsphalt.position.set(-433, 0.001, -122.5);
    laMarquesaAsphalt.material = asphaltMat;
    laMarquesaAsphalt.receiveShadows = true;

    // 9. Arcos de asfalto de gran radio para curvas abiertas de alta velocidad
    for (const curve of METROPOLITAN_OPEN_CURVES) {
      const steps = 28;
      const innerPath: Vector3[] = [];
      const outerPath: Vector3[] = [];
      for (let s = 0; s <= steps; s += 1) {
        const theta = curve.startAngle + ((curve.endAngle - curve.startAngle) * s) / steps;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        innerPath.push(
          new Vector3(
            curve.cx + cosT * curve.innerRadius,
            0.0015,
            curve.cz + sinT * curve.innerRadius,
          ),
        );
        outerPath.push(
          new Vector3(
            curve.cx + cosT * curve.outerRadius,
            0.0015,
            curve.cz + sinT * curve.outerRadius,
          ),
        );
      }
      const arcRibbon = MeshBuilder.CreateRibbon(
        `${curve.id}-asphalt`,
        {
          pathArray: [innerPath, outerPath],
          sideOrientation: Mesh.DOUBLESIDE,
        },
        this.scene,
      );
      arcRibbon.material = asphaltMat;
      arcRibbon.receiveShadows = true;
    }

    return asphaltMat;
  }

  private buildRoundaboutIsland(): void {
    const grassMat = new PBRMaterial('roundabout-grass-pbr', this.scene);
    grassMat.albedoColor = new Color3(0.06, 0.14, 0.08);
    grassMat.metallic = 0.02;
    grassMat.roughness = 0.88;

    const plazaMat = new PBRMaterial('roundabout-plaza-pbr', this.scene);
    plazaMat.albedoColor = new Color3(0.16, 0.17, 0.2);
    plazaMat.metallic = 0.04;
    plazaMat.roughness = 0.86;

    const curbMat = new PBRMaterial('roundabout-curb-pbr', this.scene);
    curbMat.albedoColor = new Color3(0.32, 0.32, 0.34);
    curbMat.metallic = 0.05;
    curbMat.roughness = 0.65;

    for (const roundabout of METROPOLITAN_ROUNDABOUTS) {
      const island = MeshBuilder.CreateCylinder(
        `roundabout-island-${roundabout.id}`,
        { height: 0.32, diameter: roundabout.islandRadius * 2, tessellation: 40 },
        this.scene,
      );
      island.position.set(roundabout.x, 0.16, roundabout.z);
      island.material = roundabout.id === 'angel' ? grassMat : plazaMat;
      island.receiveShadows = true;

      const curbRing = MeshBuilder.CreateTorus(
        `roundabout-curb-${roundabout.id}`,
        { diameter: roundabout.islandRadius * 2, thickness: 0.55, tessellation: 48 },
        this.scene,
      );
      curbRing.position.set(roundabout.x, 0.24, roundabout.z);
      curbRing.material = curbMat;
      this.reflectables.push(island, curbRing);
    }
  }

  private buildSharpCurvesAndChicanes(): void {
    const whiteCurbMat = new PBRMaterial('apex-curb-white-pbr', this.scene);
    whiteCurbMat.albedoColor = new Color3(0.92, 0.94, 0.96);
    whiteCurbMat.roughness = 0.5;

    const redCurbMat = new PBRMaterial('apex-curb-red-pbr', this.scene);
    redCurbMat.albedoColor = new Color3(0.88, 0.12, 0.16);
    redCurbMat.emissiveColor = new Color3(0.18, 0.02, 0.03);
    redCurbMat.roughness = 0.45;

    const barrierCoreMat = new PBRMaterial('curve-barrier-core-pbr', this.scene);
    barrierCoreMat.albedoColor = new Color3(0.12, 0.14, 0.18);
    barrierCoreMat.roughness = 0.8;

    const hazardStripeMat = new PBRMaterial('curve-barrier-hazard-pbr', this.scene);
    hazardStripeMat.albedoColor = new Color3(0.98, 0.75, 0.06);
    hazardStripeMat.emissiveColor = new Color3(0.32, 0.24, 0.02);
    hazardStripeMat.roughness = 0.4;

    const postMat = new PBRMaterial('chevron-post-pbr', this.scene);
    postMat.albedoColor = new Color3(0.24, 0.28, 0.34);
    postMat.metallic = 0.78;
    postMat.roughness = 0.34;

    const chevronLeftTex = createChevronSignTexture(this.scene, 'LEFT');
    const chevronRightTex = createChevronSignTexture(this.scene, 'RIGHT');

    const chevronLeftMat = new PBRMaterial('chevron-left-mat', this.scene);
    chevronLeftMat.albedoTexture = chevronLeftTex;
    chevronLeftMat.emissiveTexture = chevronLeftTex;
    chevronLeftMat.emissiveColor = new Color3(0.55, 0.48, 0.12);
    chevronLeftMat.roughness = 0.35;

    const chevronRightMat = new PBRMaterial('chevron-right-mat', this.scene);
    chevronRightMat.albedoTexture = chevronRightTex;
    chevronRightMat.emissiveTexture = chevronRightTex;
    chevronRightMat.emissiveColor = new Color3(0.55, 0.48, 0.12);
    chevronRightMat.roughness = 0.35;

    for (const barrier of METROPOLITAN_CURVE_BARRIERS) {
      // Lavadero rojo/blanco exterior + núcleo con franja amarilla reflectiva
      const whiteRing = MeshBuilder.CreateTorus(
        `${barrier.id}-curb-white`,
        { diameter: barrier.radius * 2, thickness: 0.9, tessellation: 36 },
        this.scene,
      );
      whiteRing.position.set(barrier.x, 0.18, barrier.z);
      whiteRing.material = whiteCurbMat;

      const redSegmentCount = barrier.radius >= 12 ? 12 : 8;
      for (let k = 0; k < redSegmentCount; k += 1) {
        const angle = (Math.PI * 2 * k) / redSegmentCount;
        const arcSeg = MeshBuilder.CreateBox(
          `${barrier.id}-curb-red-${k}`,
          {
            width: Math.max(1.2, (Math.PI * barrier.radius) / redSegmentCount),
            height: 0.38,
            depth: 0.95,
          },
          this.scene,
        );
        arcSeg.position.set(
          barrier.x + Math.sin(angle) * barrier.radius,
          0.22,
          barrier.z + Math.cos(angle) * barrier.radius,
        );
        arcSeg.rotation.y = angle;
        arcSeg.material = redCurbMat;
        this.reflectables.push(arcSeg);
      }

      const coreDiam = Math.max(2.0, barrier.radius * 2 - 1.1);
      const core = MeshBuilder.CreateCylinder(
        `${barrier.id}-core`,
        { height: 1.45, diameter: coreDiam, tessellation: 28 },
        this.scene,
      );
      core.position.set(barrier.x, 0.72, barrier.z);
      core.material = barrierCoreMat;

      const hazardBand = MeshBuilder.CreateCylinder(
        `${barrier.id}-hazard`,
        { height: 0.34, diameter: coreDiam + 0.18, tessellation: 28 },
        this.scene,
      );
      hazardBand.position.set(barrier.x, 1.08, barrier.z);
      hazardBand.material = hazardStripeMat;

      this.reflectables.push(whiteRing, core, hazardBand);

      // 3 carteles reflectivos de Chevron >>> / <<< mirando hacia los dos sentidos de aproximación
      const signMat = barrier.chevronDir === 'LEFT' ? chevronLeftMat : chevronRightMat;
      const signRadius = barrier.radius - 0.1;
      const approachAngles = [-0.42, 0, 0.42, Math.PI - 0.42, Math.PI, Math.PI + 0.42];
      approachAngles.forEach((ang, idx) => {
        const nx = Math.sin(ang);
        const nz = Math.cos(ang);
        const sx = barrier.x + nx * signRadius;
        const sz = barrier.z + nz * signRadius;

        const signPole = new TransformNode(`${barrier.id}-chevron-${idx}`, this.scene);
        signPole.position.set(sx, 0, sz);
        signPole.rotation.y = Math.atan2(-nx, -nz);

        const pole = MeshBuilder.CreateCylinder(
          `${barrier.id}-chevron-pole-${idx}`,
          { height: 3.1, diameter: 0.14, tessellation: 8 },
          this.scene,
        );
        pole.parent = signPole;
        pole.position.set(0, 1.55, 0.08);
        pole.material = postMat;

        const plate = MeshBuilder.CreatePlane(
          `${barrier.id}-chevron-face-${idx}`,
          { width: 2.2, height: 1.65 },
          this.scene,
        );
        plate.parent = signPole;
        plate.position.set(0, 2.7, -0.02);
        plate.material = signMat;

        this.reflectables.push(pole, plate);
        this.glowMeshes.push(plate);
      });
    }

    // Guarniciones exteriores/interiores y chevrones reflectivos en las curvas abiertas
    for (const curve of METROPOLITAN_OPEN_CURVES) {
      const curbSegments = 14;
      const span = curve.endAngle - curve.startAngle;
      for (const r of [curve.innerRadius, curve.outerRadius] as const) {
        const segLen = (r * Math.abs(span)) / curbSegments;
        for (let k = 0; k < curbSegments; k += 1) {
          const theta = curve.startAngle + (span * (k + 0.5)) / curbSegments;
          const curbBlock = MeshBuilder.CreateBox(
            `${curve.id}-curb-${r}-${k}`,
            { width: 1.05, height: 0.28, depth: Math.max(2.0, segLen * 0.96) },
            this.scene,
          );
          curbBlock.position.set(
            curve.cx + Math.cos(theta) * r,
            0.14,
            curve.cz + Math.sin(theta) * r,
          );
          curbBlock.rotation.y = Math.atan2(-Math.sin(theta), Math.cos(theta));
          curbBlock.material = k % 2 === 0 ? redCurbMat : whiteCurbMat;
          this.reflectables.push(curbBlock);
        }
      }

      const signMat = curve.chevronDir === 'LEFT' ? chevronLeftMat : chevronRightMat;
      const signRadius = curve.outerRadius + 1.4;
      const chevronCount = 5;
      for (let c = 0; c < chevronCount; c += 1) {
        const theta = curve.startAngle + (span * (c + 0.5)) / chevronCount;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const signPole = new TransformNode(`${curve.id}-chevron-${c}`, this.scene);
        signPole.position.set(curve.cx + cosT * signRadius, 0, curve.cz + sinT * signRadius);
        signPole.rotation.y = Math.atan2(cosT, sinT);

        const pole = MeshBuilder.CreateCylinder(
          `${curve.id}-chevron-pole-${c}`,
          { height: 3.1, diameter: 0.14, tessellation: 8 },
          this.scene,
        );
        pole.parent = signPole;
        pole.position.set(0, 1.55, 0.08);
        pole.material = postMat;

        const plate = MeshBuilder.CreatePlane(
          `${curve.id}-chevron-face-${c}`,
          { width: 2.4, height: 1.75, sideOrientation: Mesh.DOUBLESIDE },
          this.scene,
        );
        plate.parent = signPole;
        plate.position.set(0, 2.7, -0.02);
        plate.material = signMat;

        this.reflectables.push(pole, plate);
        this.glowMeshes.push(plate);
      }
    }
  }

  private buildSidewalksAndMedians(): void {
    const { roadWidth, sidewalkWidth, angelPosition } = TEST_AVENUE_CONFIG;

    const sidewalkMat = new PBRMaterial('wet-sidewalk-pbr', this.scene);
    sidewalkMat.albedoColor = new Color3(0.24, 0.25, 0.28);
    sidewalkMat.metallic = 0.02;
    sidewalkMat.roughness = 0.88;
    sidewalkMat.clearCoat.isEnabled = false;

    const yellowCurbMat = new PBRMaterial('curb-yellow-pbr', this.scene);
    yellowCurbMat.albedoColor = new Color3(0.75, 0.52, 0.08);
    yellowCurbMat.metallic = 0.05;
    yellowCurbMat.roughness = 0.5;

    // Banquetas de Reforma divididas antes y después del crucero transversal (Z = 57..93)
    const reformaSegments: readonly { id: string; centerZ: number; length: number }[] = [
      { id: 'south', centerZ: -26.5, length: 167 },
      { id: 'north', centerZ: 161.5, length: 137 },
    ];
    const offset = roadWidth / 2 + sidewalkWidth / 2;
    for (const seg of reformaSegments) {
      for (const side of [-1, 1] as const) {
        const sidewalk = MeshBuilder.CreateBox(
          `sidewalk-${seg.id}-${side < 0 ? 'left' : 'right'}`,
          { width: sidewalkWidth, height: 0.24, depth: seg.length },
          this.scene,
        );
        sidewalk.position.set(side * offset, 0.12, seg.centerZ);
        sidewalk.material = sidewalkMat;
        sidewalk.receiveShadows = true;

        const curbStripe = MeshBuilder.CreateBox(
          `curb-paint-${seg.id}-${side < 0 ? 'left' : 'right'}`,
          { width: 0.22, height: 0.25, depth: seg.length },
          this.scene,
        );
        curbStripe.position.set(side * (roadWidth / 2 + 0.11), 0.125, seg.centerZ);
        curbStripe.material = yellowCurbMat;
        this.reflectables.push(sidewalk, curbStripe);
      }
    }

    // Camellón central antes y después de la glorieta del Ángel
    const southMedian = MeshBuilder.CreateBox(
      'reforma-median-south',
      { width: 1.8, height: 0.22, depth: 110 },
      this.scene,
    );
    southMedian.position.set(0, 0.11, -3);
    southMedian.material = sidewalkMat;
    southMedian.receiveShadows = true;

    const northMedian = MeshBuilder.CreateBox(
      'reforma-median-north',
      { width: 1.8, height: 0.22, depth: 110 },
      this.scene,
    );
    northMedian.position.set(0, 0.11, angelPosition.z + 75);
    northMedian.material = sidewalkMat;
    northMedian.receiveShadows = true;
    this.reflectables.push(southMedian, northMedian);
  }

  private buildRoadMarkings(): void {
    const paintMat = new PBRMaterial('road-paint-pbr', this.scene);
    paintMat.albedoColor = new Color3(0.68, 0.72, 0.78);
    paintMat.metallic = 0.04;
    paintMat.roughness = 0.55;

    const dashTemplate = MeshBuilder.CreateBox(
      'lane-dash-template',
      { width: 0.16, height: 0.012, depth: 3.4 },
      this.scene,
    );
    dashTemplate.material = paintMat;
    dashTemplate.isVisible = false;

    const isCrossRoadZ = (z: number, x: number): boolean =>
      Math.abs(z - 75) < 22 ||
      Math.abs(z - 380) < 22 ||
      Math.abs(z + 320) < 22 ||
      (x > -25 && Math.abs(z - 225) < 22);

    const isCrossRoadX = (x: number): boolean =>
      Math.abs(x) < 22 || Math.abs(x + 380) < 22 || Math.abs(x - 380) < 22;

    // Corredor central Insurgentes / Reforma
    for (const laneX of [-12, -6, 6, 12]) {
      for (let z = -460; z <= 540; z += 12) {
        if (isCrossRoadZ(z, laneX)) {
          continue;
        }
        const dash = dashTemplate.createInstance(`lane-dash-main-${laneX}-${z}`);
        dash.position.set(laneX, 0.008, z);
      }
    }

    // Periférico Poniente (Satélite / Santa Fe) y Circuito Mexiquense Oriente (Ecatepec / Neza)
    for (const corridorCenterX of [-380, 380]) {
      for (const offset of [-9, 0, 9]) {
        const laneX = corridorCenterX + offset;
        for (let z = -340; z <= 420; z += 14) {
          if (isCrossRoadZ(z, laneX)) {
            continue;
          }
          const dash = dashTemplate.createInstance(`lane-dash-ns-${laneX}-${z}`);
          dash.position.set(laneX, 0.009, z);
        }
      }
    }

    // Ejes transversales E-O (Periférico Norte Edomex, Eje Central Reforma-Neza, Periférico Sur)
    for (const corridorZ of [-320, 75, 380]) {
      for (const offset of [-9, 0, 9]) {
        const laneZ = corridorZ + offset;
        for (let x = -468; x <= 468; x += 14) {
          if (isCrossRoadX(x)) {
            continue;
          }
          const dash = dashTemplate.createInstance(`lane-dash-ew-${laneZ}-${x}`);
          dash.rotation.y = Math.PI / 2;
          dash.position.set(x, 0.01, laneZ);
        }
      }
    }

    // Blvd. Puerto Aéreo · AICM (E-O desde Insurgentes hasta Circuito Oriente)
    for (const offset of [-9, 0, 9]) {
      const laneZ = 225 + offset;
      for (let x = 24; x <= 356; x += 14) {
        const dash = dashTemplate.createInstance(`lane-dash-aicm-${laneZ}-${x}`);
        dash.rotation.y = Math.PI / 2;
        dash.position.set(x, 0.01, laneZ);
      }
    }

    const crosswalkTemplate = MeshBuilder.CreateBox(
      'crosswalk-template',
      { width: 0.72, height: 0.012, depth: 2.8 },
      this.scene,
    );
    crosswalkTemplate.material = paintMat;
    crosswalkTemplate.isVisible = false;

    for (let x = -16; x <= 16; x += 1.7) {
      if (Math.abs(x) < 1.8) {
        continue;
      }
      const bar = crosswalkTemplate.createInstance(`crosswalk-bar-${x}`);
      bar.position.set(x, 0.009, 26);
    }

    // Marcas tangenciales en las curvas abiertas metropolitanas
    for (const curve of METROPOLITAN_OPEN_CURVES) {
      const midR = 0.5 * (curve.innerRadius + curve.outerRadius);
      const span = curve.endAngle - curve.startAngle;
      for (const laneR of [midR - 8, midR, midR + 8]) {
        const dashCount = 16;
        for (let s = 0; s < dashCount; s += 1) {
          const theta = curve.startAngle + (span * (s + 0.5)) / dashCount;
          const dash = dashTemplate.createInstance(`lane-dash-${curve.id}-${laneR}-${s}`);
          dash.position.set(
            curve.cx + Math.cos(theta) * laneR,
            0.01,
            curve.cz + Math.sin(theta) * laneR,
          );
          dash.rotation.y = Math.atan2(-Math.sin(theta), Math.cos(theta));
        }
      }
    }
  }

  private buildReformaTreesAndHedges(): void {
    const trunkMat = new PBRMaterial('reforma-tree-trunk-pbr', this.scene);
    trunkMat.albedoColor = new Color3(0.2, 0.16, 0.12);
    trunkMat.roughness = 0.9;

    const foliageMat = new PBRMaterial('reforma-foliage-pbr', this.scene);
    foliageMat.albedoColor = new Color3(0.08, 0.24, 0.11);
    foliageMat.roughness = 0.72;

    const hedgeMat = new PBRMaterial('reforma-hedge-pbr', this.scene);
    hedgeMat.albedoColor = new Color3(0.07, 0.21, 0.09);
    hedgeMat.roughness = 0.85;

    // Seto verde continuo sobre los camellones centrales como en la fotografía real de Reforma
    const southHedge = MeshBuilder.CreateBox(
      'reforma-median-hedge-south',
      { width: 1.25, height: 0.75, depth: 106 },
      this.scene,
    );
    southHedge.position.set(0, 0.56, -3);
    southHedge.material = hedgeMat;

    const northHedge = MeshBuilder.CreateBox(
      'reforma-median-hedge-north',
      { width: 1.25, height: 0.75, depth: 106 },
      this.scene,
    );
    northHedge.position.set(0, 0.56, 150);
    northHedge.material = hedgeMat;
    this.reflectables.push(southHedge, northHedge);

    // Árboles frondosos iluminados alineados a ambos costados de Paseo de la Reforma
    for (let z = -12; z <= 132; z += 18) {
      if (z >= 52 && z <= 98) {
        continue;
      }
      for (const side of [-1, 1] as const) {
        const tx = side * 21.8;
        const trunk = MeshBuilder.CreateCylinder(
          `reforma-tree-trunk-${side}-${z}`,
          { height: 5.2, diameterTop: 0.26, diameterBottom: 0.42, tessellation: 8 },
          this.scene,
        );
        trunk.position.set(tx, 2.6, z);
        trunk.material = trunkMat;

        const canopyA = MeshBuilder.CreateSphere(
          `reforma-tree-canopy-a-${side}-${z}`,
          { diameter: 4.8, segments: 10 },
          this.scene,
        );
        canopyA.position.set(tx - side * 0.4, 6.2, z);
        canopyA.scaling.set(1.15, 0.88, 1.15);
        canopyA.material = foliageMat;

        const canopyB = MeshBuilder.CreateSphere(
          `reforma-tree-canopy-b-${side}-${z}`,
          { diameter: 3.6, segments: 8 },
          this.scene,
        );
        canopyB.position.set(tx + side * 0.6, 5.5, z + 1.1);
        canopyB.material = foliageMat;

        this.reflectables.push(trunk, canopyA, canopyB);
        this.shadowCasters.push(trunk, canopyA);
      }
    }

    // Carteles viales verdes con pórtico completo (columna en banqueta, brazo y doble cara)
    const signPoleMat = new PBRMaterial('gantry-sign-pole-pbr', this.scene);
    signPoleMat.albedoColor = new Color3(0.14, 0.17, 0.22);
    signPoleMat.metallic = 0.8;
    signPoleMat.roughness = 0.34;

    const signCabinetMat = new PBRMaterial('gantry-sign-cabinet-pbr', this.scene);
    signCabinetMat.albedoColor = new Color3(0.08, 0.1, 0.14);
    signCabinetMat.metallic = 0.6;
    signCabinetMat.roughness = 0.45;

    const overheadSigns: readonly {
      id: string;
      lines: [string, string];
      x: number;
      y: number;
      z: number;
      rotY: number;
      poleLocalX: number;
    }[] = [
      {
        id: 'reforma-highway-sign',
        lines: ['PASEO DE LA REFORMA', 'GLORIETA DEL ÁNGEL · CENTRO'],
        x: 12.0,
        y: 7.4,
        z: 30.25,
        rotY: 0,
        poleLocalX: 8.5,
      },
      {
        id: 'satelite-edomex-sign',
        lines: ['PERIFÉRICO NORTE · EDOMEX', 'NAUCALPAN · TORRES DE SATÉLITE'],
        x: -387,
        y: 7.4,
        z: 305,
        rotY: 0,
        poleLocalX: -11.5,
      },
      {
        id: 'marquesa-curvas-sign',
        lines: ['LA MARQUESA · CURVAS CERRADAS', 'EDOMEX · ZONA DE DERRAPE'],
        x: -372,
        y: 7.4,
        z: 6,
        rotY: Math.PI,
        poleLocalX: -10.5,
      },
      {
        id: 'neza-edomex-sign',
        lines: ['AV. CHIMALHUACÁN · EDOMEX', 'CD. NEZAHUALCÓYOTL · COYOTE'],
        x: 318,
        y: 7.4,
        z: 66,
        rotY: Math.PI / 2,
        poleLocalX: 9.8,
      },
      {
        id: 'ecatepec-edomex-sign',
        lines: ['VÍA MORELOS · EDOMEX', 'ECATEPEC · MEXICABLE'],
        x: 302,
        y: 7.4,
        z: 371,
        rotY: Math.PI / 2,
        poleLocalX: 10.8,
      },
      {
        id: 'zocalo-cdmx-sign',
        lines: ['CENTRO HISTÓRICO · CDMX', 'ZÓCALO · TORRE LATINO'],
        x: 168,
        y: 7.4,
        z: 66,
        rotY: Math.PI / 2,
        poleLocalX: 9.8,
      },
      {
        id: 'coyoacan-cu-sign',
        lines: ['INSURGENTES SUR · CDMX', 'COYOACÁN · CU UNAM'],
        x: -11.5,
        y: 7.4,
        z: -252,
        rotY: Math.PI,
        poleLocalX: 9.0,
      },
      {
        id: 'aicm-puerto-aereo-sign',
        lines: ['BLVD. PUERTO AÉREO · AICM', 'TERMINAL 1 · T2 · METRO L5'],
        x: 158,
        y: 7.4,
        z: 216,
        rotY: Math.PI / 2,
        poleLocalX: 9.8,
      },
      {
        id: 'tren-ligero-ste-sign',
        lines: ['TREN LIGERO STE · XOCHIMILCO', 'TASQUEÑA · CU · COYOACÁN'],
        x: -120,
        y: 7.4,
        z: -329,
        rotY: Math.PI / 2,
        poleLocalX: 9.8,
      },
    ];

    for (const spec of overheadSigns) {
      const signTex = createRoadSignTexture(this.scene, spec.lines);
      const signMat = new PBRMaterial(`${spec.id}-mat`, this.scene);
      signMat.albedoTexture = signTex;
      signMat.emissiveTexture = signTex;
      signMat.emissiveColor = new Color3(0.32, 0.36, 0.32);
      signMat.roughness = 0.4;

      const gantry = new TransformNode(`${spec.id}-gantry`, this.scene);
      gantry.position.set(spec.x, 0, spec.z);
      gantry.rotation.y = spec.rotY;

      const footing = MeshBuilder.CreateBox(
        `${spec.id}-footing`,
        { width: 0.9, height: 0.5, depth: 0.9 },
        this.scene,
      );
      footing.parent = gantry;
      footing.position.set(spec.poleLocalX, 0.25, 0);
      footing.material = signCabinetMat;

      const postHeight = spec.y + 1.1;
      const post = MeshBuilder.CreateCylinder(
        `${spec.id}-post`,
        { height: postHeight, diameter: 0.34, tessellation: 10 },
        this.scene,
      );
      post.parent = gantry;
      post.position.set(spec.poleLocalX, postHeight / 2, 0);
      post.material = signPoleMat;

      const armOuter =
        spec.poleLocalX >= 0 ? Math.max(spec.poleLocalX, 3.8) : Math.min(spec.poleLocalX, -3.8);
      const armInner = spec.poleLocalX >= 0 ? -3.8 : 3.8;
      const armWidth = Math.abs(armOuter - armInner);
      const armCenter = (armOuter + armInner) / 2;

      const arm = MeshBuilder.CreateBox(
        `${spec.id}-arm`,
        { width: armWidth, height: 0.34, depth: 0.34 },
        this.scene,
      );
      arm.parent = gantry;
      arm.position.set(armCenter, spec.y, 0);
      arm.material = signPoleMat;

      const cabinet = MeshBuilder.CreateBox(
        `${spec.id}-cabinet`,
        { width: 7.6, height: 2.5, depth: 0.2 },
        this.scene,
      );
      cabinet.parent = gantry;
      cabinet.position.set(0, spec.y, 0);
      cabinet.material = signCabinetMat;

      const frontFace = MeshBuilder.CreatePlane(
        `${spec.id}-front`,
        { width: 7.4, height: 2.4 },
        this.scene,
      );
      frontFace.parent = gantry;
      frontFace.position.set(0, spec.y, -0.12);
      frontFace.material = signMat;

      const backFace = MeshBuilder.CreatePlane(
        `${spec.id}-back`,
        { width: 7.4, height: 2.4 },
        this.scene,
      );
      backFace.parent = gantry;
      backFace.position.set(0, spec.y, 0.12);
      backFace.rotation.y = Math.PI;
      backFace.material = signMat;

      this.reflectables.push(footing, post, arm, cabinet, frontFace, backFace);
      this.shadowCasters.push(post);
    }
  }

  public updateTrafficSignals(elapsedSec: number): IntersectionSignalState {
    const state = resolveIntersectionSignalState(elapsedSec);
    if (
      this.lastSignalState &&
      this.lastSignalState.ns === state.ns &&
      this.lastSignalState.ew === state.ew
    ) {
      return state;
    }

    this.applyAxisSignalColor(this.nsSignalMats, state.ns);
    this.applyAxisSignalColor(this.ewSignalMats, state.ew);
    this.lastSignalState = state;
    return state;
  }

  private createSignalMaterials(axisPrefix: string): AxisSignalMaterials {
    const red = new PBRMaterial(`traffic-${axisPrefix}-red-pbr`, this.scene);
    red.metallic = 0.05;
    red.roughness = 0.25;

    const yellow = new PBRMaterial(`traffic-${axisPrefix}-yellow-pbr`, this.scene);
    yellow.metallic = 0.05;
    yellow.roughness = 0.25;

    const green = new PBRMaterial(`traffic-${axisPrefix}-green-pbr`, this.scene);
    green.metallic = 0.05;
    green.roughness = 0.25;

    return { red, yellow, green };
  }

  private applyAxisSignalColor(mats: AxisSignalMaterials, active: TrafficLightColor): void {
    if (active === 'RED') {
      mats.red.albedoColor = new Color3(1.0, 0.1, 0.1);
      mats.red.emissiveColor = new Color3(2.8, 0.12, 0.12);
    } else {
      mats.red.albedoColor = new Color3(0.12, 0.05, 0.05);
      mats.red.emissiveColor = new Color3(0, 0, 0);
    }

    if (active === 'YELLOW') {
      mats.yellow.albedoColor = new Color3(1.0, 0.72, 0.08);
      mats.yellow.emissiveColor = new Color3(2.6, 1.5, 0.08);
    } else {
      mats.yellow.albedoColor = new Color3(0.12, 0.1, 0.04);
      mats.yellow.emissiveColor = new Color3(0, 0, 0);
    }

    if (active === 'GREEN') {
      mats.green.albedoColor = new Color3(0.1, 1.0, 0.45);
      mats.green.emissiveColor = new Color3(0.18, 2.5, 0.75);
    } else {
      mats.green.albedoColor = new Color3(0.04, 0.12, 0.06);
      mats.green.emissiveColor = new Color3(0, 0, 0);
    }
  }

  private buildTrafficSignals(): void {
    const poleMat = new PBRMaterial('signal-pole-pbr', this.scene);
    poleMat.albedoColor = new Color3(0.12, 0.14, 0.18);
    poleMat.metallic = 0.78;
    poleMat.roughness = 0.34;

    const gantries: readonly {
      id: string;
      x: number;
      z: number;
      rotY: number;
      axis: 'NS' | 'EW';
    }[] = [
      // Cruce Reforma × Eje Central / Juárez (0, 75) en los 4 sentidos
      { id: 'reforma-ns-nb', x: 11.5, z: 44, rotY: 0, axis: 'NS' },
      { id: 'reforma-ns-sb', x: -11.5, z: 106, rotY: Math.PI, axis: 'NS' },
      { id: 'reforma-ew-eb', x: -28, z: 65, rotY: Math.PI / 2, axis: 'EW' },
      { id: 'reforma-ew-wb', x: 28, z: 85, rotY: -Math.PI / 2, axis: 'EW' },
      // Santa Fe (-380, 75)
      { id: 'santafe-ns-nb', x: -370.5, z: 44, rotY: 0, axis: 'NS' },
      { id: 'santafe-ew-eb', x: -408, z: 65, rotY: Math.PI / 2, axis: 'EW' },
      // Cd. Nezahualcóyotl / El Coyote (380, 75)
      { id: 'neza-ns-sb', x: 370.5, z: 106, rotY: Math.PI, axis: 'NS' },
      { id: 'neza-ew-eb', x: 352, z: 65, rotY: Math.PI / 2, axis: 'EW' },
      // Coyoacán / Ciudad Universitaria UNAM (0, -320)
      { id: 'cu-ns-sb', x: -11.5, z: -292, rotY: Math.PI, axis: 'NS' },
      { id: 'cu-ew-eb', x: -28, z: -330, rotY: Math.PI / 2, axis: 'EW' },
      // Insurgentes Norte / Periférico Norte Indios Verdes (0, 380)
      { id: 'indiosverdes-ns-nb', x: 11.5, z: 352, rotY: 0, axis: 'NS' },
      { id: 'indiosverdes-ew-eb', x: -28, z: 370, rotY: Math.PI / 2, axis: 'EW' },
    ];

    for (const spec of gantries) {
      const mats = spec.axis === 'NS' ? this.nsSignalMats : this.ewSignalMats;
      const gantryRoot = new TransformNode(`signal-gantry-${spec.id}`, this.scene);
      gantryRoot.position.set(spec.x, 0, spec.z);
      gantryRoot.rotation.y = spec.rotY;

      const post = MeshBuilder.CreateCylinder(
        `signal-post-${spec.id}`,
        { height: 7.4, diameter: 0.28, tessellation: 10 },
        this.scene,
      );
      post.parent = gantryRoot;
      post.position.set(8.5, 3.7, 0);
      post.material = poleMat;

      const arm = MeshBuilder.CreateBox(
        `signal-arm-${spec.id}`,
        { width: 15.0, height: 0.22, depth: 0.22 },
        this.scene,
      );
      arm.parent = gantryRoot;
      arm.position.set(1.0, 7.35, 0);
      arm.material = poleMat;

      this.reflectables.push(post, arm);
      this.shadowCasters.push(post);

      for (const offsetX of [-3.2, 2.4]) {
        const housing = MeshBuilder.CreateBox(
          `signal-box-${spec.id}-${offsetX}`,
          { width: 0.56, height: 1.55, depth: 0.44 },
          this.scene,
        );
        housing.parent = gantryRoot;
        housing.position.set(offsetX, 6.72, 0);
        housing.material = poleMat;

        const lenses: readonly { key: string; y: number; mat: PBRMaterial }[] = [
          { key: 'red', y: 7.12, mat: mats.red },
          { key: 'yellow', y: 6.72, mat: mats.yellow },
          { key: 'green', y: 6.32, mat: mats.green },
        ];

        for (const item of lenses) {
          const lens = MeshBuilder.CreateSphere(
            `signal-lens-${spec.id}-${offsetX}-${item.key}`,
            { diameter: 0.28, segments: 8 },
            this.scene,
          );
          lens.parent = gantryRoot;
          lens.position.set(offsetX, item.y, -0.22);
          lens.material = item.mat;

          this.reflectables.push(lens);
          this.glowMeshes.push(lens);
        }

        this.reflectables.push(housing);
      }
    }

    this.updateTrafficSignals(0);
  }

  private buildStreetLights(): void {
    const { roadWidth, streetLightSpacing } = TEST_AVENUE_CONFIG;

    const poleMat = new PBRMaterial('lamp-pole-pbr', this.scene);
    poleMat.albedoColor = new Color3(0.15, 0.17, 0.22);
    poleMat.metallic = 0.75;
    poleMat.roughness = 0.35;

    const bulbMat = new PBRMaterial('lamp-bulb-pbr', this.scene);
    bulbMat.albedoColor = new Color3(1.0, 0.86, 0.6);
    bulbMat.emissiveColor = toColor3(NOCTURNAL_COLORS.sodiumLamp).scale(1.9);

    const poleTemplate = MeshBuilder.CreateCylinder(
      'street-lamp-pole-template',
      { height: 8.6, diameterTop: 0.16, diameterBottom: 0.26, tessellation: 10 },
      this.scene,
    );
    poleTemplate.material = poleMat;
    poleTemplate.isVisible = false;

    const armTemplate = MeshBuilder.CreateBox(
      'street-lamp-arm-template',
      { width: 2.8, height: 0.12, depth: 0.12 },
      this.scene,
    );
    armTemplate.material = poleMat;
    armTemplate.isVisible = false;

    const bulbTemplate = MeshBuilder.CreateBox(
      'street-lamp-bulb-template',
      { width: 0.85, height: 0.12, depth: 0.34 },
      this.scene,
    );
    bulbTemplate.material = bulbMat;
    bulbTemplate.isVisible = false;

    let lightIndex = 0;
    for (let z = -20; z <= 148; z += streetLightSpacing) {
      for (const side of [-1, 1] as const) {
        const curbX = side * (roadWidth / 2 + 0.6);
        const pole = poleTemplate.createInstance(`lamp-pole-${lightIndex}`);
        pole.position.set(curbX, 4.3, z);

        const arm = armTemplate.createInstance(`lamp-arm-${lightIndex}`);
        arm.position.set(curbX - side * 1.3, 8.5, z);

        const bulb = bulbTemplate.clone(`lamp-bulb-${lightIndex}`);
        bulb.isVisible = true;
        bulb.position.set(curbX - side * 2.4, 8.38, z);

        this.reflectables.push(pole, arm, bulb);
        this.glowMeshes.push(bulb);
        this.shadowCasters.push(pole);

        const pointLight = new PointLight(
          `sodium-light-${lightIndex}`,
          new Vector3(curbX - side * 2.4, 8.0, z),
          this.scene,
        );
        pointLight.diffuse = toColor3(NOCTURNAL_COLORS.sodiumLamp);
        pointLight.specular = new Color3(1.0, 0.8, 0.48);
        pointLight.intensity = 22;
        pointLight.range = 32;
        this.streetLights.push(pointLight);
        lightIndex += 1;
      }
    }
  }
}
