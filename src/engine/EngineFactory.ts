import { Engine, WebGPUEngine, type AbstractEngine } from '@babylonjs/core';
import {
  detectRecommendedProfile,
  getGraphicsProfileSettings,
  type GraphicsBackend,
  type QualityProfile,
} from '../config/GraphicsConfig';

export interface EngineInfoSnapshot {
  readonly vendor: string;
  readonly renderer: string;
  readonly version: string;
}

export interface DeviceDiagnostics {
  readonly backend: GraphicsBackend;
  readonly isFallback: boolean;
  readonly fallbackReason: string | null;
  readonly vendor: string;
  readonly renderer: string;
  readonly version: string;
  readonly hardwareScalingLevel: number;
  readonly maxTextureSize: number;
  readonly recommendedProfile: QualityProfile;
}

export interface EngineProvider {
  readonly isWebGPUSupported: () => Promise<boolean>;
  readonly createWebGPUEngine: (
    canvas: HTMLCanvasElement,
    antialias: boolean,
  ) => Promise<AbstractEngine>;
  readonly createWebGLEngine: (canvas: HTMLCanvasElement, antialias: boolean) => AbstractEngine;
}

export interface EngineCreationOptions {
  readonly preferredBackend?: GraphicsBackend;
  readonly antialias?: boolean;
  readonly searchParams?: string;
  readonly hardwareConcurrency?: number;
  readonly devicePixelRatio?: number;
  readonly provider?: EngineProvider;
}

export interface EngineCreationResult {
  readonly engine: AbstractEngine;
  readonly diagnostics: DeviceDiagnostics;
}

interface EngineWithInfo {
  getInfo: () => EngineInfoSnapshot;
}

function hasGetInfo(engine: AbstractEngine): engine is AbstractEngine & EngineWithInfo {
  return 'getInfo' in engine && typeof (engine as Partial<EngineWithInfo>).getInfo === 'function';
}

const DEFAULT_PROVIDER: EngineProvider = {
  async isWebGPUSupported(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
      return false;
    }
    try {
      return await WebGPUEngine.IsSupportedAsync;
    } catch {
      return false;
    }
  },

  async createWebGPUEngine(canvas: HTMLCanvasElement, antialias: boolean): Promise<AbstractEngine> {
    const engine = new WebGPUEngine(canvas, {
      antialias,
      adaptToDeviceRatio: true,
      powerPreference: 'high-performance',
    });
    try {
      await engine.initAsync();
      return engine;
    } catch (error) {
      engine.dispose();
      throw error;
    }
  },

  createWebGLEngine(canvas: HTMLCanvasElement, antialias: boolean): AbstractEngine {
    return new Engine(
      canvas,
      antialias,
      {
        preserveDrawingBuffer: false,
        stencil: true,
        powerPreference: 'high-performance',
      },
      true,
    );
  },
};

export function parseBackendPreference(search?: string): GraphicsBackend | undefined {
  const rawSearch =
    search !== undefined ? search : typeof window !== 'undefined' ? window.location.search : '';
  if (!rawSearch) {
    return undefined;
  }

  const params = new URLSearchParams(rawSearch);
  const value = params.get('backend')?.trim().toLowerCase();
  if (value === 'webgl2' || value === 'webgl') {
    return 'WebGL2';
  }
  if (value === 'webgpu') {
    return 'WebGPU';
  }
  return undefined;
}

/**
 * Fábrica encargada de detectar WebGPU, inicializarlo de forma segura,
 * gestionar errores con fallback a WebGL 2 y exponer diagnósticos del dispositivo.
 */
export class EngineFactory {
  public static async isWebGPUSupported(
    provider: EngineProvider = DEFAULT_PROVIDER,
  ): Promise<boolean> {
    try {
      return await provider.isWebGPUSupported();
    } catch {
      return false;
    }
  }

  public static async create(
    canvas: HTMLCanvasElement,
    options: EngineCreationOptions = {},
  ): Promise<EngineCreationResult> {
    const provider = options.provider ?? DEFAULT_PROVIDER;
    const antialias = options.antialias ?? true;
    const preferredBackend =
      options.preferredBackend ?? parseBackendPreference(options.searchParams);
    const dpr =
      options.devicePixelRatio ??
      (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const concurrency =
      options.hardwareConcurrency ??
      (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined);

    let engine: AbstractEngine | null = null;
    let backend: GraphicsBackend = 'WebGL2';
    let isFallback = false;
    let fallbackReason: string | null = null;

    if (preferredBackend === 'WebGL2') {
      isFallback = false;
      fallbackReason = 'Backend WebGL 2 seleccionado explícitamente.';
    } else {
      const supported = await EngineFactory.isWebGPUSupported(provider);
      if (supported) {
        try {
          engine = await provider.createWebGPUEngine(canvas, antialias);
          backend = 'WebGPU';
        } catch (error) {
          isFallback = true;
          fallbackReason = `Fallo al inicializar WebGPU (${EngineFactory.formatError(error)}); usando WebGL 2.`;
        }
      } else {
        isFallback = true;
        fallbackReason =
          'WebGPU no está disponible en este navegador o dispositivo; usando WebGL 2.';
      }
    }

    if (!engine) {
      try {
        engine = provider.createWebGLEngine(canvas, antialias);
        backend = 'WebGL2';
      } catch (error) {
        throw new Error(
          `No se pudo inicializar ni WebGPU ni WebGL 2: ${EngineFactory.formatError(error)}`,
          { cause: error },
        );
      }
    }

    const info = EngineFactory.extractEngineInfo(engine);
    const combinedAdapterText = `${info.renderer} ${info.version} ${info.vendor}`;
    const recommendedProfile = detectRecommendedProfile(combinedAdapterText, concurrency);
    const appliedScaling = EngineFactory.applyProfile(engine, recommendedProfile, dpr);

    const caps = engine.getCaps();
    const displayRenderer =
      info.renderer !== 'unknown renderer' && info.renderer.trim().length > 0
        ? info.renderer
        : info.version;

    return {
      engine,
      diagnostics: {
        backend,
        isFallback,
        fallbackReason,
        vendor: info.vendor,
        renderer: displayRenderer,
        version: info.version,
        hardwareScalingLevel: appliedScaling,
        maxTextureSize: caps?.maxTextureSize ?? 0,
        recommendedProfile,
      },
    };
  }

  public static applyProfile(
    engine: AbstractEngine,
    profile: QualityProfile,
    devicePixelRatio?: number,
  ): number {
    const settings = getGraphicsProfileSettings(profile);
    const dpr =
      devicePixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const normalizedBase = 1 / Math.min(Math.max(dpr, 1), 2);
    const effectiveScaling = Number((normalizedBase * settings.hardwareScalingLevel).toFixed(3));
    engine.setHardwareScalingLevel(effectiveScaling);
    return engine.getHardwareScalingLevel();
  }

  private static extractEngineInfo(engine: AbstractEngine): EngineInfoSnapshot {
    if (hasGetInfo(engine)) {
      const info = engine.getInfo();
      return {
        vendor: info.vendor || 'Desconocido',
        renderer: info.renderer || engine.description || 'Desconocido',
        version: info.version || 'Desconocido',
      };
    }

    return {
      vendor: 'Desconocido',
      renderer: engine.description || 'Desconocido',
      version: 'Desconocido',
    };
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
