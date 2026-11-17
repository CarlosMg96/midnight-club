import { describe, expect, it } from 'vitest';
import { PerformanceManager } from '../src/engine/PerformanceManager';

describe('PerformanceManager', () => {
  it('clasifica 60 FPS como OPTIMAL y calcula correctamente el promedio', () => {
    const manager = new PerformanceManager(10);
    for (let i = 0; i < 10; i += 1) {
      manager.recordFrame(16.6667);
    }

    const snapshot = manager.getSnapshot();
    expect(snapshot.sampleCount).toBe(10);
    expect(snapshot.averageFps).toBeCloseTo(60, 0);
    expect(snapshot.frameTimeMs).toBeCloseTo(16.67, 1);
    expect(snapshot.status).toBe('OPTIMAL');
  });

  it('clasifica ~33 FPS como ACCEPTABLE', () => {
    const manager = new PerformanceManager(5);
    for (let i = 0; i < 5; i += 1) {
      manager.recordFrame(30);
    }

    const snapshot = manager.getSnapshot();
    expect(snapshot.averageFps).toBeCloseTo(33.33, 1);
    expect(snapshot.status).toBe('ACCEPTABLE');
  });

  it('clasifica <28 FPS como LOW e ignora muestras no válidas', () => {
    const manager = new PerformanceManager(4);
    manager.recordFrame(0);
    manager.recordFrame(-10);
    manager.recordFrame(Number.NaN);
    manager.recordFrame(50);
    manager.recordFrame(50);

    const snapshot = manager.getSnapshot();
    expect(snapshot.sampleCount).toBe(2);
    expect(snapshot.averageFps).toBeCloseTo(20, 1);
    expect(snapshot.status).toBe('LOW');
  });

  it('mantiene únicamente las últimas N muestras y permite resetear', () => {
    const manager = new PerformanceManager(3);
    manager.recordFrame(50);
    manager.recordFrame(50);
    manager.recordFrame(16.67);
    manager.recordFrame(16.67);
    manager.recordFrame(16.67);

    const snapshot = manager.getSnapshot();
    expect(snapshot.sampleCount).toBe(3);
    expect(snapshot.averageFps).toBeCloseTo(60, 0);

    manager.reset();
    expect(manager.getSnapshot().sampleCount).toBe(0);
  });
});
