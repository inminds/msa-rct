import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { demoAuth } from "./middlewares/demoAuth.js"; // <-- ESM: usar .js no import
import { initScheduler } from "./services/schedulerService";
import { setupLocalAuth, seedUsers } from "./localAuth";

// ── Validação de variáveis de ambiente obrigatórias em produção ──────────────
if (process.env.NODE_ENV === "production") {
  const missing = [
    !process.env.SESSION_SECRET        && "SESSION_SECRET",
    !process.env.SEED_PASSWORD_THAYSSA && "SEED_PASSWORD_THAYSSA",
    !process.env.SEED_PASSWORD_YURI    && "SEED_PASSWORD_YURI",
    !process.env.SEED_PASSWORD_ADMIN   && "SEED_PASSWORD_ADMIN",
  ].filter(Boolean);

  if (missing.length > 0) {
    console.error(
      "\n❌ ERRO CRÍTICO: variáveis de ambiente obrigatórias não definidas em produção:\n" +
      missing.map(v => `   - ${v}`).join("\n") + "\n" +
      "\n   Defina-as no painel do Railway/Vercel antes de subir.\n"
    );
    process.exit(1);
  }
}

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
  const isDev = process.env.NODE_ENV === "development";

  // Local auth runs in all environments (dev + production)
  setupLocalAuth(app);
  await seedUsers();

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
