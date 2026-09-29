import { DashboardState, GroupState, Heartbeat, KumaMonitor, MonitorState } from "./types.js";

const MAX_HISTORY = Number(process.env.MAX_HISTORY || 500);

function statusLabel(status: number | null): MonitorState["statusLabel"] {
  if (status === 1) return "up";
  if (status === 0) return "down";
  if (status === 2) return "pending";
  if (status === 3) return "maintenance";
  return "unknown";
}

function findDownSince(history: Heartbeat[]): string | null {
  if (!history.length || history[history.length - 1].status !== 0) return null;
  let i = history.length - 1;
  while (i >= 0 && history[i].status === 0) i--;
  return history[i + 1]?.time ?? null;
}

export class StateStore {
  private monitors = new Map<number, KumaMonitor>();
  private heartbeatHistory = new Map<number, Heartbeat[]>();
  private importantHeartbeatHistory = new Map<number, Heartbeat[]>();
  connected = false;
  authenticated = false;
  inventoryLoaded = false;
  lastUpdate: string | null = null;

  setConnection(connected: boolean, authenticated = this.authenticated) {
    this.connected = connected;
    this.authenticated = authenticated;
    this.lastUpdate = new Date().toISOString();
  }

  setAuthenticated(value: boolean) {
    this.authenticated = value;
    this.lastUpdate = new Date().toISOString();
  }

  replaceMonitors(list: Record<string, KumaMonitor> | KumaMonitor[]) {
    const entries = Array.isArray(list) ? list : Object.values(list || {});
    const next = new Map<number, KumaMonitor>();
    for (const monitor of entries) {
      if (monitor?.id != null) next.set(Number(monitor.id), { ...monitor, id: Number(monitor.id) });
    }
    this.monitors = next;
    this.inventoryLoaded = true;
    this.lastUpdate = new Date().toISOString();
  }

  updateMonitors(list: Record<string, KumaMonitor> | KumaMonitor[]) {
    const entries = Array.isArray(list) ? list : Object.values(list || {});
    for (const monitor of entries) {
      if (monitor?.id != null) this.monitors.set(Number(monitor.id), { ...monitor, id: Number(monitor.id) });
    }
    this.lastUpdate = new Date().toISOString();
  }

  removeMonitor(id: number) {
    const monitorID = Number(id);
    this.monitors.delete(monitorID);
    this.heartbeatHistory.delete(monitorID);
    this.importantHeartbeatHistory.delete(monitorID);
    this.lastUpdate = new Date().toISOString();
  }

  inventory(): KumaMonitor[] {
    return [...this.monitors.values()].map(m => ({ ...m }));
  }

  setHeartbeatList(payload: Record<string, Heartbeat[] | Record<string, Heartbeat>>) {
    for (const [id, beatsRaw] of Object.entries(payload || {})) {
      const beats: Heartbeat[] = Array.isArray(beatsRaw)
        ? beatsRaw
        : Object.values(beatsRaw || {});

      const normalized = beats
        .filter(Boolean)
        .map(b => ({ ...b, monitorID: Number(b.monitorID ?? id) }))
        .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
        .slice(-MAX_HISTORY);

      this.heartbeatHistory.set(Number(id), normalized);
    }
    this.lastUpdate = new Date().toISOString();
  }

  setHeartbeatListForMonitor(monitorID: number, beatsRaw: Heartbeat[] | Record<string, Heartbeat>, overwrite = true) {
    const id = Number(monitorID);
    const beats: Heartbeat[] = Array.isArray(beatsRaw) ? beatsRaw : Object.values(beatsRaw || {});
    const normalized = beats
      .filter(Boolean)
      .map(b => ({ ...b, monitorID: Number(b.monitorID ?? id) }))
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const current = overwrite ? [] : (this.heartbeatHistory.get(id) ?? []);
    const merged = [...current, ...normalized]
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
      .filter((b, i, arr) => i === 0 || b.time !== arr[i - 1].time || b.status !== arr[i - 1].status)
      .slice(-MAX_HISTORY);
    this.heartbeatHistory.set(id, merged);
    this.lastUpdate = new Date().toISOString();
  }

  setImportantHeartbeatList(payload: Record<string, Heartbeat[] | Record<string, Heartbeat>>) {
    for (const [id, beatsRaw] of Object.entries(payload || {})) {
      this.setImportantHeartbeatListForMonitor(Number(id), beatsRaw, true);
    }
  }

  setImportantHeartbeatListForMonitor(monitorID: number, beatsRaw: Heartbeat[] | Record<string, Heartbeat>, overwrite = true) {
    const id = Number(monitorID);
    const beats: Heartbeat[] = Array.isArray(beatsRaw) ? beatsRaw : Object.values(beatsRaw || {});
    const normalized = beats
      .filter(Boolean)
      .map(b => ({ ...b, monitorID: Number(b.monitorID ?? id) }))
      .filter(b => b.status === 0 || b.status === 1)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const current = overwrite ? [] : (this.importantHeartbeatHistory.get(id) ?? []);
    const merged = [...current, ...normalized]
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
      .filter((b, i, arr) => i === 0 || b.time !== arr[i - 1].time || b.status !== arr[i - 1].status)
      .slice(-MAX_HISTORY);
    this.importantHeartbeatHistory.set(id, merged);
    this.lastUpdate = new Date().toISOString();
  }

  addHeartbeat(beat: Heartbeat) {
    if (!beat || beat.monitorID == null) return;
    const id = Number(beat.monitorID);
    const arr = this.heartbeatHistory.get(id) ?? [];
    const last = arr[arr.length - 1];
    if (!last || last.time !== beat.time || last.status !== beat.status) arr.push({ ...beat, monitorID: id });
    if (arr.length > MAX_HISTORY) arr.splice(0, arr.length - MAX_HISTORY);
    this.heartbeatHistory.set(id, arr);
    this.lastUpdate = new Date().toISOString();
  }

  private monitorState(m: KumaMonitor): MonitorState {
    const history = this.heartbeatHistory.get(m.id) ?? [];
    const importantHistory = this.importantHeartbeatHistory.get(m.id) ?? [];
    const last = history[history.length - 1];
    const status = last?.status ?? importantHistory[importantHistory.length - 1]?.status ?? null;

    // Important heartbeats are emitted by Kuma on state changes. When the
    // Wallboard starts while a monitor is already DOWN, the normal heartbeat
    // window may contain only DOWN beats and therefore cannot reveal when the
    // outage actually began. Prefer the latest real DOWN transition from the
    // important heartbeat history, then fall back to the normal heartbeat list.
    let downSince: string | null = null;
    if (status === 0) {
      for (let i = importantHistory.length - 1; i >= 0; i--) {
        if (importantHistory[i].status === 0) {
          downSince = importantHistory[i].time;
          break;
        }
      }
      downSince ??= findDownSince(history);
    }

    return {
      id: m.id,
      name: m.name,
      type: String(m.type ?? "unknown"),
      parent: m.parent == null ? null : Number(m.parent),
      active: m.active !== false,
      status,
      statusLabel: statusLabel(status),
      ping: typeof last?.ping === "number" ? last.ping : null,
      message: String(last?.msg ?? ""),
      lastHeartbeatAt: last?.time ?? null,
      downSince,
      history
    };
  }

  snapshot(): DashboardState {
    const monitorStates = [...this.monitors.values()].map(m => this.monitorState(m));
    const groupMonitors = [...this.monitors.values()].filter(m => m.type === "group");
    const groupIds = new Set(groupMonitors.map(g => g.id));

    const groups: GroupState[] = groupMonitors.map(g => {
      const children = monitorStates.filter(m => m.parent === g.id && m.active && m.type !== "group");
      const down = children.filter(m => m.statusLabel === "down").length;
      const pending = children.filter(m => m.statusLabel === "pending" || m.statusLabel === "unknown").length;
      const maintenance = children.filter(m => m.statusLabel === "maintenance").length;
      const up = children.filter(m => m.statusLabel === "up").length;
      const status: GroupState["status"] = down > 0 ? "down" : pending > 0 ? "warning" : (children.length > 0 && maintenance === children.length) ? "maintenance" : up > 0 ? "up" : "unknown";
      return { id: `group-${g.id}`, kumaMonitorId: g.id, name: g.name, monitors: children, total: children.length, up, down, pending, maintenance, status };
    });

    // Monitors that do not belong to a real Uptime Kuma group stay individual.
    // Never create a synthetic "Outros"/"Others" group for them.
    const ungrouped = monitorStates.filter(
      m => m.type !== "group" && (m.parent == null || !groupIds.has(m.parent)) && m.active
    );

    const incidents = monitorStates.filter(m => m.active && m.type !== "group" && m.statusLabel === "down");

    return { connected: this.connected, authenticated: this.authenticated, lastUpdate: this.lastUpdate, groups, ungrouped, incidents };
  }
}
