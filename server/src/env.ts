import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

// Works both from server/src (tsx dev) and server/dist (compiled production).
export const projectRoot = path.resolve(currentDir, "../..");
export const envPath = process.env.ENV_FILE || path.join(projectRoot, ".env");

const result = dotenv.config({ path: envPath, quiet: true });
if (result.error) {
  console.warn(`[ENV] Could not load ${envPath}: ${result.error.message}`);
} else {
  console.log(`[ENV] Loaded ${envPath}`);
}
