import { io, Socket } from "socket.io-client";
import { StateStore } from "./store.js";
import { Heartbeat, KumaMonitor } from "./types.js";

export class KumaClient {
  private socket?: Socket;
  private store: StateStore;
  private onChange: () => void;
  private onInventory: () => void;

  constructor(store: StateStore, onChange: () => void, onInventory: () => void) {
    this.store = store;
    this.onChange = onChange;
    this.onInventory = onInventory;
  }

  start() {
    const url = process.env.KUMA_URL;
    if (!url) throw new Error("KUMA_URL is required");
    const username = process.env.KUMA_USERNAME;
    const password = process.env.KUMA_PASSWORD;
    const token = process.env.KUMA_TOKEN;

    console.log(`[KUMA] Connecting to ${url}`);
    this.socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 15000
    });

    const s = this.socket;
    s.on("connect", () => {
      console.log("[KUMA] Socket connected");
      this.store.setConnection(true, false);
      this.onChange();
      const finish = (res: any) => {
        if (res?.ok) {
          console.log("[KUMA] Authenticated");
          this.store.setAuthenticated(true);
          this.onChange();
          this.refreshInventory();
        } else {
          console.error("[KUMA] Authentication failed:", res?.msg || res);
          this.store.setAuthenticated(false);
          this.onChange();
        }
      };
      if (token) s.emit("loginByToken", token, finish);
      else if (username && password) s.emit("login", { username, password }, finish);
      else console.error("[KUMA] Set KUMA_TOKEN or KUMA_USERNAME/KUMA_PASSWORD");
    });

    s.on("disconnect", (reason) => {
      console.warn(`[KUMA] Disconnected: ${reason}`);
      this.store.setConnection(false, false);
      this.onChange();
    });

    s.on("connect_error", (error) => console.error("[KUMA] Connection error:", error.message));

    s.on("monitorList", (list: Record<string, KumaMonitor>) => {
      this.store.replaceMonitors(list);
      this.onInventory();
      this.onChange();
    });

    s.on("updateMonitorIntoList", (monitor: KumaMonitor | Record<string, KumaMonitor>) => {
      if ((monitor as KumaMonitor)?.id != null) this.store.updateMonitors([monitor as KumaMonitor]);
      else this.store.updateMonitors(monitor as Record<string, KumaMonitor>);
      this.onChange();
    });

    s.on("deleteMonitorFromList", (monitorID: number | string) => {
      this.store.removeMonitor(Number(monitorID));
      this.onChange();
    });

    // Kuma versions differ in the heartbeatList wire shape. Support both the
    // map form and the per-monitor form: (monitorID, beats, overwrite).
    s.on("heartbeatList", (...args: any[]) => {
      if (args.length >= 2 && (typeof args[0] === "number" || typeof args[0] === "string")) {
        this.store.setHeartbeatListForMonitor(Number(args[0]), args[1] || [], args[2] !== false);
      } else {
        this.store.setHeartbeatList((args[0] || {}) as Record<string, Heartbeat[] | Record<string, Heartbeat>>);
      }
      this.onChange();
    });

    // Kuma also sends importantHeartbeatList. These records represent real
    // state transitions and let us recover the original outage start time when
    // the Wallboard opens after a monitor has already been DOWN for a while.
    s.on("importantHeartbeatList", (...args: any[]) => {
      if (args.length >= 2 && (typeof args[0] === "number" || typeof args[0] === "string")) {
        this.store.setImportantHeartbeatListForMonitor(Number(args[0]), args[1] || [], args[2] !== false);
      } else {
        this.store.setImportantHeartbeatList((args[0] || {}) as Record<string, Heartbeat[] | Record<string, Heartbeat>>);
      }
      this.onChange();
    });

    s.on("heartbeat", (beat: Heartbeat) => {
      this.store.addHeartbeat(beat);
      this.onChange();
    });
  }

  refreshInventory() {
    if (!this.socket?.connected || !this.store.authenticated) return false;
    console.log("[KUMA] Requesting monitor inventory refresh");
    this.socket.emit("getMonitorList");
    return true;
  }

  stop() {
    this.socket?.close();
  }
}
