import methodOverride from "method-override";

export const useMethodOverride = methodOverride(
  (req) =>
    req.query._method ||
    req.body._method ||
    req.headers["x-http-method-override"]
);
