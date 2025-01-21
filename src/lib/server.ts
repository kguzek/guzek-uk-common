import type { Application, Request, Response } from "express";
import { getLogger } from "./logger";
import { sendError } from "./http";
import { router as healthcheckRouter } from "../routes/health";
import { router as logRouter } from "../routes/logs";

const logger = getLogger(__filename);

const send405 = (req: Request, res: Response) =>
  sendError(res, 405, {
    message: `You cannot ${req.method.toUpperCase()} the resource at '${
      req.path
    }'.`,
  });

function closeServer(message: string) {
  logger.crit(message);
  return null;
}

function getServerPort() {
  const port = process.env.NODE_PORT;
  if (port == null || port === "") {
    return closeServer("No NODE_PORT environment variable set.");
  }
  if (!/^\d+$/.test(port)) {
    return closeServer("NODE_PORT is set to a non-integer value.");
  }
  const portInt = +port;
  if (portInt < 0 || portInt > 65535) {
    return closeServer("NODE_PORT is set to an invalid port number.");
  }
  return portInt;
}

/**
 * Starts the server on the specified port, and registers a catch-all 404 route.
 *
 * @param app The Express application to start the server on.
 * @returns True if the server was started successfully, false otherwise.
 */
export function startServer(app: Application) {
  const port = getServerPort();
  if (!port) return false;

  app.use("/health", healthcheckRouter, send405);
  app.use("/logs", logRouter, send405);

  // Catch-all 404 response for any other route
  app.all("*", (req, res) =>
    sendError(res, 404, {
      message: `The resource at '${req.path}' was not located.`,
    })
  );

  const server = app.listen(port, () =>
    logger.info(`API listening on port ${port}.`)
  );

  // Gracefully shut down on SIGTERM (sent by Docker when you run `docker compose down`)
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM. Closing server...");
    server.close((error) => {
      if (error) {
        closeServer(`Attempted to close a server that was not open: ${error}`);
        process.exit(1);
      }
      logger.info("Server exited gracefully.");
      process.exit(0);
    });
  });
  return true;
}
