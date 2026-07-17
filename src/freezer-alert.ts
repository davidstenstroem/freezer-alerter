import { sendPushover } from './pushover';
import type { TemperatureReading } from './types';

type Level = 'ok' | 'warning' | 'critical';

export function createFreezerAlerter({
  setPoint = -18,
  criticalAt = -12,
  warningGraceMs = 10 * 60_000,
}: { setPoint?: number; criticalAt?: number; warningGraceMs?: number } = {}) {
  const zones = new Map<string, { level: Level; warmSince: number | null }>();

  return (r: TemperatureReading): void => {
    const key = `${r.deviceId}:${r.zoneId}`;
    const state = zones.get(key) ?? { level: 'ok' as Level, warmSince: null };
    zones.set(key, state);

    const isWarm = r.current > setPoint;
    const isCritial = r.current >= criticalAt;

    if (!isWarm) state.warmSince = null;
    else state.warmSince ??= Date.now();

    let next: Level;
    if (isCritial) next = 'critical';
    else if (!isWarm) next = 'ok';
    else if (state.level !== 'ok') next = 'warning';
    else
      next =
        Date.now() - (state.warmSince ?? Date.now()) >= warningGraceMs
          ? 'warning'
          : 'ok';
    if (next === state.level) return;
    const prev = state.level;
    state.level = next;

    if (next === 'critical') {
      void sendPushover({
        title: '🚨 FREEZER CRITICAL',
        message: `Zone ${r.zoneId} is at ${r.current}${r.unit} (critical >= ${criticalAt}${r.unit}). Check the freezer NOW.`,
        priority: 2,
      });
    } else if (next === 'warning') {
      if (prev === 'ok') {
        void sendPushover({
          title: '⚠️ Freezer too warm',
          message: `Zone ${r.zoneId} is at ${r.current}${r.unit}, above setpoint ${setPoint}${r.unit}.`,
          priority: 1,
        });
      }
    } else {
      void sendPushover({
        title: '✅ Freezer recovered',
        message: `Zone ${r.zoneId} is back at ${r.current}${r.unit}.`,
        priority: 0,
      });
    }
  };
}
