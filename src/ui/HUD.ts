import {
  getMetropolitanZone,
  METROPOLITAN_CORRIDORS,
  METROPOLITAN_OPEN_CURVES,
  METROPOLITAN_ROUNDABOUTS,
  METROPOLITAN_ZONE_ORDER,
  METROPOLITAN_ZONES,
  resolveMetropolitanZoneName,
  TEST_AVENUE_CONFIG,
  type MetropolitanZoneId,
} from '../config/GameConfig';
import {
  QUALITY_PROFILE_ORDER,
  getGraphicsProfileSettings,
  type QualityProfile,
} from '../config/GraphicsConfig';
import type { DeviceDiagnostics } from '../engine/EngineFactory';
import type { PerformanceSnapshot } from '../engine/PerformanceManager';
import type { VehiclePhysicsState } from '../physics/VehiclePhysics';
import type { CameraMode } from '../vehicles/VehicleCamera';
import type { RaceSnapshot } from '../world/RaceManager';
import { METROPOLITAN_TRAFFIC_COORDS } from '../world/TrafficManager';

export interface HudOptions {
  readonly root: HTMLElement;
  readonly diagnostics: DeviceDiagnostics;
  readonly initialProfile: QualityProfile;
  readonly onProfileSelect: (profile: QualityProfile) => void;
  readonly onToggleGarage: () => void;
  readonly onCycleCamera: () => void;
  readonly onResetVehicle: () => void;
  readonly onStartRace?: () => void;
  readonly onToggleMute?: () => boolean;
  readonly onSelectZone?: (zoneId: MetropolitanZoneId) => void;
  readonly onMapOpenChange?: (isOpen: boolean) => void;
  readonly onSettingsOpenChange?: (isOpen: boolean) => void;
}

const CAMERA_MODE_LABELS: Readonly<Record<CameraMode, string>> = {
  CHASE_CLOSE: 'Cerca',
  CHASE_FAR: 'Lejos',
  HOOD_CAM: 'Capó',
};

const MINIMAP_SIZE_PX = 204;
const GAUGE_WIDTH_PX = 324;
const GAUGE_HEIGHT_PX = 128;

function scaleHiDpiCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.round(cssWidth * dpr);
  const backingHeight = Math.round(cssHeight * dpr);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function formatRaceTime(elapsedSec: number): string {
  const safeSeconds = Math.max(0, elapsedSec);
  const totalCentis = Math.floor(safeSeconds * 100);
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 100;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/**
 * HUD estilo Midnight Club 3: DUB Edition desacoplado de la escena 3D.
 * Presenta temporizador y posición en esquinas superiores, radar circular con
 * puntero direccional al monumento activo en la esquina inferior izquierda,
 * tacómetro analógico + barra digital + zona ZMVM en la inferior derecha y
 * paneles colapsables de Mapa Metropolitano (CDMX + Edomex) y diagnóstico.
 */
export class HUD {
  private readonly root: HTMLElement;
  private readonly diagnostics: DeviceDiagnostics;
  private readonly onProfileSelect: (profile: QualityProfile) => void;
  private readonly onToggleGarage: () => void;
  private readonly onCycleCamera: () => void;
  private readonly onResetVehicle: () => void;
  private readonly onStartRace?: () => void;
  private readonly onToggleMute?: () => boolean;
  private readonly onSelectZone?: (zoneId: MetropolitanZoneId) => void;
  private readonly onMapOpenChange?: (isOpen: boolean) => void;
  private readonly onSettingsOpenChange?: (isOpen: boolean) => void;

  private readonly timerEl: HTMLElement;
  private readonly lapEl: HTMLElement;
  private readonly posRankEl: HTMLElement;
  private readonly posTotalEl: HTMLElement;
  private readonly miniDiagEl: HTMLElement;
  private readonly raceBannerEl: HTMLElement;
  private readonly pursuitBannerEl: HTMLElement;
  private readonly arrestOverlayEl: HTMLElement;
  private readonly arrestDetailEl: HTMLElement;
  private readonly garageBtn: HTMLButtonElement;
  private readonly raceBtn: HTMLButtonElement;
  private readonly mapBtn: HTMLButtonElement;
  private readonly cameraBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;

  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly gaugeCanvas: HTMLCanvasElement;
  private readonly speedValueEl: HTMLElement;
  private readonly gearValueEl: HTMLElement;
  private readonly stateFlagEl: HTMLElement;
  private readonly streetPlateEl: HTMLElement;

  private readonly mapDrawer: HTMLElement;
  private readonly zoneButtons = new Map<MetropolitanZoneId, HTMLButtonElement>();
  private readonly settingsDrawer: HTMLElement;
  private readonly fpsValueEl: HTMLElement;
  private readonly frameTimeValueEl: HTMLElement;
  private readonly scalingValueEl: HTMLElement;
  private readonly profileDescEl: HTMLElement;
  private readonly statusAnnouncementEl: HTMLElement;
  private readonly profileButtons = new Map<QualityProfile, HTMLButtonElement>();

  private activeProfile: QualityProfile;
  private activeZoneId: MetropolitanZoneId = 'REFORMA_ANGEL';
  private isMapOpen = false;
  private isSettingsOpen = false;
  private isGarageOpen = false;
  private nitroCharge = 1.0;
  private wasPolicePursuit = false;
  private wasArrested = false;
  private lastPursuitText = '';
  private lastArrestDetailText = '';
  private lastRaceBannerText = '';
  private lastLapLabelText = 'LAP 1/2 · ZMVM (CDMX · EDOMEX)';
  private lastVehicleState: VehiclePhysicsState = {
    x: TEST_AVENUE_CONFIG.playerSpawn.x,
    z: TEST_AVENUE_CONFIG.playerSpawn.z,
    vx: 0,
    vz: 0,
    heading: TEST_AVENUE_CONFIG.playerSpawn.heading,
    steerAngle: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    speedMs: 0,
    speedKmh: 0,
    rpm: 900,
    gear: 'N',
    pitchAngle: 0,
    rollAngle: 0,
    isDrifting: false,
    isBraking: false,
    isNitroActive: false,
    impactIntensity: 0,
    damageLevel: 0,
    isPolicePursuit: false,
    pursuitTimer: 0,
    isArrested: false,
    arrestProgress: 0,
    arrestCount: 0,
  };

  public constructor(options: HudOptions) {
    this.root = options.root;
    this.diagnostics = options.diagnostics;
    this.activeProfile = options.initialProfile;
    this.onProfileSelect = options.onProfileSelect;
    this.onToggleGarage = options.onToggleGarage;
    this.onCycleCamera = options.onCycleCamera;
    this.onResetVehicle = options.onResetVehicle;
    this.onStartRace = options.onStartRace;
    this.onToggleMute = options.onToggleMute;
    this.onSelectZone = options.onSelectZone;
    this.onMapOpenChange = options.onMapOpenChange;
    this.onSettingsOpenChange = options.onSettingsOpenChange;

    this.root.replaceChildren();

    // ─── FILA SUPERIOR: Cronómetro/Acciones (izquierda) + Posición (derecha) ──
    const topRow = document.createElement('header');
    topRow.className = 'hud-top-row';

    const topLeft = document.createElement('div');
    topLeft.className = 'hud-mc-top-left';

    const raceClock = document.createElement('div');
    raceClock.className = 'hud-race-clock';
    raceClock.setAttribute('aria-label', 'Tiempo de recorrido');

    this.timerEl = document.createElement('div');
    this.timerEl.className = 'hud-timer-mc';
    this.timerEl.textContent = '00:00.00';

    const lapEl = document.createElement('div');
    lapEl.className = 'hud-lap-label';
    lapEl.textContent = 'LAP 1/2 · ZMVM (CDMX · EDOMEX)';
    this.lapEl = lapEl;

    raceClock.append(this.timerEl, lapEl);

    this.miniDiagEl = document.createElement('div');
    this.miniDiagEl.className = 'hud-mini-diag';
    const backendIcon = this.diagnostics.backend === 'WebGPU' ? '⚡ WebGPU' : '◆ WebGL2';
    this.miniDiagEl.textContent = `${backendIcon} · -- FPS · -- ms`;

    const actionRow = document.createElement('nav');
    actionRow.className = 'hud-action-row';
    actionRow.setAttribute('aria-label', 'Controles rápidos');

    this.raceBtn = this.createActionButton('🏁 Carrera (F)', () => {
      this.onStartRace?.();
    });

    this.garageBtn = this.createActionButton('Garaje (G)', () => {
      this.onToggleGarage();
    });
    this.garageBtn.setAttribute('aria-expanded', 'false');

    this.mapBtn = this.createActionButton('Mapa ZMVM (M)', () => {
      this.toggleMap();
    });
    this.mapBtn.setAttribute('aria-expanded', 'false');

    this.cameraBtn = this.createActionButton(
      `Cámara: ${CAMERA_MODE_LABELS.CHASE_CLOSE} (C)`,
      () => {
        this.onCycleCamera();
      },
    );

    this.muteBtn = this.createActionButton('🔊 Sonido: ON (V)', () => {
      this.onToggleMute?.();
    });

    this.settingsBtn = this.createActionButton('Opciones (O)', () => {
      this.toggleSettings();
    });
    this.settingsBtn.setAttribute('aria-expanded', 'false');

    const resetBtn = this.createActionButton('Reiniciar (R)', () => {
      this.onResetVehicle();
    });

    this.raceBannerEl = document.createElement('div');
    this.raceBannerEl.className = 'hud-race-banner';
    this.raceBannerEl.hidden = true;

    this.pursuitBannerEl = document.createElement('div');
    this.pursuitBannerEl.className = 'hud-pursuit-banner';
    this.pursuitBannerEl.hidden = true;
    this.pursuitBannerEl.textContent = '🚨 PERSECUCIÓN POLICIAL · EVADE A LAS PATRULLAS';

    actionRow.append(
      this.raceBtn,
      this.garageBtn,
      this.mapBtn,
      this.cameraBtn,
      this.muteBtn,
      this.settingsBtn,
      resetBtn,
    );
    topLeft.append(raceClock, this.miniDiagEl, actionRow, this.raceBannerEl, this.pursuitBannerEl);

    const posBadge = document.createElement('div');
    posBadge.className = 'hud-position-badge';
    posBadge.setAttribute('aria-label', 'Posición de carrera');

    const posRank = document.createElement('span');
    posRank.className = 'hud-position-rank';
    posRank.textContent = '1';
    this.posRankEl = posRank;

    const posTotal = document.createElement('span');
    posTotal.className = 'hud-position-total';
    posTotal.textContent = '/6';
    this.posTotalEl = posTotal;

    posBadge.append(posRank, posTotal);
    topRow.append(topLeft, posBadge);

    // ─── PANEL COLAPSABLE: Diagnóstico del motor y calidad gráfica ────────────
    this.settingsDrawer = document.createElement('aside');
    this.settingsDrawer.className = 'hud-settings-drawer';
    this.settingsDrawer.setAttribute('aria-label', 'Opciones gráficas y diagnóstico del motor');
    this.settingsDrawer.hidden = true;

    const settingsHeader = document.createElement('div');
    settingsHeader.className = 'hud-drawer-header';

    const settingsTitle = document.createElement('h2');
    settingsTitle.className = 'hud-section-title';
    settingsTitle.textContent = 'Motor Gráfico y Calidad';

    const closeSettingsBtn = this.createActionButton('Cerrar (O)', () => {
      this.setSettingsOpen(false);
    });

    settingsHeader.append(settingsTitle, closeSettingsBtn);
    this.settingsDrawer.append(settingsHeader);

    const metricsGrid = document.createElement('dl');
    metricsGrid.className = 'hud-metrics';

    const backendText = this.diagnostics.isFallback
      ? 'WebGL 2 (Alternativo)'
      : `${this.diagnostics.backend} (Nativo)`;
    const backendField = this.createMetricItem('Backend gráfico', backendText);
    const fpsField = this.createMetricItem('FPS promedio', '-- FPS');
    const frameTimeField = this.createMetricItem('Tiempo de cuadro', '-- ms');
    const scalingField = this.createMetricItem(
      'Escalado hardware',
      `${(1 / this.diagnostics.hardwareScalingLevel).toFixed(2)}x`,
    );
    const gpuField = this.createMetricItem(
      'Adaptador GPU',
      `${this.diagnostics.renderer} (${this.diagnostics.vendor})`,
      true,
    );

    this.fpsValueEl = fpsField.valueEl;
    this.frameTimeValueEl = frameTimeField.valueEl;
    this.scalingValueEl = scalingField.valueEl;

    metricsGrid.append(
      backendField.container,
      fpsField.container,
      frameTimeField.container,
      scalingField.container,
      gpuField.container,
    );
    this.settingsDrawer.append(metricsGrid);

    if (this.diagnostics.isFallback && this.diagnostics.fallbackReason) {
      const fallbackNote = document.createElement('p');
      fallbackNote.className = 'hud-fallback-note';
      fallbackNote.textContent = `Fallback WebGL2: ${this.diagnostics.fallbackReason}`;
      this.settingsDrawer.append(fallbackNote);
    }

    const profileTitle = document.createElement('h3');
    profileTitle.className = 'hud-section-title';
    profileTitle.textContent = 'Perfil de Calidad Visual';
    this.settingsDrawer.append(profileTitle);

    const profileGroup = document.createElement('div');
    profileGroup.className = 'hud-profile-group';
    profileGroup.setAttribute('role', 'group');
    profileGroup.setAttribute('aria-label', 'Selección de perfil gráfico');

    for (const profile of QUALITY_PROFILE_ORDER) {
      const settings = getGraphicsProfileSettings(profile);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hud-profile-btn';
      button.textContent = settings.label;
      button.setAttribute('aria-pressed', String(profile === this.activeProfile));
      button.addEventListener('click', () => {
        this.selectProfile(profile);
        this.onProfileSelect(profile);
      });
      this.profileButtons.set(profile, button);
      profileGroup.append(button);
    }
    this.settingsDrawer.append(profileGroup);

    this.profileDescEl = document.createElement('p');
    this.profileDescEl.className = 'hud-profile-desc';
    this.profileDescEl.textContent = getGraphicsProfileSettings(this.activeProfile).description;
    this.settingsDrawer.append(this.profileDescEl);

    const controlsLegend = document.createElement('p');
    controlsLegend.className = 'hud-controls-hint';
    controlsLegend.textContent =
      'Conducción: W/↑ Acelerar · S/↓ Freno/Reversa · A/D Girar · Espacio Drift · Shift Nitro · M Mapa ZMVM · Gamepad';
    this.settingsDrawer.append(controlsLegend);

    // ─── PANEL COLAPSABLE: Mapa Metropolitano CDMX + Estado de México ────────
    this.mapDrawer = document.createElement('aside');
    this.mapDrawer.className = 'hud-map-drawer';
    this.mapDrawer.setAttribute('aria-label', 'Mapa Metropolitano CDMX y Estado de México');
    this.mapDrawer.hidden = true;

    const mapHeader = document.createElement('div');
    mapHeader.className = 'hud-drawer-header';

    const mapTitle = document.createElement('h2');
    mapTitle.className = 'hud-section-title';
    mapTitle.textContent = 'Mapa Metropolitano · CDMX & Estado de México';

    const closeMapBtn = this.createActionButton('Cerrar (M)', () => {
      this.setMapOpen(false);
    });

    mapHeader.append(mapTitle, closeMapBtn);

    const mapSubtitle = document.createElement('p');
    mapSubtitle.className = 'hud-profile-desc';
    mapSubtitle.textContent =
      'Selecciona una zona para viaje rápido y fijar el puntero GPS hacia su monumento.';

    const mapGrid = document.createElement('div');
    mapGrid.className = 'hud-map-grid';
    mapGrid.setAttribute('role', 'group');
    mapGrid.setAttribute('aria-label', 'Zonas de Ciudad de México y Estado de México');

    for (const zoneId of METROPOLITAN_ZONE_ORDER) {
      const zone = METROPOLITAN_ZONES[zoneId];
      const zoneBtn = document.createElement('button');
      zoneBtn.type = 'button';
      zoneBtn.className = 'hud-map-zone-btn';
      zoneBtn.dataset.region = zone.region;
      zoneBtn.setAttribute('aria-pressed', String(zoneId === this.activeZoneId));

      const regionBadge = document.createElement('span');
      regionBadge.className = 'hud-zone-region';
      regionBadge.textContent = zone.region;

      const zoneName = document.createElement('span');
      zoneName.className = 'hud-zone-name';
      zoneName.textContent = zone.name;

      zoneBtn.append(regionBadge, zoneName);
      zoneBtn.addEventListener('click', () => {
        this.setActiveZone(zoneId);
        this.onSelectZone?.(zoneId);
        this.setMapOpen(false);
      });

      this.zoneButtons.set(zoneId, zoneBtn);
      mapGrid.append(zoneBtn);
    }

    this.mapDrawer.append(mapHeader, mapSubtitle, mapGrid);

    // ─── FILA INFERIOR: Radar circular (izq.) + Tacómetro MC3 (der.) ──────────
    const bottomRow = document.createElement('div');
    bottomRow.className = 'hud-bottom-row';

    const minimapWrap = document.createElement('div');
    minimapWrap.className = 'hud-minimap-shell';

    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.className = 'hud-minimap';
    this.minimapCanvas.width = MINIMAP_SIZE_PX;
    this.minimapCanvas.height = MINIMAP_SIZE_PX;
    this.minimapCanvas.setAttribute('role', 'img');
    this.minimapCanvas.setAttribute(
      'aria-label',
      'Minimapa radar metropolitano de CDMX y Estado de México con puntero GPS hacia el monumento activo',
    );
    minimapWrap.append(this.minimapCanvas);

    const gaugeCluster = document.createElement('section');
    gaugeCluster.className = 'hud-gauge-cluster';
    gaugeCluster.setAttribute('aria-label', 'Tacómetro, velocidad, marcha y ubicación');

    const gaugeFrame = document.createElement('div');
    gaugeFrame.className = 'hud-gauge-frame';

    this.gaugeCanvas = document.createElement('canvas');
    this.gaugeCanvas.className = 'hud-gauge-canvas';
    this.gaugeCanvas.width = GAUGE_WIDTH_PX;
    this.gaugeCanvas.height = GAUGE_HEIGHT_PX;
    this.gaugeCanvas.setAttribute('aria-hidden', 'true');

    const barReadout = document.createElement('div');
    barReadout.className = 'hud-mc-bar-readout';

    const speedWrap = document.createElement('div');
    speedWrap.className = 'hud-mc-speed-wrap';

    this.speedValueEl = document.createElement('span');
    this.speedValueEl.className = 'hud-speed-value';
    this.speedValueEl.textContent = '0';

    const speedUnitEl = document.createElement('span');
    speedUnitEl.className = 'hud-speed-unit';
    speedUnitEl.textContent = 'KM/H';
    speedWrap.append(this.speedValueEl, speedUnitEl);

    this.gearValueEl = document.createElement('span');
    this.gearValueEl.className = 'hud-gear-badge';
    this.gearValueEl.setAttribute('aria-label', 'Marcha');
    this.gearValueEl.textContent = 'N';

    this.stateFlagEl = document.createElement('span');
    this.stateFlagEl.className = 'hud-boost-flag';
    this.stateFlagEl.dataset.mode = 'READY';
    this.stateFlagEl.textContent = 'NOS';

    barReadout.append(speedWrap, this.gearValueEl, this.stateFlagEl);
    gaugeFrame.append(this.gaugeCanvas, barReadout);

    this.streetPlateEl = document.createElement('div');
    this.streetPlateEl.className = 'hud-street-plate';
    this.streetPlateEl.textContent = 'PASEO DE LA REFORMA';

    gaugeCluster.append(gaugeFrame, this.streetPlateEl);
    bottomRow.append(minimapWrap, gaugeCluster);

    this.arrestOverlayEl = document.createElement('section');
    this.arrestOverlayEl.className = 'hud-arrest-overlay';
    this.arrestOverlayEl.setAttribute('role', 'alertdialog');
    this.arrestOverlayEl.setAttribute('aria-labelledby', 'hud-arrest-title');
    this.arrestOverlayEl.hidden = true;

    const arrestCard = document.createElement('div');
    arrestCard.className = 'hud-arrest-card';

    const arrestTitle = document.createElement('h2');
    arrestTitle.id = 'hud-arrest-title';
    arrestTitle.className = 'hud-arrest-title';
    arrestTitle.textContent = '🚨 ¡ARRESTADO! 🚨';

    const arrestSubtitle = document.createElement('p');
    arrestSubtitle.className = 'hud-arrest-subtitle';
    arrestSubtitle.textContent = 'DETENIDO POR LA POLICÍA METROPOLITANA (SSC CDMX · EDOMEX)';

    this.arrestDetailEl = document.createElement('p');
    this.arrestDetailEl.className = 'hud-arrest-detail';
    this.arrestDetailEl.textContent =
      'Tu vehículo fue remitido al corralón. Presiona R para pagar la multa y salir.';

    const releaseBtn = this.createActionButton('Salir del Corralón (R)', () => {
      this.onResetVehicle();
    });

    arrestCard.append(arrestTitle, arrestSubtitle, this.arrestDetailEl, releaseBtn);
    this.arrestOverlayEl.append(arrestCard);

    this.statusAnnouncementEl = document.createElement('div');
    this.statusAnnouncementEl.className = 'visually-hidden';
    this.statusAnnouncementEl.setAttribute('role', 'status');
    this.statusAnnouncementEl.setAttribute('aria-live', 'polite');

    this.root.append(
      topRow,
      this.settingsDrawer,
      this.mapDrawer,
      this.arrestOverlayEl,
      bottomRow,
      this.statusAnnouncementEl,
    );

    // Dibujo inicial limpio en reposo
    this.drawMinimapRadar(this.lastVehicleState);
    this.drawTachometerCluster(900, false, false, 0);
  }

  public setGarageOpen(open: boolean): void {
    if (this.isGarageOpen === open) {
      return;
    }
    this.isGarageOpen = open;
    this.garageBtn.setAttribute('aria-expanded', String(open));
    this.announce(open ? 'Garaje de tuning abierto.' : 'Garaje de tuning cerrado.');
  }

  public isGarageCurrentlyOpen(): boolean {
    return this.isGarageOpen;
  }

  public setMapOpen(open: boolean): void {
    if (this.isMapOpen === open) {
      return;
    }
    this.isMapOpen = open;
    this.mapDrawer.hidden = !open;
    this.mapBtn.setAttribute('aria-expanded', String(open));
    this.onMapOpenChange?.(open);
    this.announce(
      open
        ? 'Mapa metropolitano de CDMX y Estado de México abierto.'
        : 'Mapa metropolitano cerrado.',
    );
  }

  public toggleMap(): boolean {
    this.setMapOpen(!this.isMapOpen);
    return this.isMapOpen;
  }

  public setActiveZone(zoneId: MetropolitanZoneId): void {
    this.activeZoneId = zoneId;
    const zone = getMetropolitanZone(zoneId);

    for (const [key, btn] of this.zoneButtons.entries()) {
      btn.setAttribute('aria-pressed', String(key === zoneId));
    }

    this.streetPlateEl.textContent = zone.streetBanner;
    this.lastVehicleState = {
      ...this.lastVehicleState,
      x: zone.spawn.x,
      z: zone.spawn.z,
      heading: zone.spawn.heading,
      speedMs: 0,
      speedKmh: 0,
    };
    this.drawMinimapRadar(this.lastVehicleState);
    this.announce(`Destino y ubicación fijados en ${zone.name} (${zone.region}).`);
  }

  public setSettingsOpen(open: boolean): void {
    if (this.isSettingsOpen === open) {
      return;
    }
    this.isSettingsOpen = open;
    this.settingsDrawer.hidden = !open;
    this.settingsBtn.setAttribute('aria-expanded', String(open));
    this.onSettingsOpenChange?.(open);
    this.announce(open ? 'Opciones gráficas abiertas.' : 'Opciones gráficas cerradas.');
  }

  public toggleSettings(): boolean {
    this.setSettingsOpen(!this.isSettingsOpen);
    return this.isSettingsOpen;
  }

  public setCameraLabel(mode: CameraMode): void {
    this.cameraBtn.textContent = `Cámara: ${CAMERA_MODE_LABELS[mode]} (C)`;
    this.announce(`Cámara cambiada a modo ${CAMERA_MODE_LABELS[mode]}.`);
  }

  public selectProfile(profile: QualityProfile): void {
    this.activeProfile = profile;
    const settings = getGraphicsProfileSettings(profile);
    this.profileDescEl.textContent = settings.description;

    for (const [key, button] of this.profileButtons.entries()) {
      button.setAttribute('aria-pressed', String(key === profile));
    }

    this.announce(`Perfil gráfico cambiado a ${settings.label}`);
  }

  public updateMetrics(snapshot: PerformanceSnapshot, hardwareScalingLevel: number): void {
    const fpsRounded = Math.round(snapshot.averageFps);
    const frameTimeText = `${snapshot.frameTimeMs.toFixed(1)} ms`;
    const backendIcon = this.diagnostics.backend === 'WebGPU' ? '⚡ WebGPU' : '◆ WebGL2';

    this.miniDiagEl.textContent = `${backendIcon} · ${fpsRounded} FPS · ${frameTimeText}`;
    this.miniDiagEl.dataset.status = snapshot.status;

    const statusBadge = document.createElement('span');
    statusBadge.className = `hud-badge hud-badge--${snapshot.status.toLowerCase()}`;
    statusBadge.textContent = `● ${fpsRounded} FPS (${snapshot.status})`;
    this.fpsValueEl.replaceChildren(statusBadge);

    this.frameTimeValueEl.textContent = frameTimeText;
    this.scalingValueEl.textContent = `${(1 / hardwareScalingLevel).toFixed(2)}x`;
  }

  public setAudioMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇 Sonido: OFF (V)' : '🔊 Sonido: ON (V)';
    this.announce(muted ? 'Sonido desactivado.' : 'Sonido activado.');
  }

  public updateDrivingTelemetry(
    state: VehiclePhysicsState,
    elapsedSec: number,
    raceSnapshot?: RaceSnapshot,
  ): void {
    if (raceSnapshot && raceSnapshot.phase !== 'IDLE') {
      this.timerEl.textContent = formatRaceTime(raceSnapshot.raceElapsedSec);
      const lapLabel = `LAP ${raceSnapshot.currentLap}/${raceSnapshot.totalLaps} · CP ${raceSnapshot.currentCheckpointIndex + 1}/${raceSnapshot.totalCheckpoints} · ${raceSnapshot.raceName}`;
      if (lapLabel !== this.lastLapLabelText) {
        this.lastLapLabelText = lapLabel;
        this.lapEl.textContent = lapLabel;
      }
      this.posRankEl.textContent = String(raceSnapshot.playerPosition);
      this.posTotalEl.textContent = `/${raceSnapshot.totalRacers}`;

      const bannerText =
        raceSnapshot.phase === 'COUNTDOWN'
          ? `🏁 ${raceSnapshot.raceName} · ARRANQUE EN ${Math.max(1, Math.ceil(raceSnapshot.countdownSec))}...`
          : raceSnapshot.phase === 'RACING'
            ? `🏁 CP ${raceSnapshot.currentCheckpointIndex + 1}/${raceSnapshot.totalCheckpoints} · VUELTA ${raceSnapshot.currentLap}/${raceSnapshot.totalLaps}`
            : `🏆 ¡META! POSICIÓN ${raceSnapshot.finishPosition}/${raceSnapshot.totalRacers} · ${formatRaceTime(raceSnapshot.raceElapsedSec)} (F: Otra Carrera)`;

      if (this.raceBannerEl.hidden) {
        this.raceBannerEl.hidden = false;
      }
      if (bannerText !== this.lastRaceBannerText) {
        this.lastRaceBannerText = bannerText;
        this.raceBannerEl.textContent = bannerText;
      }
    } else {
      this.timerEl.textContent = formatRaceTime(elapsedSec);
      const idleLabel = 'LAP 1/2 · ZMVM (CDMX · EDOMEX)';
      if (this.lastLapLabelText !== idleLabel) {
        this.lastLapLabelText = idleLabel;
        this.lapEl.textContent = idleLabel;
      }
      this.posRankEl.textContent = '1';
      this.posTotalEl.textContent = '/6';
      if (!this.raceBannerEl.hidden) {
        this.raceBannerEl.hidden = true;
        this.lastRaceBannerText = '';
      }
    }

    this.speedValueEl.textContent = String(Math.round(state.speedKmh));
    this.gearValueEl.textContent = state.gear;

    if (state.isArrested) {
      this.stateFlagEl.dataset.mode = 'BRAKE';
      this.stateFlagEl.textContent = 'ARRESTADO';
      if (this.arrestOverlayEl.hidden) {
        this.arrestOverlayEl.hidden = false;
      }
      const detailText = `Arrestos registrados: #${state.arrestCount} · Liberación automática o presiona R`;
      if (detailText !== this.lastArrestDetailText) {
        this.lastArrestDetailText = detailText;
        this.arrestDetailEl.textContent = detailText;
      }
      if (!this.wasArrested) {
        this.wasArrested = true;
        this.announce('Arrestado por la policía metropolitana. Vehículo remitido al corralón.');
      }
    } else {
      if (!this.arrestOverlayEl.hidden) {
        this.arrestOverlayEl.hidden = true;
      }
      this.wasArrested = false;

      if (state.isNitroActive) {
        this.nitroCharge = Math.max(0.08, this.nitroCharge - 0.014);
        this.stateFlagEl.dataset.mode = 'NITRO';
        this.stateFlagEl.textContent = 'NITRO';
      } else {
        this.nitroCharge = Math.min(1.0, this.nitroCharge + 0.004);
        if (state.impactIntensity > 0.25) {
          this.stateFlagEl.dataset.mode = 'BRAKE';
          this.stateFlagEl.textContent = 'IMPACTO';
        } else if (state.isPolicePursuit) {
          this.stateFlagEl.dataset.mode = 'BRAKE';
          this.stateFlagEl.textContent = 'POLICÍA';
        } else if (state.isDrifting) {
          this.stateFlagEl.dataset.mode = 'DRIFT';
          this.stateFlagEl.textContent = 'DRIFT';
        } else if (state.isBraking) {
          this.stateFlagEl.dataset.mode = 'BRAKE';
          this.stateFlagEl.textContent = 'FRENO';
        } else {
          this.stateFlagEl.dataset.mode = 'READY';
          this.stateFlagEl.textContent = 'NOS';
        }
      }
    }

    if (state.isPolicePursuit && !state.isArrested) {
      const remainingSec = Math.ceil(state.pursuitTimer);
      const nextPursuitText =
        state.arrestProgress > 0.08
          ? `🚨 ¡ACORRALADO! RIESGO DE ARRESTO ${Math.round(state.arrestProgress * 100)}% (${remainingSec}s)`
          : `🚨 PERSECUCIÓN POLICIAL · EVADE A LAS PATRULLAS (${remainingSec}s)`;

      if (!this.wasPolicePursuit) {
        this.pursuitBannerEl.hidden = false;
        this.wasPolicePursuit = true;
        this.lastPursuitText = nextPursuitText;
        this.pursuitBannerEl.textContent = nextPursuitText;
        this.announce('Persecución policial activada. Evade a las patrullas.');
      } else if (nextPursuitText !== this.lastPursuitText) {
        this.lastPursuitText = nextPursuitText;
        this.pursuitBannerEl.textContent = nextPursuitText;
      }
    } else if (this.wasPolicePursuit) {
      this.wasPolicePursuit = false;
      this.lastPursuitText = '';
      this.pursuitBannerEl.hidden = true;
      if (!state.isArrested) {
        this.announce('Persecución policial evadida.');
      }
    }

    this.lastVehicleState = state;
    this.streetPlateEl.textContent = resolveMetropolitanZoneName(state.x, state.z);
    this.drawMinimapRadar(state, raceSnapshot);
    this.drawTachometerCluster(state.rpm, state.isNitroActive, state.isDrifting, state.speedKmh);
  }

  public dispose(): void {
    this.root.replaceChildren();
  }

  public static renderFatalError(root: HTMLElement, message: string): void {
    const box = document.createElement('section');
    box.className = 'hud-error';
    box.setAttribute('role', 'alert');

    const heading = document.createElement('h2');
    heading.textContent = 'No fue posible iniciar el motor gráfico 3D';

    const detail = document.createElement('p');
    detail.textContent = message;

    const hint = document.createElement('p');
    hint.textContent =
      'Verifica que tu navegador sea Chrome, Edge, Safari o Firefox actualizado con WebGPU o WebGL 2 habilitado.';

    box.append(heading, detail, hint);
    root.replaceChildren(box);
  }

  private drawMinimapRadar(state: VehiclePhysicsState, raceSnapshot?: RaceSnapshot): void {
    const ctx = scaleHiDpiCanvas(this.minimapCanvas, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX);
    if (!ctx) {
      return;
    }

    const cx = MINIMAP_SIZE_PX / 2;
    const cy = MINIMAP_SIZE_PX / 2;
    const radarRadius = 74;
    const radarScale = 0.24;
    const activeTarget = getMetropolitanZone(this.activeZoneId).landmark;

    ctx.clearRect(0, 0, MINIMAP_SIZE_PX, MINIMAP_SIZE_PX);

    // Sombra sutil detrás del aro circular
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radarRadius + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(4, 8, 16, 0.72)';
    ctx.fill();
    ctx.restore();

    // Contenido del mapa recortado dentro del círculo radar
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radarRadius, 0, Math.PI * 2);
    ctx.clip();

    const bgGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, radarRadius);
    bgGrad.addColorStop(0, '#182436');
    bgGrad.addColorStop(1, '#0b111c');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(cx - radarRadius, cy - radarRadius, radarRadius * 2, radarRadius * 2);

    // Transformación centrada en jugador con rumbo orientado hacia arriba
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-state.heading);
    ctx.scale(radarScale, -radarScale);
    ctx.translate(-state.x, -state.z);

    // Retícula metropolitana de fondo
    ctx.strokeStyle = 'rgba(138, 174, 214, 0.14)';
    ctx.lineWidth = 4;
    for (let grid = -500; grid <= 600; grid += 120) {
      ctx.beginPath();
      ctx.moveTo(-520, grid);
      ctx.lineTo(520, grid);
      ctx.moveTo(grid, -520);
      ctx.lineTo(grid, 600);
      ctx.stroke();
    }

    // Calzadas de los 6 corredores metropolitanos CDMX + Estado de México
    for (const corridor of METROPOLITAN_CORRIDORS) {
      const w = corridor.maxX - corridor.minX;
      const d = corridor.maxZ - corridor.minZ;
      ctx.fillStyle = '#364961';
      ctx.fillRect(corridor.minX, corridor.minZ, w, d);
    }

    ctx.strokeStyle = '#92b0d4';
    ctx.lineWidth = 4;
    for (const corridor of METROPOLITAN_CORRIDORS) {
      const w = corridor.maxX - corridor.minX;
      const d = corridor.maxZ - corridor.minZ;
      ctx.strokeRect(corridor.minX, corridor.minZ, w, d);
    }

    // Arcos de curvas abiertas metropolitanas
    for (const curve of METROPOLITAN_OPEN_CURVES) {
      ctx.beginPath();
      ctx.arc(
        curve.cx,
        curve.cz,
        (curve.innerRadius + curve.outerRadius) / 2,
        curve.startAngle,
        curve.endAngle,
      );
      ctx.strokeStyle = '#364961';
      ctx.lineWidth = curve.outerRadius - curve.innerRadius;
      ctx.stroke();

      ctx.strokeStyle = '#92b0d4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(curve.cx, curve.cz, curve.innerRadius, curve.startAngle, curve.endAngle);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(curve.cx, curve.cz, curve.outerRadius, curve.startAngle, curve.endAngle);
      ctx.stroke();
    }

    // Glorietas metropolitanas (Ángel, Torres de Satélite, El Coyote de Neza)
    for (const roundabout of METROPOLITAN_ROUNDABOUTS) {
      ctx.beginPath();
      ctx.arc(roundabout.x, roundabout.z, roundabout.islandRadius + 14, 0, Math.PI * 2);
      ctx.fillStyle = '#364961';
      ctx.fill();
      ctx.strokeStyle = '#92b0d4';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(roundabout.x, roundabout.z, roundabout.islandRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#182436';
      ctx.fill();
      ctx.strokeStyle = roundabout.color;
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }

    // Marcadores de zonas CDMX y Estado de México + destino GPS resaltado
    for (const zoneId of METROPOLITAN_ZONE_ORDER) {
      const zone = METROPOLITAN_ZONES[zoneId];
      const isSelected = zoneId === this.activeZoneId;
      ctx.beginPath();
      ctx.arc(zone.landmark.x, zone.landmark.z, isSelected ? 11 : 7, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#4be3ff' : zone.region === 'EDOMEX' ? '#ff9d42' : '#ffd15c';
      ctx.fill();
    }

    // Tráfico urbano metropolitano diferenciado (Metro, Tranvía STE, Metrobús, Patrullas, Sedanes)
    for (const marker of METROPOLITAN_TRAFFIC_COORDS) {
      let fillStyle = '#ffe052';
      let radius = 5.2;
      if (marker.kind === 'METRO') {
        fillStyle = '#ff7b1c';
        radius = 7.0;
      } else if (marker.kind === 'TRAM') {
        fillStyle = '#26f7c7';
        radius = 6.8;
      } else if (marker.kind === 'METROBUS') {
        fillStyle = '#ff5a36';
        radius = 6.8;
      } else if (marker.kind === 'PATROL') {
        fillStyle = '#38a8ff';
        radius = 6.2;
      }
      if (state.isPolicePursuit && marker.kind === 'PATROL') {
        const flashRed = Math.floor(performance.now() / 160) % 2 === 0;
        const pulseScale = 1.65 + 0.45 * Math.sin(performance.now() * 0.015);
        ctx.beginPath();
        ctx.arc(marker.x, marker.z, radius * pulseScale, 0, Math.PI * 2);
        ctx.strokeStyle = flashRed ? '#ff3355' : '#38a8ff';
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(marker.x, marker.z, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }

    // Checkpoints y rivales de carrera en el minimapa radar
    if (raceSnapshot && raceSnapshot.phase !== 'IDLE') {
      const activeCp = raceSnapshot.activeCheckpoint;
      if (activeCp) {
        ctx.save();
        ctx.setLineDash([16, 12]);
        ctx.strokeStyle = 'rgba(70, 228, 255, 0.72)';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(state.x, state.z);
        ctx.lineTo(activeCp.x, activeCp.z);
        ctx.stroke();
        ctx.restore();

        const pulse = 13 + Math.sin(performance.now() * 0.009) * 3.5;
        ctx.beginPath();
        ctx.arc(activeCp.x, activeCp.z, pulse, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd15c';
        ctx.lineWidth = 5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(activeCp.x, activeCp.z, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#46e4ff';
        ctx.fill();
      }

      const rivalPalette = ['#00e5ff', '#ff2a85', '#52ff00', '#ffb700', '#a64dff'];
      raceSnapshot.rivalPositions.forEach((rival, idx) => {
        ctx.beginPath();
        ctx.arc(rival.x, rival.z, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = rivalPalette[idx] ?? '#ff48b0';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    ctx.restore();
    ctx.restore();

    // Bisel metálico doble estilo Midnight Club 3
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radarRadius + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#8998ad';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radarRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#101824';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Flecha del jugador centrada apuntando hacia arriba
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8.5);
    ctx.lineTo(cx - 5.5, cy + 5.5);
    ctx.lineTo(cx, cy + 2.5);
    ctx.lineTo(cx + 5.5, cy + 5.5);
    ctx.closePath();
    ctx.fillStyle = '#4bff9e';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#07131a';
    ctx.stroke();

    // Puntero direccional cian exterior hacia el monumento de destino activo
    const dx = activeTarget.x - state.x;
    const dz = activeTarget.z - state.z;
    const sinH = Math.sin(state.heading);
    const cosH = Math.cos(state.heading);
    const localRight = dx * cosH - dz * sinH;
    const localForward = dx * sinH + dz * cosH;
    const pointerAngle = Math.atan2(-localForward, localRight);

    ctx.translate(cx, cy);
    ctx.rotate(pointerAngle);
    ctx.beginPath();
    ctx.moveTo(radarRadius + 22, 0);
    ctx.lineTo(radarRadius + 5, -10.5);
    ctx.lineTo(radarRadius + 8, 0);
    ctx.lineTo(radarRadius + 5, 10.5);
    ctx.closePath();

    const coneGrad = ctx.createLinearGradient(radarRadius + 4, 0, radarRadius + 22, 0);
    coneGrad.addColorStop(0, '#26d7ff');
    coneGrad.addColorStop(1, '#bff8ff');
    ctx.fillStyle = coneGrad;
    ctx.shadowColor = '#3ae6ff';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#0a1420';
    ctx.stroke();
    ctx.restore();
  }

  private drawTachometerCluster(
    rpm: number,
    isNitroActive: boolean,
    isDrifting: boolean,
    speedKmh: number,
  ): void {
    const ctx = scaleHiDpiCanvas(this.gaugeCanvas, GAUGE_WIDTH_PX, GAUGE_HEIGHT_PX);
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, GAUGE_WIDTH_PX, GAUGE_HEIGHT_PX);

    const dialCx = 66;
    const dialCy = 64;
    const dialRadius = 46;

    // 1. Ala horizontal translúcida derecha para sub-dials y barra digital
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dialCx + 8, 18);
    ctx.lineTo(310, 18);
    ctx.lineTo(318, 26);
    ctx.lineTo(318, 100);
    ctx.lineTo(306, 110);
    ctx.lineTo(dialCx + 8, 110);
    ctx.closePath();

    const wingGrad = ctx.createLinearGradient(dialCx, 18, dialCx, 110);
    wingGrad.addColorStop(0, 'rgba(14, 21, 34, 0.88)');
    wingGrad.addColorStop(1, 'rgba(7, 11, 20, 0.94)');
    ctx.fillStyle = wingGrad;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(136, 186, 224, 0.65)';
    ctx.stroke();
    ctx.restore();

    // 2. Arco exterior cian brillante izquierdo (Nitro / Boost MC3)
    ctx.save();
    const arcStart = (108 * Math.PI) / 180;
    const arcEnd = (252 * Math.PI) / 180;
    const arcSpan = arcEnd - arcStart;

    // Pista oscura de fondo del arco
    ctx.beginPath();
    ctx.arc(dialCx, dialCy, 56, arcStart, arcEnd);
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(18, 32, 48, 0.92)';
    ctx.stroke();

    // Relleno de carga de Nitro cian brillante
    const filledEnd = arcStart + arcSpan * this.nitroCharge;
    const nitroGrad = ctx.createLinearGradient(10, 10, 20, 118);
    nitroGrad.addColorStop(0, isNitroActive ? '#ffffff' : '#96f6ff');
    nitroGrad.addColorStop(0.55, '#2edcff');
    nitroGrad.addColorStop(1, '#0d90c9');

    ctx.beginPath();
    ctx.arc(dialCx, dialCy, 56, arcStart, filledEnd);
    ctx.lineWidth = isNitroActive ? 8.5 : 7;
    ctx.lineCap = 'round';
    ctx.strokeStyle = nitroGrad;
    ctx.shadowColor = isNitroActive ? '#7cf4ff' : '#26d7ff';
    ctx.shadowBlur = isNitroActive ? 14 : 9;
    ctx.stroke();
    ctx.restore();

    // 3. Carátula circular del tacómetro analógico (0 - 8 x1000 RPM)
    ctx.save();
    ctx.beginPath();
    ctx.arc(dialCx, dialCy, dialRadius + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#090e18';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#92b6d8';
    ctx.stroke();

    const faceGrad = ctx.createRadialGradient(dialCx, dialCy - 8, 6, dialCx, dialCy, dialRadius);
    faceGrad.addColorStop(0, '#1a273d');
    faceGrad.addColorStop(1, '#080c15');
    ctx.beginPath();
    ctx.arc(dialCx, dialCy, dialRadius, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad;
    ctx.fill();

    // Rango angular del tacómetro: 135 deg (0 RPM) -> 405 deg (8000 RPM)
    const startRad = (135 * Math.PI) / 180;
    const totalSweep = (270 * Math.PI) / 180;

    // Zona roja (6.5 - 8.0)
    const redStart = startRad + totalSweep * (6.5 / 8);
    ctx.beginPath();
    ctx.arc(dialCx, dialCy, dialRadius - 5, redStart, startRad + totalSweep);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff3848';
    ctx.stroke();

    // Marcas y números 0..8
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'italic 700 10px system-ui, -apple-system, sans-serif';

    for (let step = 0; step <= 16; step++) {
      const ratio = step / 16;
      const angle = startRad + ratio * totalSweep;
      const isMajor = step % 2 === 0;
      const tickOuter = dialRadius - 3;
      const tickInner = isMajor ? dialRadius - 10 : dialRadius - 7;

      ctx.beginPath();
      ctx.moveTo(dialCx + Math.cos(angle) * tickInner, dialCy + Math.sin(angle) * tickInner);
      ctx.lineTo(dialCx + Math.cos(angle) * tickOuter, dialCy + Math.sin(angle) * tickOuter);
      ctx.lineWidth = isMajor ? 1.8 : 1;
      ctx.strokeStyle = ratio >= 0.81 ? '#ff4d5a' : '#d8e8ff';
      ctx.stroke();

      if (isMajor) {
        const label = String(step / 2);
        const textR = dialRadius - 16;
        ctx.fillStyle = ratio >= 0.85 ? '#ff5c68' : '#e6f4ff';
        ctx.fillText(label, dialCx + Math.cos(angle) * textR, dialCy + Math.sin(angle) * textR);
      }
    }

    // Aguja naranja/roja del tacómetro
    const clampedRpm = Math.max(0, Math.min(8000, rpm));
    const needleAngle = startRad + (clampedRpm / 8000) * totalSweep;
    ctx.save();
    ctx.translate(dialCx, dialCy);
    ctx.rotate(needleAngle);
    ctx.beginPath();
    ctx.moveTo(-7, -1.6);
    ctx.lineTo(dialRadius - 7, 0);
    ctx.lineTo(-7, 1.6);
    ctx.closePath();
    ctx.fillStyle = '#ff6a2b';
    ctx.shadowColor = '#ff5026';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();

    // Tapa central metálica de la aguja
    ctx.beginPath();
    ctx.arc(dialCx, dialCy, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = '#2c3d58';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#9ac6ea';
    ctx.stroke();
    ctx.restore();

    // 4. Dos sub-esferas superiores derechas (Turbo + Reserva Nitro)
    const speedRatio = Math.max(0, Math.min(1, speedKmh / 240));
    this.drawMiniPod(
      ctx,
      160,
      42,
      16,
      'NOS',
      this.nitroCharge,
      isNitroActive ? '#8ef6ff' : '#35dcff',
    );
    this.drawMiniPod(
      ctx,
      208,
      42,
      16,
      isDrifting ? 'SLIP' : 'TRB',
      isDrifting ? 0.92 : speedRatio,
      isDrifting ? '#ffb84d' : '#4be39a',
    );

    // Indicador de carga lateral derecho
    ctx.save();
    ctx.font = 'italic 700 9px ui-monospace, monospace';
    ctx.fillStyle = '#9ec6e8';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(this.nitroCharge * 100)}%`, 304, 38);
    ctx.fillStyle = '#38d6f5';
    ctx.fillRect(244, 45, 60 * this.nitroCharge, 4);
    ctx.strokeStyle = 'rgba(130, 178, 224, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(244, 45, 60, 4);
    ctx.restore();

    // 5. Barra digital biselada cian inferior derecha (marco para KM/H y marcha)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(84, 67);
    ctx.lineTo(312, 67);
    ctx.lineTo(304, 102);
    ctx.lineTo(74, 102);
    ctx.closePath();

    const barBg = ctx.createLinearGradient(74, 67, 74, 102);
    barBg.addColorStop(0, 'rgba(10, 26, 44, 0.94)');
    barBg.addColorStop(0.55, 'rgba(6, 15, 28, 0.96)');
    barBg.addColorStop(1, 'rgba(14, 34, 56, 0.95)');
    ctx.fillStyle = barBg;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = isNitroActive ? '#b2fcff' : '#45e2ff';
    ctx.shadowColor = '#38d6f5';
    ctx.shadowBlur = isNitroActive ? 10 : 5;
    ctx.stroke();
    ctx.restore();
  }

  private drawMiniPod(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    label: string,
    ratio: number,
    accentColor: string,
  ): void {
    const start = (135 * Math.PI) / 180;
    const sweep = (270 * Math.PI) / 180;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#09101c';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(138, 174, 214, 0.55)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius - 3.5, start, start + sweep * Math.max(0.05, Math.min(1, ratio)));
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = accentColor;
    ctx.stroke();

    ctx.fillStyle = '#d8ecff';
    ctx.font = '700 7.5px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
    ctx.restore();
  }

  private createActionButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-action-btn';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
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

  private announce(message: string): void {
    this.statusAnnouncementEl.textContent = '';
    requestAnimationFrame(() => {
      this.statusAnnouncementEl.textContent = message;
    });
  }
}
