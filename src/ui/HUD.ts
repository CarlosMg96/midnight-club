import { GAME_SUBTITLE, GAME_TITLE } from '../config/GameConfig';
import {
  getGraphicsProfileSettings,
  QUALITY_PROFILE_ORDER,
  type QualityProfile,
} from '../config/GraphicsConfig';
import type { DeviceDiagnostics } from '../engine/EngineFactory';
import type { PerformanceSnapshot } from '../engine/PerformanceManager';

export interface HudOptions {
  readonly root: HTMLElement;
  readonly diagnostics: DeviceDiagnostics;
  readonly initialProfile: QualityProfile;
  readonly onProfileSelect: (profile: QualityProfile) => void;
}

/**
 * Interfaz HTML superpuesta e independiente de la escena 3D para telemetría
 * del motor gráfico y conmutación en caliente del perfil de calidad.
 */
export class HUD {
  private readonly root: HTMLElement;
  private readonly onProfileSelect: (profile: QualityProfile) => void;
  private readonly fpsValueEl: HTMLElement;
  private readonly frameTimeValueEl: HTMLElement;
  private readonly scalingValueEl: HTMLElement;
  private readonly profileDescEl: HTMLElement;
  private readonly liveStatusEl: HTMLElement;
  private readonly profileButtons = new Map<QualityProfile, HTMLButtonElement>();
  private currentProfile: QualityProfile;

  public constructor(options: HudOptions) {
    this.root = options.root;
    this.onProfileSelect = options.onProfileSelect;
    this.currentProfile = options.initialProfile;

    this.root.replaceChildren();

    const header = document.createElement('header');
    header.className = 'hud-header';

    const title = document.createElement('h1');
    title.className = 'hud-title';
    title.textContent = GAME_TITLE;

    const subtitle = document.createElement('p');
    subtitle.className = 'hud-subtitle';
    subtitle.textContent = GAME_SUBTITLE;

    header.append(title, subtitle);

    const panel = document.createElement('aside');
    panel.className = 'hud-panel';
    panel.setAttribute('aria-label', 'Diagnóstico gráfico y perfiles de rendimiento');

    const sectionTitle = document.createElement('h2');
    sectionTitle.className = 'hud-section-title';
    sectionTitle.textContent = 'Diagnóstico del motor';

    const metrics = document.createElement('dl');
    metrics.className = 'hud-metrics';

    const backendLabel = options.diagnostics.isFallback
      ? `${options.diagnostics.backend} (Fallback)`
      : `${options.diagnostics.backend} (Nativo)`;

    const backendIcon = options.diagnostics.backend === 'WebGPU' ? '⚡' : '◆';
    const backendMetric = this.createMetricItem(
      'Backend gráfico',
      `${backendIcon} ${backendLabel}`,
    );
    const fpsMetric = this.createMetricItem('FPS promedio', '-- FPS');
    const frameTimeMetric = this.createMetricItem('Tiempo de cuadro', '-- ms');
    const scalingMetric = this.createMetricItem(
      'Escalado hardware',
      `${options.diagnostics.hardwareScalingLevel.toFixed(2)}x`,
    );
    const gpuMetric = this.createMetricItem(
      'Adaptador GPU',
      `${options.diagnostics.renderer} (${options.diagnostics.vendor})`,
      true,
    );

    this.fpsValueEl = fpsMetric.valueEl;
    this.frameTimeValueEl = frameTimeMetric.valueEl;
    this.scalingValueEl = scalingMetric.valueEl;

    metrics.append(
      backendMetric.container,
      fpsMetric.container,
      frameTimeMetric.container,
      scalingMetric.container,
      gpuMetric.container,
    );

    panel.append(sectionTitle, metrics);

    if (options.diagnostics.isFallback && options.diagnostics.fallbackReason) {
      const fallbackNote = document.createElement('p');
      fallbackNote.className = 'hud-fallback-note';
      fallbackNote.textContent = `Aviso: ${options.diagnostics.fallbackReason}`;
      panel.append(fallbackNote);
    }

    const profileHeading = document.createElement('h2');
    profileHeading.className = 'hud-section-title';
    profileHeading.textContent = 'Perfil de calidad gráfica';

    const profileGroup = document.createElement('div');
    profileGroup.className = 'hud-profile-group';
    profileGroup.setAttribute('role', 'group');
    profileGroup.setAttribute('aria-label', 'Seleccionar perfil de calidad gráfica');

    for (const profile of QUALITY_PROFILE_ORDER) {
      const settings = getGraphicsProfileSettings(profile);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-profile-btn';
      button.textContent = settings.label;
      button.dataset.profile = profile;
      button.setAttribute('aria-pressed', String(profile === this.currentProfile));
      button.addEventListener('click', () => {
        this.selectProfile(profile);
      });
      this.profileButtons.set(profile, button);
      profileGroup.append(button);
    }

    this.profileDescEl = document.createElement('p');
    this.profileDescEl.className = 'hud-profile-desc';
    this.profileDescEl.textContent = getGraphicsProfileSettings(this.currentProfile).description;

    this.liveStatusEl = document.createElement('div');
    this.liveStatusEl.className = 'visually-hidden';
    this.liveStatusEl.setAttribute('role', 'status');
    this.liveStatusEl.setAttribute('aria-live', 'polite');

    panel.append(profileHeading, profileGroup, this.profileDescEl, this.liveStatusEl);
    this.root.append(header, panel);
  }

  public updateMetrics(snapshot: PerformanceSnapshot, hardwareScalingLevel: number): void {
    if (snapshot.sampleCount === 0) {
      return;
    }

    const statusIcon =
      snapshot.status === 'OPTIMAL' ? '●' : snapshot.status === 'ACCEPTABLE' ? '▲' : '■';
    const statusClass =
      snapshot.status === 'OPTIMAL'
        ? 'hud-badge--optimal'
        : snapshot.status === 'ACCEPTABLE'
          ? 'hud-badge--acceptable'
          : 'hud-badge--low';

    this.fpsValueEl.className = `hud-badge ${statusClass}`;
    this.fpsValueEl.textContent = `${statusIcon} ${Math.round(snapshot.averageFps)} FPS (${snapshot.status})`;
    this.frameTimeValueEl.textContent = `${snapshot.frameTimeMs.toFixed(1)} ms`;
    this.scalingValueEl.textContent = `${hardwareScalingLevel.toFixed(2)}x`;
  }

  public selectProfile(profile: QualityProfile): void {
    if (profile === this.currentProfile) {
      return;
    }

    this.currentProfile = profile;
    for (const [key, btn] of this.profileButtons) {
      btn.setAttribute('aria-pressed', String(key === profile));
    }

    const settings = getGraphicsProfileSettings(profile);
    this.profileDescEl.textContent = settings.description;
    this.scalingValueEl.textContent = `${settings.hardwareScalingLevel.toFixed(2)}x`;
    this.liveStatusEl.textContent = `Perfil gráfico cambiado a ${settings.label}.`;
    this.onProfileSelect(profile);
  }

  public dispose(): void {
    this.root.replaceChildren();
    this.profileButtons.clear();
  }

  public static renderFatalError(root: HTMLElement, message: string): void {
    root.replaceChildren();
    const box = document.createElement('section');
    box.className = 'hud-error';
    box.setAttribute('role', 'alert');

    const heading = document.createElement('h2');
    heading.textContent = 'Error al inicializar el motor gráfico';

    const detail = document.createElement('p');
    detail.textContent = message;

    box.append(heading, detail);
    root.append(box);
  }

  private createMetricItem(
    label: string,
    initialValue: string,
    wide = false,
  ): { container: HTMLDivElement; valueEl: HTMLElement } {
    const container = document.createElement('div');
    container.className = wide ? 'hud-metric hud-metric--wide' : 'hud-metric';

    const dt = document.createElement('dt');
    dt.textContent = label;

    const dd = document.createElement('dd');
    dd.textContent = initialValue;

    container.append(dt, dd);
    return { container, valueEl: dd };
  }
}
