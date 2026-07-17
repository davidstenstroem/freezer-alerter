export interface TemperatureReading {
  deviceId: string;
  deviceName: string;
  zoneId: number;
  zonePosition?: 'top' | 'middle' | 'bottom';
  current: number;
  target: number;
  unit: '°C' | '°F';
  timestamp: Date;
}

export interface RawControl {
  type: string;
  name: string;
  zoneId?: number;
  zonePosition?: 'top' | 'middle' | 'bottom';
  value?: number | string | boolean | null; // current temperature for TemperatureControl
  target?: number; // setpoint
  min?: number;
  max?: number;
  unit?: '°C' | '°F';
}

export interface LiebherrDevice {
  deviceId: string;
  nickname: string;
  deviceName: string; // model
  deviceType: 'FRIDGE' | 'FREEZER' | 'WINE' | 'COMBI';
  imageUrl?: string;
}

export interface MonitorHandlers {
  /** Every temperature control received (initial snapshot + every push). */
  onTemperature?: (reading: TemperatureReading) => void;
  /** Only when `current` differs from the previous reading for that zone. */
  onChange?: (reading: TemperatureReading, previous: number) => void;
  onConnected?: (deviceId: string) => void;
  onDisconnected?: (deviceId: string) => void;
  onError?: (error: Error) => void;
}

export interface MonitorOptions {
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

export interface TempMonitor {
  /** Fetch devices and open one SSE stream per device. Resolves once streams are started. */
  start: () => Promise<void>;
  stop: () => void;
}
