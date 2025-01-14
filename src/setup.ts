import { dirname, resolve } from "path";
import dotenv from "dotenv";
import { initialiseSequelize } from "./sequelize";

/** Gets the root directory of the Node.js application. */
export function getRootDirectory() {
  const entryPoint = require.main?.filename;
  if (!entryPoint) {
    throw new Error("Unable to determine the entry point of the application.");
  }
  return dirname(entryPoint);
}

/**
 * Reads the `.env` file and prepares for server start.
 * @param isDecentralised pass `true` if this is a LiveSeries server, so that the correct database configuration is used. Default: `false`.
 * @returns `true` if the server is in development mode, else `false`.
 */
export function setupEnvironment(isDecentralised: boolean = false): boolean {
  const appDirectory = getRootDirectory();
  const debugMode = process.env.NODE_ENV === "development";
  // In production mode, this code is run from /dist/index.js
  // In development mode, it is in /index.ts
  // The env file is in /.env, so adjust accordingly
  const ENV_FILE_PATH = debugMode ? ".env" : "../.env";
  const dotEnvPath = resolve(appDirectory, ENV_FILE_PATH);
  dotenv.config({ path: dotEnvPath });

  if (debugMode) {
    // Add newline before app output for readability
    console.log();
  } else {
    // Attempt to load the production .env file from /dist, just in case
    dotenv.config();
  }

  initialiseSequelize(debugMode, isDecentralised);
  return debugMode;
}
