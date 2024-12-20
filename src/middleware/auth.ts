import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { getLogger } from "../logger";
import { sendError, StatusCode } from "../util";
import { CustomRequest, RequestMethod, UserObj } from "../models";

const logger = getLogger(__filename);

const DEBUG_MODE = process.env.NODE_ENV === "development";

// Allows all requests to go through, even if JWT authentication fails.
const DISABLE_AUTH =
  DEBUG_MODE && process.env.DANGEROUSLY_DISABLE_AUTHENTICATION === "true";

if (DISABLE_AUTH)
  logger.warn(
    "Authentication is disabled: all API routes are publicly accessible. Do not use this setting in production!"
  );

const USE_LOCAL_AUTH_URL =
  DEBUG_MODE && process.env.USE_LOCAL_AUTH_URL === "true";

const AUTH_SERVER_URL = USE_LOCAL_AUTH_URL
  ? "http://localhost:5019"
  : "https://auth.guzek.uk";

// If false, allows requests with expired access tokens to go through
const VERIFY_TOKEN_EXPIRY = true;

const PERMISSIONS = {
  anonymous: {
    GET: [
      "/pages", // View all pages
      "/updated", // View site updates
      "/liveseries/downloaded-episodes/ws/.websocket", // LiveSeries downloaded episode info
      "/liveseries/video", // Stream downloaded LiveSeries episode
      "/liveseries/subtitles", // Fetch episode subtitles
      "/torrents", // Search for torrents using scraper
      "/.well-known", // JWKS for JWT
    ],
    POST: [
      "/auth/users", // Sign up
      "/auth/tokens", // Log in
      "/auth/refresh", // Regenerate access token
    ],
    PUT: [],
    DELETE: [],
    PATCH: [],
  },
  loggedInUser: {
    GET: [
      "/tu-lalem", // View all app coordinates
      "/auth/usernames", // View all usernames
      "/liveseries/shows/personal", // View own liked/subscribed shows
      "/liveseries/watched-episodes/personal", // View own watched episodes
    ],
    POST: [
      "/tu-lalem", // Submit app coordinates
      "/liveseries/shows/personal", // Add show to liked/subscribed list
    ],
    PUT: ["/liveseries/watched-episodes/personal"], // Modify own watched episodes
    DELETE: [
      "/auth/tokens", // Log out
      "/liveseries/shows/personal", // Remove show from liked/subscribed list
    ],
    PATCH: [],
  },
} as const;

const jwksClient = new JwksClient({
  jwksUri: AUTH_SERVER_URL + "/.well-known/jwks.json",
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

export function authMiddleware(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  const endpointAccessibleBy = {
    anonymous: false,
    loggedInUser: false,
  };
  // Check if the current endpoint is accessible using the request method to anonymous or logged in users
  for (const [level, routes] of Object.entries(PERMISSIONS)) {
    const method =
      req.method === "HEAD" ? "GET" : (req.method as RequestMethod);
    const endpoints = routes[method] ?? [];
    endpointAccessibleBy[level as keyof typeof PERMISSIONS] = endpoints.some(
      (endpoint) => req.path.startsWith(endpoint)
    );
  }

  function reject(code: StatusCode, message: string) {
    if (endpointAccessibleBy.anonymous || DISABLE_AUTH) {
      return void next();
    }
    if (code === 401) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="${AUTH_SERVER_URL}", error="invalid_token", error_description="${message}"`
      );
    }
    sendError(res, code, { message });
  }

  const token =
    req.headers.authorization?.split(" ")?.[1] ||
    (req.query.access_token as string | undefined);
  if (!token) {
    return reject(401, "Missing authorisation token.");
  }

  jwt.verify(token, getKey, (err, user) => {
    if (err) {
      logger.error(err);
      return reject(401, "Invalid authorisation token.");
    }
    const { iat, exp, ...userDetails } = user as UserObj & {
      iat: number;
      exp: number;
    };
    req.user = userDetails;
    if (VERIFY_TOKEN_EXPIRY && new Date().getTime() > exp) {
      return reject(401, "Access token is expired.");
    }
    if (endpointAccessibleBy.loggedInUser || req.user?.admin) {
      return void next();
    }
    // Allow user to edit own details
    if (req.path.startsWith("/auth/user/" + req.user?.uuid)) {
      if (["GET", "PUT", "PATCH"].includes(req.method)) {
        return void next();
      }
    }
    reject(403, "You cannot perform that action.");
  });
}
