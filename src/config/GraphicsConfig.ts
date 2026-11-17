export type QualityProfile = 'QUALITY' | 'BALANCED' | 'PERFORMANCE';

export type GraphicsBackend = 'WebGPU' | 'WebGL2';

export interface GraphicsProfileSettings {
  readonly profile: QualityProfile;
  readonly label: string;
  readonly description: string;
  readonly hardwareScalingLevel: number;
  readonly antialiasing: boolean;
  readonly shadowsEnabled: boolean;
  readonly shadowMapSize: number;
  readonly softShadows: boolean;
  readonly maxDrawDistance: number;
  readonly streetLightCount: number;
  readonly environmentIntensity: number;
  readonly fogDensity: number;
  readonly planarReflections: boolean;
  readonly reflectionMapSize: number;
  readonly bloomEnabled: boolean;
  readonly glowEnabled: boolean;
  readonly fxaaEnabled: boolean;
  readonly particleScale: number;
}

export const GRAPHICS_PROFILES: Readonly<Record<QualityProfile, GraphicsProfileSettings>> = {
  QUALITY: {
    profile: 'QUALITY',
    label: 'Quality',
    description:
      'Resolución nativa, reflejos planares 1024 px, bloom, glow neón y sombras de 2048 px (60 FPS objetivo).',
    hardwareScalingLevel: 1.0,
    antialiasing: true,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    softShadows: true,
    maxDrawDistance: 440,
    streetLightCount: 8,
    environmentIntensity: 1.25,
    fogDensity: 0.0028,
    planarReflections: true,
    reflectionMapSize: 1024,
    bloomEnabled: true,
    glowEnabled: true,
    fxaaEnabled: true,
    particleScale: 1.0,
  },
  BALANCED: {
    profile: 'BALANCED',
    label: 'Balanced',
    description:
      'Reflejos planares 512 px, bloom y glow selectivos, sombras de 1024 px (30-60 FPS).',
    hardwareScalingLevel: 1.25,
    antialiasing: true,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    softShadows: false,
    maxDrawDistance: 320,
    streetLightCount: 6,
    environmentIntensity: 1.05,
    fogDensity: 0.0038,
    planarReflections: true,
    reflectionMapSize: 512,
    bloomEnabled: true,
    glowEnabled: true,
    fxaaEnabled: true,
    particleScale: 0.6,
  },
  PERFORMANCE: {
    profile: 'PERFORMANCE',
    label: 'Performance',
    description:
      'Resolución reducida, sin reflejos planares ni postprocesado costoso (30 FPS estables).',
    hardwareScalingLevel: 1.5,
    antialiasing: false,
    shadowsEnabled: true,
    shadowMapSize: 512,
    softShadows: false,
    maxDrawDistance: 260,
    streetLightCount: 4,
    environmentIntensity: 0.85,
    fogDensity: 0.0052,
    planarReflections: false,
    reflectionMapSize: 0,
    bloomEnabled: false,
    glowEnabled: false,
    fxaaEnabled: false,
    particleScale: 0.25,
  },
};

export const QUALITY_PROFILE_ORDER: readonly QualityProfile[] = [
  'QUALITY',
  'BALANCED',
  'PERFORMANCE',
];

export function getGraphicsProfileSettings(profile: QualityProfile): GraphicsProfileSettings {
  return GRAPHICS_PROFILES[profile];
}

/**
 * Recomienda un perfil gráfico conservador según el adaptador reportado.
 * Nunca fuerza QUALITY automáticamente por el mero hecho de usar WebGPU o Apple Silicon.
 */
export function detectRecommendedProfile(
  rendererInfo: string,
  hardwareConcurrency?: number,
): QualityProfile {
  const normalized = rendererInfo.trim().toLowerCase();

  const isSoftwareOrLowIntegrated =
    normalized.includes('swiftshader') ||
    normalized.includes('llvmpipe') ||
    normalized.includes('microsoft basic render') ||
    normalized.includes('intel(r) uhd') ||
    normalized.includes('intel uhd') ||
    normalized.includes('intel(r) hd graphics') ||
    normalized.includes('intel hd graphics');

  if (isSoftwareOrLowIntegrated) {
    return 'PERFORMANCE';
  }

  if (hardwareConcurrency !== undefined && hardwareConcurrency > 0 && hardwareConcurrency <= 2) {
    return 'PERFORMANCE';
  }

  const isMidIntegrated =
    normalized.includes('radeon(tm) graphics') ||
    normalized.includes('radeon vega') ||
    normalized.includes('intel(r) iris') ||
    normalized.includes('intel iris');

  if (isMidIntegrated && hardwareConcurrency !== undefined && hardwareConcurrency <= 4) {
    return 'PERFORMANCE';
  }

  return 'BALANCED';
}
