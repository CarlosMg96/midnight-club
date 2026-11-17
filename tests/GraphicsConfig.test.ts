import { describe, expect, it } from 'vitest';
import {
  detectRecommendedProfile,
  getGraphicsProfileSettings,
  GRAPHICS_PROFILES,
  QUALITY_PROFILE_ORDER,
} from '../src/config/GraphicsConfig';

describe('GraphicsConfig', () => {
  it('define los tres perfiles de calidad con escalado progresivo', () => {
    expect(QUALITY_PROFILE_ORDER).toEqual(['QUALITY', 'BALANCED', 'PERFORMANCE']);

    const quality = getGraphicsProfileSettings('QUALITY');
    const balanced = getGraphicsProfileSettings('BALANCED');
    const performance = getGraphicsProfileSettings('PERFORMANCE');

    expect(quality.hardwareScalingLevel).toBeLessThan(balanced.hardwareScalingLevel);
    expect(balanced.hardwareScalingLevel).toBeLessThan(performance.hardwareScalingLevel);

    expect(quality.shadowMapSize).toBeGreaterThan(balanced.shadowMapSize);
    expect(balanced.shadowMapSize).toBeGreaterThan(performance.shadowMapSize);

    expect(quality.maxDrawDistance).toBeGreaterThan(balanced.maxDrawDistance);
    expect(balanced.maxDrawDistance).toBeGreaterThan(performance.maxDrawDistance);

    expect(quality.planarReflections).toBe(true);
    expect(quality.reflectionMapSize).toBeGreaterThan(balanced.reflectionMapSize);
    expect(balanced.planarReflections).toBe(true);
    expect(performance.planarReflections).toBe(false);
    expect(performance.reflectionMapSize).toBe(0);

    expect(quality.bloomEnabled).toBe(true);
    expect(quality.glowEnabled).toBe(true);
    expect(quality.particleScale).toBeGreaterThan(balanced.particleScale);
    expect(balanced.particleScale).toBeGreaterThan(performance.particleScale);

    expect(GRAPHICS_PROFILES.PERFORMANCE.antialiasing).toBe(false);
    expect(GRAPHICS_PROFILES.PERFORMANCE.bloomEnabled).toBe(false);
    expect(GRAPHICS_PROFILES.PERFORMANCE.glowEnabled).toBe(false);
    expect(GRAPHICS_PROFILES.PERFORMANCE.fxaaEnabled).toBe(false);
  });

  it('asigna PERFORMANCE a GPUs integradas modestas como Intel UHD o renderizadores por software', () => {
    expect(detectRecommendedProfile('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', 8)).toBe(
      'PERFORMANCE',
    );
    expect(detectRecommendedProfile('Google SwiftShader', 8)).toBe('PERFORMANCE');
    expect(detectRecommendedProfile('llvmpipe (LLVM 15.0.7, 256 bits)', 4)).toBe('PERFORMANCE');
  });

  it('asigna BALANCED en Apple Silicon o GPU dedicada sin forzar QUALITY automáticamente', () => {
    expect(detectRecommendedProfile('Apple M1', 8)).toBe('BALANCED');
    expect(detectRecommendedProfile('NVIDIA GeForce RTX 4070', 16)).toBe('BALANCED');
    expect(detectRecommendedProfile('AMD Radeon(TM) Graphics', 8)).toBe('BALANCED');
  });

  it('degrada a PERFORMANCE en hardware con muy pocos núcleos o Radeon integrada de gama baja', () => {
    expect(detectRecommendedProfile('AMD Radeon(TM) Graphics', 4)).toBe('PERFORMANCE');
    expect(detectRecommendedProfile('Generic GPU', 2)).toBe('PERFORMANCE');
  });
});
