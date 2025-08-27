import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  real,
  pgEnum,
  uuid
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").default("USER"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// File types enum
export const fileTypeEnum = pgEnum('file_type', ['SPED', 'XML', 'CSV']);

// Upload status enum
export const uploadStatusEnum = pgEnum('upload_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'ERROR']);

// Tribute types enum
export const tributeTypeEnum = pgEnum('tribute_type', ['ICMS', 'IPI', 'PIS', 'COFINS']);

// Jurisdiction enum
export const jurisdictionEnum = pgEnum('jurisdiction', ['FEDERAL', 'ESTADUAL']);

// Upload table
export const uploads = pgTable("uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  fileType: fileTypeEnum("file_type").notNull(),
  description: text("description"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: uploadStatusEnum("status").default('PENDING'),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
});

// NCM Items table
export const ncmItems = pgTable("ncm_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ncmCode: varchar("ncm_code", { length: 8 }).notNull(),
  description: text("description"),
  productName: text("product_name"),
  uploadId: varchar("upload_id").notNull().references(() => uploads.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tributes table
export const tributes = pgTable("tributes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: tributeTypeEnum("type").notNull(),
  rate: real("rate"),
  jurisdiction: jurisdictionEnum("jurisdiction").notNull(),
  lawSource: text("law_source"),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  ncmItemId: varchar("ncm_item_id").notNull().references(() => ncmItems.id),
  validated: timestamp("validated"),
  validatedBy: varchar("validated_by").references(() => users.id),
});

// Law change logs table
export const lawChangeLogs = pgTable("law_change_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tribute: tributeTypeEnum("tribute").notNull(),
  jurisdiction: jurisdictionEnum("jurisdiction").notNull(),
  description: text("description").notNull(),
  detectedAt: timestamp("detected_at").defaultNow(),
  previousContent: text("previous_content"),
  newContent: text("new_content"),
  sourceUrl: text("source_url"),
});

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
