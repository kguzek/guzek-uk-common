import type { NextFunction, Request, Response } from "express";
import { getLogger } from "../lib/logger";
import { getRequestIp } from "../lib/http";
import type { CustomResponse } from "../models";

const logger = getLogger(__filename);

const SENSITIVE_FIELDS = [
  "password",
  "oldPassword",
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
];

export async function loggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const body = Array.isArray(req.body) ? [...req.body] : { ...req.body };
  // Ensure passwords are not logged in plaintext
  for (const sensitiveField of SENSITIVE_FIELDS) {
    if (!body[sensitiveField]) continue;
    body[sensitiveField] = "********";
  }
  const ip = getRequestIp(req);
  // Needed to log the IP address during response
  (res as CustomResponse).ip = ip;
  const path = req.originalUrl.replace(/token=[^&]+/, "token=********");
  logger.request(`${req.method} ${path}`, { ip, body });
  next();
}
