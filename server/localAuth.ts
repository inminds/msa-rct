/**
 * localAuth.ts — autenticação local (dev) com passport-local + memorystore
 * Funciona com SQLite em desenvolvimento. Produção continua usando Replit OIDC.
 */
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import MemoryStore from "memorystore";
import bcrypt from "bcryptjs";
import type { Express, RequestHandler } from "express";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const MemStore = MemoryStore(session);

// ─── Usuários pré-cadastrados ────────────────────────────────────────────────

const SEED_USERS = [
  {
    id: "thayssa",
    firstName: "Thayssa",
    lastName: "",
    email: "thayssa@machadoschutz.adv.br",
    role: "USER",
    password: "Thayssa@MS",
  },
  {
    id: "yuri",
    firstName: "Yuri",
    lastName: "",
    email: "yuri@machadoschutz.adv.br",
    role: "USER",
    password: "Yuri@MS",
  },
];

export async function seedUsers() {
  // Usamos SQLite direto para lidar com password_hash (coluna fora do schema Drizzle)
  const Database = (await import("better-sqlite3")).default;
  const sqliteDb = new Database(".data/dev.db");

  for (const u of SEED_USERS) {
    const existing = sqliteDb.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(u.id) as any;
    if (!existing) {
      const hash = await bcrypt.hash(u.password, 10);
      sqliteDb.prepare(`
        INSERT INTO users (id, first_name, last_name, email, role, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(u.id, u.firstName, u.lastName, u.email, u.role, hash);
      console.log(`[localAuth] Usuário "${u.id}" criado.`);
    } else if (!existing.password_hash) {
      const hash = await bcrypt.hash(u.password, 10);
      sqliteDb.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, u.id);
      console.log(`[localAuth] Senha de "${u.id}" atualizada.`);
    } else {
      console.log(`[localAuth] Usuário "${u.id}" já existe com senha.`);
    }
  }

  sqliteDb.close();
}

// ─── Configuração do passport-local ─────────────────────────────────────────

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const rows = await db.select().from(users).where(eq(users.id, username.toLowerCase()));
      if (rows.length === 0) return done(null, false, { message: "Usuário não encontrado" });
      const user = rows[0] as any;
      if (!user.password_hash) return done(null, false, { message: "Usuário sem senha configurada" });
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return done(null, false, { message: "Senha incorreta" });
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user: any, cb) => cb(null, user.id));
passport.deserializeUser(async (id: string, cb) => {
  try {
    const rows = await db.select().from(users).where(eq(users.id, id));
    if (rows.length === 0) return cb(null, null);
    // Fetch password_hash separately (column not in Drizzle schema)
    const Database = (await import("better-sqlite3")).default;
    const sqliteDb = new Database(".data/dev.db");
    const raw = sqliteDb.prepare("SELECT password_hash FROM users WHERE id = ?").get(id) as any;
    sqliteDb.close();
    cb(null, { ...rows[0], password_hash: raw?.password_hash ?? null });
  } catch (err) {
    cb(err);
  }
});

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setupLocalAuth(app: Express) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;

  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "dev-secret-rct-2024",
      store: new MemStore({ checkPeriod: sessionTtl }),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, maxAge: sessionTtl },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // POST /api/auth/login
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message ?? "Credenciais inválidas" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({ id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role });
      });
    })(req, res, next);
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => res.json({ success: true }));
  });
}

// ─── Middleware de autenticação (dev) ────────────────────────────────────────

export const isAuthenticatedLocal: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Unauthorized" });
};
