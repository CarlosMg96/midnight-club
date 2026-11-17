export const GAME_TITLE = 'Midnight Club: CDMX';
export const GAME_SUBTITLE = 'Paseo de la Reforma · Glorieta del Ángel';

/** Paso de tiempo fijo preparado para simulación física determinista (60 Hz). */
export const FIXED_TIME_STEP = 1 / 60;

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
  roadWidth: 36,
  sidewalkWidth: 6.0,
  streetLightSpacing: 36,
  buildingRowOffset: 26,
  angelPosition: { x: 0, z: 75 },
  roundaboutIslandRadius: 12.5,
  roundaboutCollisionRadius: 13.0,
  playerSpawn: { x: -7.5, y: 0, z: -12, heading: 0 },
} as const;

export const INITIAL_CAMERA_CONFIG = {
  alpha: -Math.PI / 2,
  beta: 1.24,
  radius: 7.4,
  target: { x: -7.5, y: 1.15, z: -12 },
  lowerBetaLimit: 0.22,
  upperBetaLimit: Math.PI / 2 - 0.04,
  lowerRadiusLimit: 4.5,
  upperRadiusLimit: 40,
} as const;
