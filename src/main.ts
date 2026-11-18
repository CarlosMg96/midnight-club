import './styles/main.css';
import { AudioManager } from './engine/AudioManager';
import { EngineFactory } from './engine/EngineFactory';
import { PerformanceManager } from './engine/PerformanceManager';
import { RenderManager } from './engine/RenderManager';
import { SceneManager } from './engine/SceneManager';
import { InputManager } from './multiplayer/InputManager';
import { GarageUI } from './ui/GarageUI';
import { HUD } from './ui/HUD';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('render-canvas');
  const uiRoot = document.getElementById('ui-root');

  if (!(canvas instanceof HTMLCanvasElement) || !(uiRoot instanceof HTMLElement)) {
    throw new Error('No se encontraron los elementos #render-canvas o #ui-root en el DOM.');
  }

  try {
    const { engine, diagnostics } = await EngineFactory.create(canvas);
    const performanceManager = new PerformanceManager(60);
    const inputManager = new InputManager({ playerIndex: 0 });
    const sceneManager = new SceneManager(engine, canvas, diagnostics.recommendedProfile);
    const audioManager = new AudioManager();

    let renderManager: RenderManager | null = null;
    let garageUI: GarageUI | null = null;
    let hud: HUD | null = null;

    const toggleGarage = (): void => {
      if (!garageUI || !hud) return;
      const open = garageUI.toggle();
      if (open) {
        hud.setSettingsOpen(false);
        hud.setMapOpen(false);
      }
      hud.setGarageOpen(open);
    };

    const cycleCamera = (): void => {
      const mode = sceneManager.cycleCameraMode();
      hud?.setCameraLabel(mode);
    };

    const resetVehicle = (): void => {
      sceneManager.resetVehicle();
    };

    const startOrCycleRace = (): void => {
      sceneManager.startOrCycleRace();
    };

    const toggleMute = (): boolean => {
      const muted = audioManager.toggleMute();
      hud?.setAudioMuted(muted);
      return muted;
    };

    hud = new HUD({
      root: uiRoot,
      diagnostics,
      initialProfile: diagnostics.recommendedProfile,
      onProfileSelect: (profile) => {
        renderManager?.setQualityProfile(profile);
      },
      onToggleGarage: toggleGarage,
      onCycleCamera: cycleCamera,
      onResetVehicle: resetVehicle,
      onStartRace: startOrCycleRace,
      onToggleMute: toggleMute,
      onSelectZone: (zoneId) => {
        sceneManager.teleportToZone(zoneId);
      },
      onMapOpenChange: (isOpen) => {
        if (isOpen) {
          hud?.setSettingsOpen(false);
          garageUI?.setOpen(false);
          hud?.setGarageOpen(false);
        }
      },
      onSettingsOpenChange: (isOpen) => {
        if (isOpen) {
          hud?.setMapOpen(false);
          garageUI?.setOpen(false);
          hud?.setGarageOpen(false);
        }
      },
    });

    garageUI = new GarageUI({
      container: uiRoot,
      initialTuning: sceneManager.getTuningConfig(),
      onTuningChange: (tuning) => {
        sceneManager.applyTuning(tuning);
      },
      onClose: () => {
        hud?.setGarageOpen(false);
      },
    });

    const unsubscribeActions = inputManager.onAction((action) => {
      if (action === 'TOGGLE_GARAGE') {
        toggleGarage();
      } else if (action === 'TOGGLE_MAP') {
        hud?.toggleMap();
      } else if (action === 'TOGGLE_SETTINGS') {
        hud?.toggleSettings();
      } else if (action === 'TOGGLE_CAMERA') {
        cycleCamera();
      } else if (action === 'RESET_VEHICLE') {
        resetVehicle();
      } else if (action === 'START_RACE') {
        startOrCycleRace();
      } else if (action === 'TOGGLE_MUTE') {
        toggleMute();
      }
    });

    renderManager = new RenderManager(
      engine,
      sceneManager,
      performanceManager,
      inputManager,
      (snapshot, scaling, vehicleState, elapsedSec) => {
        const raceSnap = sceneManager.getRaceSnapshot();
        hud?.updateMetrics(snapshot, scaling);
        hud?.updateDrivingTelemetry(vehicleState, elapsedSec, raceSnap);
        audioManager.update(vehicleState, raceSnap.audioEvent, snapshot.frameTimeMs / 1000);
      },
    );

    renderManager.start();

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        unsubscribeActions();
        audioManager.dispose();
        renderManager?.dispose();
        garageUI?.dispose();
        hud?.dispose();
      });
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error desconocido al iniciar WebGPU/WebGL 2 en este navegador.';
    HUD.renderFatalError(uiRoot, message);
  }
}

void bootstrap();
