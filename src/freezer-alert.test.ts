import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFreezerAlerter } from './freezer-alert';
import { sendPushover } from './pushover';
import type { TemperatureReading } from './types';

vi.mock('./pushover', () => ({
  sendPushover: vi.fn().mockResolvedValue(undefined),
}));

const sendMock = vi.mocked(sendPushover);

const GRACE_MS = 10 * 60_000;

const reading = (current: number, zoneId = 0): TemperatureReading => ({
  deviceId: 'dev-1',
  deviceName: 'Skabsfryser',
  zoneId,
  current,
  target: -18,
  unit: '°C',
  timestamp: new Date(),
});

const createAlerter = () =>
  createFreezerAlerter({
    setPoint: -18,
    criticalAt: -12,
    warningGraceMs: GRACE_MS,
  });

describe('createFreezerAlerter', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-07-17T12:00:00Z') });
    sendMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ok state', () => {
    it('stays silent at the setpoint', () => {
      const check = createAlerter();
      check(reading(-18));
      check(reading(-19));
      check(reading(-18));
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('does not warn on a brief warm blip within the grace period', () => {
      const check = createAlerter();
      check(reading(-17)); // door opened
      vi.advanceTimersByTime(GRACE_MS - 1);
      check(reading(-17)); // still within grace
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('resets the grace timer when temperature returns to setpoint', () => {
      const check = createAlerter();
      check(reading(-17));
      vi.advanceTimersByTime(5 * 60_000);
      check(reading(-18)); // recovered before grace elapsed
      vi.advanceTimersByTime(60 * 60_000);
      check(reading(-17)); // new excursion, grace restarts
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('warning', () => {
    it('warns with priority 1 once the grace period has elapsed', () => {
      const check = createAlerter();
      check(reading(-17));
      vi.advanceTimersByTime(GRACE_MS);
      check(reading(-17));

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 1,
          title: expect.stringContaining('too warm'),
        }),
      );
    });

    it('does not repeat the warning while it stays warm', () => {
      const check = createAlerter();
      check(reading(-17));
      vi.advanceTimersByTime(GRACE_MS);
      check(reading(-17)); // warning sent
      check(reading(-16));
      check(reading(-13)); // still below critical
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('warns even when no new reading arrives after the grace period', () => {
      const check = createAlerter();
      check(reading(-17)); // arms the re-evaluation timer
      vi.advanceTimersByTime(GRACE_MS + 1);
      // no new reading — the timer re-evaluated the last one
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 1 }),
      );
    });

    it('does not fire the timer warning after recovering within grace', () => {
      const check = createAlerter();
      check(reading(-17)); // arms the timer
      vi.advanceTimersByTime(5 * 60_000);
      check(reading(-18)); // recovered — must clear the pending timer
      vi.advanceTimersByTime(GRACE_MS * 2);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('reports the latest reading when the timer fires', () => {
      const check = createAlerter();
      check(reading(-17));
      vi.advanceTimersByTime(60_000);
      check(reading(-16)); // still within grace, timer already armed
      vi.advanceTimersByTime(GRACE_MS);
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('-16') }),
      );
    });
  });

  describe('critical', () => {
    it('alerts immediately with priority 2, skipping the grace period', () => {
      const check = createAlerter();
      check(reading(-12));

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 2,
          title: expect.stringContaining('CRITICAL'),
        }),
      );
    });

    it('escalates from warning to critical', () => {
      const check = createAlerter();
      check(reading(-17));
      vi.advanceTimersByTime(GRACE_MS);
      check(reading(-17)); // warning
      check(reading(-11)); // critical

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(sendMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ priority: 2 }),
      );
    });

    it('does not repeat the critical alert while it stays critical', () => {
      const check = createAlerter();
      check(reading(-12));
      check(reading(-10));
      check(reading(-8));
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('de-escalates from critical to warning silently', () => {
      const check = createAlerter();
      check(reading(-12)); // critical
      check(reading(-16)); // improving, still warm
      expect(sendMock).toHaveBeenCalledTimes(1); // only the critical alert
    });
  });

  describe('recovery', () => {
    it('sends an all-clear with priority 0 when back at setpoint', () => {
      const check = createAlerter();
      check(reading(-12)); // critical
      check(reading(-18)); // recovered

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(sendMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          priority: 0,
          title: expect.stringContaining('recovered'),
        }),
      );
    });

    it('goes through a full cycle: ok → warning → critical → ok → ok', () => {
      const check = createAlerter();
      check(reading(-17));
      vi.advanceTimersByTime(GRACE_MS);
      check(reading(-17)); // 1: warning
      check(reading(-12)); // 2: critical
      check(reading(-19)); // 3: recovered
      check(reading(-18)); // silent

      expect(sendMock).toHaveBeenCalledTimes(3);
      expect(sendMock.mock.calls.map(([msg]) => msg.priority)).toEqual([
        1, 2, 0,
      ]);
    });
  });

  describe('boundaries', () => {
    it('treats exactly the setpoint as ok', () => {
      const check = createAlerter();
      check(reading(-18));
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('treats exactly criticalAt as critical', () => {
      const check = createAlerter();
      check(reading(-12));
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 2 }),
      );
    });

    it('treats one below criticalAt as warm, not critical', () => {
      const check = createAlerter();
      check(reading(-13));
      expect(sendMock).not.toHaveBeenCalled(); // within grace, no warning yet
    });
  });

  describe('zones', () => {
    it('tracks zones independently', () => {
      const check = createAlerter();
      check(reading(-12, 0)); // zone 0 critical
      check(reading(-18, 1)); // zone 1 fine
      expect(sendMock).toHaveBeenCalledTimes(1);

      check(reading(-11, 1)); // zone 1 now critical too
      expect(sendMock).toHaveBeenCalledTimes(2);

      check(reading(-18, 0)); // zone 0 recovers, zone 1 still critical
      expect(sendMock).toHaveBeenCalledTimes(3);
      expect(sendMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ priority: 0 }),
      );
    });
  });
});
