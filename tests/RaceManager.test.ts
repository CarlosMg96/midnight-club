import { describe, expect, it } from 'vitest';
import { AudioManager } from '../src/engine/AudioManager';
import type { VehiclePhysicsState } from '../src/physics/VehiclePhysics';
import { RaceManager } from '../src/world/RaceManager';

function makeState(overrides?: Partial<VehiclePhysicsState>): VehiclePhysicsState {
  return {
    x: 13.5,
    z: -40,
    vx: 0,
    vz: 0,
    heading: 0,
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
    ...overrides,
  };
}

describe('AudioManager (modo headless seguro)', () => {
  it('soporta mute/unmute, eventos discretos y actualización sin AudioContext en Node', () => {
    const audio = new AudioManager();
    expect(audio.isMuted()).toBe(false);
    expect(audio.toggleMute()).toBe(true);
    expect(audio.isMuted()).toBe(true);
    audio.setMuted(false);
    expect(audio.isMuted()).toBe(false);

    audio.update(
      makeState({
        rpm: 5400,
        gear: '4',
        speedKmh: 120,
        isDrifting: true,
        isNitroActive: true,
        isPolicePursuit: true,
        impactIntensity: 0.7,
      }),
      'COUNTDOWN_GO',
      1 / 60,
    );
    audio.update(makeState(), 'CHECKPOINT', 1 / 60);
    audio.update(makeState(), 'FINISH_WIN', 1 / 60);
    audio.dispose();
  });
});

describe('RaceManager (carreras callejeras e IA rival)', () => {
  it('cicla los 3 circuitos metropolitanos, ejecuta cuenta regresiva y activa 5 rivales', () => {
    const manager = new RaceManager(null);
    expect(manager.getSnapshot(false).phase).toBe('IDLE');
    expect(manager.getRivalColliders()).toHaveLength(0);

    const first = manager.startNextRace();
    expect(first.id).toBe('REFORMA_SPRINT');
    expect(manager.isCountdownFrozen()).toBe(true);
    expect(manager.getRivalColliders()).toHaveLength(5);

    const events: string[] = [];
    for (let i = 0; i < 70; i += 1) {
      const snap = manager.update(0.05, makeState({ x: first.spawn.x, z: first.spawn.z }));
      if (snap.audioEvent !== 'NONE') {
        events.push(snap.audioEvent);
      }
    }

    const active = manager.getSnapshot(false);
    expect(active.phase).toBe('RACING');
    expect(manager.isCountdownFrozen()).toBe(false);
    expect(events).toContain('COUNTDOWN_TICK');
    expect(events).toContain('COUNTDOWN_GO');

    const second = manager.startNextRace();
    expect(second.id).toBe('RETO_MARQUESA');
    const third = manager.startNextRace();
    expect(third.id).toBe('CIRCUITO_ZMVM');
    const wrapped = manager.startNextRace();
    expect(wrapped.id).toBe('REFORMA_SPRINT');

    manager.stopRace();
    expect(manager.getSnapshot(false).phase).toBe('IDLE');
    expect(manager.getRivalColliders()).toHaveLength(0);
  });

  it('avanza checkpoints y vueltas hasta cruzar meta con cálculo de posición 1..6', () => {
    const manager = new RaceManager(null);
    const spec = manager.startNextRace();

    // Supera los 3 segundos de cuenta regresiva
    for (let i = 0; i < 65; i += 1) {
      manager.update(0.05, makeState({ x: spec.spawn.x, z: spec.spawn.z }));
    }

    let lastSnap = manager.getSnapshot(true);
    expect(lastSnap.phase).toBe('RACING');

    // Recorre todos los checkpoints de todas las vueltas teletransportando al jugador dentro del radio
    const maxSteps = spec.totalLaps * spec.checkpoints.length + 2;
    for (let step = 0; step < maxSteps && lastSnap.phase === 'RACING'; step += 1) {
      const cp = lastSnap.activeCheckpoint;
      expect(cp).not.toBeNull();
      if (!cp) break;
      lastSnap = manager.update(0.05, makeState({ x: cp.x, z: cp.z, speedKmh: 140 }));
    }

    expect(lastSnap.phase).toBe('FINISHED');
    expect(lastSnap.finishPosition).toBeGreaterThanOrEqual(1);
    expect(lastSnap.finishPosition).toBeLessThanOrEqual(6);
    expect(lastSnap.audioEvent === 'FINISH_WIN' || lastSnap.audioEvent === 'FINISH_LOSE').toBe(
      true,
    );
  });
});
