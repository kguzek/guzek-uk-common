import { Application, Request, Response } from "express";
import { getLogger } from "./logger";
import { sendError, sendOK } from "./util";

const logger = getLogger(__filename);

const HEALTHCHECK_PATH = "/health";

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

const send405 = (req: Request, res: Response) =>
  sendError(res, 405, {
    message: `You cannot ${req.method.toUpperCase()} the resource at '${
      req.originalUrl
    }'.`,
  });

/**
 * Imports each specified module and instructs the application to use its router.
 * @param app the Express.Application server app instance
 * @param endpoints the array of paths to the route file, with an assumed base directory of `/src/routes/`.
 */
async function initialiseEndpoints(app: Application, endpoints: string[]) {
  for (const endpoint of endpoints) {
    const middleware = await import("./src/routes/" + endpoint);
    if (middleware.init) middleware.init(endpoints);
    const path = `/${endpoint}`;
    app.use(path, middleware.router, send405);
  }
}

/** Starts the server on the specified port, and registers a catch-all 404 route. */
export function startServer(app: Application, endpoints: string[]) {
  const port = getServerPort();
  if (!port) return;

  initialiseEndpoints(app, endpoints);

  app.get(HEALTHCHECK_PATH, (_, res) =>
    sendOK(res, { message: "Server is up" })
  );

  // Catch-all 404 response for any other route
  app.all("*", (req, res) =>
    sendError(res, 404, {
      message: `The resource at '${req.originalUrl}' was not located.`,
    })
  );

  app.listen(port, () => logger.info(`API listening on port ${port}.`));
}
