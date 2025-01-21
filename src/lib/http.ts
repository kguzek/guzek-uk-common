import { promises as fs, createReadStream } from "fs";
import type { Request, Response } from "express";
import { STATIC_CACHE_DURATION_MINS } from "../enums";
import { getStatusText, getVideoExtension, setCacheControl } from "./util";
import { getLogger } from "./logger";
import type { StatusCode } from "../models";

const logger = getLogger(__filename);

export const logResponse = (res: Response, message: string) =>
  logger.response(message, {
    ip: (res as any).ip,
  });

/** Sends the response with a 2xx status and JSON body containing the given data object.
 *
 *  @example sendOK(res, { message: "Success" }) => res.status(200).json({ message: "Success" })
 *  @example sendOK(res) => res.status(204).send()
 */
export function sendOK(res: Response, data?: any, code: StatusCode = 200) {
  if (data) {
    res.status(code).json(data);
  } else {
    code = 204;
    res.status(code).send();
  }
  logResponse(res, getStatusText(code));
}

/** Sends the response with the given code and the provided error object's message property.
 *
 * @example sendError(res, 404, { message: "No such user." }) => res.status(404).json({ "404 Not Found": "No such user." })
 * @example sendError(res, 500, err) => res.status(404).json({ "500 Internal Server Error": err.message })
 */
export function sendError(
  res: Response,
  code: StatusCode,
  error: string | { message: string } = { message: "Unknown error." }
) {
  const statusText = getStatusText(code);
  const message = typeof error === "string" ? error : error.message;
  const jsonRes = { [statusText]: message };
  logResponse(res, `${statusText}: ${message}`);
  res.status(code).json(jsonRes);
}

export async function sendFileStream(
  req: Request,
  res: Response,
  path: string
) {
  let filename = path;
  let fileExtension = getVideoExtension(filename);

  if (!fileExtension) {
    let filenames;
    try {
      filenames = await fs.readdir(filename);
    } catch (error) {
      logger.error(`Could not read directory '${filename}':`, error);
      sendError(res, 404, { message: `The path '${path}' was not found.` });
      return;
    }
    for (const file of filenames) {
      fileExtension = getVideoExtension(file);
      if (fileExtension) {
        filename += `/${file}`;
        break;
      }
    }
  }
  if (!filename || !fileExtension) {
    sendError(res, 400, { message: `Invalid file path '${path}'.` });
    return;
  }

  if (fileExtension !== "mp4") {
    filename += ".mp4";
    try {
      await fs.access(filename);
    } catch {
      sendError(res, 429, {
        message: `The file has not yet been converted to MP4. Check back later.`,
      });
      return;
    }
  }

  let stat;
  try {
    stat = await fs.stat(filename);
  } catch (error) {
    sendError(res, 500, error as Error);
    return;
  }
  let responseCode: StatusCode = 200;
  const range = req.headers.range;
  let file;

  const headers: Record<string, string | number> = {
    "Content-Type": "video/mp4",
  };
  if (range) {
    const match = range.match(/bytes=(\d+)-(\d*)/);
    if (!match)
      return sendError(res, 400, {
        message: `Malformed request header 'range': '${range}'.`,
      });
    const maxEnd = stat.size - 1;
    const end = Math.min(maxEnd, match[2] ? +match[2] : maxEnd);
    const start = Math.min(end, +match[1]);
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    headers["Accept-Ranges"] = "bytes";
    responseCode = 206;
    headers["Content-Length"] = end - start + 1;
    file = createReadStream(filename, { start, end });
  } else {
    headers["Content-Length"] = stat.size;
    file = createReadStream(filename);
  }

  setCacheControl(res, STATIC_CACHE_DURATION_MINS);
  res.writeHead(responseCode, headers);
  file.pipe(res);
  logResponse(res, getStatusText(responseCode));
}
