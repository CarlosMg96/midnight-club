# Midnight Club: CDMX — Base Técnica

Cimientos técnicos de un videojuego de carreras urbanas 3D en navegador, inspirado en _Midnight Club_ y ambientado en una representación nocturna de Ciudad de México.

## Estado actual (Fases 1–3 y Entorno Paseo de la Reforma CDMX)

- **Infraestructura reproducible**: TypeScript (`strict: true`), Vite, pnpm (`pnpm-lock.yaml`), ESLint, Prettier, Vitest y entorno Docker Compose con Node.js 26 LTS (mínimo Node.js 24 LTS) + Corepack.
- **Motor gráfico adaptativo (`EngineFactory`)**:
  - Detección y arranque prioritario con **WebGPU**.
  - Fallback automático y diagnosticado a **WebGL 2** si WebGPU no está disponible o falla su inicialización.
  - Selección explícita por parámetro de URL para pruebas comparativas: `?backend=webgl2` o `?backend=webgpu`.
- **Perfiles gráficos (`GraphicsConfig`)**:
  - `QUALITY`, `BALANCED` y `PERFORMANCE` conmutables en vivo desde el HUD sin reiniciar la escena.
  - Detección conservadora inicial según adaptador GPU (`Intel UHD`, `AMD Radeon`, `Apple Silicon`), evitando asumir que WebGPU implica automáticamente el perfil máximo.
- **Mapa Metropolitano CDMX + Estado de México (ZMVM, `M`)**:
  - 7 grandes corredores viales interconectados en circuito continuo: **Paseo de la Reforma / Insurgentes**, **Periférico Poniente**, **Circuito Mexiquense / Oriente**, **Eje Central / Juárez / Chimalhuacán**, **Blvd. Puerto Aéreo / Circuito Interior (AICM)**, **Periférico Norte (Vía Baz / Vía Morelos)** y **Periférico Sur / Viaducto**.
  - Monumentos y complejos 3D emblemáticos: **Ángel de la Independencia**, **Torre BBVA**, **Torre Reforma**, **Hotel St. Regis**, **Torre Latinoamericana y Zócalo**, **Aeropuerto Internacional CDMX (AICM T1, T2, Torre de Control, Aerotrén, pista 05R/23L y avión comercial)**, **Viaducto elevado y Estación Metro Terminal Aérea**, **Torre Arcos Bosques ("El Pantalón" en Santa Fe)**, **Circuito de Curvas Abiertas de Alta Velocidad (La Marquesa + distribuidores amplios en Satélite, San Ángel e Iztapalapa)**, **Biblioteca Central y Rectoría UNAM (Coyoacán / CU)**, **Torres de Satélite (Naucalpan, Edomex)**, **Escultura El Coyote (Cd. Nezahualcóyotl, Edomex)** y **Mexicable / Puente de Fierro (Ecatepec, Edomex)**.
  - Asfalto urbano PBR con grano mineral y juntas de alquitrán e iluminación HDR IBL (`/assets/textures/environmentSpecular.env`), arbolado frondoso, señalética verde CDMX/Edomex y letreros neón con `GlowLayer` acotado.
  - **Tráfico vivo y semáforos congruentes (`RoadManager`, `TrafficManager`)**: semáforos sincronizados de 3 luces (Verde/Ámbar/Rojo opuestos entre ejes N–S y E–O), automóviles, taxis, **Metrobuses CDMX / Mexibús Edomex**, **trenes del STC Metro ("Limusina Naranja") en viaducto elevado**, **Tranvías y Tren Ligero STE ("Ajolotren")**, **patrullas con torretas rojo/azul animadas** y **peatones NPC animados** en banquetas y pasos peatonales.
- **Flota Nissan / Audi / Mercedes-Benz, HUD Midnight Club y Garaje de Tuning (`VehiclePhysics`, `Vehicle`, `GarageUI`)**:
  - Simulación con paso de tiempo fijo (`1 / 60 s`), caja de 6 velocidades + reversa, derrape controlado con humo de neumáticos, flamas de escape (_backfire_), **físicas de choque bidireccionales** (impulso, giro NPC, sacudida de suspensión/cámara y daño), **persecución policial al pasarse altos en rojo o chocar patrullas** y **sistema de arresto (`¡ARRESTADO!`)** cuando las patrullas te acorralan o bloquean hasta remitir el vehículo al corralón (`R`).
  - **Vehículos seleccionables**: **Nissan Tsuru B13**, **Nissan Skyline GT-R (R34)**, **Audi R8 V10 Plus**, **Mercedes-AMG GT R** y **Concept GT** (`/assets/vehicles/CarConcept.glb`).
  - **HUD completo**: cronómetro digital, minimapa radar circular con checkpoints/rivales, indicador de posición (`1/6..6/6`), velocímetro, marcha, tacómetro y diagnóstico WebGPU/WebGL 2.
  - **Carreras callejeras (`RaceManager`, tecla `F`)**: 3 circuitos metropolitanos (_Sprint Reforma_, _Reto La Marquesa_ y _Gran Premio Metropolitano ZMVM_), arcos neón 3D por checkpoint, 5 rivales IA competitivos y conteo regresivo de salida.
  - **Audio procedural en tiempo real (`AudioManager`, tecla `V` para silenciar)**: síntesis vía Web Audio API sin archivos externos para motor por RPM, cambios de marcha, derrape de llantas, turbina nitro, choques, sirenas policiales y fanfarrias de carrera.
  - **Garaje de Tuning en vivo (`G`)**: pintura/livery (Plata Agencia, Azul Bayside R34, Gris Suzuka Audi, Verde Green Hell AMG, Taxi CDMX Rosa/Verde, Negro, Rojo GSR), kit aerodinámico, rines, neón underglow, stage de motor y suspensión.

## Controles de conducción

- **Acelerar / Frenar y Reversa**: `W` / `S` o flechas `↑` / `↓` (o gatillos de Gamepad)
- **Dirección**: `A` / `D` o flechas `←` / `→` (o stick izquierdo de Gamepad)
- **Freno de mano / Derrape**: `Espacio`
- **Nitro / Turbo**: `Shift`
- **Iniciar / Cambiar Carrera Callejera**: `F`
- **Silenciar / Activar Sonido**: `V`
- **Abrir / Cerrar Garaje de Tuning**: `G`
- **Abrir / Cerrar Mapa Metropolitano (Viaje rápido CDMX y Estado de México)**: `M`
- **Abrir / Cerrar Opciones Gráficas y Diagnóstico**: `O`
- **Cambiar cámara (Persecución / Lejana / Cofre)**: `C`
- **Reiniciar vehículo**: `R`

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
├── public/
│   └── assets/
│       ├── textures/
│       │   └── environmentSpecular.env  # IBL HDR oficial de Babylon.js Assets
│       └── vehicles/
│           └── CarConcept.glb           # Modelo automotriz Khronos Group (CC BY 4.0)
├── src/
│   ├── config/
│   │   ├── GameConfig.ts          # Constantes de Reforma, Glorieta del Ángel y paso fijo
│   │   └── GraphicsConfig.ts      # Perfiles QUALITY / BALANCED / PERFORMANCE y heurística GPU
│   ├── engine/
│   │   ├── EngineFactory.ts       # Detección WebGPU, fallback WebGL 2 y diagnósticos
│   │   ├── PerformanceManager.ts  # Ventana móvil de FPS y tiempo de cuadro
│   │   ├── ProceduralTextures.ts  # Texturas PBR (asfalto con grano, ventanas, neón, placa TSURU)
│   │   ├── RenderManager.ts       # Bucle de renderizado, paso fijo de físicas y telemetría
│   │   └── SceneManager.ts        # Orquestación 3D, IBL, iluminación y postprocesado ACES
│   ├── multiplayer/
│   │   └── InputManager.ts        # Captura de teclado y Gamepad API (preparado multijugador)
│   ├── physics/
│   │   └── VehiclePhysics.ts      # Dinámica arcade-sim, caja 6 vel., derrape y colisiones
│   ├── styles/
│   │   └── main.css               # Estilos del canvas, velocímetro y garaje accesible
│   ├── ui/
│   │   ├── GarageUI.ts            # Panel interactivo de personalización y tuning en vivo
│   │   └── HUD.ts                 # Telemetría vehicular, diagnóstico WebGPU/WebGL 2 y perfiles
│   ├── vehicles/
│   │   ├── BrandCarBuilders.ts    # Modelos 3D Nissan Skyline R34, Audi R8 y Mercedes-AMG GT R
│   │   ├── TsuruMeshBuilder.ts    # Modelo 3D suavizado Nissan Tsuru B13 y piezas de tuning
│   │   ├── Vehicle.ts             # Gestor de flota, soporte .glb, humo y flamas backfire
│   │   ├── VehicleCamera.ts       # Cámara de persecución suave y vista en cofre
│   │   └── VehicleConfig.ts       # Catálogo Nissan/Audi/Mercedes, pinturas y stages de motor
│   ├── world/
│   │   ├── AngelMonumentBuilder.ts # Monumento 3D de El Ángel de la Independencia
│   │   ├── BuildingManager.ts     # Torres de Reforma, edificios comerciales y letreros neón
│   │   ├── RoadManager.ts         # Red vial CDMX/Edomex, semáforos congruentes de 3 luces y glorieta
│   │   └── TrafficManager.ts      # Tráfico vivo (autos, Metrobús/Mexibús, patrullas y peatones NPC)
│   └── main.ts                    # Arranque de la aplicación y gestión de ciclo HMR
├── tests/
│   ├── EngineFactory.test.ts
│   ├── GraphicsConfig.test.ts
│   ├── PerformanceManager.test.ts
│   └── VehiclePhysics.test.ts
├── Dockerfile
├── compose.yaml
├── eslint.config.js
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── vite.config.ts
```

## Atribución de assets gratuitos externos

- **`public/assets/vehicles/CarConcept.glb`**: Khronos Group `glTF-Sample-Assets` (`CarConcept`), licencia **CC BY 4.0**.
- **`public/assets/textures/environmentSpecular.env`**: Babylon.js Official Assets (`environmentSpecular.env`).

## Hoja de ruta de implementación

- **Fases 1–3 (Implementadas)**: Infraestructura Docker/pnpm/Vite/TS/ESLint/Prettier/Vitest, WebGPU/WebGL 2, Paseo de la Reforma con Glorieta del Ángel de la Independencia, conducción arcade-sim, Nissan Tsuru B13 + Concept GT `.glb`, garaje de tuning y HUD completo.
- **Fases 4–6 (Siguientes)**: Integración opcional de Babylon Physics V2 (Havok) detrás de capa de abstracción para carreras con rivales IA, audio/radio modular, pantalla dividida local y pruebas comparativas en hardware objetivo (M1, Intel UHD, AMD Radeon).
