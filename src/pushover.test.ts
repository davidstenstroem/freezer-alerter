import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendPushover } from './pushover';

vi.mock('./env', () => ({
  env: {
    API_KEY: 'test-api-key',
    DEVICE_ID: 'test-device',
    PUSHOVER_TOKEN: 'test-token',
    PUSHOVER_USER: 'test-user',
  },
}));

const fetchMock = vi.fn();

const sentBody = (): URLSearchParams => {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return init.body as URLSearchParams;
};

describe('sendPushover', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{"status":1}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts credentials and message to the Pushover API', async () => {
    await sendPushover({ message: 'hello', title: 'Test', priority: 1 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.pushover.net/1/messages.json',
      expect.objectContaining({ method: 'POST' }),
    );

    const body = sentBody();
    expect(body.get('token')).toBe('test-token');
    expect(body.get('user')).toBe('test-user');
    expect(body.get('message')).toBe('hello');
    expect(body.get('title')).toBe('Test');
    expect(body.get('priority')).toBe('1');
  });

  it('defaults to priority 0 and omits the title when not given', async () => {
    await sendPushover({ message: 'hello' });

    const body = sentBody();
    expect(body.get('priority')).toBe('0');
    expect(body.has('title')).toBe(false);
  });

  it('adds retry and expire only for emergency priority', async () => {
    await sendPushover({ message: 'critical!', priority: 2 });

    const body = sentBody();
    expect(body.get('retry')).toBe('60');
    expect(body.get('expire')).toBe('3600');
  });

  it('omits retry and expire for non-emergency priorities', async () => {
    await sendPushover({ message: 'warning', priority: 1 });

    const body = sentBody();
    expect(body.has('retry')).toBe(false);
    expect(body.has('expire')).toBe(false);
  });

  it('logs but does not throw on a non-2xx response', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response('bad token', { status: 400 }));

    await expect(sendPushover({ message: 'x' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[pushover] 400'),
    );
    errorSpy.mockRestore();
  });

  it('logs but does not throw when fetch rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(sendPushover({ message: 'x' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      '[pushover] send failed:',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
