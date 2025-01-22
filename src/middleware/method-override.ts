import methodOverride from "method-override";
import { getLogger } from "../lib/logger";

const logger = getLogger(__filename);

export const useMethodOverride = methodOverride(
  (req) => {
    const method =
      req.query._method ||
      req.body._method ||
      req.headers["x-http-method-override"];
    if (!method) return "POST";
    if (typeof method !== "string") {
      logger.warn("Invalid HTTP method override", method);
      return "POST";
    }
    delete req.query._method;
    delete req.body._method;
    logger.http(`Request method override is ${method}`);
    return method;
  },
  { methods: ["POST"] }
);
