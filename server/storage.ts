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

  // NCM Scan operations
  getPendingNCMs(): Promise<{ ncmCode: string; description: string | null }[]>;
  updateNCMEconetStatus(ncmCode: string, status: string, matchedNcm?: string): Promise<void>;
  saveNCMTributeData(
    ncmCode: string,
    status: string,
    regras: { regime: string; pis: number; cofins: number; dispositivoLegal: string }[],
    matchedNcm?: string,
  ): Promise<{ saved: number }>;
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
    const Database = (await import("better-sqlite3")).default;
    const sqliteDb = new Database(".data/dev.db");
    try {
      const processedFiles = (sqliteDb.prepare(
        "SELECT COUNT(*) as c FROM uploads WHERE status = 'COMPLETED'"
      ).get() as any)?.c ?? 0;

      const ncmCodes = (sqliteDb.prepare(
        "SELECT COUNT(DISTINCT ncm_code) as c FROM ncm_items"
      ).get() as any)?.c ?? 0;

      // Análises concluídas = NCMs que foram scaneados pelo Econet com sucesso
      const completedAnalyses = (sqliteDb.prepare(
        "SELECT COUNT(*) as c FROM ncm_items WHERE econet_status IN ('FOUND', 'PARTIAL')"
      ).get() as any)?.c ?? 0;

      // Pendentes validação = mudanças detectadas aguardando aceite
      const pendingValidation = (sqliteDb.prepare(
        "SELECT COUNT(*) as c FROM ncm_changes WHERE status = 'pending'"
      ).get() as any)?.c ?? 0;

      return { processedFiles, ncmCodes, completedAnalyses, pendingValidation };
    } finally {
      sqliteDb.close();
    }
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
    // Only return NCMs that were actually analysed by Econet, ordered by scan date
    const items = await db
      .select()
      .from(ncmItems)
      .where(sql`${ncmItems.econetStatus} IN ('FOUND', 'PARTIAL')`)
      .orderBy(desc(ncmItems.econetScannedAt))
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
    const Database = (await import("better-sqlite3")).default;
    const sqliteDb = new Database(".data/dev.db");
    try {
      const rows = sqliteDb.prepare(
        "SELECT type, COUNT(*) as c FROM tributes GROUP BY type"
      ).all() as { type: string; c: number }[];
      const dist = { icms: 0, ipi: 0, pis: 0, cofins: 0 };
      for (const row of rows) {
        const key = row.type.toLowerCase() as keyof typeof dist;
        if (key in dist) dist[key] = row.c;
      }
      return dist;
    } finally {
      sqliteDb.close();
    }
  }

  async getJurisdictionDistribution(): Promise<{
    federal: number;
    estadual: number;
  }> {
    const Database = (await import("better-sqlite3")).default;
    const sqliteDb = new Database(".data/dev.db");
    try {
      const rows = sqliteDb.prepare(
        "SELECT jurisdiction, COUNT(*) as c FROM tributes GROUP BY jurisdiction"
      ).all() as { jurisdiction: string; c: number }[];
      const dist = { federal: 0, estadual: 0 };
      for (const row of rows) {
        const key = row.jurisdiction.toLowerCase() as keyof typeof dist;
        if (key in dist) dist[key] = row.c;
      }
      return dist;
    } finally {
      sqliteDb.close();
    }
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

  async getPendingNCMs(): Promise<{ ncmCode: string; description: string | null }[]> {
    const rows = await db
      .selectDistinct({ ncmCode: ncmItems.ncmCode, description: ncmItems.description })
      .from(ncmItems)
      .where(eq((ncmItems as any).econetStatus, 'PENDING'));

    // Filter out codes that already have tributes (incremental guarantee)
    const result: { ncmCode: string; description: string | null }[] = [];
    for (const row of rows) {
      const hasData = await this.hasExistingTributeData(row.ncmCode);
      if (!hasData) result.push(row);
    }
    return result;
  }

  async updateNCMEconetStatus(ncmCode: string, status: string, matchedNcm?: string): Promise<void> {
    await db
      .update(ncmItems)
      .set({
        econetStatus: status,
        econetScannedAt: new Date(),
        ...(matchedNcm ? { econetMatchedNcm: matchedNcm } : {}),
      } as any)
      .where(eq(ncmItems.ncmCode, ncmCode));
  }

  async saveNCMTributeData(
    ncmCode: string,
    status: string,
    regras: { regime: string; pis: number; cofins: number; dispositivoLegal: string }[],
    matchedNcm?: string,
  ): Promise<{ saved: number }> {
    await this.updateNCMEconetStatus(ncmCode, status, matchedNcm);

    if (regras.length === 0) return { saved: 0 };

    const items = await db
      .select({ id: ncmItems.id })
      .from(ncmItems)
      .where(eq(ncmItems.ncmCode, ncmCode));

    let saved = 0;
    for (const item of items) {
      for (const regra of regras) {
        await db.insert(tributes).values({
          id: randomUUID(),
          type: 'PIS',
          rate: regra.pis,
          jurisdiction: 'FEDERAL',
          lawSource: `[${regra.regime}] ${regra.dispositivoLegal}`,
          effectiveFrom: new Date(),
          ncmItemId: item.id,
        });
        await db.insert(tributes).values({
          id: randomUUID(),
          type: 'COFINS',
          rate: regra.cofins,
          jurisdiction: 'FEDERAL',
          lawSource: `[${regra.regime}] ${regra.dispositivoLegal}`,
          effectiveFrom: new Date(),
          ncmItemId: item.id,
        });
        saved++;
      }
    }
    return { saved };
  }
}

export const storage = new DatabaseStorage();
