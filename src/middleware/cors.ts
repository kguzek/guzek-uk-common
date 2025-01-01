import cors from "cors";

const ALLOWED_ORIGINS = [
  "https://www.guzek.uk",
  "https://beta.guzek.uk",
  "https://nojs.guzek.uk",
];

export function useCors(debugMode: boolean) {
  if (debugMode) {
    ALLOWED_ORIGINS.push("http://localhost:3000");
  }
  return cors({
    origin: (origin, callback) => callback(null, !origin || ALLOWED_ORIGINS),
  });
}
