import type { Response } from "express";
import type { Model, ModelStatic } from "sequelize";
import { getLogger } from "./logger";
import { STATUS_CODES, DownloadStatus, DOWNLOAD_STATUS_MAP } from "../enums";
import type { TorrentInfo, Episode, StatusCode } from "../models";
import { Updated } from "./sequelize";
import { sendError } from "./http";

const logger = getLogger(__filename);

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

/** Returns the code followed by the status code name according to RFC2616 § 10 */
export const getStatusText = (code: StatusCode) =>
  `${code} ${STATUS_CODES[code]}`;

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

export const getVideoExtension = (filename: string) =>
  filename.match(/\.(mkv|mp4|avi)$/)?.[1];

export const serialiseEpisode = (
  episode: Pick<Episode, "season" | "episode">
) =>
  "S" +
  `${episode.season}`.padStart(2, "0") +
  "E" +
  `${episode.episode}`.padStart(2, "0");
