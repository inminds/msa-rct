import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { demoAuth } from "./middlewares/demoAuth.js"; // <-- ESM: usar .js no import
import { initScheduler } from "./services/schedulerService";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Healthcheck para warm-up / monitoramento
app.get("/health", (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

(async () => {
  // Demo auth disabled for demonstration purposes
  // app.use("/api", demoAuth);

  const server = await registerRoutes(app);
  await initScheduler();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const isDev = process.env.NODE_ENV === 'development';
  const host = isDev ? "127.0.0.1" : "0.0.0.0";

  server.listen(
    {
      port,
      host,
      reusePort: !isDev,
    },
    () => {
      log(`serving on http://${host}:${port}`);
    }
  );
})();
