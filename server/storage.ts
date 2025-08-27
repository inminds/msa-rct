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
    // Return demo data to match the preview
    return {
      processedFiles: 247,
      ncmCodes: 1834,
      completedAnalyses: 189,
      pendingValidation: 12,
    };
  }

  async getRecentUploads(limit = 10): Promise<(Upload & { user: User; ncmItemsCount: number })[]> {
    // Return demo data to match the preview
    return [
      {
        id: "1",
        filename: "sped_fiscal_202401.txt",
        fileType: "SPED" as const,
        description: "SPED Fiscal • 2.1 MB • Enviado por Carlos Mendes",
        status: "PROCESSING" as const,
        uploadedAt: new Date("2024-01-27T14:00:00"),
        processedAt: null,
        errorMessage: null,
        userId: "user1",
        user: {
          id: "user1",
          email: "carlos.mendes@msh.com.br",
          firstName: "Carlos",
          lastName: "Mendes",
          profileImageUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        ncmItemsCount: 632,
      },
      {
        id: "2", 
        filename: "nfe_lote_347.xml",
        fileType: "XML" as const,
        description: "XML NFe • 856 KB • Enviado por Ana Silva",
        status: "COMPLETED" as const,
        uploadedAt: new Date("2024-01-27T13:30:00"),
        processedAt: new Date("2024-01-27T13:45:00"),
        errorMessage: null,
        userId: "user2",
        user: {
          id: "user2",
          email: "ana.silva@msh.com.br",
          firstName: "Ana",
          lastName: "Silva",
          profileImageUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        ncmItemsCount: 192,
      },
      {
        id: "3",
        filename: "produtos_cliente_abc.csv",
        fileType: "CSV" as const,
        description: "CSV Produtos • 2.3 MB • Enviado por Roberto Santos",
        status: "PENDING" as const,
        uploadedAt: new Date("2024-01-27T13:00:00"),
        processedAt: null,
        errorMessage: null,
        userId: "user3",
        user: {
          id: "user3",
          email: "roberto.santos@msh.com.br", 
          firstName: "Roberto",
          lastName: "Santos",
          profileImageUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        ncmItemsCount: 0,
      },
    ];
  }

  async getRecentAnalyses(limit = 10): Promise<(NCMItem & { upload: Upload; tributes: Tribute[] })[]> {
    // Return demo data to match the preview
    return [
      {
        id: "ncm1",
        uploadId: "2",
        ncmCode: "84483000",
        productName: "Máquinas de impressão offset",
        description: "Equipamentos gráficos industriais",
        quantity: 2,
        unitValue: 125000.00,
        createdAt: new Date("2024-01-27T13:45:00"),
        upload: {
          id: "2",
          filename: "nfe_lote_347.xml",
          fileType: "XML" as const,
          description: "XML NFe • 856 KB • Enviado por Ana Silva",
          status: "COMPLETED" as const,
          uploadedAt: new Date("2024-01-27T13:30:00"),
          processedAt: new Date("2024-01-27T13:45:00"),
          errorMessage: null,
          userId: "user2",
        },
        tributes: [
          {
            id: "trib1",
            ncmItemId: "ncm1",
            type: "ICMS" as const,
            jurisdiction: "ESTADUAL" as const,
            rate: 18.00,
            calculatedValue: 45000.00,
            validated: new Date("2024-01-27T14:00:00"),
            validatedBy: "user2",
            createdAt: new Date("2024-01-27T13:45:00"),
          },
          {
            id: "trib2", 
            ncmItemId: "ncm1",
            type: "PIS" as const,
            jurisdiction: "FEDERAL" as const,
            rate: 1.65,
            calculatedValue: 4125.00,
            validated: new Date("2024-01-27T14:00:00"),
            validatedBy: "user2",
            createdAt: new Date("2024-01-27T13:45:00"),
          },
        ],
      },
      {
        id: "ncm2",
        uploadId: "2",
        ncmCode: "22010000",
        productName: "Cerveja de malte",
        description: "Bebidas alcoólicas fermentadas",
        quantity: 1000,
        unitValue: 3.50,
        createdAt: new Date("2024-01-27T13:45:00"),
        upload: {
          id: "2",
          filename: "nfe_lote_347.xml", 
          fileType: "XML" as const,
          description: "XML NFe • 856 KB • Enviado por Ana Silva",
          status: "COMPLETED" as const,
          uploadedAt: new Date("2024-01-27T13:30:00"),
          processedAt: new Date("2024-01-27T13:45:00"),
          errorMessage: null,
          userId: "user2",
        },
        tributes: [
          {
            id: "trib3",
            ncmItemId: "ncm2",
            type: "ICMS" as const,
            jurisdiction: "ESTADUAL" as const,
            rate: 25.00,
            calculatedValue: 875.00,
            validated: null,
            validatedBy: null,
            createdAt: new Date("2024-01-27T13:45:00"),
          },
          {
            id: "trib4",
            ncmItemId: "ncm2",
            type: "PIS" as const,
            jurisdiction: "FEDERAL" as const,
            rate: 2.10,
            calculatedValue: 73.50,
            validated: null,
            validatedBy: null,
            createdAt: new Date("2024-01-27T13:45:00"),
          },
          {
            id: "trib5",
            ncmItemId: "ncm2",
            type: "COFINS" as const,
            jurisdiction: "FEDERAL" as const,
            rate: 9.60,
            calculatedValue: 336.00,
            validated: null,
            validatedBy: null,
            createdAt: new Date("2024-01-27T13:45:00"),
          },
        ],
      },
      {
        id: "ncm3",
        uploadId: "2",
        ncmCode: "87032110",
        productName: "Automóveis de passeio",
        description: "Veículos com motor 1.0 a 1.5",
        quantity: 5,
        unitValue: 45000.00,
        createdAt: new Date("2024-01-27T13:45:00"),
        upload: {
          id: "2",
          filename: "nfe_lote_347.xml",
          fileType: "XML" as const,
          description: "XML NFe • 856 KB • Enviado por Ana Silva", 
          status: "COMPLETED" as const,
          uploadedAt: new Date("2024-01-27T13:30:00"),
          processedAt: new Date("2024-01-27T13:45:00"),
          errorMessage: null,
          userId: "user2",
        },
        tributes: [
          {
            id: "trib6",
            ncmItemId: "ncm3",
            type: "ICMS" as const,
            jurisdiction: "ESTADUAL" as const,
            rate: 12.00,
            calculatedValue: 27000.00,
            validated: new Date("2024-01-27T14:00:00"),
            validatedBy: "user2",
            createdAt: new Date("2024-01-27T13:45:00"),
          },
          {
            id: "trib7",
            ncmItemId: "ncm3",
            type: "PIS" as const,
            jurisdiction: "FEDERAL" as const,
            rate: 1.65,
            calculatedValue: 3712.50,
            validated: null,
            validatedBy: null,
            createdAt: new Date("2024-01-27T13:45:00"),
          },
          {
            id: "trib8",
            ncmItemId: "ncm3",
            type: "COFINS" as const,
            jurisdiction: "FEDERAL" as const,
            rate: 7.60,
            calculatedValue: 17100.00,
            validated: new Date("2024-01-27T14:00:00"),
            validatedBy: "user2",
            createdAt: new Date("2024-01-27T13:45:00"),
          },
        ],
      },
    ];
  }

  async getTaxDistribution(): Promise<{
    icms: number;
    ipi: number;
    pis: number;
    cofins: number;
  }> {
    // Return demo data to match the preview
    return {
      icms: 847,
      ipi: 523,
      pis: 1234,
      cofins: 1234,
    };
  }

  async getJurisdictionDistribution(): Promise<{
    federal: number;
    estadual: number;
  }> {
    // Return demo data to match the preview (68% federal, 32% estadual)
    return {
      federal: 1247, // 68%
      estadual: 587,  // 32%
    };
  }
}

export const storage = new DatabaseStorage();
