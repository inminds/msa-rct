import { defineConfig } from "drizzle-kit";

const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",

  // Development: SQLite
  // Production: PostgreSQL
  ...(isDev
    ? {
      dialect: "sqlite",
      dbCredentials: {
        url: "./.data/dev.db",
      },
    }
    : {
      dialect: "postgresql",
      dbCredentials: {
        url: process.env.DATABASE_URL || "",
      },
    }
  ),
});
