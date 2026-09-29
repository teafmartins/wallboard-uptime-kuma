import "./env.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { StateStore } from "./store.js";
import { KumaClient } from "./kumaClient.js";
import { inventorySyncEnabled, inventorySyncIntervalMs, loadConfig, publicAssetsRoot, syncDashboardConfig, webDistRoot } from "./config.js";

const app = express();
const port = Number(process.env.PORT || process.env.WALLBOARD_PORT || 3002);
const store = new StateStore();
const clients = new Set<express.Response>();

app.use(cors());
app.use(express.json());
app.use("/assets", express.static(publicAssetsRoot(), { fallthrough: true }));

const broadcastConfig = () => {
  const data = `event: config\ndata: ${JSON.stringify(loadConfig())}\n\n`;
  for (const res of clients) res.write(data);
};

const sendState = () => {
  const snapshot = store.snapshot();
  const stateData = `event: state\ndata: ${JSON.stringify(snapshot)}\n\n`;
  for (const res of clients) res.write(stateData);
};

const syncInventoryConfig = () => {
  if (!store.inventoryLoaded) return;
  try {
    const result = syncDashboardConfig(store.inventory());
    if (result.changed) broadcastConfig();
  } catch (error) {
    console.error("[CONFIG] Inventory sync failed:", (error as Error).message);
  }
};

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  kumaConnected: store.connected,
  kumaAuthenticated: store.authenticated,
  port
}));
app.get("/api/state", (_req, res) => res.json(store.snapshot()));
app.get("/api/config", (_req, res) => res.json(loadConfig()));
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: state\ndata: ${JSON.stringify(store.snapshot())}\n\n`);
  res.write(`event: config\ndata: ${JSON.stringify(loadConfig())}\n\n`);
  const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 25000);
  clients.add(res);
  req.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
});

const webDist = webDistRoot();
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
} else {
  console.warn(`[WEB] Dist not found at ${webDist} (normal when running 'npm run dev')`);
}

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`[APP] Kuma Wallboard listening on :${port}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[APP] API: http://localhost:${port}/api/health`);
  }
});

const kuma = new KumaClient(store, sendState, syncInventoryConfig);
kuma.start();

let inventoryTimer: NodeJS.Timeout | undefined;

const scheduleInventoryRefresh = () => {
  if (inventoryTimer) clearTimeout(inventoryTimer);
  if (!inventorySyncEnabled()) {
    console.log("[CONFIG] Periodic inventory sync disabled; startup sync remains enabled");
    return;
  }

  const intervalMs = inventorySyncIntervalMs();
  console.log(`[CONFIG] Inventory refresh interval: ${Math.round(intervalMs / 60000)} minute(s)`);
  inventoryTimer = setTimeout(() => {
    kuma.refreshInventory();
    scheduleInventoryRefresh();
  }, intervalMs);
};

scheduleInventoryRefresh();

const shutdown = () => {
  if (inventoryTimer) clearTimeout(inventoryTimer);
  kuma.stop();
  server.close(() => process.exit(0));
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
