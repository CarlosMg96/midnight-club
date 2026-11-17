import './styles/main.css';
import { EngineFactory } from './engine/EngineFactory';
import { PerformanceManager } from './engine/PerformanceManager';
import { RenderManager } from './engine/RenderManager';
import { SceneManager } from './engine/SceneManager';
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
    const sceneManager = new SceneManager(engine, canvas, diagnostics.recommendedProfile);

    let renderManager: RenderManager | null = null;

    const hud = new HUD({
      root: uiRoot,
      diagnostics,
      initialProfile: diagnostics.recommendedProfile,
      onProfileSelect: (profile) => {
        renderManager?.setQualityProfile(profile);
      },
    });

    renderManager = new RenderManager(
      engine,
      sceneManager,
      performanceManager,
      (snapshot, scaling) => {
        hud.updateMetrics(snapshot, scaling);
      },
    );

    renderManager.start();

    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        renderManager?.dispose();
        hud.dispose();
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
