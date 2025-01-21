import type { Request } from "express";
import { convertTorrentInfo } from "./lib/util";
import {
  CLIENT_ERROR_STATUS_CODES,
  SERVER_ERROR_STATUS_CODES,
  SUCCESS_STATUS_CODES,
} from "./enums";

export type RequestMethod = "GET" | "PUT" | "POST" | "DELETE" | "PATCH";

export type SuccessStatusCode = keyof typeof SUCCESS_STATUS_CODES;
export type ClientErrorStatusCode = keyof typeof CLIENT_ERROR_STATUS_CODES;
export type ServerErrorStatusCode = keyof typeof SERVER_ERROR_STATUS_CODES;
export type StatusCode =
  | SuccessStatusCode
  | ClientErrorStatusCode
  | ServerErrorStatusCode;

export interface RecipientData {
  name: string;
  firstName?: string;
  lastName?: string;
  company: string;
  street: string;
  house: string;
  apartment: null;
  place: string;
  postalCode: string;
  countryIsoAlfa2Code: string;
  phoneNumber: string;
  email: string;
  pni?: string;
}

export interface Order {
  id: string;
  contentDesc: string;
  cost: number;
  recipientData: RecipientData;
}

export type LatLngObject = { lat: number; lng: number };
export type LatLngArray = [number, number];
export type LatLng = LatLngObject | LatLngArray;

export interface UserObj {
  uuid: string;
  username: string;
  email: string;
  admin?: boolean;
}

export interface CustomRequest extends Request {
  user?: UserObj;
}

export interface TorrentInfo {
  id: number;
  name: string;
  status: number;
  rateDownload?: number;
  eta?: number;
  percentDone?: number;
}

type WatchedData = { [season: string]: number[] };

export type WatchedShowData = { [showId: string]: WatchedData };

export interface TvShow {
  id: number;
  name: string;
  // ...
  episodes: Episode[];
}

export interface Episode {
  episode: number;
  season: number;
  name: string;
  air_date: string;
}

export type ConvertedTorrentInfo = ReturnType<typeof convertTorrentInfo>;

export type BasicEpisode = Pick<
  ConvertedTorrentInfo,
  "showName" | "season" | "episode"
>;

export interface BasicTvShow {
  showName: string;
  showId: number;
}
