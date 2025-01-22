import { json } from "express";
import type { RequestHandler } from "express";
import cookies from "cookie-parser";
import methodOverride from "method-override";
import { auth } from "./auth";
import { headerMiddleware } from "./headers";
import { loggingMiddleware } from "./logging";
import { useCors } from "./cors";
import { rateLimiterMiddleware } from "./rateLimiter";

export const getMiddleware = (debugMode: boolean): RequestHandler[] => [
  useCors(debugMode),
  json(),
  cookies(),
  methodOverride("_method"),
  loggingMiddleware,
  rateLimiterMiddleware,
  headerMiddleware,
  auth(debugMode),
];
