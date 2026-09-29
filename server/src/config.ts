import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./env.js";
import type { KumaMonitor } from "./types.js";

export type DashboardConfig = {
  dashboard?: {
    title?: string;
    logo?: string;
    logoAlt?: string;
    logoHeight?: number;
    showTitle?: boolean;
    theme?: "dark" | "light";
    orientation?: "auto" | "landscape" | "portrait";
    showClock?: boolean;
    recoverDisplaySeconds?: number;
  };
  sync?: {
    enabled?: boolean;
    intervalMinutes?: number;
    recreateDashboard?: boolean;
    backup?: boolean;
  };
  badges?: {
    display?: "icon_only" | "text_only" | "icon_text" | "count";
    rows?: number;
    rowsLandscape?: number;
    rowsPortrait?: number;
    pinProblems?: boolean;
    problemBehavior?: "pin" | "firstPage" | "normal";
    rotation?: {
      enabled?: boolean;
      intervalSeconds?: number;
      pauseOnCritical?: boolean;
      transition?: "fade" | "slide" | "none";
    };
  };
  incidents?: {
    maxVisible?: number;
    rotateEverySeconds?: number;
    graphWindowMinutes?: number;
    showMessage?: boolean;
  };
  audio?: {
    enabledByDefault?: boolean;
    testOnStartup?: boolean;
    startupVolume?: number;
  };
  alert?: {
    enabled?: boolean;
    defaultSound?: string;
    volume?: number;
    repeatAfterSeconds?: number;
    maxRepeats?: number;
    alertAfterSeconds?: number;
    recoverySound?: string | null;
  };
  sounds?: Record<string, string>;
  visibility?: {
    groups?: { mode?: "all" | "include" | "exclude"; items?: string[] };
    monitors?: { mode?: "all" | "include" | "exclude"; items?: string[] };
  };
  groups?: Record<string, {
    label?: string;
    icon?: string;
    display?: "icon_only" | "text_only" | "icon_text" | "count";
    sound?: string | boolean;
    priority?: number;
    hidden?: boolean;
    visible?: boolean;
    aggregate?: boolean;
    monitorIcon?: string;
    monitorDisplay?: "icon_only" | "text_only" | "icon_text" | "count";
  }>;
  monitors?: Record<string, {
    label?: string;
    display?: "icon_only" | "text_only" | "icon_text" | "count";
    icon?: string;
    sound?: string | boolean;
    priority?: "info" | "warning" | "critical";
    showGraphOnFailure?: boolean;
    graphType?: "availability" | "ping";
    hidden?: boolean;
    visible?: boolean;
    showIncident?: boolean;
    alertAfterSeconds?: number;
  }>;
};

const defaults: DashboardConfig = {
  dashboard: { title: "Infrastructure Monitor", theme: "dark", orientation: "auto", showClock: true, recoverDisplaySeconds: 30 },
  sync: { enabled: true, intervalMinutes: 5, recreateDashboard: true, backup: true },
  badges: { display: "icon_text", pinProblems: true, problemBehavior: "pin", rotation: { enabled: true, intervalSeconds: 8, pauseOnCritical: false, transition: "fade" } },
  incidents: { maxVisible: 6, rotateEverySeconds: 10, graphWindowMinutes: 360, showMessage: true },
  audio: { enabledByDefault: true, testOnStartup: true, startupVolume: 0.15 },
  alert: { enabled: true, defaultSound: "critical", volume: 0.75, repeatAfterSeconds: 300, maxRepeats: 3, alertAfterSeconds: 10, recoverySound: "recovery" },
  sounds: { critical: "builtin:critical", warning: "builtin:warning", recovery: "builtin:recovery" },
  visibility: { groups: { mode: "all", items: [] }, monitors: { mode: "all", items: [] } },
  groups: {},
  monitors: {}
};

function merge<T extends object>(base: T, extra: Partial<T>): T {
  const out: any = { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (out as any)[k] === "object") {
      out[k] = merge((out as any)[k], v as any);
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}

function isDockerRuntime() {
  return process.env.RUNNING_IN_DOCKER === "1" || process.env.CONTAINER === "1" || fs.existsSync("/.dockerenv");
}

function resolveProjectPath(raw: string | undefined, fallbackRelative: string) {
  const fallback = path.join(projectRoot, fallbackRelative);
  if (!raw?.trim()) return fallback;

  const value = raw.trim();
  const normalized = value.replace(/\\/g, "/");

  if (!isDockerRuntime() && process.platform === "win32" && /^\/?app\//i.test(normalized)) {
    console.warn(`[CONFIG] Ignoring Docker-only path '${value}' in native Windows mode.`);
    return fallback;
  }

  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

export function dashboardConfigPath() {
  return resolveProjectPath(process.env.DASHBOARD_CONFIG, path.join("config", "dashboard.json"));
}

export function loadConfig(): DashboardConfig {
  const configPath = dashboardConfigPath();
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return merge(defaults, parsed);
  } catch (error) {
    console.warn(`[CONFIG] Using defaults. Could not load ${configPath}:`, (error as Error).message);
    return structuredClone(defaults);
  }
}

export function inventorySyncIntervalMs() {
  const configured = Number(loadConfig().sync?.intervalMinutes ?? 5);
  const minutes = Number.isFinite(configured) ? Math.min(1440, Math.max(1, configured)) : 5;
  return Math.round(minutes * 60_000);
}

export function inventorySyncEnabled() {
  return loadConfig().sync?.enabled !== false;
}

const iconRules: Array<{ terms: string[]; icon: string }> = [
  { terms: ["firewall", "fortigate", "fortinet"], icon: "firewall" },
  { terms: ["access point", "accesspoint", "wireless", "wifi", "wlan"], icon: "wifi" },
  { terms: ["router", "gateway", "gw "], icon: "router" },
  { terms: ["switch", "ethernet", "network", "rede"], icon: "network" },
  { terms: ["vpn"], icon: "vpn" },
  { terms: ["database", "postgresql", "postgres", "mysql", "oracle", "sql server", "sqlserver", " db2", "db2", " sql", " db"], icon: "database" },
  { terms: ["api", "rest", "soap", "endpoint", "webservice", "web service"], icon: "api" },
  { terms: ["website", "web site", "http", "https", "www", "portal", "site"], icon: "website" },
  { terms: ["internet", "wan"], icon: "internet" },
  { terms: ["server", "servidor", " srv", "srv-", "srv_"], icon: "server" },
  { terms: ["nas", "storage", "disk", "disco", "ficheiros", "files", "backup", "bck"], icon: "nas" },
  { terms: ["smtp", "imap", "mail", "email", "correio"], icon: "mail" },
  { terms: ["dns"], icon: "dns" },
  { terms: ["docker", "container"], icon: "docker" },
  { terms: ["vmware", "esxi", "hyper-v", "hyperv", "virtual machine", " vm ", "vm-", "vm_"], icon: "vm" },
  { terms: ["printer", "impressora"], icon: "printer" },
  { terms: ["camera", "cctv"], icon: "camera" },
  { terms: ["ups"], icon: "ups" },
  { terms: ["power", "energia", "electric"], icon: "power" },
  { terms: ["temperature", "temperatura", "temp "], icon: "temperature" },
  { terms: ["plc"], icon: "plc" },
  { terms: ["factory", "fabrica", "fábrica", "industrial"], icon: "industrial" },
  { terms: ["erp"], icon: "erp" },
  { terms: ["linux", "ubuntu", "debian", "centos", "rhel"], icon: "linux" },
  { terms: ["windows", "win server", "iis"], icon: "windows" },
  { terms: ["ssh", "ftp", "sftp"], icon: "terminal" },
  { terms: ["cloud", "azure", "aws", "gcp"], icon: "cloud" },
  { terms: ["phone", "mobile", "telefone", "android", "iphone"], icon: "phone" }
];

function inferIcon(name: string, type?: string, fallback = "monitor") {
  const haystack = `${name ?? ""} ${type ?? ""}`.toLowerCase().replace(/[_/\\]+/g, " ");
  for (const rule of iconRules) if (rule.terms.some(term => haystack.includes(term))) return rule.icon;
  return fallback;
}

function defaultGroupConfig(monitor: KumaMonitor) {
  return {
    label: monitor.name,
    icon: inferIcon(monitor.name, "group", "monitor"),
    visible: true,
    aggregate: true
  };
}

function defaultMonitorConfig(monitor: KumaMonitor) {
  return {
    label: monitor.name,
    icon: inferIcon(monitor.name, monitor.type, "monitor"),
    visible: true,
    showIncident: true,
    showGraphOnFailure: true,
    graphType: "availability" as const
  };
}

function backupPathFor(configPath: string) {
  const dir = path.dirname(configPath);
  const ext = path.extname(configPath) || ".json";
  const base = path.basename(configPath, ext);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").replace(/\.\d{3}Z$/, "");
  let candidate = path.join(dir, `${base}.${stamp}.bak${ext}`);
  let n = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}.${stamp}.${n}.bak${ext}`);
    n++;
  }
  return candidate;
}

function writeConfigAtomic(configPath: string, config: DashboardConfig) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = `${configPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
  // On native Windows, rename-over-existing can fail. The normal sync path
  // renames the old dashboard to a backup first; this fallback mainly covers
  // the explicit backup:false case.
  if (fs.existsSync(configPath)) fs.rmSync(configPath);
  fs.renameSync(tmp, configPath);
}

export type ConfigSyncResult = {
  created: boolean;
  changed: boolean;
  backupPath?: string;
  addedGroups: number;
  removedGroups: number;
  addedMonitors: number;
  removedMonitors: number;
};

export function syncDashboardConfig(monitors: KumaMonitor[]): ConfigSyncResult {
  const configPath = dashboardConfigPath();
  const result: ConfigSyncResult = {
    created: false,
    changed: false,
    addedGroups: 0,
    removedGroups: 0,
    addedMonitors: 0,
    removedMonitors: 0
  };

  const kumaGroups = monitors.filter(m => m?.id != null && m.type === "group");
  const kumaDevices = monitors.filter(m => m?.id != null && m.type !== "group");

  if (!fs.existsSync(configPath)) {
    const generated: DashboardConfig = structuredClone(defaults);

    // Keep unattended-TV audio settings explicit in newly generated configs.
    // Do not rely only on a generic defaults clone here: dashboard.json is a
    // user-facing configuration file and these values must always be visible.
    generated.audio = {
      enabledByDefault: true,
      testOnStartup: true,
      startupVolume: 0.15
    };

    generated.groups = {};
    generated.monitors = {};

    for (const group of kumaGroups) generated.groups[group.name] = defaultGroupConfig(group);
    for (const monitor of kumaDevices) generated.monitors[monitor.name] = defaultMonitorConfig(monitor);

    writeConfigAtomic(configPath, generated);
    result.created = true;
    result.changed = true;
    result.addedGroups = kumaGroups.length;
    result.addedMonitors = kumaDevices.length;
    console.log(`[CONFIG] Created ${configPath} from Uptime Kuma (${kumaGroups.length} groups, ${kumaDevices.length} monitors)`);
    return result;
  }

  let current: DashboardConfig;
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf8");
    current = JSON.parse(raw);
  } catch (error) {
    console.error(`[CONFIG] Inventory sync skipped because ${configPath} is invalid:`, (error as Error).message);
    return result;
  }

  // If the file exists, automatic inventory reconciliation can be disabled.
  // Missing dashboard.json is always generated earlier, regardless of this setting.
  const effectiveCurrent = merge(defaults, current);
  if (effectiveCurrent.sync?.recreateDashboard === false) {
    console.log(`[CONFIG] Inventory loaded, but dashboard recreation is disabled; keeping ${configPath} unchanged`);
    return result;
  }

  const oldGroups = current.groups ?? {};
  const oldMonitors = current.monitors ?? {};
  const nextGroups: NonNullable<DashboardConfig["groups"]> = {};
  const nextMonitors: NonNullable<DashboardConfig["monitors"]> = {};

  for (const group of kumaGroups) {
    if (Object.prototype.hasOwnProperty.call(oldGroups, group.name)) {
      nextGroups[group.name] = oldGroups[group.name];
    } else {
      nextGroups[group.name] = defaultGroupConfig(group);
      result.addedGroups++;
    }
  }

  for (const monitor of kumaDevices) {
    if (Object.prototype.hasOwnProperty.call(oldMonitors, monitor.name)) {
      nextMonitors[monitor.name] = oldMonitors[monitor.name];
    } else {
      nextMonitors[monitor.name] = defaultMonitorConfig(monitor);
      result.addedMonitors++;
    }
  }

  const kumaGroupNames = new Set(kumaGroups.map(g => g.name));
  const kumaMonitorNames = new Set(kumaDevices.map(m => m.name));
  result.removedGroups = Object.keys(oldGroups).filter(name => !kumaGroupNames.has(name)).length;
  result.removedMonitors = Object.keys(oldMonitors).filter(name => !kumaMonitorNames.has(name)).length;

  const changed = result.addedGroups > 0 || result.removedGroups > 0 || result.addedMonitors > 0 || result.removedMonitors > 0;
  if (!changed) return result;

  const next: DashboardConfig = {
    ...current,
    groups: nextGroups,
    monitors: nextMonitors
  };

  const shouldBackup = effectiveCurrent.sync?.backup !== false;
  if (shouldBackup) {
    const backupPath = backupPathFor(configPath);
    fs.renameSync(configPath, backupPath);
    result.backupPath = backupPath;
  }

  try {
    writeConfigAtomic(configPath, next);
  } catch (error) {
    if (result.backupPath && !fs.existsSync(configPath) && fs.existsSync(result.backupPath)) {
      fs.renameSync(result.backupPath, configPath);
    }
    throw error;
  }

  result.changed = true;
  console.log(
    `[CONFIG] Synced inventory: +${result.addedGroups}/-${result.removedGroups} groups, ` +
    `+${result.addedMonitors}/-${result.removedMonitors} monitors` +
    (result.backupPath ? `; backup=${result.backupPath}` : "")
  );
  return result;
}

export function publicAssetsRoot() {
  return resolveProjectPath(process.env.ASSETS_DIR, "assets");
}

export function webDistRoot() {
  return resolveProjectPath(process.env.WEB_DIST, path.join("web", "dist"));
}
