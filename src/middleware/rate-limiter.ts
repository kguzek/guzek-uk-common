import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { STATUS_CODES } from "../enums";
import { isLanRequest, logResponse } from "../lib/http";

const RATE_LIMITER_CODE = 429;
const RATE_LIMITER_STATUS =
  `${RATE_LIMITER_CODE} ${STATUS_CODES[RATE_LIMITER_CODE]}` as const;

export const rateLimiterMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  limit: (req: Request) => (isLanRequest(req) ? 1000 : 100), // 100 requests per 15 mins
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
