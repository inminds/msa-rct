import { sql } from 'drizzle-orm';
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Auto-detect database type based on environment
const isDev = process.env.NODE_ENV === 'development';

// Generic column definitions that work with both SQLite and PostgreSQL
import {
  timestamp,
  varchar,
  text,
  real,
  integer,
} from "drizzle-orm/pg-core";

// Conditional table imports - static to avoid require issues
import { sqliteTable as sqliteTableFn } from "drizzle-orm/sqlite-core";
import { pgTable as pgTableFn } from "drizzle-orm/pg-core";

const tableFactory = isDev ? sqliteTableFn : pgTableFn;

// Session storage table for Replit Auth
export const sessions = tableFactory(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    // SESSION: Store as text in both SQLite and PostgreSQL
    sess: text("sess").notNull(),
    expire: timestamp("expire").notNull(),
  }
);

// User storage table for Replit Auth

export const users = tableFactory("users", {
  id: isDev ? varchar("id").primaryKey() : varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("USER"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// Upload table
export const uploads = tableFactory("uploads", {
  id: isDev ? varchar("id").primaryKey() : varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  fileType: varchar("file_type").notNull(), // SPED, XML, CSV
  description: text("description"),
  uploadedAt: timestamp("uploaded_at"),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: varchar("status").default('PENDING'), // PENDING, PROCESSING, COMPLETED, ERROR
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
});

// NCM Items table
export const ncmItems = tableFactory("ncm_items", {
  id: isDev ? varchar("id").primaryKey() : varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ncmCode: varchar("ncm_code", { length: 8 }).notNull(),
  description: text("description"),
  productName: text("product_name"),
  uploadId: varchar("upload_id").notNull().references(() => uploads.id),
  createdAt: timestamp("created_at"),
  // Econet scan tracking
  econetStatus: varchar("econet_status").default('PENDING'), // PENDING | FOUND | NOT_FOUND | PARTIAL
  econetScannedAt: timestamp("econet_scanned_at"),
  econetMatchedNcm: varchar("econet_matched_ncm"), // NCM efetivamente encontrado (pode diferir em match parcial)
});

// Tributes table
export const tributes = tableFactory("tributes", {
  id: isDev ? varchar("id").primaryKey() : varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type").notNull(), // ICMS, IPI, PIS, COFINS
  rate: real("rate"),
  jurisdiction: varchar("jurisdiction").notNull(), // FEDERAL, ESTADUAL
  lawSource: text("law_source"),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  ncmItemId: varchar("ncm_item_id").notNull().references(() => ncmItems.id),
  validated: timestamp("validated"),
  validatedBy: varchar("validated_by").references(() => users.id),
});

// Law change logs table
export const lawChangeLogs = tableFactory("law_change_logs", {
  id: isDev ? varchar("id").primaryKey() : varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tribute: varchar("tribute").notNull(), // ICMS, IPI, PIS, COFINS
  jurisdiction: varchar("jurisdiction").notNull(), // FEDERAL, ESTADUAL
  description: text("description").notNull(),
  detectedAt: timestamp("detected_at"),
  previousContent: text("previous_content"),
  newContent: text("new_content"),
  sourceUrl: text("source_url"),
});

// Scan schedule table (single row, id always = 1)
export const scanSchedule = tableFactory("scan_schedule", {
  id: integer("id").primaryKey(),
  enabled: integer("enabled").notNull().default(0), // 0=false, 1=true
  frequency: varchar("frequency").notNull().default("weekly"), // 'weekly' | 'monthly'
  dayOfWeek: integer("day_of_week").default(1), // 0=Sun … 6=Sat (used when weekly)
  dayOfMonth: integer("day_of_month").default(1), // 1–28 (used when monthly)
  hour: integer("hour").notNull().default(8),
  minute: integer("minute").notNull().default(0),
  mode: varchar("mode").notNull().default("incompletos"), // 'incompletos' | 'todos'
  updatedAt: timestamp("updated_at"),
});

export type ScanSchedule = typeof scanSchedule.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  uploads: many(uploads),
  validatedTributes: many(tributes),
}));

export const uploadsRelations = relations(uploads, ({ one, many }) => ({
  user: one(users, {
    fields: [uploads.userId],
    references: [users.id],
  }),
  ncmItems: many(ncmItems),
}));

export const ncmItemsRelations = relations(ncmItems, ({ one, many }) => ({
  upload: one(uploads, {
    fields: [ncmItems.uploadId],
    references: [uploads.id],
  }),
  tributes: many(tributes),
}));

export const tributesRelations = relations(tributes, ({ one }) => ({
  ncmItem: one(ncmItems, {
    fields: [tributes.ncmItemId],
    references: [ncmItems.id],
  }),
  validator: one(users, {
    fields: [tributes.validatedBy],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  profileImageUrl: true,
  role: true,
});

export const insertUploadSchema = createInsertSchema(uploads).pick({
  filename: true,
  fileType: true,
  description: true,
});

export const insertNCMItemSchema = createInsertSchema(ncmItems).pick({
  ncmCode: true,
  description: true,
  productName: true,
  uploadId: true,
});

export const insertTributeSchema = createInsertSchema(tributes).pick({
  type: true,
  rate: true,
  jurisdiction: true,
  lawSource: true,
  effectiveFrom: true,
  effectiveTo: true,
  ncmItemId: true,
});

// Types
export type UpsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Upload = typeof uploads.$inferSelect;
export type InsertUpload = z.infer<typeof insertUploadSchema>;
export type NCMItem = typeof ncmItems.$inferSelect;
export type InsertNCMItem = z.infer<typeof insertNCMItemSchema>;
export type Tribute = typeof tributes.$inferSelect;
export type InsertTribute = z.infer<typeof insertTributeSchema>;
export type LawChangeLog = typeof lawChangeLogs.$inferSelect;
