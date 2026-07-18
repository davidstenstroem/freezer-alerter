import { env } from './env';
import { createFreezerAlerter } from './freezer-alert';
import {
  markConnected,
  markDisconnected,
  markEvent,
  startHealtServer,
} from './health';
import { createTemperatureMonitor } from './monitor';

const checkFreezer = createFreezerAlerter({
  setPoint: -18,
  criticalAt: -12,
  warningGraceMs: 10 * 60_000,
});

startHealtServer();

createTemperatureMonitor({
  onConnected: (id) => {
    console.log(`[sse] connected: ${id}`);
    markConnected();
  },
  onDisconnected: (id) => {
    console.log(`[sse] disconnected: ${id}, reconnecting...`);
    markDisconnected();
  },
  onError: (err) => console.error(`[sse] ${err.message}`),
  onTemperature: (r) => {
    console.log(
      `${r.deviceName} zone ${r.zoneId} (${r.zonePosition ?? '?'}): ${r.current}${r.unit} (target ${r.target}${r.unit})`,
    );
    markEvent();
    if (r.deviceId === env.DEVICE_ID) {
      checkFreezer(r);
    }
  },
  onChange: (r, prev) =>
    console.log(
      `⚠️ ${r.deviceName} zone ${r.zoneId}: ${prev}${r.unit} → ${r.current}${r.unit}`,
    ),
})
  .start()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
