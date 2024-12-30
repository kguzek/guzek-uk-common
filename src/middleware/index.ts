import { json, Request, RequestHandler, Response } from "express";
import cors from "cors";
import cookies from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { authMiddleware } from "./auth";
import { headerMiddleware } from "./headers";
import { loggingMiddleware } from "./logging";
import { STATUS_CODES, logResponse } from "../util";

const RATE_LIMITER_CODE = 429;
const RATE_LIMITER_STATUS =
  `${RATE_LIMITER_CODE} ${STATUS_CODES[RATE_LIMITER_CODE]}` as const;

export function getMiddleware(): RequestHandler[] {
  const rateLimiterMiddleware = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    limit: 100, // 100 requests per 15 mins
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: RATE_LIMITER_CODE,
    message: (_req: Request, res: Response) => {
      logResponse(res, RATE_LIMITER_STATUS);
      return {
        [RATE_LIMITER_STATUS]:
          "You have sent too many requests recently. Try again later.",
      };
    },
  });

  return [
    cors(),
    json(),
    cookies(),
    loggingMiddleware,
    rateLimiterMiddleware,
    headerMiddleware,
    authMiddleware,
  ];
}
