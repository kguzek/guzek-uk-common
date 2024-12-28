import { NextFunction, Request, Response } from "express";
import { getLogger } from "../logger";

const logger = getLogger(__filename);

const SENSITIVE_FIELDS = [
  "password",
  "oldPassword",
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
];

const getRequestIP = (req: Request) =>
  req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;

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
  const ip = getRequestIP(req);
  (res as any).ip = ip;
  const path = req.originalUrl.replace(/token=[^&]+/, "token=********");
  logger.request(`${req.method} ${path}`, { ip, body });
  next();
}
