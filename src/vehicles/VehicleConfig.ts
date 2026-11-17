export type VehicleModelId = 'TSURU_B13' | 'CONCEPT_GT';

export type PaintPresetId =
  | 'PLATA_AGENCIA'
  | 'TAXI_CDMX_ROSA'
  | 'TAXI_VERDE'
  | 'MIDNIGHT_BLACK'
  | 'ROJO_GSR';

export type BodyKitId = 'STOCK' | 'STREET_TUNER' | 'MIDNIGHT_GT';

export type WheelStyleId = 'TAPONES_STOCK' | 'BBS_GOLD' | 'CHROME_SPORT';

export type UnderglowColorId = 'OFF' | 'CYAN' | 'MAGENTA' | 'ORANGE' | 'GREEN';

export type EngineStageId = 'STOCK_16L' | 'GSR_2000_TURBO' | 'SR20DET_SWAP';

export type StanceId = 'STOCK' | 'LOWERED' | 'DRIFT_SPEC';

export interface TuningConfig {
  readonly vehicleId: VehicleModelId;
  readonly paintPreset: PaintPresetId;
  readonly bodyKit: BodyKitId;
  readonly wheelStyle: WheelStyleId;
  readonly underglow: UnderglowColorId;
  readonly engineStage: EngineStageId;
  readonly stance: StanceId;
}

export interface VehicleSpecs {
  readonly massKg: number;
  readonly maxEngineAcceleration: number;
  readonly reverseAcceleration: number;
  readonly maxSpeedMs: number;
  readonly brakeDeceleration: number;
  readonly aeroDrag: number;
  readonly rollingResistance: number;
  readonly maxSteerAngleRad: number;
  readonly lateralGrip: number;
  readonly driftLateralGrip: number;
  readonly nitroMultiplier: number;
  readonly rideHeightOffset: number;
  readonly wheelCamberRad: number;
}

export interface PaintPresetSpec {
  readonly id: PaintPresetId;
  readonly label: string;
  readonly primaryHex: string;
  readonly roofHex: string;
  readonly metallic: number;
  readonly roughness: number;
}

export const PAINT_PRESETS: Readonly<Record<PaintPresetId, PaintPresetSpec>> = {
  PLATA_AGENCIA: {
    id: 'PLATA_AGENCIA',
    label: 'Plata Agencia',
    primaryHex: '#b8c0cc',
    roofHex: '#b8c0cc',
    metallic: 0.82,
    roughness: 0.22,
  },
  TAXI_CDMX_ROSA: {
    id: 'TAXI_CDMX_ROSA',
    label: 'Taxi CDMX Rosa',
    primaryHex: '#df1c6e',
    roofHex: '#f1f4f8',
    metallic: 0.45,
    roughness: 0.26,
  },
  TAXI_VERDE: {
    id: 'TAXI_VERDE',
    label: 'Taxi Clásico Verde',
    primaryHex: '#0d8a47',
    roofHex: '#f1f4f8',
    metallic: 0.42,
    roughness: 0.28,
  },
  MIDNIGHT_BLACK: {
    id: 'MIDNIGHT_BLACK',
    label: 'Negro Obsidiana',
    primaryHex: '#151924',
    roofHex: '#151924',
    metallic: 0.88,
    roughness: 0.16,
  },
  ROJO_GSR: {
    id: 'ROJO_GSR',
    label: 'Rojo Deportivo GSR',
    primaryHex: '#c81828',
    roofHex: '#c81828',
    metallic: 0.72,
    roughness: 0.18,
  },
};

export const ENGINE_STAGE_SPECS: Readonly<
  Record<EngineStageId, { label: string; accelMultiplier: number; topSpeedMs: number }>
> = {
  STOCK_16L: {
    label: '1.6L GA16DE Stock',
    accelMultiplier: 1.0,
    topSpeedMs: 42, // ~151 km/h
  },
  GSR_2000_TURBO: {
    label: '2.0L GSR Turbo',
    accelMultiplier: 1.38,
    topSpeedMs: 56, // ~202 km/h
  },
  SR20DET_SWAP: {
    label: 'SR20DET Swap Stage 3',
    accelMultiplier: 1.82,
    topSpeedMs: 70, // ~252 km/h
  },
};

export const UNDERGLOW_COLORS: Readonly<
  Record<UnderglowColorId, { label: string; hex: string | null }>
> = {
  OFF: { label: 'Apagado', hex: null },
  CYAN: { label: 'Neón Cian', hex: '#14e8ff' },
  MAGENTA: { label: 'Neón Rosa CDMX', hex: '#ff2b8a' },
  ORANGE: { label: 'Neón Ámbar', hex: '#ff6a14' },
  GREEN: { label: 'Neón Verde', hex: '#26ff7e' },
};

export const DEFAULT_TUNING_CONFIG: TuningConfig = {
  vehicleId: 'TSURU_B13',
  paintPreset: 'PLATA_AGENCIA',
  bodyKit: 'STOCK',
  wheelStyle: 'TAPONES_STOCK',
  underglow: 'OFF',
  engineStage: 'STOCK_16L',
  stance: 'STOCK',
};

/**
 * Calcula los parámetros físicos efectivos del vehículo combinando plataforma,
 * stage de motor, kit aerodinámico y configuración de suspensión.
 */
export function computeEffectiveVehicleSpecs(tuning: TuningConfig): VehicleSpecs {
  const isConcept = tuning.vehicleId === 'CONCEPT_GT';
  const stage = ENGINE_STAGE_SPECS[tuning.engineStage];

  const baseAccel = isConcept ? 19.5 : 14.5;
  const baseSpeed = isConcept ? stage.topSpeedMs + 8 : stage.topSpeedMs;
  const kitGripBonus = tuning.bodyKit === 'MIDNIGHT_GT' ? 1.16 : tuning.bodyKit === 'STREET_TUNER' ? 1.08 : 1.0;

  let rideHeightOffset = 0;
  let wheelCamberRad = 0;
  let driftMultiplier = 1.0;

  if (tuning.stance === 'LOWERED') {
    rideHeightOffset = -0.045;
    wheelCamberRad = 0.025;
  } else if (tuning.stance === 'DRIFT_SPEC') {
    rideHeightOffset = -0.06;
    wheelCamberRad = 0.065;
    driftMultiplier = 0.78;
  }

  return {
    massKg: isConcept ? 1280 : 1040,
    maxEngineAcceleration: baseAccel * stage.accelMultiplier,
    reverseAcceleration: 9.5,
    maxSpeedMs: baseSpeed,
    brakeDeceleration: 24.0,
    aeroDrag: tuning.bodyKit === 'MIDNIGHT_GT' ? 0.0022 : 0.0019,
    rollingResistance: 0.45,
    maxSteerAngleRad: 0.52,
    lateralGrip: 9.2 * kitGripBonus,
    driftLateralGrip: 3.1 * driftMultiplier,
    nitroMultiplier: 1.45,
    rideHeightOffset,
    wheelCamberRad,
  };
}
