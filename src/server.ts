import type { Application } from "express";
import { getLogger } from "./logger";
import { send405, sendError } from "./util";
import { router as healthcheckRouter } from "./routes/health";
import { router as logRouter } from "./routes/logs";

const logger = getLogger(__filename);

function getServerPort() {
  const port = process.env.NODE_PORT;
  if (port == null || port === "") {
    logger.error("No NODE_PORT environment variable set.");
    return null;
  }
  if (!/^\d+$/.test(port)) {
    logger.error("NODE_PORT is set to a non-integer value.");
    return null;
  }
  const portInt = +port;
  if (portInt < 0 || portInt > 65535) {
    logger.error("NODE_PORT is set to an invalid port number.");
    return null;
  }
  return portInt;
}

/** Starts the server on the specified port, and registers a catch-all 404 route. */
export function startServer(app: Application) {
  const port = getServerPort();
  if (!port) return;

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
        logger.error(`Attempted to close a server that was not open: ${error}`);
        process.exit(1);
      }
      logger.info("Server exited gracefully.");
      process.exit(0);
    });
  });
}
