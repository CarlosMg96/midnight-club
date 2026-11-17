import type { AbstractEngine } from '@babylonjs/core';
import { describe, expect, it, vi } from 'vitest';
import {
  EngineFactory,
  parseBackendPreference,
  type EngineInfoSnapshot,
  type EngineProvider,
} from '../src/engine/EngineFactory';

interface MockEngineState {
  scaling: number;
  info: EngineInfoSnapshot;
  maxTextureSize: number;
}

function createFakeEngine(state: MockEngineState): AbstractEngine {
  const fake = {
    description: state.info.renderer,
    setHardwareScalingLevel(level: number): void {
      state.scaling = level;
    },
    getHardwareScalingLevel(): number {
      return state.scaling;
    },
    getInfo(): EngineInfoSnapshot {
      return state.info;
    },
    getCaps(): { maxTextureSize: number } {
      return { maxTextureSize: state.maxTextureSize };
    },
    dispose(): void {},
  };

  return fake as unknown as AbstractEngine;
}

describe('EngineFactory', () => {
  it('detecta preferencia de backend en query params', () => {
    expect(parseBackendPreference('?backend=webgl2')).toBe('WebGL2');
    expect(parseBackendPreference('?backend=webgpu')).toBe('WebGPU');
    expect(parseBackendPreference('?foo=bar')).toBeUndefined();
    expect(parseBackendPreference('')).toBeUndefined();
  });

  it('inicializa WebGPU cuando está disponible y funciona correctamente', async () => {
    const canvas = document.createElement('canvas');
    const webgpuEngine = createFakeEngine({
      scaling: 1,
      info: { vendor: 'apple', renderer: 'common-3', version: 'Apple M1' },
      maxTextureSize: 8192,
    });

    const provider: EngineProvider = {
      isWebGPUSupported: vi.fn(async () => true),
      createWebGPUEngine: vi.fn(async () => webgpuEngine),
      createWebGLEngine: vi.fn(() => {
        throw new Error('No debería llamarse WebGL2');
      }),
    };

    const result = await EngineFactory.create(canvas, {
      provider,
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
    });

    expect(result.engine).toBe(webgpuEngine);
    expect(result.diagnostics.backend).toBe('WebGPU');
    expect(result.diagnostics.isFallback).toBe(false);
    expect(result.diagnostics.recommendedProfile).toBe('BALANCED');
    expect(result.diagnostics.maxTextureSize).toBe(8192);
    expect(provider.createWebGPUEngine).toHaveBeenCalledTimes(1);
    expect(provider.createWebGLEngine).not.toHaveBeenCalled();
  });

  it('hace fallback a WebGL 2 cuando WebGPU no está soportado', async () => {
    const canvas = document.createElement('canvas');
    const webglEngine = createFakeEngine({
      scaling: 1,
      info: {
        vendor: 'Google Inc. (Intel)',
        renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630)',
        version: 'WebGL 2.0',
      },
      maxTextureSize: 16384,
    });

    const provider: EngineProvider = {
      isWebGPUSupported: vi.fn(async () => false),
      createWebGPUEngine: vi.fn(async () => {
        throw new Error('No debería intentarse');
      }),
      createWebGLEngine: vi.fn(() => webglEngine),
    };

    const result = await EngineFactory.create(canvas, {
      provider,
      devicePixelRatio: 1,
      hardwareConcurrency: 4,
    });

    expect(result.engine).toBe(webglEngine);
    expect(result.diagnostics.backend).toBe('WebGL2');
    expect(result.diagnostics.isFallback).toBe(true);
    expect(result.diagnostics.fallbackReason).toContain('no está disponible');
    expect(result.diagnostics.recommendedProfile).toBe('PERFORMANCE');
    expect(provider.createWebGPUEngine).not.toHaveBeenCalled();
    expect(provider.createWebGLEngine).toHaveBeenCalledTimes(1);
  });

  it('hace fallback a WebGL 2 si la inicialización de WebGPU lanza un error', async () => {
    const canvas = document.createElement('canvas');
    const webglEngine = createFakeEngine({
      scaling: 1,
      info: { vendor: 'AMD', renderer: 'AMD Radeon(TM) Graphics', version: 'WebGL 2.0' },
      maxTextureSize: 8192,
    });

    const provider: EngineProvider = {
      isWebGPUSupported: vi.fn(async () => true),
      createWebGPUEngine: vi.fn(async () => {
        throw new Error('No se pudo obtener GPUAdapter');
      }),
      createWebGLEngine: vi.fn(() => webglEngine),
    };

    const result = await EngineFactory.create(canvas, {
      provider,
      devicePixelRatio: 1,
      hardwareConcurrency: 8,
    });

    expect(result.diagnostics.backend).toBe('WebGL2');
    expect(result.diagnostics.isFallback).toBe(true);
    expect(result.diagnostics.fallbackReason).toContain('No se pudo obtener GPUAdapter');
    expect(result.diagnostics.recommendedProfile).toBe('BALANCED');
  });

  it('respeta preferredBackend WebGL2 sin intentar WebGPU', async () => {
    const canvas = document.createElement('canvas');
    const webglEngine = createFakeEngine({
      scaling: 1,
      info: { vendor: 'Apple', renderer: 'Apple M1', version: 'WebGL 2.0' },
      maxTextureSize: 8192,
    });

    const provider: EngineProvider = {
      isWebGPUSupported: vi.fn(async () => true),
      createWebGPUEngine: vi.fn(async () => {
        throw new Error('No debería intentarse');
      }),
      createWebGLEngine: vi.fn(() => webglEngine),
    };

    const result = await EngineFactory.create(canvas, {
      provider,
      searchParams: '?backend=webgl2',
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
    });

    expect(result.diagnostics.backend).toBe('WebGL2');
    expect(result.diagnostics.isFallback).toBe(false);
    expect(provider.isWebGPUSupported).not.toHaveBeenCalled();
    expect(provider.createWebGPUEngine).not.toHaveBeenCalled();
  });

  it('propaga un error claro si fallan tanto WebGPU como WebGL 2', async () => {
    const canvas = document.createElement('canvas');
    const provider: EngineProvider = {
      isWebGPUSupported: vi.fn(async () => false),
      createWebGPUEngine: vi.fn(async () => {
        throw new Error('No WebGPU');
      }),
      createWebGLEngine: vi.fn(() => {
        throw new Error('WebGL2 context lost');
      }),
    };

    await expect(EngineFactory.create(canvas, { provider })).rejects.toThrow(
      /No se pudo inicializar ni WebGPU ni WebGL 2/,
    );
  });
});
