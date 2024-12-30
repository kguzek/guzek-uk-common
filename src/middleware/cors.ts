import cors from "cors";

export function useCors(debugMode: boolean) {
  const allowedOrigins = debugMode
    ? ["http://localhost:3000"]
    : ["https://www.guzek.uk", "https://beta.guzek.uk"];
  return cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("This origin is not allowed by CORS"));
      }
    },
  });
}
