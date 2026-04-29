/**
 * localAuth.ts — autenticação local com passport-local + session.
 * Dev:  SQLite via rawDb + MemoryStore
 * Prod: PostgreSQL via rawDb + connect-pg-simple
 */
import session from "express-session";
import passport from "passport";
import { randomBytes } from "crypto";
import { Strategy as LocalStrategy } from "passport-local";
import MemoryStore from "memorystore";
import bcrypt from "bcryptjs";
import type { Express, RequestHandler } from "express";
import { rawGet, rawRun } from "./rawDb.js";

const MemStore = MemoryStore(session);

// ─── Usuários pré-cadastrados ────────────────────────────────────────────────

// UUIDs fixos para usuários seed — nunca alterar após definidos
// (precisam ser determinísticos para que a migração e o seedUsers funcionem
//  de forma consistente em qualquer ambiente/boot)
export const SEED_USER_IDS = {
  thayssa:       "10000000-0000-4000-8000-000000000001",
  yuri:          "10000000-0000-4000-8000-000000000002",
  adminInminds:  "10000000-0000-4000-8000-000000000003",
} as const;

const SEED_USERS = [
  {
    id: SEED_USER_IDS.thayssa,
    firstName: "Thayssa",
    lastName: "",
    email: "thayssa@machadoschutz.adv.br",
    role: "ADMIN",
    password: process.env.SEED_PASSWORD_THAYSSA ?? "",
  },
  {
    id: SEED_USER_IDS.yuri,
    firstName: "Yuri",
    lastName: "",
    email: "yuri@machadoschutz.adv.br",
    role: "ADMIN",
    password: process.env.SEED_PASSWORD_YURI ?? "",
  },
  {
    id: SEED_USER_IDS.adminInminds,
    firstName: "Admin",
    lastName: "InMinds",
    email: "admin@inminds.com.br",
    role: "ADMIN",
    password: process.env.SEED_PASSWORD_ADMIN ?? "",
  },
];

export async function seedUsers() {
  for (const u of SEED_USERS) {
    if (!u.password) {
      console.warn(`[localAuth] Senha não configurada para "${u.email}" — defina a env var correspondente. Seed ignorado.`);
      continue;
    }
    const existing = await rawGet(
      "SELECT id, role, password_hash FROM users WHERE id = ?",
      [u.id]
    );
    if (!existing) {
      const hash = await bcrypt.hash(u.password, 10);
      await rawRun(
        `INSERT INTO users (id, first_name, last_name, email, role, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [u.id, u.firstName, u.lastName, u.email, u.role, hash]
      );
      console.log(`[localAuth] Usuário "${u.id}" criado.`);
    } else {
      if (!existing.password_hash) {
        const hash = await bcrypt.hash(u.password, 10);
        await rawRun(
          "UPDATE users SET password_hash = ?, role = ? WHERE id = ?",
          [hash, u.role, u.id]
        );
        console.log(`[localAuth] Senha e role de "${u.id}" atualizados.`);
      } else if (existing.role !== u.role) {
        await rawRun("UPDATE users SET role = ? WHERE id = ?", [u.role, u.id]);
        console.log(`[localAuth] Role de "${u.id}" atualizado para ${u.role}.`);
      } else {
        console.log(`[localAuth] Usuário "${u.id}" já existe com senha.`);
      }
    }
  }
}

// ─── Configuração do passport-local ─────────────────────────────────────────

passport.use(
  new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
    try {
      const user = await rawGet(
        "SELECT id, first_name, last_name, email, role, password_hash FROM users WHERE LOWER(email) = LOWER(?)",
        [email.trim()]
      );
      if (!user) return done(null, false, { message: "E-mail não encontrado" });
      if (!user.password_hash)
        return done(null, false, { message: "Usuário sem senha configurada" });
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return done(null, false, { message: "Senha incorreta" });
      return done(null, {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
      });
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user: any, cb) => cb(null, user.id));

passport.deserializeUser(async (id: string, cb) => {
  try {
    const user = await rawGet(
      "SELECT id, first_name, last_name, email, role FROM users WHERE id = ?",
      [id]
    );
    if (!user) return cb(null, null);
    cb(null, {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    cb(err);
  }
});

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setupLocalAuth(app: Express) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const isProd = process.env.NODE_ENV === "production";

  let store: session.Store;

  if (isProd && process.env.DATABASE_URL) {
    // Sessões persistentes no PostgreSQL
    const ConnectPgSimple = require("connect-pg-simple")(session);
    store = new ConnectPgSimple({
      conString: process.env.DATABASE_URL,
      tableName: "sessions",
      createTableIfMissing: true,
    });
  } else {
    store = new MemStore({ checkPeriod: sessionTtl });
  }

  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? randomBytes(32).toString("hex"),
      store,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: sessionTtl,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // POST /api/auth/login
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user)
        return res.status(401).json({ message: info?.message ?? "Credenciais inválidas" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        });
      });
    })(req, res, next);
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });
}

// ─── Middlewares ─────────────────────────────────────────────────────────────

export const isAuthenticatedLocal: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Unauthorized" });
};

export const isAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as any;
  if (user?.role !== "ADMIN") return res.status(403).json({ message: "Acesso restrito a administradores" });
  next();
};
