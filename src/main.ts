import { env } from './env';
import { createFreezerAlerter } from './freezer-alert';
import {
  markConnected,
  markDisconnected,
  markEvent,
  startHealthServer,
} from './health';
import { createTemperatureMonitor } from './monitor';
import { sendPushover } from './pushover';

const checkFreezer = createFreezerAlerter({
  setPoint: -18,
  criticalAt: -12,
  warningGraceMs: 10 * 60_000,
});

startHealthServer();

createTemperatureMonitor(env.API_KEY, {
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
    checkFreezer(r);
  },
  onChange: (r, prev) =>
    console.log(
      `⚠️ ${r.deviceName} zone ${r.zoneId}: ${prev}${r.unit} → ${r.current}${r.unit}`,
    ),
})
  .start()
  .then(() => {
    sendPushover({
      title: '🟢 Freezer alerter started',
      message: 'Connected to the Liebherr API, monitoring is running.',
      priority: -1,
    })
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
