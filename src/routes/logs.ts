import { Router } from "express";
import type { Response } from "express";
import { readdir, readFile } from "fs/promises";
import { getLogger, LOG_DIRECTORY } from "../lib/logger";
import { isInvalidDate, setCacheControl } from "../lib/util";
import { sendError, sendOK } from "../lib/http";

export const router = Router();
const logger = getLogger(__filename);

async function getLogFilenames(path: string = "") {
  let filenames;
  try {
    filenames = await readdir(LOG_DIRECTORY + path);
  } catch (error) {
    logger.error(`Could not read log filenames: ${error}`);
    return [];
  }
  return filenames.map((filename) => filename.replace(/\.log$/, ""));
}

async function sendLogFile(res: Response, filename: string) {
  const file = `${LOG_DIRECTORY}/${filename}.log`;
  let buffer: Buffer;
  try {
    buffer = await readFile(file);
  } catch (error) {
    logger.error(`Error reading log file '${file}':`, error);
    return sendError(res, 500, error as Error);
  }
  const logStrings = buffer.toString().split("\n");

  const logs = logStrings
    .filter((log) => log.trim())
    .map((log) => {
      const trimmed = log.trim();
      try {
        return JSON.parse(trimmed);
      } catch (err) {
        const error = err as Error;
        return {
          label: "logs.js",
          level: "error",
          message: "[Could not parse log line]",
          metadata: {
            body: {
              badMessage: trimmed,
              error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
              },
            },
          },
          timestamp: filename,
        };
      }
    });
  setCacheControl(res, 60);
  sendOK(res, { date: filename, logs });
}

router.get("/error", (_req, res) => sendLogFile(res, "error"));

router.get("/date/:date", async (req, res) => {
  const queryDateString = req.params.date;
  const queryDateObject = new Date(queryDateString + " Z");
  if (isInvalidDate(queryDateObject))
    return sendError(res, 400, {
      message: `Date parameter '${queryDateString}' must be a valid date.`,
    });
  const date = queryDateObject.toISOString().split("T")[0];
  let dates;
  try {
    dates = await getLogFilenames();
  } catch (error) {
    return sendError(res, 500, error as Error);
  }
  if (!dates.includes(date)) return sendOK(res, { date, logs: [] });
  sendLogFile(res, date);
});
