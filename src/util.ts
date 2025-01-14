import { promises as fs, createReadStream } from "fs";
import type { Request, Response } from "express";
import type {
  Attributes,
  FindOptions,
  Identifier,
  InferCreationAttributes,
  Model,
  ModelStatic,
  WhereOptions,
} from "sequelize";
import { getLogger } from "./logger";
import { DownloadStatus, STATIC_CACHE_DURATION_MINS } from "./models";
import type { TorrentInfo, Episode } from "./models";
import { Updated } from "./sequelize";
import type { MakeNullishOptional } from "sequelize/lib/utils";

const logger = getLogger(__filename);

const DOWNLOAD_STATUS_MAP = {
  2: DownloadStatus.VERIFYING,
  4: DownloadStatus.PENDING,
  6: DownloadStatus.COMPLETE,
} as const;

export const STATUS_CODES = {
  200: "OK",
  201: "Created",
  204: "No Content",
  206: "Partial Content",
  400: "Bad Request",
  401: "Unauthorised",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  429: "Too Many Requests",
  500: "Internal Server Error",
  503: "Service Unavailable",
} as const;

export type StatusCode = keyof typeof STATUS_CODES;

const TORRENT_NAME_PATTERN = /^(.+)(?:\.|\s|\+)S0?(\d+)E0?(\d+)/;

/** Updates the 'timestamp' column for the given endpoint in the 'updated' table with the current Epoch time. */
export async function updateEndpoint<T extends Model>(
  endpointClass: ModelStatic<T>
) {
  const newValue = { timestamp: new Date().getTime() };
  const endpoint = endpointClass.tableName;
  const row = await Updated.findOne({ where: { endpoint } });
  if (row) {
    await row.set(newValue).save();
  } else {
    await Updated.create({ endpoint, ...newValue });
  }
  logger.verbose(`Updated endpoint '${endpoint}'`);
}

export const logResponse = (res: Response, message: string) =>
  logger.response(message, {
    ip: (res as any).ip,
  });

export const getStatusText = (code: StatusCode) =>
  `${code} ${STATUS_CODES[code]}`;

const isResponse = (res: any): res is Response =>
  res?.status && typeof res.status === "function";

/** Sends the response with a 200 status and JSON body containing the given data object. */
export function sendOK(res: Response, data?: any, code: StatusCode = 200) {
  if (data) {
    res.status(code).json(data);
  } else {
    code = 204;
    res.status(code).send();
  }
  logResponse(res, getStatusText(code));
}

/** Sends the response with the given code and the provided error object's message property, i.e.
 *
 * `(res, 404, err) => res.status(404).json({ "404 Not Found": err.message })`
 */
export function sendError(
  res: Response,
  code: StatusCode,
  error: { message: string } = { message: "Unknown error." }
) {
  const statusText = getStatusText(code);
  const jsonRes = { [statusText]: error.message };
  logResponse(res, `${statusText}: ${error.message}`);
  res.status(code).json(jsonRes);
}

/** Creates a new database entry in the database table model derivative provided.
 *  Sends a response containing the created data, unless `sendMethod` is specified.
 *  Returns `true` if the operation succeeded, else `false` if a 500 response was sent.
 */
export async function createDatabaseEntry<T extends Model>(
  model: ModelStatic<T>,
  modelParams: MakeNullishOptional<InferCreationAttributes<T>>,
  res?: Response,
  sendMethod?: (resp: Response, data: any, code: number) => void
) {
  let obj;
  try {
    obj = await model.create(modelParams);
  } catch (error) {
    if ((error as Error).name === "SequelizeUniqueConstraintError")
      if (res)
        sendError(res, 400, {
          message: "Cannot create duplicate entries.",
        });
    logger.error("Error while creating database entry:", error);
    if (res) sendError(res, 500, error as Error);
    return false;
  }
  await updateEndpoint(model);
  if (res) (sendMethod ?? sendOK)(res, obj, 201);
  return true;
}

/** Retrieves all entries in the database table model derivative provided. */
export async function readAllDatabaseEntries<T extends Model>(
  model: ModelStatic<T>,
  res: Response,
  callback?: (data: T[]) => void
) {
  let objs;
  try {
    objs = await model.findAll();
  } catch (error) {
    return void sendError(res, 500, error as Error);
  }
  if (callback) {
    callback(objs);
  } else {
    sendOK(res, objs);
  }
}

const isErrorCallback = (onError: any): onError is (error: Error) => void =>
  typeof onError === "function";

type OnError = ((error: Error) => void) | Response;

/**
 * Retrieves all entries in the database which match the query and returns the array.
 * @param model the model instance to query
 * @param where the values to search for, e.g. { id: 1 }
 * @param onError the `Response` to which to send HTTP 500 if an error occurs, or a callback function to call when `findAll` fails.
 * If provided, the function will return `null` on error, othwerwies it will silently return an empty array on error.
 * @param allowEmptyResults if true, this will also call `onError` if the query returns no results (default: `false`)
 */
export async function queryDatabase<
  T extends Model,
  Y extends [] | [OnError] | [OnError, boolean]
>(
  model: ModelStatic<T>,
  query: FindOptions<Attributes<T>>,
  ...[onError, allowEmptyResults]: Y
): Promise<T[] | null>;
export async function queryDatabase<T extends Model>(
  model: ModelStatic<T>,
  query: FindOptions<Attributes<T>>,
  onError?: OnError,
  allowEmptyResults: boolean = false
): Promise<T[] | null> {
  let objs;
  try {
    objs = await model.findAll(query);
    if (objs.length === 0 && !allowEmptyResults) {
      throw Error("The database query returned no results.");
    }
  } catch (error) {
    if (isResponse(onError)) {
      sendError(onError, 500, error as Error);
      return null;
    }
    if (isErrorCallback(onError)) {
      onError(error as Error);
      return null;
    }
    return [];
  }
  return objs;
}

export const findUnique = <T extends Model>(
  model: ModelStatic<T>,
  primaryKey?: Identifier
) => (primaryKey ? model.findByPk(primaryKey) : null);

/** Updates the entry with the request payload in the database table model derivative provided.
 *  Sends back a response containing the number of affected rows.
 */
export async function updateDatabaseEntry<T extends Model>(
  model: ModelStatic<T>,
  req: Request,
  res: Response,
  modelParams?: Record<string, any>,
  where?: WhereOptions
) {
  let result: [affectedCount: number];
  where ??= req.params;
  modelParams ??= req.body;
  if (!modelParams)
    return void sendError(res, 400, {
      message: "Model parameters must be specified in request body.",
    });
  try {
    result = await model.update(modelParams, { where });
  } catch (error) {
    return void sendError(res, 500, error as Error);
  }
  const affectedRows = result[0];
  await updateEndpoint(model);
  return sendOK(res, { affectedRows });
}

/** Deletes the specified entry from the database table model derivative provided.
 *  Sends back a response containing the number of destroyed rows.
 */
export async function deleteDatabaseEntry<T extends Model>(
  model: ModelStatic<T>,
  where: WhereOptions,
  res?: Response
) {
  let destroyedRows: number;
  try {
    destroyedRows = await model.destroy({ where });
  } catch (error) {
    if (!res) throw error;
    return void sendError(res, 500, error as Error);
  }
  await updateEndpoint(model);
  if (res) {
    sendOK(res, { destroyedRows });
  }
  return destroyedRows;
}

export const isInvalidDate = (date: Date) => date.toString() === "Invalid Date";

/** Sets the Cache-Control header in the response so that browsers will be able to cache it for a maximum of `maxAgeMinutes` minutes. */
export const setCacheControl = (res: Response, maxAgeMinutes: number) =>
  res.setHeader("Cache-Control", `public, max-age=${maxAgeMinutes * 60}`);

function getDownloadStatus(status: number) {
  const val = DOWNLOAD_STATUS_MAP[status as keyof typeof DOWNLOAD_STATUS_MAP];
  if (val != null) return val;
  logger.warn(`Unknown torrent status code '${status}'.`);
  return DownloadStatus.UNKNOWN;
}

/** Converts the data into the form useful to the client application. */
export function convertTorrentInfo(info: TorrentInfo) {
  if (!info.name) throw new Error("Torrent info has no name attribute");
  const match = info.name.match(TORRENT_NAME_PATTERN);
  if (!match)
    throw new Error(`Torrent name doesn't match regex: '${info.name}'.`);
  const [_, showName, season, episode] = match;
  return {
    status: getDownloadStatus(info.status),
    showName: showName.replace(/\./g, " "),
    season: +season,
    episode: +episode,
    progress: info.percentDone,
    speed: info.rateDownload,
    eta: info.eta,
  };
}

/** If `value` is not a valid natural number, returns a user-friendly error message. Otherwise returns `undefined`. */
export function validateNaturalNumber(value: any) {
  if (!Number.isInteger(value)) return `Key '${value}' must be an integer.`;
  if (value < 0) return `Key '${value} cannot be negative.`;
  return undefined;
}

/** Ensures that the request body is an array of non-negative integers. */
export function validateNaturalList(list: any, res: Response) {
  const reject = (message: string) => void sendError(res, 400, { message });

  if (!Array.isArray(list)) return reject("Request body must be an array.");
  for (const id of list) {
    const errorMessage = validateNaturalNumber(id);
    if (errorMessage) return reject(errorMessage);
  }
  return list as number[];
}

const getVideoExtension = (filename: string) =>
  filename.match(/\.(mkv|mp4|avi)$/)?.[1];

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

export const serialiseEpisode = (
  episode: Pick<Episode, "season" | "episode">
) =>
  "S" +
  `${episode.season}`.padStart(2, "0") +
  "E" +
  `${episode.episode}`.padStart(2, "0");

export const send405 = (req: Request, res: Response) =>
  sendError(res, 405, {
    message: `You cannot ${req.method.toUpperCase()} the resource at '${
      req.path
    }'.`,
  });
