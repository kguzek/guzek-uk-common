import { dirname, resolve } from "path";
import dotenv from "dotenv";

/**
 * Reads the `.env` file and prepares for server start.
 * Returns `true` if the server is in development mode, else `false`.
 */
export function setupEnvironment() {
  const entryPoint = require.main?.filename;
  if (!entryPoint) {
    throw new Error("Unable to determine the entry point of the application.");
  }
  const appDirectory = dirname(entryPoint);
  const DEBUG_MODE = process.env.NODE_ENV === "development";
  // In production mode, this code is run from /api/v1/dist/index.js
  // In development mode, it is in /api/v1/index.ts
  // The env file is in /api/.env, so adjust accordingly
  const ENV_FILE_PATH = DEBUG_MODE ? ".env" : "../.env";
  const dotEnvPath = resolve(appDirectory, ENV_FILE_PATH);
  dotenv.config({ path: dotEnvPath });

  if (DEBUG_MODE) {
    // Add newline before app output for readability
    console.log();
  }

  return DEBUG_MODE;
}
