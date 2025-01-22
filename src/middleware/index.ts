import { json } from "express";
import type { RequestHandler } from "express";
import cookies from "cookie-parser";
import { auth } from "./auth";
import { headerMiddleware } from "./headers";
import { loggingMiddleware } from "./logging";
import { useCors } from "./cors";
import { rateLimiterMiddleware } from "./rateLimiter";
import { useMethodOverride } from "./method-override";

export const getMiddleware = (debugMode: boolean): RequestHandler[] => [
  useCors(debugMode),
  json(),
  cookies(),
  useMethodOverride,
  loggingMiddleware,
  rateLimiterMiddleware,
  headerMiddleware,
  auth(debugMode),
];
