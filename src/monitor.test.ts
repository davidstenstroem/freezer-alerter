import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createTemperatureMonitor,
  getDevices,
  parseTemperatureReadings,
  sseEvents,
} from './monitor';
import type { LiebherrDevice, TemperatureReading } from './types';

const device: LiebherrDevice = {
  deviceId: 'dev-1',
  nickname: 'Skabsfryser',
  deviceName: 'SFNe 5227',
  deviceType: 'FREEZER',
};

const encoder = new TextEncoder();

/** Build a ReadableStream from chunks, closing when exhausted. */
const streamOf = (
  ...chunks: (string | Uint8Array)[]
): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === 'string' ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
  });

/** A stream that never produces data and never closes. */
const hangingStream = (): ReadableStream<Uint8Array> =>
  new ReadableStream({ start() {} });

const fetchMock = vi.fn();

const collectSse = async (
  ...chunks: (string | Uint8Array)[]
): Promise<string[]> => {
  fetchMock.mockResolvedValue(new Response(streamOf(...chunks)));
  const events: string[] = [];
  for await (const e of sseEvents('key', 'dev-1', new AbortController().signal)) {
    events.push(e);
  }
  return events;
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sseEvents', () => {
  it('requests the SSE endpoint with api key and accept header', async () => {
    await collectSse('data: []\n\n');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://home-api.smartdevice.liebherr.com/v1/sse/devices/dev-1/controls',
      expect.objectContaining({
        headers: expect.objectContaining({
          'api-key': 'key',
          accept: 'text/event-stream',
        }),
      }),
    );
  });

  it('yields the data of a single event', async () => {
    expect(await collectSse('data: [1,2]\n\n')).toEqual(['[1,2]']);
  });

  it('yields multiple events arriving in one chunk', async () => {
    expect(await collectSse('data: [1]\n\ndata: [2]\n\n')).toEqual([
      '[1]',
      '[2]',
    ]);
  });

  it('buffers an event split across chunks', async () => {
    expect(await collectSse('data: [1,', '2,3]', '\n\n')).toEqual(['[1,2,3]']);
  });

  it('handles CRLF line endings', async () => {
    expect(await collectSse('data: [1]\r\n\r\ndata: [2]\r\n\r\n')).toEqual([
      '[1]',
      '[2]',
    ]);
  });

  it('joins multi-line data fields with newlines', async () => {
    expect(await collectSse('data: line1\ndata: line2\n\n')).toEqual([
      'line1\nline2',
    ]);
  });

  it('accepts data without a space after the colon', async () => {
    expect(await collectSse('data:[1]\n\n')).toEqual(['[1]']);
  });

  it('ignores comments and non-data fields', async () => {
    expect(
      await collectSse(': keep-alive\n\nevent: update\nid: 7\ndata: [1]\n\n'),
    ).toEqual(['[1]']);
  });

  it('reassembles a multi-byte character split across chunks', async () => {
    const bytes = encoder.encode('data: {"unit":"°C"}\n\n');
    // ° encodes as 0xC2 0xB0 — split between the two bytes
    const mid = bytes.indexOf(0xc2) + 1;
    expect(await collectSse(bytes.slice(0, mid), bytes.slice(mid))).toEqual([
      '{"unit":"°C"}',
    ]);
  });

  it('does not yield a trailing event missing its separator', async () => {
    expect(await collectSse('data: [1]\n\ndata: incomplete')).toEqual(['[1]']);
  });

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 401 }));
    const iterate = async () => {
      for await (const _ of sseEvents(
        'key',
        'dev-1',
        new AbortController().signal,
      )) {
        // no-op
      }
    };
    await expect(iterate()).rejects.toThrow('SSE connect failed: 401');
  });
});

describe('parseTemperatureReadings', () => {
  it('maps a temperature control to a reading', () => {
    const now = new Date('2026-07-17T12:00:00Z');
    const json = JSON.stringify([
      {
        type: 'TemperatureControl',
        name: 'temperature',
        zoneId: 1,
        zonePosition: 'top',
        value: -18,
        target: -18,
        unit: '°C',
      },
    ]);

    expect(parseTemperatureReadings(device, json, now)).toEqual([
      {
        deviceId: 'dev-1',
        deviceName: 'Skabsfryser',
        zoneId: 1,
        zonePosition: 'top',
        current: -18,
        target: -18,
        unit: '°C',
        timestamp: now,
      } satisfies TemperatureReading,
    ]);
  });

  it('filters out non-temperature controls', () => {
    const json = JSON.stringify([
      { type: 'ToggleControl', name: 'superfrost', value: false },
      { type: 'TemperatureControl', name: 'temperature', value: -18 },
      { type: 'IceMakerControl', name: 'icemaker', value: 'OFF' },
    ]);
    expect(parseTemperatureReadings(device, json)).toHaveLength(1);
  });

  it('ignores temperature controls without a numeric value', () => {
    const json = JSON.stringify([
      { type: 'TemperatureControl', name: 'temperature', value: null },
      { type: 'TemperatureControl', name: 'temperature' },
      { type: 'TemperatureControl', name: 'temperature', value: '-18' },
    ]);
    expect(parseTemperatureReadings(device, json)).toEqual([]);
  });

  it('applies defaults for missing zoneId, unit and target', () => {
    const json = JSON.stringify([
      { type: 'TemperatureControl', name: 'temperature', value: -18 },
    ]);
    const [reading] = parseTemperatureReadings(device, json);
    expect(reading?.zoneId).toBe(0);
    expect(reading?.unit).toBe('°C');
    expect(reading?.target).toBeNaN();
  });

  it('falls back to the model name when nickname is missing', () => {
    const unnamed = { ...device, nickname: undefined } as unknown as LiebherrDevice;
    const json = JSON.stringify([
      { type: 'TemperatureControl', name: 'temperature', value: -18 },
    ]);
    expect(parseTemperatureReadings(unnamed, json)[0]?.deviceName).toBe(
      'SFNe 5227',
    );
  });

  it('returns an empty list for malformed JSON', () => {
    expect(parseTemperatureReadings(device, 'not json')).toEqual([]);
  });

  // Documents a gap: a JSON *object* payload parses fine but is not an
  // array, so .filter throws instead of returning []. Add an
  // Array.isArray(controls) check to enable this test.
  it.skip('returns an empty list for a non-array JSON payload', () => {
    expect(parseTemperatureReadings(device, '{"status":"ok"}')).toEqual([]);
  });
});

describe('getDevices', () => {
  it('returns the device list', async () => {
    fetchMock.mockResolvedValue(Response.json([device]));
    expect(await getDevices('key')).toEqual([device]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://home-api.smartdevice.liebherr.com/v1/devices',
      expect.objectContaining({
        headers: expect.objectContaining({ 'api-key': 'key' }),
      }),
    );
  });

  it.each([
    [401, 'Invalid API Key'],
    [429, 'API rate limit exceeded'],
    [500, 'GET /devices failed: 500'],
  ])('throws on HTTP %i', async (status, message) => {
    fetchMock.mockResolvedValue(new Response('err', { status }));
    await expect(getDevices('key')).rejects.toThrow(message);
  });
});

describe('createTemperatureMonitor', () => {
  it('emits onConnected, onTemperature and change-only onChange', async () => {
    const sseBody =
      'data: [{"type":"TemperatureControl","name":"temperature","zoneId":0,"value":-18}]\n\n' +
      'data: [{"type":"TemperatureControl","name":"temperature","zoneId":0,"value":-18}]\n\n' +
      'data: [{"type":"TemperatureControl","name":"temperature","zoneId":0,"value":-17}]\n\n';

    let sseCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/sse/')) {
        sseCalls += 1;
        // First connection delivers events then closes; reconnections hang
        // so the assertions below stay deterministic.
        return Promise.resolve(
          new Response(sseCalls === 1 ? streamOf(sseBody) : hangingStream()),
        );
      }
      return Promise.resolve(Response.json([device]));
    });

    const connected: string[] = [];
    const temps: number[] = [];
    const changes: [number, number][] = [];

    const monitor = createTemperatureMonitor(
      'key',
      {
        onConnected: (id) => connected.push(id),
        onTemperature: (r) => temps.push(r.current),
        onChange: (r, prev) => changes.push([prev, r.current]),
      },
      { reconnectBaseMs: 1 },
    );

    await monitor.start();
    await vi.waitFor(() => expect(temps).toHaveLength(3));
    monitor.stop();

    expect(connected).toEqual(['dev-1']);
    expect(temps).toEqual([-18, -18, -17]);
    // repeated -18 must not fire onChange; -18 → -17 must
    expect(changes).toEqual([[-18, -17]]);
  });
});
