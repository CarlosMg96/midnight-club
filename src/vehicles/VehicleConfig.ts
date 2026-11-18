export type VehicleModelId =
  'NISSAN_TSURU' | 'NISSAN_GTR_R34' | 'AUDI_R8' | 'MERCEDES_AMG_GT' | 'CONCEPT_GT';

export type PaintPresetId =
  | 'PLATA_AGENCIA'
  | 'AZUL_BAYSIDE_R34'
  | 'GRIS_SUZUKA_AUDI'
  | 'VERDE_AMG_HELL'
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

export interface VehicleCatalogEntry {
  readonly id: VehicleModelId;
  readonly brand: 'Nissan' | 'Audi' | 'Mercedes-Benz' | 'Concept';
  readonly label: string;
  readonly defaultPaint: PaintPresetId;
  readonly massKg: number;
  readonly baseAccel: number;
  readonly speedBonusMs: number;
  readonly gripBonus: number;
}

export const VEHICLE_CATALOG: Readonly<Record<VehicleModelId, VehicleCatalogEntry>> = {
  NISSAN_TSURU: {
    id: 'NISSAN_TSURU',
    brand: 'Nissan',
    label: 'Nissan Tsuru B13',
    defaultPaint: 'PLATA_AGENCIA',
    massKg: 1040,
    baseAccel: 14.5,
    speedBonusMs: 0,
    gripBonus: 1.0,
  },
  NISSAN_GTR_R34: {
    id: 'NISSAN_GTR_R34',
    brand: 'Nissan',
    label: 'Nissan Skyline GT-R (R34)',
    defaultPaint: 'AZUL_BAYSIDE_R34',
    massKg: 1540,
    baseAccel: 20.5,
    speedBonusMs: 11,
    gripBonus: 1.18,
  },
  AUDI_R8: {
    id: 'AUDI_R8',
    brand: 'Audi',
    label: 'Audi R8 V10 Plus',
    defaultPaint: 'GRIS_SUZUKA_AUDI',
    massKg: 1595,
    baseAccel: 22.0,
    speedBonusMs: 14,
    gripBonus: 1.22,
  },
  MERCEDES_AMG_GT: {
    id: 'MERCEDES_AMG_GT',
    brand: 'Mercedes-Benz',
    label: 'Mercedes-AMG GT R',
    defaultPaint: 'VERDE_AMG_HELL',
    massKg: 1630,
    baseAccel: 21.5,
    speedBonusMs: 13,
    gripBonus: 1.15,
  },
  CONCEPT_GT: {
    id: 'CONCEPT_GT',
    brand: 'Concept',
    label: 'Concept GT (.glb)',
    defaultPaint: 'ROJO_GSR',
    massKg: 1280,
    baseAccel: 20.0,
    speedBonusMs: 9,
    gripBonus: 1.1,
  },
};

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
    label: 'Plata Agencia (Nissan)',
    primaryHex: '#b8c0cc',
    roofHex: '#b8c0cc',
    metallic: 0.84,
    roughness: 0.2,
  },
  AZUL_BAYSIDE_R34: {
    id: 'AZUL_BAYSIDE_R34',
    label: 'Azul Bayside (Skyline R34)',
    primaryHex: '#1054d4',
    roofHex: '#1054d4',
    metallic: 0.86,
    roughness: 0.16,
  },
  GRIS_SUZUKA_AUDI: {
    id: 'GRIS_SUZUKA_AUDI',
    label: 'Gris Suzuka (Audi R8)',
    primaryHex: '#d5dce5',
    roofHex: '#171b24',
    metallic: 0.78,
    roughness: 0.18,
  },
  VERDE_AMG_HELL: {
    id: 'VERDE_AMG_HELL',
    label: 'Verde Green Hell (AMG GT)',
    primaryHex: '#25a844',
    roofHex: '#12161d',
    metallic: 0.74,
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
    primaryHex: '#141822',
    roofHex: '#141822',
    metallic: 0.88,
    roughness: 0.15,
  },
  ROJO_GSR: {
    id: 'ROJO_GSR',
    label: 'Rojo Deportivo GSR',
    primaryHex: '#c81828',
    roofHex: '#c81828',
    metallic: 0.76,
    roughness: 0.18,
  },
};

export const ENGINE_STAGE_SPECS: Readonly<
  Record<EngineStageId, { label: string; accelMultiplier: number; topSpeedMs: number }>
> = {
  STOCK_16L: {
    label: 'Stage 1 · Aspirado Stock',
    accelMultiplier: 1.0,
    topSpeedMs: 42,
  },
  GSR_2000_TURBO: {
    label: 'Stage 2 · Twin-Turbo Street',
    accelMultiplier: 1.38,
    topSpeedMs: 56,
  },
  SR20DET_SWAP: {
    label: 'Stage 3 · Swap Race / Biturbo',
    accelMultiplier: 1.82,
    topSpeedMs: 70,
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
  vehicleId: 'NISSAN_TSURU',
  paintPreset: 'PLATA_AGENCIA',
  bodyKit: 'STOCK',
  wheelStyle: 'TAPONES_STOCK',
  underglow: 'OFF',
  engineStage: 'STOCK_16L',
  stance: 'STOCK',
};

/**
 * Calcula los parámetros físicos efectivos combinando vehículo (Nissan/Audi/Mercedes),
 * stage de motor, kit aerodinámico y configuración de suspensión.
 */
export function computeEffectiveVehicleSpecs(tuning: TuningConfig): VehicleSpecs {
  const catalog = VEHICLE_CATALOG[tuning.vehicleId];
  const stage = ENGINE_STAGE_SPECS[tuning.engineStage];
  const kitGripBonus =
    tuning.bodyKit === 'MIDNIGHT_GT' ? 1.15 : tuning.bodyKit === 'STREET_TUNER' ? 1.08 : 1.0;

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
    massKg: catalog.massKg,
    maxEngineAcceleration: catalog.baseAccel * stage.accelMultiplier,
    reverseAcceleration: 10.0,
    maxSpeedMs: stage.topSpeedMs + catalog.speedBonusMs,
    brakeDeceleration: 25.0,
    aeroDrag: tuning.bodyKit === 'MIDNIGHT_GT' ? 0.0021 : 0.00185,
    rollingResistance: 0.45,
    maxSteerAngleRad: 0.52,
    lateralGrip: 9.2 * catalog.gripBonus * kitGripBonus,
    driftLateralGrip: 3.1 * driftMultiplier,
    nitroMultiplier: 1.48,
    rideHeightOffset,
    wheelCamberRad,
  };
}
