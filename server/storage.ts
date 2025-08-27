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
import { eq, desc, sql, and, count } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Upload operations
  createUpload(upload: InsertUpload & { userId: string }): Promise<Upload>;
  getUploadsByUser(userId: string): Promise<Upload[]>;
  getUpload(id: string): Promise<Upload | undefined>;
  updateUploadStatus(id: string, status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR', errorMessage?: string): Promise<void>;
  
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
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createUpload(upload: InsertUpload & { userId: string }): Promise<Upload> {
    const [created] = await db.insert(uploads).values(upload).returning();
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
    const [created] = await db.insert(ncmItems).values(ncmItem).returning();
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
    const [created] = await db.insert(tributes).values(tribute).returning();
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
    const baseQuery = userId 
      ? and(eq(uploads.userId, userId))
      : undefined;

    const [processedFilesResult] = await db
      .select({ count: count() })
      .from(uploads)
      .where(baseQuery);

    const [ncmCodesResult] = await db
      .select({ count: count() })
      .from(ncmItems)
      .innerJoin(uploads, eq(ncmItems.uploadId, uploads.id))
      .where(baseQuery);

    const [completedAnalysesResult] = await db
      .select({ count: count() })
      .from(tributes)
      .innerJoin(ncmItems, eq(tributes.ncmItemId, ncmItems.id))
      .innerJoin(uploads, eq(ncmItems.uploadId, uploads.id))
      .where(and(baseQuery, sql`${tributes.validated} IS NOT NULL`));

    const [pendingValidationResult] = await db
      .select({ count: count() })
      .from(tributes)
      .innerJoin(ncmItems, eq(tributes.ncmItemId, ncmItems.id))
      .innerJoin(uploads, eq(ncmItems.uploadId, uploads.id))
      .where(and(baseQuery, sql`${tributes.validated} IS NULL`));

    return {
      processedFiles: processedFilesResult.count,
      ncmCodes: ncmCodesResult.count,
      completedAnalyses: completedAnalysesResult.count,
      pendingValidation: pendingValidationResult.count,
    };
  }

  async getRecentUploads(limit = 10): Promise<(Upload & { user: User; ncmItemsCount: number })[]> {
    const result = await db
      .select({
        upload: uploads,
        user: users,
        ncmItemsCount: count(ncmItems.id),
      })
      .from(uploads)
      .innerJoin(users, eq(uploads.userId, users.id))
      .leftJoin(ncmItems, eq(uploads.id, ncmItems.uploadId))
      .groupBy(uploads.id, users.id)
      .orderBy(desc(uploads.uploadedAt))
      .limit(limit);

    return result.map(row => ({
      ...row.upload,
      user: row.user,
      ncmItemsCount: row.ncmItemsCount,
    }));
  }

  async getRecentAnalyses(limit = 10): Promise<(NCMItem & { upload: Upload; tributes: Tribute[] })[]> {
    const ncmItemsResult = await db
      .select()
      .from(ncmItems)
      .innerJoin(uploads, eq(ncmItems.uploadId, uploads.id))
      .orderBy(desc(ncmItems.createdAt))
      .limit(limit);

    const result = [];
    for (const item of ncmItemsResult) {
      const tributesForItem = await this.getTributesByNCMItem(item.ncm_items.id);
      result.push({
        ...item.ncm_items,
        upload: item.uploads,
        tributes: tributesForItem,
      });
    }

    return result;
  }

  async getTaxDistribution(): Promise<{
    icms: number;
    ipi: number;
    pis: number;
    cofins: number;
  }> {
    const result = await db
      .select({
        type: tributes.type,
        count: count(),
      })
      .from(tributes)
      .groupBy(tributes.type);

    return {
      icms: result.find(r => r.type === 'ICMS')?.count || 0,
      ipi: result.find(r => r.type === 'IPI')?.count || 0,
      pis: result.find(r => r.type === 'PIS')?.count || 0,
      cofins: result.find(r => r.type === 'COFINS')?.count || 0,
    };
  }

  async getJurisdictionDistribution(): Promise<{
    federal: number;
    estadual: number;
  }> {
    const result = await db
      .select({
        jurisdiction: tributes.jurisdiction,
        count: count(),
      })
      .from(tributes)
      .groupBy(tributes.jurisdiction);

    return {
      federal: result.find(r => r.jurisdiction === 'FEDERAL')?.count || 0,
      estadual: result.find(r => r.jurisdiction === 'ESTADUAL')?.count || 0,
    };
  }
}

export const storage = new DatabaseStorage();
