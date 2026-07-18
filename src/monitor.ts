import type {
  LiebherrDevice,
  MonitorHandlers,
  MonitorOptions,
  RawControl,
  TemperatureReading,
  TempMonitor,
} from './types';

const apiBaseUrl = 'https://home-api.smartdevice.liebherr.com/v1'

export async function* sseEvents(
  apiKey: string,
  deviceId: string,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const res = await fetch(
    `${apiBaseUrl}/sse/devices/${deviceId}/controls`,
    {
      headers: {
        'api-key': apiKey,
        accept: 'text/event-stream',
      },
      signal,
    },
  );

  if (!res.ok || !res.body)
    throw new Error(`SSE connect failed: ${res.status}`);

  const decoder = new TextDecoder();

  let buffer = '';

  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '');
      const data = rawEvent
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
    }
  }
}

export function parseTemperatureReadings(
  device: LiebherrDevice,
  json: string,
  now: Date = new Date(),
): TemperatureReading[] {
  let controls: RawControl[];
  try {
    controls = JSON.parse(json) as RawControl[];
  } catch {
    return [];
  }

  return controls
    .filter(
      (c): c is RawControl & { value: number } =>
        c.type === 'TemperatureControl' && typeof c.value === 'number',
    )
    .map((c) => ({
      deviceId: device.deviceId,
      deviceName: device.nickname ?? device.deviceName,
      zoneId: c.zoneId ?? 0,
      zonePosition: c.zonePosition,
      current: c.value,
      target: c.target ?? NaN,
      unit: c.unit ?? '°C',
      timestamp: now,
    }));
}

export function createTemperatureMonitor(
  apiKey: string,
  handlers: MonitorHandlers,
  { reconnectBaseMs = 5_000, reconnectMaxMs = 5 * 60_000 }: MonitorOptions = {},
): TempMonitor {
  const lastValues = new Map<string, number>();
  const aborts = new Map<string, AbortController>();
  let stopped = false;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const handleReadings = (readings: TemperatureReading[]): void => {
    for (const reading of readings) {
      handlers.onTemperature?.(reading);
      const key = `${reading.deviceId}:${reading.zoneId}`;
      const prev = lastValues.get(key);
      if (prev !== undefined && prev !== reading.current) {
        handlers.onChange?.(reading, prev);
      }
      lastValues.set(key, reading.current);
    }
  };

  const streamOnce = async (device: LiebherrDevice): Promise<void> => {
    const ac = new AbortController();
    aborts.set(device.deviceId, ac);

    let connected = false;
    for await (const data of sseEvents(apiKey, device.deviceId, ac.signal)) {
      if (!connected) {
        connected = true;
        handlers.onConnected?.(device.deviceId);
      }
      handleReadings(parseTemperatureReadings(device, data));
    }
  };

  const streamWithReconnect = async (device: LiebherrDevice): Promise<void> => {
    let attempt = 0;
    while (!stopped) {
      try {
        await streamOnce(device);
        attempt = 0;
      } catch (err) {
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
      if (stopped) return;
      handlers.onDisconnected?.(device.deviceId);
      await sleep(Math.min(reconnectBaseMs * 2 ** attempt++, reconnectMaxMs));
    }
  };

  return {
    start: async () => {
      stopped = false;
      const devices = await getDevices(apiKey);
      for (const device of devices) {
        void streamWithReconnect(device);
      }
    },
    stop: () => {
      stopped = true;
      for (const ac of aborts.values()) ac.abort();
      aborts.clear();
    },
  };
}

export async function getDevices(apiKey: string): Promise<LiebherrDevice[]> {
  const res = await fetch(`${apiBaseUrl}/devices`, {
    headers: { 'api-key': apiKey },
  });
  if (res.status === 401) throw new Error('Invalid API Key');
  if (res.status === 429) throw new Error('API rate limit exceeded');
  if (!res.ok) throw new Error(`GET /devices failed: ${res.status}`);
  return (await res.json()) as LiebherrDevice[];
}
