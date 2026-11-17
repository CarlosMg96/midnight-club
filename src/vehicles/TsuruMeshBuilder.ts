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
import {
  PAINT_PRESETS,
  UNDERGLOW_COLORS,
  type TuningConfig,
  type WheelStyleId,
} from './VehicleConfig';

export interface TsuruRig {
  readonly root: TransformNode;
  readonly bodyPivot: TransformNode;
  readonly wheelPivots: readonly TransformNode[];
  readonly wheelSpinners: readonly TransformNode[];
  readonly reflectables: readonly AbstractMesh[];
  readonly shadowCasters: readonly AbstractMesh[];
  readonly glowMeshes: readonly AbstractMesh[];
  readonly applyTuning: (tuning: TuningConfig) => void;
  readonly setBraking: (braking: boolean) => void;
  readonly dispose: () => void;
}

interface BodyStation {
  readonly z: number;
  readonly halfWidth: number;
  readonly sillY: number;
  readonly beltY: number;
  readonly deckY: number;
  readonly roofY: number;
  readonly roofHalfW: number;
}

function hexToColor3(hex: string): Color3 {
  return Color3.FromHexString(hex);
}

/**
 * Construye el Nissan Tsuru B13 en 3D con carrocería perfilada mediante Ribbon suave
 * (sin cubos), tapones/rines torneados, placa "TSURU", faros, calaveras y piezas de tuning.
 */
export function buildTsuruB13Mesh(scene: Scene, initialTuning: TuningConfig): TsuruRig {
  const root = new TransformNode('tsuru-b13-root', scene);
  const bodyPivot = new TransformNode('tsuru-b13-body-pivot', scene);
  bodyPivot.parent = root;

  const paintMat = new PBRMaterial('tsuru-paint-pbr', scene);
  paintMat.metallic = 0.82;
  paintMat.roughness = 0.22;
  paintMat.clearCoat.isEnabled = true;
  paintMat.clearCoat.intensity = 1.0;
  paintMat.clearCoat.roughness = 0.06;

  const roofPaintMat = new PBRMaterial('tsuru-roof-pbr', scene);
  roofPaintMat.metallic = 0.72;
  roofPaintMat.roughness = 0.22;
  roofPaintMat.clearCoat.isEnabled = true;
  roofPaintMat.clearCoat.intensity = 1.0;

  const trimBlackMat = new PBRMaterial('tsuru-trim-black-pbr', scene);
  trimBlackMat.albedoColor = new Color3(0.06, 0.065, 0.075);
  trimBlackMat.metallic = 0.12;
  trimBlackMat.roughness = 0.58;

  const chromeMat = new PBRMaterial('tsuru-chrome-pbr', scene);
  chromeMat.albedoColor = new Color3(0.86, 0.89, 0.94);
  chromeMat.metallic = 0.96;
  chromeMat.roughness = 0.12;

  const glassMat = new PBRMaterial('tsuru-glass-pbr', scene);
  glassMat.albedoColor = new Color3(0.04, 0.06, 0.09);
  glassMat.metallic = 0.25;
  glassMat.roughness = 0.05;
  glassMat.clearCoat.isEnabled = true;
  glassMat.clearCoat.intensity = 1.0;

  const headlightMat = new PBRMaterial('tsuru-headlight-pbr', scene);
  headlightMat.albedoColor = new Color3(0.95, 0.97, 1.0);
  headlightMat.emissiveColor = new Color3(2.2, 2.35, 2.5);
  headlightMat.metallic = 0.4;
  headlightMat.roughness = 0.1;

  const indicatorMat = new PBRMaterial('tsuru-indicator-pbr', scene);
  indicatorMat.albedoColor = new Color3(0.98, 0.56, 0.08);
  indicatorMat.emissiveColor = new Color3(0.85, 0.36, 0.04);
  indicatorMat.roughness = 0.2;

  const taillightMat = new PBRMaterial('tsuru-taillight-pbr', scene);
  taillightMat.albedoColor = new Color3(0.85, 0.08, 0.1);
  taillightMat.emissiveColor = new Color3(1.1, 0.08, 0.1);
  taillightMat.roughness = 0.18;

  const carbonMat = new PBRMaterial('tsuru-carbon-kit-pbr', scene);
  carbonMat.albedoColor = new Color3(0.05, 0.055, 0.065);
  carbonMat.metallic = 0.3;
  carbonMat.roughness = 0.34;
  carbonMat.clearCoat.isEnabled = true;

  const underglowMat = new PBRMaterial('tsuru-underglow-pbr', scene);
  underglowMat.albedoColor = new Color3(0.1, 0.8, 1.0);
  underglowMat.emissiveColor = new Color3(0, 0, 0);

  const reflectables: AbstractMesh[] = [];
  const shadowCasters: AbstractMesh[] = [];
  const glowMeshes: AbstractMesh[] = [];

  // 1. Carrocería inferior suavizada del Nissan Tsuru B13 (3 volúmenes, 1992-2017)
  // El frente apunta hacia +Z; la cajuela hacia -Z
  const stations: readonly BodyStation[] = [
    { z: -2.14, halfWidth: 0.76, sillY: 0.24, beltY: 0.72, deckY: 0.84, roofY: 0.85, roofHalfW: 0.58 },
    { z: -1.96, halfWidth: 0.83, sillY: 0.21, beltY: 0.78, deckY: 0.9, roofY: 0.91, roofHalfW: 0.65 },
    { z: -1.32, halfWidth: 0.85, sillY: 0.2, beltY: 0.82, deckY: 0.92, roofY: 0.93, roofHalfW: 0.68 },
    { z: -1.02, halfWidth: 0.85, sillY: 0.2, beltY: 0.83, deckY: 0.93, roofY: 1.36, roofHalfW: 0.64 },
    { z: -0.58, halfWidth: 0.85, sillY: 0.2, beltY: 0.83, deckY: 0.93, roofY: 1.39, roofHalfW: 0.65 },
    { z: 0.25, halfWidth: 0.85, sillY: 0.2, beltY: 0.82, deckY: 0.92, roofY: 1.38, roofHalfW: 0.65 },
    { z: 0.78, halfWidth: 0.84, sillY: 0.2, beltY: 0.8, deckY: 0.9, roofY: 0.91, roofHalfW: 0.66 },
    { z: 1.52, halfWidth: 0.83, sillY: 0.21, beltY: 0.74, deckY: 0.84, roofY: 0.85, roofHalfW: 0.66 },
    { z: 1.98, halfWidth: 0.8, sillY: 0.22, beltY: 0.68, deckY: 0.75, roofY: 0.76, roofHalfW: 0.62 },
    { z: 2.16, halfWidth: 0.73, sillY: 0.25, beltY: 0.6, deckY: 0.68, roofY: 0.69, roofHalfW: 0.54 },
  ];

  // Casco inferior de carrocería (sill -> beltline -> hood/trunk deck)
  const lowerBodyPaths: Vector3[][] = stations.map((s) => [
    new Vector3(-s.halfWidth * 0.82, s.sillY, s.z),
    new Vector3(-s.halfWidth, s.sillY + 0.14, s.z),
    new Vector3(-s.halfWidth * 0.98, s.beltY, s.z),
    new Vector3(-s.roofHalfW * 1.04, s.deckY, s.z),
    new Vector3(0, s.deckY + 0.02, s.z),
    new Vector3(s.roofHalfW * 1.04, s.deckY, s.z),
    new Vector3(s.halfWidth * 0.98, s.beltY, s.z),
    new Vector3(s.halfWidth, s.sillY + 0.14, s.z),
    new Vector3(s.halfWidth * 0.82, s.sillY, s.z),
  ]);

  const lowerBody = MeshBuilder.CreateRibbon(
    'tsuru-lower-body',
    { pathArray: lowerBodyPaths, closePath: true, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  recomputeSmoothNormals(lowerBody);
  lowerBody.parent = bodyPivot;
  lowerBody.material = paintMat;

  // Habitáculo / cabina acristalada con postes estilizados (z = -1.12..+0.78)
  const cabinStations = stations.slice(2, 7);
  const cabinPaths: Vector3[][] = cabinStations.map((s, idx) => {
    const isEnd = idx === 0 || idx === cabinStations.length - 1;
    const topY = isEnd ? s.deckY + 0.02 : s.roofY;
    const topW = isEnd ? s.roofHalfW * 1.02 : s.roofHalfW * 0.92;
    return [
      new Vector3(-s.roofHalfW * 1.04, s.deckY - 0.01, s.z),
      new Vector3(-topW, topY, s.z),
      new Vector3(0, topY + 0.025, s.z),
      new Vector3(topW, topY, s.z),
      new Vector3(s.roofHalfW * 1.04, s.deckY - 0.01, s.z),
    ];
  });

  const cabinGlass = MeshBuilder.CreateRibbon(
    'tsuru-cabin-glass',
    { pathArray: cabinPaths, closePath: false, sideOrientation: Mesh.DOUBLESIDE },
    scene,
  );
  recomputeSmoothNormals(cabinGlass);
  cabinGlass.parent = bodyPivot;
  cabinGlass.material = glassMat;

  // Techo pintado independiente (para soportar toldo blanco de Taxi CDMX y Plata Agencia)
  const roofCap = MeshBuilder.CreateRibbon(
    'tsuru-roof-panel',
    {
      pathArray: [
        [
          new Vector3(-0.62, 1.37, -0.96),
          new Vector3(0, 1.405, -0.96),
          new Vector3(0.62, 1.37, -0.96),
        ],
        [
          new Vector3(-0.64, 1.4, -0.35),
          new Vector3(0, 1.43, -0.35),
          new Vector3(0.64, 1.4, -0.35),
        ],
        [
          new Vector3(-0.63, 1.385, 0.28),
          new Vector3(0, 1.415, 0.28),
          new Vector3(0.63, 1.385, 0.28),
        ],
      ],
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  recomputeSmoothNormals(roofCap);
  roofCap.parent = bodyPivot;
  roofCap.material = roofPaintMat;

  // Postes laterales A, B y C en color carrocería/toldo
  const pillarSpecs: ReadonlyArray<{ z: number; rotX: number; len: number }> = [
    { z: 0.54, rotX: -0.78, len: 0.72 },
    { z: -0.22, rotX: 0, len: 0.5 },
    { z: -0.84, rotX: 0.64, len: 0.66 },
  ];
  pillarSpecs.forEach((p, idx) => {
    for (const side of [-1, 1] as const) {
      const pillar = MeshBuilder.CreateCylinder(
        `tsuru-pillar-${idx}-${side}`,
        { height: p.len, diameter: 0.055, tessellation: 8 },
        scene,
      );
      pillar.parent = bodyPivot;
      pillar.position.set(side * 0.66, 1.15, p.z);
      pillar.rotation.x = p.rotX;
      pillar.rotation.z = side * 0.18;
      pillar.material = idx === 1 ? trimBlackMat : roofPaintMat;
      reflectables.push(pillar);
    }
  });

  // 2. Defensas contorneadas delantera y trasera con moldura negra acanalada B13
  const frontBumper = MeshBuilder.CreateCylinder(
    'tsuru-front-bumper',
    { height: 1.62, diameter: 0.24, tessellation: 14 },
    scene,
  );
  frontBumper.parent = bodyPivot;
  frontBumper.rotation.z = Math.PI / 2;
  frontBumper.scaling.set(1.1, 1, 1.35);
  frontBumper.position.set(0, 0.34, 2.13);
  frontBumper.material = paintMat;

  const rearBumper = MeshBuilder.CreateCylinder(
    'tsuru-rear-bumper',
    { height: 1.66, diameter: 0.24, tessellation: 14 },
    scene,
  );
  rearBumper.parent = bodyPivot;
  rearBumper.rotation.z = Math.PI / 2;
  rearBumper.scaling.set(1.1, 1, 1.3);
  rearBumper.position.set(0, 0.36, -2.12);
  rearBumper.material = paintMat;

  // Moldura lateral negra clásica de Tsuru
  for (const side of [-1, 1] as const) {
    const molding = MeshBuilder.CreateBox(
      `tsuru-side-molding-${side}`,
      { width: 0.03, height: 0.055, depth: 3.8 },
      scene,
    );
    molding.parent = bodyPivot;
    molding.position.set(side * 0.855, 0.52, 0);
    molding.material = trimBlackMat;

    const mirror = MeshBuilder.CreateSphere(
      `tsuru-mirror-${side}`,
      { diameterX: 0.16, diameterY: 0.1, diameterZ: 0.12, segments: 10 },
      scene,
    );
    mirror.parent = bodyPivot;
    mirror.position.set(side * 0.87, 0.92, 0.56);
    mirror.material = trimBlackMat;
    reflectables.push(molding, mirror);
  }

  // 3. Parrilla negra, emblema frontal cromado, faros horizontales y placa "TSURU"
  const grille = MeshBuilder.CreateBox(
    'tsuru-grille',
    { width: 0.72, height: 0.16, depth: 0.06 },
    scene,
  );
  grille.parent = bodyPivot;
  grille.position.set(0, 0.58, 2.13);
  grille.material = trimBlackMat;

  const emblemRing = MeshBuilder.CreateTorus(
    'tsuru-front-emblem',
    { diameter: 0.11, thickness: 0.018, tessellation: 14 },
    scene,
  );
  emblemRing.parent = bodyPivot;
  emblemRing.rotation.x = Math.PI / 2;
  emblemRing.position.set(0, 0.58, 2.17);
  emblemRing.material = chromeMat;

  const plateMat = new PBRMaterial('tsuru-plate-pbr', scene);
  plateMat.albedoTexture = createTsuruPlateTexture(scene, 'TSURU');
  plateMat.roughness = 0.45;
  plateMat.metallic = 0.1;

  const frontPlate = MeshBuilder.CreateBox(
    'tsuru-front-plate',
    { width: 0.34, height: 0.12, depth: 0.02 },
    scene,
  );
  frontPlate.parent = bodyPivot;
  frontPlate.position.set(0, 0.36, 2.27);
  frontPlate.material = plateMat;

  const rearPlate = MeshBuilder.CreateBox(
    'tsuru-rear-plate',
    { width: 0.34, height: 0.12, depth: 0.02 },
    scene,
  );
  rearPlate.parent = bodyPivot;
  rearPlate.position.set(0, 0.56, -2.17);
  rearPlate.material = plateMat;

  for (const side of [-1, 1] as const) {
    const headlight = MeshBuilder.CreateBox(
      `tsuru-headlight-${side}`,
      { width: 0.34, height: 0.14, depth: 0.08 },
      scene,
    );
    headlight.parent = bodyPivot;
    headlight.position.set(side * 0.56, 0.58, 2.13);
    headlight.material = headlightMat;

    const cornerSignal = MeshBuilder.CreateBox(
      `tsuru-corner-signal-${side}`,
      { width: 0.1, height: 0.13, depth: 0.12 },
      scene,
    );
    cornerSignal.parent = bodyPivot;
    cornerSignal.position.set(side * 0.77, 0.58, 2.09);
    cornerSignal.material = indicatorMat;

    const taillight = MeshBuilder.CreateBox(
      `tsuru-taillight-${side}`,
      { width: 0.46, height: 0.16, depth: 0.07 },
      scene,
    );
    taillight.parent = bodyPivot;
    taillight.position.set(side * 0.56, 0.68, -2.13);
    taillight.material = taillightMat;

    reflectables.push(headlight, cornerSignal, taillight);
    glowMeshes.push(headlight, taillight);
  }

  // 4. Cuatro ruedas torneadas con perfil curvo de llanta + tapones/rines configurables
  const tireMat = new PBRMaterial('tsuru-tire-pbr', scene);
  tireMat.albedoColor = new Color3(0.04, 0.045, 0.055);
  tireMat.metallic = 0.05;
  tireMat.roughness = 0.82;

  const rimMat = new PBRMaterial('tsuru-rim-pbr', scene);
  rimMat.metallic = 0.78;
  rimMat.roughness = 0.24;

  const hubcapTextures: Record<WheelStyleId, DynamicTexture> = {
    TAPONES_STOCK: createHubcapTexture(scene, '#cfd6e0'),
    BBS_GOLD: createHubcapTexture(scene, '#d8aa38'),
    CHROME_SPORT: createHubcapTexture(scene, '#f0f5fc'),
  };

  const tireProfile = [
    new Vector3(0.18, -0.1, 0),
    new Vector3(0.28, -0.1, 0),
    new Vector3(0.31, -0.06, 0),
    new Vector3(0.31, 0.06, 0),
    new Vector3(0.28, 0.1, 0),
    new Vector3(0.18, 0.1, 0),
    new Vector3(0.18, -0.1, 0),
  ];

  const wheelCoords: ReadonlyArray<{ x: number; z: number; isFront: boolean }> = [
    { x: -0.78, z: 1.32, isFront: true },
    { x: 0.78, z: 1.32, isFront: true },
    { x: -0.78, z: -1.26, isFront: false },
    { x: 0.78, z: -1.26, isFront: false },
  ];

  const wheelPivots: TransformNode[] = [];
  const wheelSpinners: TransformNode[] = [];
  const camberNodes: TransformNode[] = [];

  wheelCoords.forEach((wc, idx) => {
    const steerPivot = new TransformNode(`tsuru-wheel-steer-${idx}`, scene);
    steerPivot.parent = root;
    steerPivot.position.set(wc.x, 0.31, wc.z);

    const camberNode = new TransformNode(`tsuru-wheel-camber-${idx}`, scene);
    camberNode.parent = steerPivot;

    const spinner = new TransformNode(`tsuru-wheel-spin-${idx}`, scene);
    spinner.parent = camberNode;

    const tire = MeshBuilder.CreateLathe(
      `tsuru-tire-${idx}`,
      { shape: tireProfile, tessellation: 24 },
      scene,
    );
    tire.parent = spinner;
    tire.rotation.z = Math.PI / 2;
    tire.material = tireMat;

    const rimDisc = MeshBuilder.CreateCylinder(
      `tsuru-rim-${idx}`,
      { diameter: 0.38, height: 0.18, tessellation: 20 },
      scene,
    );
    rimDisc.parent = spinner;
    rimDisc.rotation.z = Math.PI / 2;
    rimDisc.material = rimMat;

    reflectables.push(tire, rimDisc);
    shadowCasters.push(tire);
    wheelPivots.push(steerPivot);
    camberNodes.push(camberNode);
    wheelSpinners.push(spinner);
  });

  // 5. Piezas modulares de Tuning (Street Tuner & Midnight GT + Underglow)
  const streetMeshes: AbstractMesh[] = [];
  const gtMeshes: AbstractMesh[] = [];
  const underglowRails: AbstractMesh[] = [];

  const frontLip = MeshBuilder.CreateBox(
    'tsuru-tune-front-lip',
    { width: 1.66, height: 0.06, depth: 0.28 },
    scene,
  );
  frontLip.parent = bodyPivot;
  frontLip.position.set(0, 0.2, 2.16);
  frontLip.material = carbonMat;
  streetMeshes.push(frontLip);

  for (const side of [-1, 1] as const) {
    const sideSkirt = MeshBuilder.CreateBox(
      `tsuru-tune-skirt-${side}`,
      { width: 0.08, height: 0.09, depth: 2.35 },
      scene,
    );
    sideSkirt.parent = bodyPivot;
    sideSkirt.position.set(side * 0.85, 0.2, 0.02);
    sideSkirt.material = carbonMat;
    streetMeshes.push(sideSkirt);
  }

  const streetLipSpoiler = MeshBuilder.CreateBox(
    'tsuru-tune-street-spoiler',
    { width: 1.42, height: 0.07, depth: 0.18 },
    scene,
  );
  streetLipSpoiler.parent = bodyPivot;
  streetLipSpoiler.position.set(0, 0.94, -2.06);
  streetLipSpoiler.material = paintMat;
  streetMeshes.push(streetLipSpoiler);

  const hoodScoop = MeshBuilder.CreateBox(
    'tsuru-tune-hood-scoop',
    { width: 0.46, height: 0.08, depth: 0.56 },
    scene,
  );
  hoodScoop.parent = bodyPivot;
  hoodScoop.position.set(0, 0.88, 1.24);
  hoodScoop.rotation.x = 0.08;
  hoodScoop.material = carbonMat;
  gtMeshes.push(hoodScoop);

  const gtWing = MeshBuilder.CreateBox(
    'tsuru-tune-gt-wing',
    { width: 1.66, height: 0.055, depth: 0.34 },
    scene,
  );
  gtWing.parent = bodyPivot;
  gtWing.position.set(0, 1.24, -1.98);
  gtWing.rotation.x = -0.14;
  gtWing.material = carbonMat;
  gtMeshes.push(gtWing);

  for (const side of [-0.46, 0.46] as const) {
    const pylon = MeshBuilder.CreateBox(
      `tsuru-tune-pylon-${side}`,
      { width: 0.05, height: 0.34, depth: 0.18 },
      scene,
    );
    pylon.parent = bodyPivot;
    pylon.position.set(side, 1.06, -1.94);
    pylon.material = carbonMat;
    gtMeshes.push(pylon);
  }

  for (const side of [-0.78, 0.78] as const) {
    const rail = MeshBuilder.CreateBox(
      `tsuru-underglow-rail-${side}`,
      { width: 0.06, height: 0.035, depth: 2.3 },
      scene,
    );
    rail.parent = bodyPivot;
    rail.position.set(side, 0.14, 0.02);
    rail.material = underglowMat;
    underglowRails.push(rail);
    glowMeshes.push(rail);
  }

  const underglowLight = new PointLight('tsuru-underglow-light', new Vector3(0, 0.22, 0), scene);
  underglowLight.parent = bodyPivot;
  underglowLight.intensity = 0;
  underglowLight.range = 8.5;

  reflectables.push(
    lowerBody,
    cabinGlass,
    roofCap,
    frontBumper,
    rearBumper,
    grille,
    frontPlate,
    rearPlate,
    ...streetMeshes,
    ...gtMeshes,
  );
  shadowCasters.push(lowerBody, roofCap, frontBumper, rearBumper, gtWing);

  const applyTuning = (tuning: TuningConfig): void => {
    const paint = PAINT_PRESETS[tuning.paintPreset];
    paintMat.albedoColor = hexToColor3(paint.primaryHex);
    paintMat.metallic = paint.metallic;
    paintMat.roughness = paint.roughness;

    roofPaintMat.albedoColor = hexToColor3(paint.roofHex);
    roofPaintMat.metallic = paint.metallic;
    roofPaintMat.roughness = paint.roughness;

    const wheelTex = hubcapTextures[tuning.wheelStyle];
    rimMat.albedoTexture = wheelTex;
    rimMat.metallic = tuning.wheelStyle === 'TAPONES_STOCK' ? 0.65 : 0.92;
    rimMat.roughness = tuning.wheelStyle === 'TAPONES_STOCK' ? 0.3 : 0.16;

    const showStreet = tuning.bodyKit === 'STREET_TUNER' || tuning.bodyKit === 'MIDNIGHT_GT';
    const showGt = tuning.bodyKit === 'MIDNIGHT_GT';

    for (const m of streetMeshes) {
      m.setEnabled(showStreet);
    }
    streetLipSpoiler.setEnabled(tuning.bodyKit === 'STREET_TUNER');
    for (const m of gtMeshes) {
      m.setEnabled(showGt);
    }

    const underglow = UNDERGLOW_COLORS[tuning.underglow];
    const hasGlow = underglow.hex !== null;
    for (const r of underglowRails) {
      r.setEnabled(hasGlow);
    }
    if (underglow.hex) {
      const c = hexToColor3(underglow.hex);
      underglowMat.albedoColor = c;
      underglowMat.emissiveColor = c.scale(2.4);
      underglowLight.diffuse = c;
      underglowLight.intensity = 15;
    } else {
      underglowMat.emissiveColor = Color3.Black();
      underglowLight.intensity = 0;
    }

    const rideOffset =
      tuning.stance === 'DRIFT_SPEC' ? -0.06 : tuning.stance === 'LOWERED' ? -0.045 : 0;
    bodyPivot.position.y = rideOffset;

    const camber =
      tuning.stance === 'DRIFT_SPEC' ? 0.065 : tuning.stance === 'LOWERED' ? 0.025 : 0;
    camberNodes.forEach((node, idx) => {
      const sign = idx % 2 === 0 ? -1 : 1;
      node.rotation.z = sign * camber;
    });
  };

  const setBraking = (braking: boolean): void => {
    taillightMat.emissiveColor = braking
      ? new Color3(3.2, 0.14, 0.14)
      : new Color3(1.1, 0.08, 0.1);
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
