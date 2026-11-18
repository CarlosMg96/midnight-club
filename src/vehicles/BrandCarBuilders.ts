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
  type DynamicTexture,
  type Scene,
} from '@babylonjs/core';
import { createHubcapTexture, createTsuruPlateTexture } from '../engine/ProceduralTextures';
import type { TsuruRig } from './TsuruMeshBuilder';
import {
  PAINT_PRESETS,
  UNDERGLOW_COLORS,
  type TuningConfig,
  type WheelStyleId,
} from './VehicleConfig';

interface LoftStation {
  readonly z: number;
  readonly halfWidth: number;
  readonly sillY: number;
  readonly beltY: number;
  readonly deckY: number;
  readonly roofY: number;
  readonly roofHalfW: number;
}

interface BrandCarGeometrySpec {
  readonly idPrefix: string;
  readonly plateText: string;
  readonly stations: readonly LoftStation[];
  readonly cabinRange: readonly [number, number];
  readonly wheelTrackX: number;
  readonly frontAxleZ: number;
  readonly rearAxleZ: number;
  readonly bodyWidth: number;
}

function recomputeSmoothNormals(mesh: Mesh): void {
  const positions = mesh.getVerticesData('position');
  const indices = mesh.getIndices();
  if (!positions || !indices) {
    return;
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  mesh.setVerticesData('normal', normals);
}

/**
 * Constructor base compartido para los modelos suavizados de Nissan Skyline GT-R R34,
 * Audi R8 V10 Plus y Mercedes-AMG GT R con parrillas, emblemas y calaveras distintivos.
 */
function buildSculptedBrandCar(
  scene: Scene,
  initialTuning: TuningConfig,
  spec: BrandCarGeometrySpec,
  decorateBrandDetails: (ctx: {
    scene: Scene;
    bodyPivot: TransformNode;
    paintMat: PBRMaterial;
    trimBlackMat: PBRMaterial;
    chromeMat: PBRMaterial;
    carbonMat: PBRMaterial;
    headlightMat: PBRMaterial;
    taillightMat: PBRMaterial;
    reflectables: AbstractMesh[];
    shadowCasters: AbstractMesh[];
    glowMeshes: AbstractMesh[];
  }) => void,
): TsuruRig {
  const root = new TransformNode(`${spec.idPrefix}-root`, scene);
  const bodyPivot = new TransformNode(`${spec.idPrefix}-body-pivot`, scene);
  bodyPivot.parent = root;

  const paintMat = new PBRMaterial(`${spec.idPrefix}-paint-pbr`, scene);
  paintMat.clearCoat.isEnabled = true;
  paintMat.clearCoat.intensity = 1.0;
  paintMat.clearCoat.roughness = 0.05;

  const roofPaintMat = new PBRMaterial(`${spec.idPrefix}-roof-pbr`, scene);
  roofPaintMat.clearCoat.isEnabled = true;
  roofPaintMat.clearCoat.intensity = 1.0;

  const trimBlackMat = new PBRMaterial(`${spec.idPrefix}-trim-pbr`, scene);
  trimBlackMat.albedoColor = new Color3(0.05, 0.055, 0.065);
  trimBlackMat.metallic = 0.18;
  trimBlackMat.roughness = 0.45;

  const chromeMat = new PBRMaterial(`${spec.idPrefix}-chrome-pbr`, scene);
  chromeMat.albedoColor = new Color3(0.9, 0.93, 0.98);
  chromeMat.metallic = 0.98;
  chromeMat.roughness = 0.1;

  const carbonMat = new PBRMaterial(`${spec.idPrefix}-carbon-pbr`, scene);
  carbonMat.albedoColor = new Color3(0.045, 0.05, 0.06);
  carbonMat.metallic = 0.35;
  carbonMat.roughness = 0.28;
  carbonMat.clearCoat.isEnabled = true;

  const glassMat = new PBRMaterial(`${spec.idPrefix}-glass-pbr`, scene);
  glassMat.albedoColor = new Color3(0.025, 0.035, 0.06);
  glassMat.metallic = 0.35;
  glassMat.roughness = 0.04;
  glassMat.clearCoat.isEnabled = true;
  glassMat.clearCoat.intensity = 1.0;

  const headlightMat = new PBRMaterial(`${spec.idPrefix}-headlight-pbr`, scene);
  headlightMat.albedoColor = new Color3(0.95, 0.98, 1.0);
  headlightMat.emissiveColor = new Color3(2.5, 2.7, 3.0);

  const taillightMat = new PBRMaterial(`${spec.idPrefix}-taillight-pbr`, scene);
  taillightMat.albedoColor = new Color3(1.0, 0.08, 0.1);
  taillightMat.emissiveColor = new Color3(1.5, 0.1, 0.12);

  const underglowMat = new PBRMaterial(`${spec.idPrefix}-underglow-pbr`, scene);

  const reflectables: AbstractMesh[] = [];
  const shadowCasters: AbstractMesh[] = [];
  const glowMeshes: AbstractMesh[] = [];

  // Carrocería principal suavizada mediante Ribbon longitudinal
  const lowerBodyPaths: Vector3[][] = spec.stations.map((s) => [
    new Vector3(-s.halfWidth * 0.82, s.sillY, s.z),
    new Vector3(-s.halfWidth, s.sillY + 0.15, s.z),
    new Vector3(-s.halfWidth * 0.98, s.beltY, s.z),
    new Vector3(-s.roofHalfW * 1.05, s.deckY, s.z),
    new Vector3(0, s.deckY + 0.025, s.z),
    new Vector3(s.roofHalfW * 1.05, s.deckY, s.z),
    new Vector3(s.halfWidth * 0.98, s.beltY, s.z),
    new Vector3(s.halfWidth, s.sillY + 0.15, s.z),
    new Vector3(s.halfWidth * 0.82, s.sillY, s.z),
  ]);

  const lowerBody = MeshBuilder.CreateRibbon(
    `${spec.idPrefix}-body-shell`,
    { pathArray: lowerBodyPaths, closePath: true, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  recomputeSmoothNormals(lowerBody);
  lowerBody.parent = bodyPivot;
  lowerBody.material = paintMat;

  const [cabinStart, cabinEnd] = spec.cabinRange;
  const cabinStations = spec.stations.slice(cabinStart, cabinEnd);
  const cabinPaths: Vector3[][] = cabinStations.map((s, idx) => {
    const isEnd = idx === 0 || idx === cabinStations.length - 1;
    const topY = isEnd ? s.deckY + 0.02 : s.roofY;
    const topW = isEnd ? s.roofHalfW * 1.02 : s.roofHalfW * 0.9;
    return [
      new Vector3(-s.roofHalfW * 1.04, s.deckY - 0.01, s.z),
      new Vector3(-topW, topY, s.z),
      new Vector3(0, topY + 0.025, s.z),
      new Vector3(topW, topY, s.z),
      new Vector3(s.roofHalfW * 1.04, s.deckY - 0.01, s.z),
    ];
  });

  const cabinGlass = MeshBuilder.CreateRibbon(
    `${spec.idPrefix}-cabin-glass`,
    { pathArray: cabinPaths, closePath: false, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  recomputeSmoothNormals(cabinGlass);
  cabinGlass.parent = bodyPivot;
  cabinGlass.material = glassMat;

  // Placa trasera de identificación
  const plateMat = new PBRMaterial(`${spec.idPrefix}-plate-pbr`, scene);
  plateMat.albedoTexture = createTsuruPlateTexture(scene, spec.plateText);
  plateMat.roughness = 0.45;
  const rearPlate = MeshBuilder.CreateBox(
    `${spec.idPrefix}-rear-plate`,
    { width: 0.38, height: 0.12, depth: 0.02 },
    scene,
  );
  rearPlate.parent = bodyPivot;
  rearPlate.position.set(0, 0.46, spec.stations[0]!.z - 0.02);
  rearPlate.material = plateMat;

  decorateBrandDetails({
    scene,
    bodyPivot,
    paintMat,
    trimBlackMat,
    chromeMat,
    carbonMat,
    headlightMat,
    taillightMat,
    reflectables,
    shadowCasters,
    glowMeshes,
  });

  // Cuatro ruedas torneadas deportivas + calipers rojos
  const tireMat = new PBRMaterial(`${spec.idPrefix}-tire-pbr`, scene);
  tireMat.albedoColor = new Color3(0.035, 0.04, 0.05);
  tireMat.roughness = 0.78;

  const rimMat = new PBRMaterial(`${spec.idPrefix}-rim-pbr`, scene);

  const hubcapTextures: Record<WheelStyleId, DynamicTexture> = {
    TAPONES_STOCK: createHubcapTexture(scene, '#cfd6e0'),
    BBS_GOLD: createHubcapTexture(scene, '#d8aa38'),
    CHROME_SPORT: createHubcapTexture(scene, '#f0f5fc'),
  };

  const tireProfile = [
    new Vector3(0.22, -0.13, 0),
    new Vector3(0.32, -0.13, 0),
    new Vector3(0.35, -0.07, 0),
    new Vector3(0.35, 0.07, 0),
    new Vector3(0.32, 0.13, 0),
    new Vector3(0.22, 0.13, 0),
    new Vector3(0.22, -0.13, 0),
  ];

  const wheelCoords: ReadonlyArray<{ x: number; z: number }> = [
    { x: -spec.wheelTrackX, z: spec.frontAxleZ },
    { x: spec.wheelTrackX, z: spec.frontAxleZ },
    { x: -spec.wheelTrackX, z: spec.rearAxleZ },
    { x: spec.wheelTrackX, z: spec.rearAxleZ },
  ];

  const wheelPivots: TransformNode[] = [];
  const wheelSpinners: TransformNode[] = [];
  const camberNodes: TransformNode[] = [];

  wheelCoords.forEach((wc, idx) => {
    const steerPivot = new TransformNode(`${spec.idPrefix}-wheel-steer-${idx}`, scene);
    steerPivot.parent = root;
    steerPivot.position.set(wc.x, 0.35, wc.z);

    const camberNode = new TransformNode(`${spec.idPrefix}-wheel-camber-${idx}`, scene);
    camberNode.parent = steerPivot;

    const spinner = new TransformNode(`${spec.idPrefix}-wheel-spin-${idx}`, scene);
    spinner.parent = camberNode;

    const tire = MeshBuilder.CreateLathe(
      `${spec.idPrefix}-tire-${idx}`,
      { shape: tireProfile, tessellation: 24 },
      scene,
    );
    tire.parent = spinner;
    tire.rotation.z = Math.PI / 2;
    tire.material = tireMat;

    const rim = MeshBuilder.CreateCylinder(
      `${spec.idPrefix}-rim-${idx}`,
      { diameter: 0.46, height: 0.23, tessellation: 20 },
      scene,
    );
    rim.parent = spinner;
    rim.rotation.z = Math.PI / 2;
    rim.material = rimMat;

    reflectables.push(tire, rim);
    shadowCasters.push(tire);
    wheelPivots.push(steerPivot);
    camberNodes.push(camberNode);
    wheelSpinners.push(spinner);
  });

  // Kit aerodinámico de tuning + underglow
  const streetMeshes: AbstractMesh[] = [];
  const gtMeshes: AbstractMesh[] = [];
  const underglowRails: AbstractMesh[] = [];

  const frontZ = spec.stations[spec.stations.length - 1]!.z;
  const rearZ = spec.stations[0]!.z;

  const frontLip = MeshBuilder.CreateBox(
    `${spec.idPrefix}-tune-lip`,
    { width: spec.bodyWidth, height: 0.06, depth: 0.32 },
    scene,
  );
  frontLip.parent = bodyPivot;
  frontLip.position.set(0, 0.18, frontZ - 0.02);
  frontLip.material = carbonMat;
  streetMeshes.push(frontLip);

  for (const side of [-1, 1] as const) {
    const skirt = MeshBuilder.CreateBox(
      `${spec.idPrefix}-tune-skirt-${side}`,
      { width: 0.09, height: 0.08, depth: 2.5 },
      scene,
    );
    skirt.parent = bodyPivot;
    skirt.position.set(side * (spec.bodyWidth / 2), 0.18, 0);
    skirt.material = carbonMat;
    streetMeshes.push(skirt);

    const rail = MeshBuilder.CreateBox(
      `${spec.idPrefix}-underglow-${side}`,
      { width: 0.06, height: 0.035, depth: 2.45 },
      scene,
    );
    rail.parent = bodyPivot;
    rail.position.set(side * (spec.bodyWidth / 2 - 0.06), 0.13, 0);
    rail.material = underglowMat;
    underglowRails.push(rail);
    glowMeshes.push(rail);
  }

  const gtWing = MeshBuilder.CreateBox(
    `${spec.idPrefix}-tune-gt-wing`,
    { width: spec.bodyWidth + 0.06, height: 0.06, depth: 0.36 },
    scene,
  );
  gtWing.parent = bodyPivot;
  gtWing.position.set(0, 1.24, rearZ + 0.18);
  gtWing.rotation.x = -0.14;
  gtWing.material = carbonMat;
  gtMeshes.push(gtWing);

  for (const side of [-0.52, 0.52] as const) {
    const pylon = MeshBuilder.CreateBox(
      `${spec.idPrefix}-tune-pylon-${side}`,
      { width: 0.05, height: 0.34, depth: 0.18 },
      scene,
    );
    pylon.parent = bodyPivot;
    pylon.position.set(side, 1.06, rearZ + 0.22);
    pylon.material = carbonMat;
    gtMeshes.push(pylon);
  }

  const underglowLight = new PointLight(
    `${spec.idPrefix}-underglow-light`,
    new Vector3(0, 0.22, 0),
    scene,
  );
  underglowLight.parent = bodyPivot;
  underglowLight.intensity = 0;
  underglowLight.range = 9;

  reflectables.push(lowerBody, cabinGlass, rearPlate, ...streetMeshes, ...gtMeshes);
  shadowCasters.push(lowerBody, gtWing);

  const applyTuning = (tuning: TuningConfig): void => {
    const paint = PAINT_PRESETS[tuning.paintPreset];
    paintMat.albedoColor = Color3.FromHexString(paint.primaryHex);
    paintMat.metallic = paint.metallic;
    paintMat.roughness = paint.roughness;

    roofPaintMat.albedoColor = Color3.FromHexString(paint.roofHex);
    roofPaintMat.metallic = paint.metallic;
    roofPaintMat.roughness = paint.roughness;

    const wheelTex = hubcapTextures[tuning.wheelStyle];
    rimMat.albedoTexture = wheelTex;
    rimMat.metallic = tuning.wheelStyle === 'TAPONES_STOCK' ? 0.65 : 0.94;
    rimMat.roughness = tuning.wheelStyle === 'TAPONES_STOCK' ? 0.28 : 0.14;

    const showStreet = tuning.bodyKit === 'STREET_TUNER' || tuning.bodyKit === 'MIDNIGHT_GT';
    const showGt = tuning.bodyKit === 'MIDNIGHT_GT';
    for (const m of streetMeshes) {
      m.setEnabled(showStreet);
    }
    for (const m of gtMeshes) {
      m.setEnabled(showGt);
    }

    const underglow = UNDERGLOW_COLORS[tuning.underglow];
    const hasGlow = underglow.hex !== null;
    for (const r of underglowRails) {
      r.setEnabled(hasGlow);
    }
    if (underglow.hex) {
      const c = Color3.FromHexString(underglow.hex);
      underglowMat.albedoColor = c;
      underglowMat.emissiveColor = c.scale(2.4);
      underglowLight.diffuse = c;
      underglowLight.intensity = 15;
    } else {
      underglowMat.emissiveColor = Color3.Black();
      underglowLight.intensity = 0;
    }

    bodyPivot.position.y =
      tuning.stance === 'DRIFT_SPEC' ? -0.06 : tuning.stance === 'LOWERED' ? -0.045 : 0;

    const camber = tuning.stance === 'DRIFT_SPEC' ? 0.065 : tuning.stance === 'LOWERED' ? 0.025 : 0;
    camberNodes.forEach((node, idx) => {
      node.rotation.z = (idx % 2 === 0 ? -1 : 1) * camber;
    });
  };

  const setBraking = (braking: boolean): void => {
    taillightMat.emissiveColor = braking ? new Color3(3.6, 0.16, 0.16) : new Color3(1.5, 0.1, 0.12);
  };

  applyTuning(initialTuning);

  return {
    root,
    bodyPivot,
    wheelPivots,
    wheelSpinners,
    reflectables,
    shadowCasters,
    glowMeshes,
    applyTuning,
    setBraking,
    dispose: () => {
      root.dispose();
    },
  };
}

/**
 * Nissan Skyline GT-R (R34 V-Spec II): 4 calaveras circulares rojas, intercooler frontal y alerón R34.
 */
export function buildNissanGtrR34Mesh(scene: Scene, initialTuning: TuningConfig): TsuruRig {
  return buildSculptedBrandCar(
    scene,
    initialTuning,
    {
      idPrefix: 'nissan-r34',
      plateText: 'GT-R R34',
      bodyWidth: 1.88,
      wheelTrackX: 0.86,
      frontAxleZ: 1.4,
      rearAxleZ: -1.35,
      cabinRange: [2, 7],
      stations: [
        {
          z: -2.26,
          halfWidth: 0.86,
          sillY: 0.2,
          beltY: 0.78,
          deckY: 0.9,
          roofY: 0.91,
          roofHalfW: 0.64,
        },
        {
          z: -2.02,
          halfWidth: 0.93,
          sillY: 0.18,
          beltY: 0.82,
          deckY: 0.93,
          roofY: 0.94,
          roofHalfW: 0.7,
        },
        {
          z: -1.35,
          halfWidth: 0.95,
          sillY: 0.18,
          beltY: 0.84,
          deckY: 0.95,
          roofY: 0.96,
          roofHalfW: 0.72,
        },
        {
          z: -0.95,
          halfWidth: 0.95,
          sillY: 0.18,
          beltY: 0.84,
          deckY: 0.95,
          roofY: 1.32,
          roofHalfW: 0.65,
        },
        {
          z: -0.42,
          halfWidth: 0.95,
          sillY: 0.18,
          beltY: 0.84,
          deckY: 0.95,
          roofY: 1.34,
          roofHalfW: 0.66,
        },
        {
          z: 0.28,
          halfWidth: 0.95,
          sillY: 0.18,
          beltY: 0.82,
          deckY: 0.93,
          roofY: 1.32,
          roofHalfW: 0.65,
        },
        {
          z: 0.85,
          halfWidth: 0.94,
          sillY: 0.18,
          beltY: 0.79,
          deckY: 0.9,
          roofY: 0.91,
          roofHalfW: 0.68,
        },
        {
          z: 1.65,
          halfWidth: 0.92,
          sillY: 0.18,
          beltY: 0.72,
          deckY: 0.82,
          roofY: 0.83,
          roofHalfW: 0.66,
        },
        {
          z: 2.12,
          halfWidth: 0.88,
          sillY: 0.19,
          beltY: 0.64,
          deckY: 0.72,
          roofY: 0.73,
          roofHalfW: 0.6,
        },
        {
          z: 2.28,
          halfWidth: 0.8,
          sillY: 0.21,
          beltY: 0.56,
          deckY: 0.64,
          roofY: 0.65,
          roofHalfW: 0.52,
        },
      ],
    },
    ({
      scene: s,
      bodyPivot,
      paintMat,
      trimBlackMat,
      chromeMat,
      headlightMat,
      taillightMat,
      reflectables,
      glowMeshes,
    }) => {
      // 4 calaveras redondas icónicas del Skyline GT-R (O o   o O)
      const tailRingOffsets: ReadonlyArray<{ x: number; diam: number }> = [
        { x: -0.66, diam: 0.18 },
        { x: -0.44, diam: 0.14 },
        { x: 0.44, diam: 0.14 },
        { x: 0.66, diam: 0.18 },
      ];
      for (const ring of tailRingOffsets) {
        const lamp = MeshBuilder.CreateTorus(
          `r34-tail-ring-${ring.x}`,
          { diameter: ring.diam, thickness: 0.045, tessellation: 18 },
          s,
        );
        lamp.parent = bodyPivot;
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(ring.x, 0.72, -2.27);
        lamp.material = taillightMat;
        reflectables.push(lamp);
        glowMeshes.push(lamp);
      }

      // Alerón OEM Skyline R34 pintado al color de la carrocería
      const r34Wing = MeshBuilder.CreateBox(
        'r34-oem-wing',
        { width: 1.72, height: 0.055, depth: 0.28 },
        s,
      );
      r34Wing.parent = bodyPivot;
      r34Wing.position.set(0, 1.13, -2.06);
      r34Wing.material = paintMat;
      reflectables.push(r34Wing);

      for (const side of [-0.68, 0.68] as const) {
        const leg = MeshBuilder.CreateBox(
          `r34-wing-leg-${side}`,
          { width: 0.06, height: 0.22, depth: 0.24 },
          s,
        );
        leg.parent = bodyPivot;
        leg.position.set(side, 1.01, -2.04);
        leg.material = paintMat;

        const headlight = MeshBuilder.CreateBox(
          `r34-headlight-${side}`,
          { width: 0.34, height: 0.13, depth: 0.1 },
          s,
        );
        headlight.parent = bodyPivot;
        headlight.position.set(side * 0.9, 0.58, 2.24);
        headlight.material = headlightMat;

        const exhaust = MeshBuilder.CreateCylinder(
          `r34-exhaust-${side}`,
          { diameter: 0.12, height: 0.18, tessellation: 12 },
          s,
        );
        exhaust.parent = bodyPivot;
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(side * 0.72, 0.25, -2.28);
        exhaust.material = chromeMat;

        reflectables.push(leg, headlight, exhaust);
        glowMeshes.push(headlight);
      }

      const intercooler = MeshBuilder.CreateBox(
        'r34-intercooler',
        { width: 0.88, height: 0.22, depth: 0.08 },
        s,
      );
      intercooler.parent = bodyPivot;
      intercooler.position.set(0, 0.34, 2.27);
      intercooler.material = trimBlackMat;
      reflectables.push(intercooler);
    },
  );
}

/**
 * Audi R8 V10 Plus: parrilla hexagonal Singleframe, 4 aros cromados y sideblades de carbono.
 */
export function buildAudiR8Mesh(scene: Scene, initialTuning: TuningConfig): TsuruRig {
  return buildSculptedBrandCar(
    scene,
    initialTuning,
    {
      idPrefix: 'audi-r8',
      plateText: 'AUDI R8',
      bodyWidth: 1.98,
      wheelTrackX: 0.9,
      frontAxleZ: 1.36,
      rearAxleZ: -1.34,
      cabinRange: [2, 7],
      stations: [
        {
          z: -2.24,
          halfWidth: 0.92,
          sillY: 0.18,
          beltY: 0.72,
          deckY: 0.86,
          roofY: 0.87,
          roofHalfW: 0.68,
        },
        {
          z: -1.96,
          halfWidth: 0.99,
          sillY: 0.16,
          beltY: 0.76,
          deckY: 0.9,
          roofY: 0.91,
          roofHalfW: 0.73,
        },
        {
          z: -1.25,
          halfWidth: 1.0,
          sillY: 0.16,
          beltY: 0.78,
          deckY: 0.91,
          roofY: 1.18,
          roofHalfW: 0.66,
        },
        {
          z: -0.62,
          halfWidth: 1.0,
          sillY: 0.16,
          beltY: 0.78,
          deckY: 0.91,
          roofY: 1.24,
          roofHalfW: 0.65,
        },
        {
          z: 0.15,
          halfWidth: 0.99,
          sillY: 0.16,
          beltY: 0.76,
          deckY: 0.88,
          roofY: 1.23,
          roofHalfW: 0.64,
        },
        {
          z: 0.78,
          halfWidth: 0.98,
          sillY: 0.16,
          beltY: 0.72,
          deckY: 0.82,
          roofY: 1.02,
          roofHalfW: 0.66,
        },
        {
          z: 1.24,
          halfWidth: 0.97,
          sillY: 0.16,
          beltY: 0.66,
          deckY: 0.76,
          roofY: 0.77,
          roofHalfW: 0.68,
        },
        {
          z: 1.84,
          halfWidth: 0.93,
          sillY: 0.17,
          beltY: 0.58,
          deckY: 0.66,
          roofY: 0.67,
          roofHalfW: 0.64,
        },
        {
          z: 2.22,
          halfWidth: 0.82,
          sillY: 0.19,
          beltY: 0.48,
          deckY: 0.54,
          roofY: 0.55,
          roofHalfW: 0.54,
        },
      ],
    },
    ({
      scene: s,
      bodyPivot,
      trimBlackMat,
      chromeMat,
      carbonMat,
      headlightMat,
      taillightMat,
      reflectables,
      glowMeshes,
    }) => {
      // Parrilla hexagonal Singleframe + 4 aros cromados Audi
      const singleframe = MeshBuilder.CreateBox(
        'r8-singleframe-grille',
        { width: 0.84, height: 0.24, depth: 0.06 },
        s,
      );
      singleframe.parent = bodyPivot;
      singleframe.position.set(0, 0.36, 2.22);
      singleframe.material = trimBlackMat;
      reflectables.push(singleframe);

      for (const ringOffset of [-0.09, -0.03, 0.03, 0.09]) {
        const ring = MeshBuilder.CreateTorus(
          `audi-ring-${ringOffset}`,
          { diameter: 0.075, thickness: 0.012, tessellation: 14 },
          s,
        );
        ring.parent = bodyPivot;
        ring.rotation.x = Math.PI / 2;
        ring.position.set(ringOffset, 0.5, 2.18);
        ring.material = chromeMat;
        reflectables.push(ring);
      }

      // Sideblades laterales de carbono característicos del Audi R8
      for (const side of [-1, 1] as const) {
        const sideblade = MeshBuilder.CreateBox(
          `r8-sideblade-${side}`,
          { width: 0.05, height: 0.52, depth: 0.68 },
          s,
        );
        sideblade.parent = bodyPivot;
        sideblade.position.set(side * 0.97, 0.56, -0.78);
        sideblade.material = carbonMat;

        const ledHead = MeshBuilder.CreateBox(
          `r8-headlight-${side}`,
          { width: 0.32, height: 0.08, depth: 0.1 },
          s,
        );
        ledHead.parent = bodyPivot;
        ledHead.position.set(side * 0.64, 0.48, 2.16);
        ledHead.material = headlightMat;

        const ledTail = MeshBuilder.CreateBox(
          `r8-taillight-${side}`,
          { width: 0.48, height: 0.09, depth: 0.08 },
          s,
        );
        ledTail.parent = bodyPivot;
        ledTail.position.set(side * 0.62, 0.64, -2.24);
        ledTail.material = taillightMat;

        const exhaust = MeshBuilder.CreateCylinder(
          `r8-exhaust-${side}`,
          { diameter: 0.13, height: 0.16, tessellation: 12 },
          s,
        );
        exhaust.parent = bodyPivot;
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(side * 0.62, 0.25, -2.25);
        exhaust.material = chromeMat;

        reflectables.push(sideblade, ledHead, ledTail, exhaust);
        glowMeshes.push(ledHead, ledTail);
      }
    },
  );
}

/**
 * Mercedes-AMG GT R: cofre largo musculoso, parrilla Panamericana y estrella de 3 puntas.
 */
export function buildMercedesAmgGtMesh(scene: Scene, initialTuning: TuningConfig): TsuruRig {
  return buildSculptedBrandCar(
    scene,
    initialTuning,
    {
      idPrefix: 'mercedes-amg-gt',
      plateText: 'AMG GT R',
      bodyWidth: 1.96,
      wheelTrackX: 0.88,
      frontAxleZ: 1.46,
      rearAxleZ: -1.36,
      cabinRange: [1, 6],
      stations: [
        {
          z: -2.22,
          halfWidth: 0.9,
          sillY: 0.18,
          beltY: 0.72,
          deckY: 0.84,
          roofY: 0.85,
          roofHalfW: 0.64,
        },
        {
          z: -1.85,
          halfWidth: 0.97,
          sillY: 0.16,
          beltY: 0.78,
          deckY: 0.9,
          roofY: 0.91,
          roofHalfW: 0.7,
        },
        {
          z: -1.2,
          halfWidth: 0.98,
          sillY: 0.16,
          beltY: 0.8,
          deckY: 0.92,
          roofY: 1.24,
          roofHalfW: 0.64,
        },
        {
          z: -0.52,
          halfWidth: 0.98,
          sillY: 0.16,
          beltY: 0.8,
          deckY: 0.92,
          roofY: 1.26,
          roofHalfW: 0.64,
        },
        {
          z: 0.1,
          halfWidth: 0.97,
          sillY: 0.16,
          beltY: 0.79,
          deckY: 0.9,
          roofY: 1.14,
          roofHalfW: 0.64,
        },
        {
          z: 0.62,
          halfWidth: 0.96,
          sillY: 0.16,
          beltY: 0.77,
          deckY: 0.88,
          roofY: 0.89,
          roofHalfW: 0.68,
        },
        {
          z: 1.56,
          halfWidth: 0.95,
          sillY: 0.17,
          beltY: 0.71,
          deckY: 0.82,
          roofY: 0.83,
          roofHalfW: 0.66,
        },
        {
          z: 2.16,
          halfWidth: 0.89,
          sillY: 0.18,
          beltY: 0.62,
          deckY: 0.7,
          roofY: 0.71,
          roofHalfW: 0.58,
        },
        {
          z: 2.34,
          halfWidth: 0.78,
          sillY: 0.21,
          beltY: 0.52,
          deckY: 0.6,
          roofY: 0.61,
          roofHalfW: 0.5,
        },
      ],
    },
    ({
      scene: s,
      bodyPivot,
      trimBlackMat,
      chromeMat,
      carbonMat,
      headlightMat,
      taillightMat,
      reflectables,
      glowMeshes,
    }) => {
      // Parrilla Panamericana con listones verticales cromados + Estrella de 3 puntas
      const panamericana = MeshBuilder.CreateBox(
        'amg-panamericana-grille',
        { width: 0.78, height: 0.24, depth: 0.06 },
        s,
      );
      panamericana.parent = bodyPivot;
      panamericana.position.set(0, 0.42, 2.33);
      panamericana.material = trimBlackMat;
      reflectables.push(panamericana);

      for (let i = -3; i <= 3; i += 1) {
        const slat = MeshBuilder.CreateBox(
          `amg-slat-${i}`,
          { width: 0.018, height: 0.22, depth: 0.07 },
          s,
        );
        slat.parent = bodyPivot;
        slat.position.set(i * 0.095, 0.42, 2.34);
        slat.material = chromeMat;
        reflectables.push(slat);
      }

      const starRing = MeshBuilder.CreateTorus(
        'amg-star-ring',
        { diameter: 0.14, thickness: 0.016, tessellation: 18 },
        s,
      );
      starRing.parent = bodyPivot;
      starRing.rotation.x = Math.PI / 2;
      starRing.position.set(0, 0.42, 2.38);
      starRing.material = chromeMat;
      reflectables.push(starRing);

      const amgRearWing = MeshBuilder.CreateBox(
        'amg-rear-wing',
        { width: 1.64, height: 0.05, depth: 0.25 },
        s,
      );
      amgRearWing.parent = bodyPivot;
      amgRearWing.position.set(0, 1.06, -2.06);
      amgRearWing.material = carbonMat;
      reflectables.push(amgRearWing);

      for (const side of [-1, 1] as const) {
        const headlight = MeshBuilder.CreateBox(
          `amg-headlight-${side}`,
          { width: 0.3, height: 0.12, depth: 0.1 },
          s,
        );
        headlight.parent = bodyPivot;
        headlight.position.set(side * 0.66, 0.56, 2.26);
        headlight.material = headlightMat;

        const taillight = MeshBuilder.CreateBox(
          `amg-taillight-${side}`,
          { width: 0.48, height: 0.08, depth: 0.08 },
          s,
        );
        taillight.parent = bodyPivot;
        taillight.position.set(side * 0.6, 0.66, -2.23);
        taillight.material = taillightMat;

        for (const pipeOffset of [0.54, 0.68]) {
          const exhaust = MeshBuilder.CreateCylinder(
            `amg-quad-exhaust-${side}-${pipeOffset}`,
            { diameter: 0.095, height: 0.14, tessellation: 10 },
            s,
          );
          exhaust.parent = bodyPivot;
          exhaust.rotation.x = Math.PI / 2;
          exhaust.position.set(side * pipeOffset, 0.24, -2.24);
          exhaust.material = chromeMat;
          reflectables.push(exhaust);
        }

        reflectables.push(headlight, taillight);
        glowMeshes.push(headlight, taillight);
      }
    },
  );
}
