import { NextFunction, Request, Response } from "express";
import { getLogger } from "../logger";

const logger = getLogger(__filename);

const getRequestIP = (req: Request) =>
  req.headers["x-forwarded-for"] || req.socket.remoteAddress || null;

export async function loggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const body = Array.isArray(req.body) ? [...req.body] : { ...req.body };
  // Ensure passwords are not logged in plaintext
  for (const sensitiveField of ["password", "oldPassword", "newPassword"]) {
    if (!body[sensitiveField]) continue;
    body[sensitiveField] = "********";
  }
  const ip = getRequestIP(req);
  (res as any).ip = ip;
  logger.request(`${req.method} ${req.originalUrl}`, { ip, body });
  next();
}
