import {
  users,
  uploads,
  ncmItems,
  tributes,
  lawChangeLogs,
  type User,
  type UpsertUser,
  type Upload,
  type InsertUpload,
  type NCMItem,
  type InsertNCMItem,
  type Tribute,
  type InsertTribute,
  type LawChangeLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, isNull, isNotNull } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

  // Upload operations
  createUpload(upload: InsertUpload & { userId: string }): Promise<Upload>;
  getUploadsByUser(userId: string): Promise<Upload[]>;
  getUpload(id: string): Promise<Upload | undefined>;
  updateUploadStatus(id: string, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR', errorMessage?: string): Promise<void>;
  deleteUpload(id: string): Promise<void>;
  clearAllData(): Promise<void>;

  // NCM operations
  createNCMItem(ncmItem: InsertNCMItem): Promise<NCMItem>;
  getNCMItemsByUpload(uploadId: string): Promise<NCMItem[]>;

  // Tribute operations
  createTribute(tribute: InsertTribute): Promise<Tribute>;
  getTributesByNCMItem(ncmItemId: string): Promise<Tribute[]>;
  validateTribute(tributeId: string, validatedBy: string): Promise<void>;

  // Dashboard statistics
  getDashboardStats(userId?: string): Promise<{
    processedFiles: number;
    ncmCodes: number;
    completedAnalyses: number;
    pendingValidation: number;
  }>;

  // Recent uploads and analyses
  getRecentUploads(limit?: number): Promise<(Upload & { user: User; ncmItemsCount: number })[]>;
  getRecentAnalyses(limit?: number): Promise<(NCMItem & { upload: Upload; tributes: Tribute[] })[]>;

  // Tax distribution
  getTaxDistribution(): Promise<{
    icms: number;
    ipi: number;
    pis: number;
    cofins: number;
  }>;

  // Jurisdiction distribution
  getJurisdictionDistribution(): Promise<{
    federal: number;
    estadual: number;
  }>;

  // Incremental ingestion check
  hasExistingTributeData(ncmCode: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...userData })
      .onConflictDoUpdate({
        target: users.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();
    return user;
  }

  async createUpload(upload: InsertUpload & { userId: string }): Promise<Upload> {
    const [created] = await db
      .insert(uploads)
      .values({ id: randomUUID(), uploadedAt: new Date(), ...upload })
      .returning();
    return created;
  }

  async getUploadsByUser(userId: string): Promise<Upload[]> {
    return await db
      .select()
      .from(uploads)
      .where(eq(uploads.userId, userId))
      .orderBy(desc(uploads.uploadedAt));
  }

  async getUpload(id: string): Promise<Upload | undefined> {
    const [upload] = await db.select().from(uploads).where(eq(uploads.id, id));
    return upload;
  }

  async updateUploadStatus(id: string, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR', errorMessage?: string): Promise<void> {
    await db
      .update(uploads)
      .set({
        status,
        errorMessage,
        processedAt: status === 'COMPLETED' ? new Date() : undefined
      })
      .where(eq(uploads.id, id));
  }

  async createNCMItem(ncmItem: InsertNCMItem): Promise<NCMItem> {
    const [created] = await db
      .insert(ncmItems)
      .values({ id: randomUUID(), createdAt: new Date(), ...ncmItem })
      .returning();
    return created;
  }

  async getNCMItemsByUpload(uploadId: string): Promise<NCMItem[]> {
    return await db
      .select()
      .from(ncmItems)
      .where(eq(ncmItems.uploadId, uploadId))
      .orderBy(ncmItems.ncmCode);
  }

  async createTribute(tribute: InsertTribute): Promise<Tribute> {
    const [created] = await db
      .insert(tributes)
      .values({ id: randomUUID(), ...tribute })
      .returning();
    return created;
  }

  async getTributesByNCMItem(ncmItemId: string): Promise<Tribute[]> {
    return await db
      .select()
      .from(tributes)
      .where(eq(tributes.ncmItemId, ncmItemId));
  }

  async validateTribute(tributeId: string, validatedBy: string): Promise<void> {
    await db
      .update(tributes)
      .set({ validated: new Date(), validatedBy })
      .where(eq(tributes.id, tributeId));
  }

  async getDashboardStats(userId?: string): Promise<{
    processedFiles: number;
    ncmCodes: number;
    completedAnalyses: number;
    pendingValidation: number;
  }> {
    const [[{ processedFiles }], [{ ncmCodes }], [{ completedAnalyses }], [{ pendingValidation }]] =
      await Promise.all([
        db
          .select({ processedFiles: sql<number>`cast(count(*) as int)` })
          .from(uploads)
          .where(eq(uploads.status, 'COMPLETED')),
        db
          .select({ ncmCodes: sql<number>`cast(count(distinct ${ncmItems.ncmCode}) as int)` })
          .from(ncmItems),
        db
          .select({ completedAnalyses: sql<number>`cast(count(*) as int)` })
          .from(tributes)
          .where(isNotNull(tributes.validated)),
        db
          .select({ pendingValidation: sql<number>`cast(count(*) as int)` })
          .from(tributes)
          .where(isNull(tributes.validated)),
      ]);

    return {
      processedFiles: processedFiles ?? 0,
      ncmCodes: ncmCodes ?? 0,
      completedAnalyses: completedAnalyses ?? 0,
      pendingValidation: pendingValidation ?? 0,
    };
  }

  async getRecentUploads(limit = 10): Promise<(Upload & { user: User; ncmItemsCount: number })[]> {
    const recentUploads = await db
      .select()
      .from(uploads)
      .orderBy(desc(uploads.uploadedAt))
      .limit(limit);

    return Promise.all(
      recentUploads.map(async (upload) => {
        const [user] = await db.select().from(users).where(eq(users.id, upload.userId));
        const [{ ncmItemsCount }] = await db
          .select({ ncmItemsCount: sql<number>`cast(count(*) as int)` })
          .from(ncmItems)
          .where(eq(ncmItems.uploadId, upload.id));

        return {
          ...upload,
          user: user as User,
          ncmItemsCount: ncmItemsCount ?? 0,
        };
      }),
    );
  }

  async getRecentAnalyses(limit = 10): Promise<(NCMItem & { upload: Upload; tributes: Tribute[] })[]> {
    const items = await db
      .select()
      .from(ncmItems)
      .orderBy(desc(ncmItems.createdAt))
      .limit(limit);

    return Promise.all(
      items.map(async (item) => {
        const [upload] = await db.select().from(uploads).where(eq(uploads.id, item.uploadId));
        const itemTributes = await db
          .select()
          .from(tributes)
          .where(eq(tributes.ncmItemId, item.id));

        return { ...item, upload: upload as Upload, tributes: itemTributes };
      }),
    );
  }

  async getTaxDistribution(): Promise<{
    icms: number;
    ipi: number;
    pis: number;
    cofins: number;
  }> {
    const rows = await db
      .select({
        type: tributes.type,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(tributes)
      .groupBy(tributes.type);

    const dist = { icms: 0, ipi: 0, pis: 0, cofins: 0 };
    for (const row of rows) {
      const key = row.type.toLowerCase() as keyof typeof dist;
      if (key in dist) dist[key] = row.count ?? 0;
    }
    return dist;
  }

  async getJurisdictionDistribution(): Promise<{
    federal: number;
    estadual: number;
  }> {
    const rows = await db
      .select({
        jurisdiction: tributes.jurisdiction,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(tributes)
      .groupBy(tributes.jurisdiction);

    const dist = { federal: 0, estadual: 0 };
    for (const row of rows) {
      const key = row.jurisdiction.toLowerCase() as keyof typeof dist;
      if (key in dist) dist[key] = row.count ?? 0;
    }
    return dist;
  }

  async hasExistingTributeData(ncmCode: string): Promise<boolean> {
    const [result] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(tributes)
      .innerJoin(ncmItems, eq(tributes.ncmItemId, ncmItems.id))
      .where(eq(ncmItems.ncmCode, ncmCode));
    return (result?.count ?? 0) > 0;
  }

  async deleteUpload(id: string): Promise<void> {
    // Delete tributes associated with NCM items from this upload
    const ncmItemsToDelete = await db
      .select({ id: ncmItems.id })
      .from(ncmItems)
      .where(eq(ncmItems.uploadId, id));

    for (const ncmItem of ncmItemsToDelete) {
      await db.delete(tributes).where(eq(tributes.ncmItemId, ncmItem.id));
    }

    // Delete NCM items from this upload
    await db.delete(ncmItems).where(eq(ncmItems.uploadId, id));

    // Delete the upload itself
    await db.delete(uploads).where(eq(uploads.id, id));
  }

  async clearAllData(): Promise<void> {
    // Delete in correct order due to foreign key constraints
    await db.delete(tributes);
    await db.delete(ncmItems);
    await db.delete(uploads);
    console.log('🗑️  All data cleared from database');
  }
}

export const storage = new DatabaseStorage();
