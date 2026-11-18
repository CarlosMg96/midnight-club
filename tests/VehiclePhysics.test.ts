import { describe, expect, it } from 'vitest';
import {
  FIXED_TIME_STEP,
  METROPOLITAN_CURVE_BARRIERS,
  METROPOLITAN_OPEN_CURVES,
  METROPOLITAN_ZONES,
  resolveIntersectionSignalState,
  TEST_AVENUE_CONFIG,
} from '../src/config/GameConfig';
import type { DrivingInputState } from '../src/multiplayer/InputManager';
import { VehiclePhysics } from '../src/physics/VehiclePhysics';
import {
  computeEffectiveVehicleSpecs,
  DEFAULT_TUNING_CONFIG,
  VEHICLE_CATALOG,
} from '../src/vehicles/VehicleConfig';
import type { TrafficNpcKind } from '../src/world/TrafficManager';

const NEUTRAL_INPUT: DrivingInputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  nitro: false,
};

describe('VehiclePhysics y Tuning', () => {
  it('acelera el Nissan Tsuru B13 hacia adelante y sube de marcha', () => {
    const physics = new VehiclePhysics();
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);

    for (let i = 0; i < 180; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs);
    }

    const state = physics.getState();
    expect(state.speedKmh).toBeGreaterThan(75);
    expect(state.z).toBeGreaterThan(TEST_AVENUE_CONFIG.playerSpawn.z + 25);
    expect(['2', '3', '4', '5', '6']).toContain(state.gear);
  });

  it('frena y entra en reversa al mantener freno desde parado', () => {
    const physics = new VehiclePhysics();
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);

    for (let i = 0; i < 90; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, brake: 1 }, specs);
    }

    const state = physics.getState();
    expect(state.forwardSpeed).toBeLessThan(-4);
    expect(state.gear).toBe('R');
  });

  it('cambia dirección y activa derrape con freno de mano a velocidad', () => {
    const physics = new VehiclePhysics();
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);

    for (let i = 0; i < 120; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs);
    }

    for (let i = 0; i < 20; i += 1) {
      physics.step(
        FIXED_TIME_STEP,
        { ...NEUTRAL_INPUT, throttle: 1, steer: 1, handbrake: true },
        specs,
      );
    }

    const state = physics.getState();
    expect(state.heading).toBeGreaterThan(0.15);
    expect(state.isDrifting).toBe(true);
  });

  it('el swap de motor SR20DET supera claramente al motor 1.6L Stock', () => {
    const stockPhysics = new VehiclePhysics();
    const swapPhysics = new VehiclePhysics();

    const stockSpecs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);
    const swapSpecs = computeEffectiveVehicleSpecs({
      ...DEFAULT_TUNING_CONFIG,
      engineStage: 'SR20DET_SWAP',
      bodyKit: 'MIDNIGHT_GT',
    });

    for (let i = 0; i < 180; i += 1) {
      stockPhysics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, stockSpecs);
      swapPhysics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, swapSpecs);
    }

    expect(swapPhysics.getState().speedKmh).toBeGreaterThan(stockPhysics.getState().speedKmh + 25);
  });

  it('colisiona con la glorieta del Ángel de la Independencia sin atravesarla', () => {
    const physics = new VehiclePhysics({ x: 0, y: 0, z: 54, heading: 0 });
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);

    for (let i = 0; i < 180; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs);
    }

    const state = physics.getState();
    const distToAngel = Math.hypot(
      state.x - TEST_AVENUE_CONFIG.angelPosition.x,
      state.z - TEST_AVENUE_CONFIG.angelPosition.z,
    );
    expect(distToAngel).toBeGreaterThanOrEqual(TEST_AVENUE_CONFIG.roundaboutCollisionRadius);
  });

  it('diferencia las prestaciones entre Nissan Tsuru, Skyline R34, Audi R8 y Mercedes-AMG GT', () => {
    const tsuru = computeEffectiveVehicleSpecs({
      ...DEFAULT_TUNING_CONFIG,
      vehicleId: 'NISSAN_TSURU',
    });
    const r34 = computeEffectiveVehicleSpecs({
      ...DEFAULT_TUNING_CONFIG,
      vehicleId: 'NISSAN_GTR_R34',
    });
    const audi = computeEffectiveVehicleSpecs({ ...DEFAULT_TUNING_CONFIG, vehicleId: 'AUDI_R8' });
    const mercedes = computeEffectiveVehicleSpecs({
      ...DEFAULT_TUNING_CONFIG,
      vehicleId: 'MERCEDES_AMG_GT',
    });

    expect(VEHICLE_CATALOG.NISSAN_GTR_R34.brand).toBe('Nissan');
    expect(VEHICLE_CATALOG.AUDI_R8.brand).toBe('Audi');
    expect(VEHICLE_CATALOG.MERCEDES_AMG_GT.brand).toBe('Mercedes-Benz');

    expect(r34.maxEngineAcceleration).toBeGreaterThan(tsuru.maxEngineAcceleration);
    expect(audi.maxSpeedMs).toBeGreaterThan(tsuru.maxSpeedMs);
    expect(mercedes.maxSpeedMs).toBeGreaterThan(tsuru.maxSpeedMs);
  });

  it('permite circular por corredores transversales hacia Estado de México y colisiona con El Coyote de Neza', () => {
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);

    const sateliteZone = METROPOLITAN_ZONES.NAUCALPAN_SATELITE;
    const satelitePhysics = new VehiclePhysics(sateliteZone.spawn);
    for (let i = 0; i < 180; i += 1) {
      satelitePhysics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs);
    }
    const sateliteState = satelitePhysics.getState();
    expect(sateliteState.z).toBeGreaterThan(sateliteZone.spawn.z + 25);
    expect(sateliteState.speedKmh).toBeGreaterThan(55);

    const coyoteZone = METROPOLITAN_ZONES.NEZAHUALCOYOTL_COYOTE;
    const nezaPhysics = new VehiclePhysics({ x: 356, y: 0, z: 75, heading: Math.PI / 2 });
    for (let i = 0; i < 120; i += 1) {
      nezaPhysics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs);
    }
    const nezaState = nezaPhysics.getState();
    const distToCoyote = Math.hypot(
      nezaState.x - coyoteZone.landmark.x,
      nezaState.z - coyoteZone.landmark.z,
    );
    expect(distToCoyote).toBeGreaterThanOrEqual(8.5);
  });

  it('mantiene congruencia opuesta de semáforos entre ejes Norte-Sur y Este-Oeste', () => {
    expect(resolveIntersectionSignalState(0)).toEqual({ ns: 'GREEN', ew: 'RED' });
    expect(resolveIntersectionSignalState(9.5)).toEqual({ ns: 'YELLOW', ew: 'RED' });
    expect(resolveIntersectionSignalState(12)).toEqual({ ns: 'RED', ew: 'GREEN' });
    expect(resolveIntersectionSignalState(21.5)).toEqual({ ns: 'RED', ew: 'YELLOW' });
    expect(resolveIntersectionSignalState(24)).toEqual({ ns: 'GREEN', ew: 'RED' });

    for (let sec = 0; sec < 24; sec += 0.5) {
      const state = resolveIntersectionSignalState(sec);
      expect(state.ns === 'RED' || state.ew === 'RED').toBe(true);
    }
  });

  it('colisiona con vehículos NPC a nivel de suelo (sedán, metrobús, tranvía y patrulla) e ignora trenes del Metro elevado', () => {
    const physics = new VehiclePhysics({ x: 13.5, y: 0, z: 0, heading: 0 });
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);
    const npcs: ReadonlyArray<{ x: number; z: number; kind: TrafficNpcKind; elevated: boolean }> = [
      { x: 13.5, z: 6, kind: 'METRO', elevated: true },
      { x: 13.5, z: 12, kind: 'TRAM', elevated: false },
      { x: -13.8, z: 24, kind: 'PATROL', elevated: false },
    ];

    for (let i = 0; i < 180; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs, npcs);
    }

    const state = physics.getState();
    const distToTram = Math.hypot(state.x - 13.5, state.z - 12);
    expect(state.z).toBeGreaterThan(6);
    expect(distToTram).toBeGreaterThanOrEqual(2.35);
    expect(state.z).toBeLessThan(12);
  });

  it('colisiona con las islas deflectoras de curvas cerradas en La Marquesa sin atravesarlas', () => {
    const firstApex = METROPOLITAN_CURVE_BARRIERS[0];
    expect(firstApex).toBeDefined();
    if (!firstApex) {
      return;
    }

    const physics = new VehiclePhysics({
      x: firstApex.x,
      y: 0,
      z: firstApex.z + firstApex.radius + 8,
      heading: Math.PI,
    });
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);

    for (let i = 0; i < 120; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs);
    }

    const state = physics.getState();
    const distToApex = Math.hypot(state.x - firstApex.x, state.z - firstApex.z);
    expect(distToApex).toBeGreaterThanOrEqual(firstApex.radius);
  });

  it('activa persecución policial al pasarse una luz roja de tráfico y limpia al reiniciar', () => {
    const physics = new VehiclePhysics({ x: 13.5, y: 0, z: 34, heading: 0 });
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);
    const redSignal = {
      ns: 'RED' as const,
      ew: 'GREEN' as const,
      nsRemainingSec: 10,
      ewRemainingSec: 10,
    };

    for (let i = 0; i < 120; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs, undefined, redSignal);
    }

    const state = physics.getState();
    expect(state.z).toBeGreaterThanOrEqual(44);
    expect(state.isPolicePursuit).toBe(true);
    expect(state.pursuitTimer).toBeGreaterThan(30);

    physics.reset();
    const resetState = physics.getState();
    expect(resetState.isPolicePursuit).toBe(false);
    expect(resetState.pursuitTimer).toBe(0);
    expect(resetState.damageLevel).toBe(0);
  });

  it('aplica físicas de choque bidireccionales con impulso NPC, daño y persecución contra patrulla', () => {
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);
    const physics = new VehiclePhysics({ x: 13.5, y: 0, z: -20, heading: 0 });
    const greenSignal = {
      ns: 'GREEN' as const,
      ew: 'RED' as const,
      nsRemainingSec: 10,
      ewRemainingSec: 10,
    };

    let impactCalls = 0;
    let maxImpulseVz = 0;
    let maxAbsSpin = 0;
    let npcX = 14.3;
    let npcZ = -6;
    let npcVx = 0;
    let npcVz = 0;

    const sedanNpc = [
      {
        get x(): number {
          return npcX;
        },
        get z(): number {
          return npcZ;
        },
        get vx(): number {
          return npcVx;
        },
        get vz(): number {
          return npcVz;
        },
        kind: 'SEDAN',
        elevated: false,
        onImpact: (impulseVx: number, impulseVz: number, spinDelta: number): void => {
          impactCalls += 1;
          npcVx += impulseVx;
          npcVz += impulseVz;
          maxImpulseVz = Math.max(maxImpulseVz, impulseVz);
          maxAbsSpin = Math.max(maxAbsSpin, Math.abs(spinDelta));
        },
      },
    ];

    let peakIntensity = 0;
    for (let i = 0; i < 120; i += 1) {
      npcX += npcVx * FIXED_TIME_STEP;
      npcZ += npcVz * FIXED_TIME_STEP;
      const st = physics.step(
        FIXED_TIME_STEP,
        { ...NEUTRAL_INPUT, throttle: 1 },
        specs,
        sedanNpc,
        greenSignal,
      );
      peakIntensity = Math.max(peakIntensity, st.impactIntensity);
    }

    const afterCrash = physics.getState();
    expect(impactCalls).toBeGreaterThan(0);
    expect(maxImpulseVz).toBeGreaterThan(2);
    expect(maxAbsSpin).toBeGreaterThan(0.05);
    expect(peakIntensity).toBeGreaterThan(0.15);
    expect(afterCrash.damageLevel).toBeGreaterThan(0);

    // Colisionar con una patrulla policial activa persecución inmediata
    const patrolPhysics = new VehiclePhysics({ x: 13.5, y: 0, z: -4, heading: 0 });
    const patrolNpc = [{ x: 13.5, z: 6, kind: 'PATROL', elevated: false }];
    for (let i = 0; i < 90; i += 1) {
      patrolPhysics.step(
        FIXED_TIME_STEP,
        { ...NEUTRAL_INPUT, throttle: 1 },
        specs,
        patrolNpc,
        greenSignal,
      );
    }
    expect(patrolPhysics.getState().isPolicePursuit).toBe(true);
  });

  it('permite recorrer a alta velocidad las curvas abiertas metropolitanas sin colisión de muro', () => {
    const openCurve = METROPOLITAN_OPEN_CURVES.find((c) => c.id === 'curva-abierta-satelite-nw');
    expect(openCurve).toBeDefined();
    if (!openCurve) {
      return;
    }

    const midR = (openCurve.innerRadius + openCurve.outerRadius) / 2;
    const theta = (3 * Math.PI) / 4;
    const spawnX = openCurve.cx + Math.cos(theta) * midR;
    const spawnZ = openCurve.cz + Math.sin(theta) * midR;

    const physics = new VehiclePhysics({
      x: spawnX,
      y: 0,
      z: spawnZ,
      heading: -theta,
    });
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);

    for (let i = 0; i < 100; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT, throttle: 1 }, specs);
    }

    const state = physics.getState();
    const radiusFromCenter = Math.hypot(state.x - openCurve.cx, state.z - openCurve.cz);
    expect(state.speedKmh).toBeGreaterThan(40);
    expect(state.impactIntensity).toBe(0);
    expect(radiusFromCenter).toBeGreaterThan(openCurve.innerRadius);
    expect(radiusFromCenter).toBeLessThan(openCurve.outerRadius);
  });

  it('arresta al jugador e inmoviliza el vehículo cuando las patrullas lo acorralan en persecución', () => {
    const physics = new VehiclePhysics({ x: 13.5, y: 0, z: -12, heading: 0 });
    const specs = computeEffectiveVehicleSpecs(DEFAULT_TUNING_CONFIG);
    physics.triggerPolicePursuit(35);

    const nearbyPatrol = [{ x: 13.5, z: -6, vx: 0, vz: 0, kind: 'PATROL', elevated: false }];
    for (let i = 0; i < 120; i += 1) {
      physics.step(FIXED_TIME_STEP, { ...NEUTRAL_INPUT }, specs, nearbyPatrol);
    }

    const arrestedState = physics.getState();
    expect(arrestedState.isArrested).toBe(true);
    expect(arrestedState.arrestProgress).toBe(1);
    expect(arrestedState.arrestCount).toBe(1);
    expect(arrestedState.speedKmh).toBe(0);

    // Aunque acelere, permanece inmovilizado hasta salir del corralón con reset()
    physics.step(
      FIXED_TIME_STEP,
      { ...NEUTRAL_INPUT, throttle: 1, nitro: true },
      specs,
      nearbyPatrol,
    );
    expect(physics.getState().isArrested).toBe(true);
    expect(physics.getState().speedMs).toBe(0);

    physics.reset();
    const releasedState = physics.getState();
    expect(releasedState.isArrested).toBe(false);
    expect(releasedState.arrestProgress).toBe(0);
    expect(releasedState.arrestCount).toBe(1);
  });
});
