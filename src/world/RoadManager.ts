import {
  Color3,
  Mesh,
  MeshBuilder,
  MirrorTexture,
  PBRMaterial,
  Plane,
  PointLight,
  Vector3,
  type AbstractMesh,
  type Scene,
} from '@babylonjs/core';
import { NOCTURNAL_COLORS, TEST_AVENUE_CONFIG, type RgbTuple } from '../config/GameConfig';
import { createWetAsphaltTextures } from '../engine/ProceduralTextures';

function toColor3(rgb: RgbTuple): Color3 {
  return new Color3(rgb.r, rgb.g, rgb.b);
}

/**
 * Construye Paseo de la Reforma con asfalto mojado PBR, reflejos planares,
 * glorieta transitable alrededor del Ángel, palmeras, semáforos y alumbrado público.
 */
export class RoadManager {
  private readonly scene: Scene;
  private readonly asphaltMat: PBRMaterial;
  private readonly streetLights: PointLight[] = [];
  private readonly reflectables: AbstractMesh[] = [];
  private readonly shadowCasters: AbstractMesh[] = [];
  private readonly glowMeshes: AbstractMesh[] = [];
  private mirrorTexture: MirrorTexture | null = null;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.asphaltMat = this.buildWetRoad();
    this.buildRoundaboutIsland();
    this.buildSidewalksAndMedians();
    this.buildRoadMarkings();
    this.buildReformaPalms();
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
    sceneReflectables: AbstractMesh[],
  ): void {
    if (!enabled || mapSize <= 0) {
      if (this.mirrorTexture) {
        this.asphaltMat.reflectionTexture = null;
        this.mirrorTexture.dispose();
        this.mirrorTexture = null;
      }
      this.asphaltMat.clearCoat.intensity = 0.65;
      this.asphaltMat.metallic = 0.22;
      return;
    }

    if (this.mirrorTexture && this.mirrorTexture.getSize().width !== mapSize) {
      this.asphaltMat.reflectionTexture = null;
      this.mirrorTexture.dispose();
      this.mirrorTexture = null;
    }

    if (!this.mirrorTexture) {
      const mirror = new MirrorTexture('wet-road-mirror', mapSize, this.scene, true);
      mirror.mirrorPlane = new Plane(0, -1, 0, 0);
      mirror.level = 0.58;
      mirror.adaptiveBlurKernel = mapSize >= 1024 ? 18 : 12;
      this.mirrorTexture = mirror;
    }

    this.mirrorTexture.renderList = sceneReflectables;
    this.asphaltMat.reflectionTexture = this.mirrorTexture;
    this.asphaltMat.clearCoat.intensity = 0.88;
    this.asphaltMat.metallic = 0.35;
  }

  public dispose(): void {
    if (this.mirrorTexture) {
      this.asphaltMat.reflectionTexture = null;
      this.mirrorTexture.dispose();
      this.mirrorTexture = null;
    }
  }

  private buildWetRoad(): PBRMaterial {
    const { roadLength, roadWidth } = TEST_AVENUE_CONFIG;
    const textures = createWetAsphaltTextures(this.scene, 4.2, 34);

    const asphaltMat = new PBRMaterial('wet-asphalt-pbr', this.scene);
    asphaltMat.albedoTexture = textures.albedoTexture;
    asphaltMat.albedoColor = new Color3(0.88, 0.9, 0.96);
    asphaltMat.metallicTexture = textures.metallicRoughnessTexture;
    asphaltMat.useRoughnessFromMetallicTextureGreen = true;
    asphaltMat.useMetallnessFromMetallicTextureBlue = true;
    asphaltMat.bumpTexture = textures.bumpTexture;
    asphaltMat.bumpTexture.level = 0.6;
    asphaltMat.metallic = 0.35;
    asphaltMat.roughness = 0.85;
    asphaltMat.reflectivityColor = new Color3(0.85, 0.88, 0.94);
    asphaltMat.clearCoat.isEnabled = true;
    asphaltMat.clearCoat.intensity = 0.86;
    asphaltMat.clearCoat.roughness = 0.1;

    const road = MeshBuilder.CreateGround(
      'reforma-wet-asphalt',
      { width: roadWidth, height: roadLength, subdivisions: 8 },
      this.scene,
    );
    road.position.set(0, 0, 60);
    road.material = asphaltMat;
    road.receiveShadows = true;

    return asphaltMat;
  }

  private buildRoundaboutIsland(): void {
    const { angelPosition, roundaboutIslandRadius } = TEST_AVENUE_CONFIG;

    const grassMat = new PBRMaterial('roundabout-grass-pbr', this.scene);
    grassMat.albedoColor = new Color3(0.06, 0.14, 0.08);
    grassMat.metallic = 0.02;
    grassMat.roughness = 0.88;

    const curbMat = new PBRMaterial('roundabout-curb-pbr', this.scene);
    curbMat.albedoColor = new Color3(0.32, 0.32, 0.34);
    curbMat.metallic = 0.05;
    curbMat.roughness = 0.65;

    const island = MeshBuilder.CreateCylinder(
      'angel-roundabout-island',
      { height: 0.32, diameter: roundaboutIslandRadius * 2, tessellation: 40 },
      this.scene,
    );
    island.position.set(angelPosition.x, 0.16, angelPosition.z);
    island.material = grassMat;
    island.receiveShadows = true;

    const curbRing = MeshBuilder.CreateTorus(
      'angel-roundabout-curb',
      { diameter: roundaboutIslandRadius * 2, thickness: 0.55, tessellation: 48 },
      this.scene,
    );
    curbRing.position.set(angelPosition.x, 0.24, angelPosition.z);
    curbRing.material = curbMat;
    this.reflectables.push(island, curbRing);
  }

  private buildSidewalksAndMedians(): void {
    const { roadLength, roadWidth, sidewalkWidth, angelPosition } = TEST_AVENUE_CONFIG;

    const sidewalkMat = new PBRMaterial('wet-sidewalk-pbr', this.scene);
    sidewalkMat.albedoColor = new Color3(0.12, 0.13, 0.16);
    sidewalkMat.metallic = 0.1;
    sidewalkMat.roughness = 0.42;
    sidewalkMat.clearCoat.isEnabled = true;
    sidewalkMat.clearCoat.intensity = 0.35;

    const yellowCurbMat = new PBRMaterial('curb-yellow-pbr', this.scene);
    yellowCurbMat.albedoColor = new Color3(0.75, 0.52, 0.08);
    yellowCurbMat.metallic = 0.05;
    yellowCurbMat.roughness = 0.5;

    const offset = roadWidth / 2 + sidewalkWidth / 2;
    for (const side of [-1, 1] as const) {
      const sidewalk = MeshBuilder.CreateBox(
        `sidewalk-${side < 0 ? 'left' : 'right'}`,
        { width: sidewalkWidth, height: 0.24, depth: roadLength },
        this.scene,
      );
      sidewalk.position.set(side * offset, 0.12, 60);
      sidewalk.material = sidewalkMat;
      sidewalk.receiveShadows = true;

      const curbStripe = MeshBuilder.CreateBox(
        `curb-paint-${side < 0 ? 'left' : 'right'}`,
        { width: 0.22, height: 0.25, depth: roadLength },
        this.scene,
      );
      curbStripe.position.set(side * (roadWidth / 2 + 0.11), 0.125, 60);
      curbStripe.material = yellowCurbMat;
      this.reflectables.push(sidewalk, curbStripe);
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

    const { angelPosition } = TEST_AVENUE_CONFIG;
    for (const laneX of [-12, -6, 6, 12]) {
      for (let z = -60; z < 190; z += 9) {
        if (Math.abs(z - angelPosition.z) < 19 && Math.abs(laneX) < 15) {
          continue;
        }
        const dash = dashTemplate.createInstance(`lane-dash-${laneX}-${z}`);
        dash.position.set(laneX, 0.008, z);
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
  }

  private buildReformaPalms(): void {
    const trunkMat = new PBRMaterial('palm-trunk-pbr', this.scene);
    trunkMat.albedoColor = new Color3(0.24, 0.19, 0.14);
    trunkMat.roughness = 0.9;

    const frondMat = new PBRMaterial('palm-frond-pbr', this.scene);
    frondMat.albedoColor = new Color3(0.08, 0.24, 0.1);
    frondMat.roughness = 0.68;

    const palmCoords: ReadonlyArray<readonly [number, number]> = [
      [-19.5, 4],
      [19.5, 4],
      [-19.5, 36],
      [19.5, 36],
      [-19.5, 68],
      [19.5, 68],
      [-19.5, 100],
      [19.5, 100],
      [-19.5, 132],
      [19.5, 132],
      [0, -24],
      [0, 12],
      [0, 38],
      [0, 114],
    ];

    palmCoords.forEach(([px, pz], idx) => {
      const trunk = MeshBuilder.CreateTube(
        `reforma-palm-trunk-${idx}`,
        {
          path: [
            new Vector3(px, 0.2, pz),
            new Vector3(px + (idx % 2 === 0 ? 0.18 : -0.18), 3.4, pz),
            new Vector3(px + (idx % 2 === 0 ? 0.3 : -0.3), 6.8, pz),
          ],
          radius: 0.2,
          tessellation: 8,
        },
        this.scene,
      );
      trunk.material = trunkMat;

      const crownX = px + (idx % 2 === 0 ? 0.3 : -0.3);
      for (let f = 0; f < 5; f += 1) {
        const angle = (f / 5) * Math.PI * 2;
        const frond = MeshBuilder.CreateRibbon(
          `palm-frond-${idx}-${f}`,
          {
            pathArray: [
              [
                new Vector3(crownX, 6.75, pz),
                new Vector3(crownX + Math.cos(angle) * 1.1, 7.15, pz + Math.sin(angle) * 1.1),
                new Vector3(crownX + Math.cos(angle) * 2.1, 6.35, pz + Math.sin(angle) * 2.1),
              ],
              [
                new Vector3(crownX, 6.75, pz),
                new Vector3(
                  crownX + Math.cos(angle + 0.22) * 1.1,
                  7.05,
                  pz + Math.sin(angle + 0.22) * 1.1,
                ),
                new Vector3(
                  crownX + Math.cos(angle + 0.22) * 2.1,
                  6.25,
                  pz + Math.sin(angle + 0.22) * 2.1,
                ),
              ],
            ],
            sideOrientation: Mesh.DOUBLESIDE,
          },
          this.scene,
        );
        frond.material = frondMat;
        this.reflectables.push(frond);
      }

      this.reflectables.push(trunk);
      this.shadowCasters.push(trunk);
    });
  }

  private buildTrafficSignals(): void {
    const poleMat = new PBRMaterial('signal-pole-pbr', this.scene);
    poleMat.albedoColor = new Color3(0.12, 0.14, 0.18);
    poleMat.metallic = 0.78;
    poleMat.roughness = 0.34;

    const redSignalMat = new PBRMaterial('traffic-red-pbr', this.scene);
    redSignalMat.albedoColor = new Color3(1, 0.1, 0.1);
    redSignalMat.emissiveColor = new Color3(2.4, 0.14, 0.14);

    const greenSignalMat = new PBRMaterial('traffic-green-pbr', this.scene);
    greenSignalMat.albedoColor = new Color3(0.1, 1, 0.45);
    greenSignalMat.emissiveColor = new Color3(0.18, 2.2, 0.75);

    const signalPositions = [30, 122];
    signalPositions.forEach((z, idx) => {
      const post = MeshBuilder.CreateCylinder(
        `signal-post-${idx}`,
        { height: 7.2, diameter: 0.26, tessellation: 10 },
        this.scene,
      );
      post.position.set(18.2, 3.6, z);
      post.material = poleMat;

      const arm = MeshBuilder.CreateBox(
        `signal-arm-${idx}`,
        { width: 13.5, height: 0.2, depth: 0.2 },
        this.scene,
      );
      arm.position.set(11.4, 7.0, z);
      arm.material = poleMat;

      this.reflectables.push(post, arm);
      this.shadowCasters.push(post);

      for (const offset of [-3.2, 2.6]) {
        const housing = MeshBuilder.CreateBox(
          `signal-box-${idx}-${offset}`,
          { width: 0.55, height: 1.3, depth: 0.42 },
          this.scene,
        );
        housing.position.set(11.0 + offset, 6.6, z);
        housing.material = poleMat;

        const lens = MeshBuilder.CreateSphere(
          `signal-lens-${idx}-${offset}`,
          { diameter: 0.26, segments: 8 },
          this.scene,
        );
        lens.position.set(11.0 + offset, 6.92, z - 0.22);
        lens.material = idx === 0 ? greenSignalMat : redSignalMat;

        this.reflectables.push(housing, lens);
        this.glowMeshes.push(lens);
      }
    });
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

        const bulb = bulbTemplate.createInstance(`lamp-bulb-${lightIndex}`);
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
