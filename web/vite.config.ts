import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const rootDir = path.resolve(currentDir, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const backendPort = env.PORT || env.WALLBOARD_PORT || "3002";
  const backend = `http://127.0.0.1:${backendPort}`;

  return {
    plugins: [react()],
    envDir: rootDir,
    server: {
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true
        },
        "/assets": {
          target: backend,
          changeOrigin: true
        }
      }
    }
  };
});
