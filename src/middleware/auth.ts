import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { getLogger } from "../lib/logger";
import { sendError } from "../lib/http";
import type {
  CustomRequest,
  RequestMethod,
  StatusCode,
  UserObj,
} from "../models";

const logger = getLogger(__filename);

// If false, allows requests with expired access tokens to go through
const VERIFY_TOKEN_EXPIRY = true;
const PRODUCTION_AUTH_SERVER_URL = "https://auth.guzek.uk";

type AccessLevel = "anonymous" | "authenticatedUser" /* | "cronUser"*/;

const INITIAL_ACCESS_MAP: Record<AccessLevel, boolean> = {
  anonymous: false,
  authenticatedUser: false,
  // cronUser: false,
};

const PERMISSIONS: [AccessLevel, Record<RequestMethod, string[]>][] = [
  [
    "anonymous",
    {
      GET: [
        "/pages", // View all pages
        "/updated", // View site updates
        "/liveseries/downloaded-episodes/ws/.websocket", // LiveSeries downloaded episode info
        "/liveseries/video", // Stream downloaded LiveSeries episode
        "/liveseries/subtitles", // Fetch episode subtitles
        "/torrents", // Search for torrents using scraper
        "/.well-known", // JWKS for JWT
        "/health", // Health check
        "/favicon.ico", // Favicon
      ],
      POST: [
        "/auth/users", // Sign up
        "/auth/tokens", // Log in
        "/auth/refresh", // Regenerate access token
      ],
      PUT: [],
      DELETE: [
        "/auth/tokens", // Log out
      ],
      PATCH: [],
    },
  ],
  [
    "authenticatedUser",
    {
      GET: [
        "/tu-lalem", // View all app coordinates
        "/auth/usernames", // View all usernames
        "/auth/users/me", // View own user details
        "/liveseries/shows/personal", // View own liked/subscribed shows
        "/liveseries/watched-episodes/personal", // View own watched episodes
      ],
      POST: [
        "/tu-lalem", // Submit app coordinates
        "/liveseries/shows/personal", // Add show to liked/subscribed list
      ],
      PUT: [
        "/liveseries/watched-episodes/personal", // Modify own watched episodes
        "/liveseries/downloaded-episodes", // Download unwatched episode
        "/auth/users/me", // Modify own user details
      ],
      DELETE: [
        "/liveseries/shows/personal", // Remove show from liked/subscribed list
      ],
      PATCH: [
        "/auth/users/me", // Modify own user details
      ],
    },
  ],
];

// Hardcoded for security reasons
// const CRON_USER_UUID = "a5260d6a-7275-4d86-bcd7-fd5372827ff5";

// const isCronUser = (user: UserObj | null) => user?.uuid === CRON_USER_UUID;

export function auth(debugMode: boolean) {
  // Allows all requests to go through, even if JWT authentication fails.
  const DISABLE_AUTH =
    debugMode && process.env.DANGEROUSLY_DISABLE_AUTHENTICATION === "true";

  if (DISABLE_AUTH)
    logger.warn(
      "Authentication is disabled: all API routes are publicly accessible. Do not use this setting in production!"
    );

  const USE_LOCAL_AUTH_URL =
    debugMode && process.env.USE_LOCAL_AUTH_URL === "true";

  const AUTH_SERVER_URL = USE_LOCAL_AUTH_URL
    ? "http://localhost:5019"
    : PRODUCTION_AUTH_SERVER_URL;
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

  return function (req: CustomRequest, res: Response, next: NextFunction) {
    const endpointAccessibleBy = INITIAL_ACCESS_MAP;
    // Check if the current endpoint is accessible using the request method to anonymous or logged in users
    for (const [level, routes] of PERMISSIONS) {
      const method =
        req.method === "HEAD" ? "GET" : (req.method as RequestMethod);
      const endpoints = routes[method] ?? [];
      endpointAccessibleBy[level] = endpoints.some((endpoint) =>
        req.path.startsWith(endpoint)
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

    if (
      req.cookies.refresh_token &&
      (req.method !== "DELETE" || !req.path.startsWith("/auth/tokens"))
    ) {
      logger.warn(
        "Unnecessary refresh token passed in request cookies. This is a security risk."
      );
    }

    const token =
      req.headers.authorization?.split(" ")?.[1] ||
      req.query.access_token ||
      req.cookies.access_token;
    if (!token || typeof token !== "string") {
      return reject(401, "Missing authorisation token.");
    }

    jwt.verify(token, getKey, (err, user) => {
      if (err) {
        logger.error("Error verifying token:", err);
        return reject(401, "Invalid authorisation token.");
      }
      const { iat, exp, aud, iss, ...userDetails } = user as UserObj &
        jwt.JwtPayload;
      req.user = userDetails;
      if (VERIFY_TOKEN_EXPIRY && new Date().getTime() > (exp ?? 0)) {
        return reject(401, "Access token is expired.");
      }
      if (iss !== PRODUCTION_AUTH_SERVER_URL) {
        logger.warn(`Invalid access token issuer: '${iss}'`);
        return reject(401, `Invalid access token issuer: '${iss}'`);
      }
      if (!aud) {
        return reject(401, "Access token does not specify intended audience.");
      }
      const url = `${req.protocol}://${req.headers.host}/`;
      const isValidAudience = (audience: string) =>
        [url, "*"].includes(audience);
      if (
        Array.isArray(aud) ? !aud.some(isValidAudience) : !isValidAudience(aud)
      ) {
        logger.warn(`Token intended for '${aud}' used on '${url}'`);
        return reject(401, `This access token is only valid for: '${aud}'`);
      }
      if (endpointAccessibleBy.authenticatedUser) {
        return void next();
      }
      // Allow user to edit own details
      if (req.path.startsWith("/auth/user/" + req.user?.uuid)) {
        if (["GET", "PUT", "PATCH"].includes(req.method)) {
          return void next();
        }
      }
      // if (endpointAccessibleBy.cronUser && isCronUser(req.user)) {
      //   return void next();
      // }
      if (req.user?.admin) {
        logger.debug(
          `Allowing admin ${req.user.username} to ${req.method} ${req.path} which would otherwise be forbidden.`
        );
        return void next();
      }
      return reject(403, "You cannot perform that action.");
    });
  };
}
