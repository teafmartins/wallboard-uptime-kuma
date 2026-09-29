export type KumaMonitor = {
  id: number;
  name: string;
  type?: string;
  parent?: number | null;
  active?: boolean;
  interval?: number;
  url?: string;
  hostname?: string;
  description?: string;
  [key: string]: unknown;
};

export type Heartbeat = {
  monitorID: number;
  status: number;
  time: string;
  msg?: string;
  ping?: number | null;
  important?: boolean;
  duration?: number;
  [key: string]: unknown;
};

export type MonitorState = {
  id: number;
  name: string;
  type: string;
  parent: number | null;
  active: boolean;
  status: number | null;
  statusLabel: "up" | "down" | "pending" | "maintenance" | "unknown";
  ping: number | null;
  message: string;
  lastHeartbeatAt: string | null;
  downSince: string | null;
  history: Heartbeat[];
};

export type GroupState = {
  id: string;
  kumaMonitorId?: number;
  name: string;
  monitors: MonitorState[];
  total: number;
  up: number;
  down: number;
  pending: number;
  maintenance: number;
  status: "up" | "down" | "warning" | "maintenance" | "unknown";
};

export type DashboardState = {
  connected: boolean;
  authenticated: boolean;
  lastUpdate: string | null;
  groups: GroupState[];
  ungrouped: MonitorState[];
  incidents: MonitorState[];
};
