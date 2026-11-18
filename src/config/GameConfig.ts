export const GAME_TITLE = 'Midnight Club: CDMX & Edomex';
export const GAME_SUBTITLE = 'Zona Metropolitana del Valle de México';

/** Paso de tiempo fijo preparado para simulación física determinista (60 Hz). */
export const FIXED_TIME_STEP = 1 / 60;

export const TRAFFIC_CYCLE_DURATION_SEC = 24;

export type TrafficLightColor = 'GREEN' | 'YELLOW' | 'RED';

export interface IntersectionSignalState {
  readonly ns: TrafficLightColor;
  readonly ew: TrafficLightColor;
}

/**
 * Ciclo congruente de semáforos de 3 tiempos (Verde/Ámbar/Rojo):
 * cuando un eje está en verde o ámbar, el eje perpendicular permanece estrictamente en rojo.
 */
export function resolveIntersectionSignalState(elapsedSec: number): IntersectionSignalState {
  const t =
    ((elapsedSec % TRAFFIC_CYCLE_DURATION_SEC) + TRAFFIC_CYCLE_DURATION_SEC) %
    TRAFFIC_CYCLE_DURATION_SEC;
  if (t < 9) {
    return { ns: 'GREEN', ew: 'RED' };
  }
  if (t < 12) {
    return { ns: 'YELLOW', ew: 'RED' };
  }
  if (t < 21) {
    return { ns: 'RED', ew: 'GREEN' };
  }
  return { ns: 'RED', ew: 'YELLOW' };
}

export interface RgbTuple {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const NOCTURNAL_COLORS = {
  skyClear: { r: 0.04, g: 0.06, b: 0.13 } as RgbTuple,
  skyZenith: { r: 0.04, g: 0.07, b: 0.16 } as RgbTuple,
  skyHorizon: { r: 0.42, g: 0.25, b: 0.22 } as RgbTuple,
  fog: { r: 0.05, g: 0.07, b: 0.14 } as RgbTuple,
  moonLight: { r: 0.62, g: 0.76, b: 1.0 } as RgbTuple,
  ambientSky: { r: 0.24, g: 0.3, b: 0.5 } as RgbTuple,
  ambientGround: { r: 0.08, g: 0.07, b: 0.11 } as RgbTuple,
  sodiumLamp: { r: 1.0, g: 0.68, b: 0.26 } as RgbTuple,
  neonCyan: { r: 0.06, g: 0.9, b: 1.0 } as RgbTuple,
  neonMagenta: { r: 1.0, g: 0.16, b: 0.62 } as RgbTuple,
  neonAmber: { r: 1.0, g: 0.66, b: 0.12 } as RgbTuple,
  neonGreen: { r: 0.18, g: 0.98, b: 0.56 } as RgbTuple,
  angelGold: { r: 1.0, g: 0.82, b: 0.3 } as RgbTuple,
  heroUnderglow: { r: 1.0, g: 0.42, b: 0.08 } as RgbTuple,
  heroTaillight: { r: 1.0, g: 0.08, b: 0.12 } as RgbTuple,
} as const;

export const TEST_AVENUE_CONFIG = {
  roadLength: 340,
  roadWidth: 40,
  sidewalkWidth: 6.0,
  streetLightSpacing: 36,
  buildingRowOffset: 28,
  angelPosition: { x: 0, z: 75 },
  roundaboutIslandRadius: 9.5,
  roundaboutCollisionRadius: 9.8,
  playerSpawn: { x: 13.5, y: 0, z: -12, heading: 0 },
} as const;

export interface RoadCorridorSpec {
  readonly id: string;
  readonly name: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export const METROPOLITAN_CORRIDORS: readonly RoadCorridorSpec[] = [
  {
    id: 'reforma-insurgentes',
    name: 'Insurgentes / Paseo de la Reforma',
    minX: -20,
    maxX: 20,
    minZ: -480,
    maxZ: 560,
  },
  {
    id: 'periferico-poniente',
    name: 'Periférico Poniente (San Ángel · Santa Fe · Satélite)',
    minX: -398,
    maxX: -362,
    minZ: -350,
    maxZ: 430,
  },
  {
    id: 'circuito-mexiquense-oriente',
    name: 'Circuito Mexiquense / Oriente (Iztapalapa · Neza · Ecatepec)',
    minX: 362,
    maxX: 398,
    minZ: -350,
    maxZ: 430,
  },
  {
    id: 'eje-central-juarez-palmas',
    name: 'Av. Palmas · Reforma · Centro · Av. Chimalhuacán',
    minX: -480,
    maxX: 480,
    minZ: 57,
    maxZ: 93,
  },
  {
    id: 'periferico-norte-edomex',
    name: 'Periférico Norte · Gustavo Baz · Vía Morelos (Edomex)',
    minX: -480,
    maxX: 480,
    minZ: 361,
    maxZ: 399,
  },
  {
    id: 'periferico-sur-viaducto',
    name: 'Periférico Sur · Ciudad Universitaria · Zaragoza',
    minX: -480,
    maxX: 480,
    minZ: -338,
    maxZ: -302,
  },
  {
    id: 'blvd-puerto-aereo-aicm',
    name: 'Blvd. Puerto Aéreo · Circuito Interior · AICM',
    minX: -20,
    maxX: 398,
    minZ: 207,
    maxZ: 243,
  },
  {
    id: 'curvas-la-marquesa',
    name: 'Paso de La Marquesa · Curvas Abiertas (Edomex / Santa Fe)',
    minX: -505,
    maxX: -362,
    minZ: -320,
    maxZ: 75,
  },
];

export interface OpenCurveSpec {
  readonly id: string;
  readonly name: string;
  readonly cx: number;
  readonly cz: number;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly chevronDir: 'LEFT' | 'RIGHT';
}

export const METROPOLITAN_OPEN_CURVES: readonly OpenCurveSpec[] = [
  {
    id: 'curva-abierta-marquesa-norte',
    name: 'Autopista La Marquesa · Gran Curva Abierta Norte',
    cx: -380,
    cz: -35,
    innerRadius: 68,
    outerRadius: 112,
    startAngle: Math.PI / 2,
    endAngle: (3 * Math.PI) / 2,
    chevronDir: 'LEFT',
  },
  {
    id: 'curva-abierta-marquesa-sur',
    name: 'Autopista La Marquesa · Gran Curva Abierta Sur',
    cx: -380,
    cz: -210,
    innerRadius: 68,
    outerRadius: 112,
    startAngle: Math.PI / 2,
    endAngle: (3 * Math.PI) / 2,
    chevronDir: 'RIGHT',
  },
  {
    id: 'curva-abierta-satelite-nw',
    name: 'Distribuidor Satélite · Curva Abierta Noroeste',
    cx: -250,
    cz: 250,
    innerRadius: 112,
    outerRadius: 148,
    startAngle: Math.PI / 2,
    endAngle: Math.PI,
    chevronDir: 'RIGHT',
  },
  {
    id: 'curva-abierta-san-angel-sw',
    name: 'Periférico Poniente-Sur · Curva Abierta San Ángel',
    cx: -250,
    cz: -190,
    innerRadius: 112,
    outerRadius: 148,
    startAngle: Math.PI,
    endAngle: (3 * Math.PI) / 2,
    chevronDir: 'LEFT',
  },
  {
    id: 'curva-abierta-iztapalapa-se',
    name: 'Circuito Oriente-Sur · Curva Abierta Iztapalapa',
    cx: 250,
    cz: -190,
    innerRadius: 112,
    outerRadius: 148,
    startAngle: (3 * Math.PI) / 2,
    endAngle: Math.PI * 2,
    chevronDir: 'RIGHT',
  },
];

export interface CurveBarrierSpec {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly chevronDir: 'LEFT' | 'RIGHT';
}

export const METROPOLITAN_CURVE_BARRIERS: readonly CurveBarrierSpec[] = [
  // Islas guía de curvas abiertas en La Marquesa (radio reducido y gran separación longitudinal)
  { id: 'marquesa-apex-1', x: -412, z: -35, radius: 9.5, chevronDir: 'RIGHT' },
  { id: 'marquesa-apex-2', x: -456, z: -122, radius: 9.5, chevronDir: 'LEFT' },
  { id: 'marquesa-apex-3', x: -412, z: -210, radius: 9.5, chevronDir: 'RIGHT' },
  // Curvas abiertas suaves en Coyoacán / Insurgentes
  { id: 'coyoacan-chicane-1', x: -17.2, z: -215, radius: 3.8, chevronDir: 'LEFT' },
  { id: 'coyoacan-chicane-2', x: 17.2, z: -285, radius: 3.8, chevronDir: 'RIGHT' },
  // Curvas abiertas suaves en Reforma Norte / Misterios
  { id: 'reforma-norte-chicane-1', x: 17.2, z: 245, radius: 3.8, chevronDir: 'LEFT' },
  { id: 'reforma-norte-chicane-2', x: -17.2, z: 315, radius: 3.8, chevronDir: 'RIGHT' },
];

export interface RoundaboutSpec {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  readonly islandRadius: number;
  readonly collisionRadius: number;
  readonly color: string;
}

export const METROPOLITAN_ROUNDABOUTS: readonly RoundaboutSpec[] = [
  {
    id: 'angel',
    label: 'Glorieta del Ángel',
    x: 0,
    z: 75,
    islandRadius: 9.5,
    collisionRadius: 9.8,
    color: '#ffd15c',
  },
  {
    id: 'satelite',
    label: 'Torres de Satélite (Naucalpan, Edomex)',
    x: -380,
    z: 380,
    islandRadius: 8.2,
    collisionRadius: 8.5,
    color: '#ff5c4d',
  },
  {
    id: 'coyote-neza',
    label: 'Glorieta del Coyote (Neza, Edomex)',
    x: 380,
    z: 75,
    islandRadius: 8.2,
    collisionRadius: 8.5,
    color: '#ff2e4c',
  },
];

export type MetropolitanZoneId =
  | 'REFORMA_ANGEL'
  | 'CENTRO_ZOCALO'
  | 'AEROPUERTO_AICM'
  | 'POLANCO_SANTAFE'
  | 'CURVAS_MARQUESA'
  | 'COYOACAN_CU'
  | 'IZTAPALAPA_ZARAGOZA'
  | 'NAUCALPAN_SATELITE'
  | 'TLALNEPANTLA_BAZ'
  | 'ECATEPEC_MORELOS'
  | 'NEZAHUALCOYOTL_COYOTE';

export interface MetropolitanZoneSpec {
  readonly id: MetropolitanZoneId;
  readonly name: string;
  readonly region: 'CDMX' | 'EDOMEX';
  readonly streetBanner: string;
  readonly spawn: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly heading: number;
  };
  readonly landmark: {
    readonly x: number;
    readonly z: number;
  };
}

export const METROPOLITAN_ZONES: Readonly<Record<MetropolitanZoneId, MetropolitanZoneSpec>> = {
  REFORMA_ANGEL: {
    id: 'REFORMA_ANGEL',
    name: 'Paseo de la Reforma · Ángel',
    region: 'CDMX',
    streetBanner: 'PASEO DE LA REFORMA',
    spawn: { x: 13.5, y: 0, z: -12, heading: 0 },
    landmark: { x: 0, z: 75 },
  },
  CENTRO_ZOCALO: {
    id: 'CENTRO_ZOCALO',
    name: 'Centro Histórico · Zócalo y Torre Latino',
    region: 'CDMX',
    streetBanner: 'ZÓCALO · CENTRO CDMX',
    spawn: { x: 135, y: 0, z: 66, heading: Math.PI / 2 },
    landmark: { x: 210, z: 75 },
  },
  AEROPUERTO_AICM: {
    id: 'AEROPUERTO_AICM',
    name: 'Aeropuerto Internacional CDMX (AICM T1/T2)',
    region: 'CDMX',
    streetBanner: 'BLVD. PUERTO AÉREO · AICM CDMX',
    spawn: { x: 125, y: 0, z: 216, heading: Math.PI / 2 },
    landmark: { x: 230, z: 225 },
  },
  POLANCO_SANTAFE: {
    id: 'POLANCO_SANTAFE',
    name: 'Polanco / Santa Fe · Huixquilucan',
    region: 'CDMX',
    streetBanner: 'SANTA FE · HUIXQUILUCAN',
    spawn: { x: -240, y: 0, z: 84, heading: -Math.PI / 2 },
    landmark: { x: -380, z: 75 },
  },
  CURVAS_MARQUESA: {
    id: 'CURVAS_MARQUESA',
    name: 'La Marquesa · Circuito de Curvas Abiertas',
    region: 'EDOMEX',
    streetBanner: 'LA MARQUESA · CURVAS ABIERTAS',
    spawn: { x: -389, y: 0, z: 22, heading: Math.PI },
    landmark: { x: -435, z: -120 },
  },
  COYOACAN_CU: {
    id: 'COYOACAN_CU',
    name: 'Coyoacán · Ciudad Universitaria UNAM',
    region: 'CDMX',
    streetBanner: 'COYOACÁN · CU UNAM',
    spawn: { x: -11.5, y: 0, z: -225, heading: Math.PI },
    landmark: { x: 0, z: -320 },
  },
  IZTAPALAPA_ZARAGOZA: {
    id: 'IZTAPALAPA_ZARAGOZA',
    name: 'Iztapalapa · Calz. Zaragoza',
    region: 'CDMX',
    streetBanner: 'IZTAPALAPA · ZARAGOZA',
    spawn: { x: 250, y: 0, z: -329, heading: Math.PI / 2 },
    landmark: { x: 380, z: -320 },
  },
  NAUCALPAN_SATELITE: {
    id: 'NAUCALPAN_SATELITE',
    name: 'Naucalpan · Torres de Satélite',
    region: 'EDOMEX',
    streetBanner: 'NAUCALPAN · SATÉLITE (EDOMEX)',
    spawn: { x: -389, y: 0, z: 265, heading: 0 },
    landmark: { x: -380, z: 380 },
  },
  TLALNEPANTLA_BAZ: {
    id: 'TLALNEPANTLA_BAZ',
    name: 'Tlalnepantla · Periférico Norte',
    region: 'EDOMEX',
    streetBanner: 'TLALNEPANTLA · EDOMEX',
    spawn: { x: -230, y: 0, z: 371, heading: Math.PI / 2 },
    landmark: { x: -160, z: 380 },
  },
  ECATEPEC_MORELOS: {
    id: 'ECATEPEC_MORELOS',
    name: 'Ecatepec · Vía Morelos y Mexicable',
    region: 'EDOMEX',
    streetBanner: 'ECATEPEC · MEXICABLE (EDOMEX)',
    spawn: { x: 245, y: 0, z: 371, heading: Math.PI / 2 },
    landmark: { x: 380, z: 380 },
  },
  NEZAHUALCOYOTL_COYOTE: {
    id: 'NEZAHUALCOYOTL_COYOTE',
    name: 'Cd. Nezahualcóyotl · El Coyote',
    region: 'EDOMEX',
    streetBanner: 'CD. NEZAHUALCÓYOTL (EDOMEX)',
    spawn: { x: 275, y: 0, z: 66, heading: Math.PI / 2 },
    landmark: { x: 380, z: 75 },
  },
};

export const METROPOLITAN_ZONE_ORDER: readonly MetropolitanZoneId[] = [
  'REFORMA_ANGEL',
  'CENTRO_ZOCALO',
  'AEROPUERTO_AICM',
  'POLANCO_SANTAFE',
  'CURVAS_MARQUESA',
  'COYOACAN_CU',
  'IZTAPALAPA_ZARAGOZA',
  'NAUCALPAN_SATELITE',
  'TLALNEPANTLA_BAZ',
  'ECATEPEC_MORELOS',
  'NEZAHUALCOYOTL_COYOTE',
];

export function getMetropolitanZone(zoneId: MetropolitanZoneId): MetropolitanZoneSpec {
  return METROPOLITAN_ZONES[zoneId];
}

export function resolveMetropolitanZoneName(x: number, z: number): string {
  const distToAngel = Math.hypot(x - 0, z - 75);
  if (distToAngel < 28) {
    return 'GLORIETA DEL ÁNGEL';
  }

  if (x <= -275 && z >= 210) {
    return 'NAUCALPAN · SATÉLITE (EDOMEX)';
  }
  if (x > -275 && x < 120 && z >= 340) {
    return 'TLALNEPANTLA · EDOMEX';
  }
  if (x >= 120 && z >= 340) {
    return 'ECATEPEC · MEXICABLE (EDOMEX)';
  }
  if (x >= 55 && x <= 345 && z >= 185 && z <= 295) {
    return 'BLVD. PUERTO AÉREO · AICM CDMX';
  }
  if (x > 255 && z > -140 && z < 340) {
    return 'CD. NEZAHUALCÓYOTL (EDOMEX)';
  }
  if (x >= 80 && x <= 255 && Math.abs(z - 75) <= 55) {
    return 'ZÓCALO · CENTRO CDMX';
  }
  if ((x < -398 && z >= -320 && z <= 75) || (x <= -355 && z >= -270 && z <= 45)) {
    return 'LA MARQUESA · CURVAS ABIERTAS';
  }
  if (x <= -180 && z < 210 && z > -160) {
    return 'SANTA FE · HUIXQUILUCAN';
  }
  if (x <= 180 && z <= -180) {
    return 'COYOACÁN · CU UNAM';
  }
  if (x > 180 && z <= -180) {
    return 'IZTAPALAPA · ZARAGOZA';
  }
  if (Math.abs(x) <= 32) {
    if (z >= 145) {
      return 'INSURGENTES NORTE · INDIOS VERDES';
    }
    if (z <= -90) {
      return 'INSURGENTES SUR · CDMX';
    }
    return 'PASEO DE LA REFORMA';
  }

  return 'PERIFÉRICO · ZMVM';
}

export const INITIAL_CAMERA_CONFIG = {
  alpha: -Math.PI / 2,
  beta: 1.24,
  radius: 7.4,
  target: { x: 13.5, y: 1.15, z: -12 },
  lowerBetaLimit: 0.22,
  upperBetaLimit: Math.PI / 2 - 0.04,
  lowerRadiusLimit: 4.5,
  upperRadiusLimit: 40,
} as const;
