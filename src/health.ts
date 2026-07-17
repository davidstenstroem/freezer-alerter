import { createServer } from 'node:http';

const state = { connected: false, lastEventAt: null as string | null };

export const markConnected = (): void => {
  state.connected = true;
};

export const markDisconnected = (): void => {
  state.connected = false;
};

export const markEvent = (): void => {
  state.lastEventAt = new Date().toISOString();
};

export function startHealtServer(port = 8056): void {
  createServer((_req, res) => {
    res.writeHead(state.connected ? 200 : 503, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify(state));
  }).listen(port);
}
