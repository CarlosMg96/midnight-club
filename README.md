# Midnight Club: CDMX — Base Técnica

Cimientos técnicos de un videojuego de carreras urbanas 3D en navegador, inspirado en _Midnight Club_ y ambientado en una representación nocturna de Ciudad de México.

## Estado actual (Primer Entregable: Fases 1 y 2)

- **Infraestructura reproducible**: TypeScript (`strict: true`), Vite, pnpm (`pnpm-lock.yaml`), ESLint, Prettier, Vitest y entorno Docker Compose con Node.js 26 LTS (mínimo Node.js 24 LTS) + Corepack.
- **Motor gráfico adaptativo (`EngineFactory`)**:
  - Detección y arranque prioritario con **WebGPU**.
  - Fallback automático y diagnosticado a **WebGL 2** si WebGPU no está disponible o falla su inicialización.
  - Selección explícita por parámetro de URL para pruebas comparativas: `?backend=webgl2` o `?backend=webgpu`.
- **Perfiles gráficos (`GraphicsConfig`)**:
  - `QUALITY`, `BALANCED` y `PERFORMANCE` conmutables en vivo desde el HUD sin reiniciar la escena.
  - Detección conservadora inicial según adaptador GPU (`Intel UHD`, `AMD Radeon`, `Apple Silicon`), evitando asumir que WebGPU implica automáticamente el perfil máximo.
- **Escena nocturna base (`SceneManager`)**:
  - Avenida urbana nocturna de múltiples carriles inspirada en Ciudad de México con pavimento PBR, camellón central, banquetas, señalización vial instanciada, luminarias de sodio, siluetas de edificios nocturnos instanciados y un vehículo deportivo provisional con luces emisivas y sombras proyectadas.
- **Telemetría y HUD independiente (`PerformanceManager`, `HUD`)**:
  - Panel HTML/CSS desacoplado de la escena 3D que reporta backend activo, adaptador GPU, escalado hardware, FPS promedio y tiempo de cuadro en milisegundos.

---

## Requisitos previos

- **Con Docker (recomendado para desarrollo)**:
  - Docker Desktop / Docker Engine + Docker Compose v2 (`docker compose`) o binario `docker-compose`.
- **En equipo local (alternativa sin Docker)**:
  - Node.js 26 LTS (mínimo Node.js 24 LTS, `>=24.0.0`).
  - `pnpm` 10.30.0 (habilitado vía `corepack enable`; en Node 25/26 instala Corepack con `npm install -g corepack` si no está presente).

---

## Ejecución con Docker

1. Construir la imagen e iniciar el servidor Vite con Hot Module Replacement (HMR):

```sh
docker compose up --build
```

> **Nota para macOS**: si `docker compose` devuelve `unknown command: docker compose` porque el CLI de Docker apunta a Homebrew sin el plugin enlazado, utiliza `/usr/local/bin/docker-compose up --build`.

2. Abrir en el navegador moderno del equipo anfitrión (el renderizado 3D siempre ocurre en el navegador del usuario, nunca dentro del contenedor):

- Predeterminado (intenta WebGPU y hace fallback a WebGL 2): `http://localhost:5173`
- Forzar WebGL 2: `http://localhost:5173/?backend=webgl2`
- Forzar intento WebGPU: `http://localhost:5173/?backend=webgpu`

3. Detener el entorno:

```sh
docker compose down
```

### Ejecutar comandos de calidad dentro del contenedor

```sh
docker compose run --rm --no-deps dev pnpm run typecheck
docker compose run --rm --no-deps dev pnpm run lint
docker compose run --rm --no-deps dev pnpm run format:check
docker compose run --rm --no-deps dev pnpm test
docker compose run --rm --no-deps dev pnpm run build
```

---

## Ejecución local sin Docker

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

---

## Scripts disponibles

| Script              | Descripción                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| `pnpm dev`          | Inicia Vite en `0.0.0.0:5173` con HMR habilitado.                                       |
| `pnpm build`        | Ejecuta verificación de tipos (`tsc --noEmit`) y genera build de producción en `dist/`. |
| `pnpm preview`      | Sirve el build de producción en `0.0.0.0:4173`.                                         |
| `pnpm test`         | Ejecuta las pruebas unitarias con Vitest.                                               |
| `pnpm lint`         | Analiza el código con ESLint (prohibido `any` y `catch` vacíos).                        |
| `pnpm format`       | Formatea el código con Prettier.                                                        |
| `pnpm format:check` | Comprueba el formato sin modificar archivos.                                            |
| `pnpm typecheck`    | Valida tipos con TypeScript en modo estricto.                                           |

---

## Estructura actual del proyecto

```text
midnight-club/
├── src/
│   ├── config/
│   │   ├── GameConfig.ts       # Constantes del escenario, cámara y paso fijo de simulación
│   │   └── GraphicsConfig.ts   # Perfiles QUALITY / BALANCED / PERFORMANCE y heurística GPU
│   ├── engine/
│   │   ├── EngineFactory.ts       # Detección WebGPU, fallback WebGL 2 y diagnósticos
│   │   ├── PerformanceManager.ts  # Ventana móvil de FPS y tiempo de cuadro
│   │   ├── ProceduralTextures.ts  # Generación procedural de asfalto mojado, cielo y neón
│   │   ├── RenderManager.ts       # Bucle de renderizado, resize y cambio de perfil
│   │   └── SceneManager.ts        # Orquestación de escena nocturna, reflejos y postprocesado
│   ├── styles/
│   │   └── main.css               # Estilos del canvas y HUD accesible en modo oscuro
│   ├── ui/
│   │   └── HUD.ts                 # Superposición HTML independiente de la escena 3D
│   ├── world/
│   │   ├── BuildingManager.ts     # Edificios comerciales, letreros neón y skyline CDMX
│   │   ├── HeroVehicleShowcase.ts # Superdeportivo protagonista en derrape, underglow y humo
│   │   ├── RoadManager.ts         # Avenida húmeda PBR, MirrorTexture, semáforos y farolas
│   │   └── TrafficManager.ts      # Tráfico urbano nocturno y taxi dorado lateral
│   └── main.ts                    # Arranque de la aplicación y gestión de ciclo HMR
├── tests/
│   ├── EngineFactory.test.ts
│   ├── GraphicsConfig.test.ts
│   └── PerformanceManager.test.ts
├── Dockerfile
├── compose.yaml
├── eslint.config.js
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── vite.config.ts
```

## Hoja de ruta de implementación

- **Fases 1 y 2 (Completadas)**: Infraestructura Docker/pnpm/Vite/TS/ESLint/Prettier/Vitest, inicialización WebGPU/WebGL 2, escena nocturna PBR y HUD de diagnóstico.
- **Fase 3 (Siguiente)**: Integración de físicas con paso fijo (evaluación de Havok Physics V2 detrás de interfaz desacoplada), vehículo de pruebas con suspensión, dirección, derrape y colisiones, controles teclado/Gamepad y cámara de persecución.
- **Fases 4–6**: Expansión del escenario urbano nocturno, HUD completo de conducción (velocímetro, tacómetro, marcha), arquitectura de audio modular/radio, preparación para pantalla dividida local y pruebas en hardware objetivo (M1, Intel UHD, AMD Radeon).
