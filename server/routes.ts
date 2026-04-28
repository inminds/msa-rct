import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { isAdmin } from "./localAuth";
import { FileProcessor } from "./services/fileProcessor";
import { TaxCalculator } from "./services/taxCalculator";
import multer from "multer";
import { insertUploadSchema, insertNCMItemSchema, insertTributeSchema, scanSchedule } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
import path from "path";
import { readNCMsFromExcel, readNCMsFromExcelFull, readHistoricoFromExcel, addNCMsToExcel, PYTHON } from "./services/excelService";
import { applySchedule, cancelSchedule, detectAndSaveChanges } from "./services/schedulerService";
import { setActivePid, getActivePid } from "./services/scanState";
import { generateReportFile, getPreviewData, type ReportType, type ReportFormat } from "./services/reportService";
import { rawGet, rawAll, rawRun } from "./rawDb.js";
import { randomUUID } from "crypto";
import fs from "fs";

const INTERNAL_API_KEY = process.env.NODE_API_KEY ?? "dev-internal-key";

function isInternalRequest(req: any): boolean {
  return req.headers["x-internal-key"] === INTERNAL_API_KEY;
}

// ── Audit logging helpers ────────────────────────────────────────────────────

async function getUploadsWithDetails(limit = 50) {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const uploads = await rawAll(
    `SELECT
       id,
       filename,
       file_type AS "fileType",
       description,
       uploaded_at AS "uploadedAt",
       user_id AS "userId",
       status,
       processed_at AS "processedAt",
       error_message AS "errorMessage"
     FROM uploads
     ORDER BY uploaded_at DESC
     LIMIT ?`,
    [safeLimit]
  ) as any[];

  if (!uploads.length) return [];

  const uploadIds = uploads.map((upload) => upload.id);
  const uploadPlaceholders = uploadIds.map(() => "?").join(",");
  const ncmRows = await rawAll(
    `SELECT upload_id, ncm_code
     FROM ncm_items
     WHERE upload_id IN (${uploadPlaceholders})
     ORDER BY created_at ASC`,
    uploadIds
  ) as any[];

  const ncmsByUpload: Record<string, string[]> = {};
  for (const row of ncmRows) {
    (ncmsByUpload[row.upload_id] ??= []).push(row.ncm_code);
  }

  const userIds = Array.from(new Set(uploads.map((upload) => upload.userId).filter(Boolean)));
  const usersById: Record<string, string> = {};

  if (userIds.length) {
    const userPlaceholders = userIds.map(() => "?").join(",");
    const userRows = await rawAll(
      `SELECT id, first_name, last_name, email
       FROM users
       WHERE id IN (${userPlaceholders})`,
      userIds
    ) as any[];

    for (const user of userRows) {
      usersById[user.id] =
        `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() ||
        user.email ||
        user.id;
    }
  }

  return uploads.map((upload) => ({
    ...upload,
    uploaderName: usersById[upload.userId] ?? upload.userId ?? "-",
    extractedNcms: ncmsByUpload[upload.id] ?? [],
  }));
}

function getUserInfo(req: any): { id: string; name: string } {
  const u = req.user as any;
  const id = u?.id ?? u?.claims?.sub ?? "unknown";
  const name = u?.firstName
    ? `${u.firstName} ${u.lastName ?? ""}`.trim()
    : (u?.email ?? id);
  return { id, name };
}

async function logAudit(
  userId: string,
  userName: string,
  action: string,
  category: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    await rawRun(
      "INSERT INTO audit_logs (user_id, user_name, action, category, details) VALUES (?, ?, ?, ?, ?)",
      [userId, userName, action, category, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error("[audit] Erro ao salvar log:", err);
  }
}

// Demo data generation function
async function generateDemoData(userId: string): Promise<void> {
  // Create demo uploads
  const uploads = [
    {
      id: `upload-${Date.now()}-1`,
      filename: "sped_fiscal_202401.txt",
      fileType: "SPED" as const,
      description: "SPED Fiscal • 2.1 MB • Enviado por Carlos Mendes",
      userId,
      status: "PROCESSING" as const,
      uploadedAt: new Date(),
    },
    {
      id: `upload-${Date.now()}-2`,
      filename: "nfe_lote_347.xml",
      fileType: "XML" as const,
      description: "XML NFe • 856 KB • Enviado por Ana Silva",
      userId,
      status: "COMPLETED" as const,
      uploadedAt: new Date(),
    },
    {
      id: `upload-${Date.now()}-3`,
      filename: "produtos_cliente_abc.csv",
      fileType: "CSV" as const,
      description: "CSV Produtos • 2.3 MB • Enviado por Roberto Santos",
      userId,
      status: "PENDING" as const,
      uploadedAt: new Date(),
    },
  ];

  const createdUploads = [];
  for (const upload of uploads) {
    const created = await storage.createUpload(upload);
    createdUploads.push(created);
  }

  // Create demo NCM items
  const ncmItems = [
    {
      id: `ncm-${Date.now()}-1`,
      uploadId: createdUploads[1].id, // XML file
      ncmCode: "84483000",
      productName: "Máquinas de impressão offset",
      description: "Equipamentos gráficos industriais",
      quantity: 2,
      unitValue: 125000.00,
      createdAt: new Date(),
    },
    {
      id: `ncm-${Date.now()}-2`,
      uploadId: createdUploads[1].id,
      ncmCode: "22010000",
      productName: "Cerveja de malte",
      description: "Bebidas alcoólicas fermentadas",
      quantity: 1000,
      unitValue: 3.50,
      createdAt: new Date(),
    },
    {
      id: `ncm-${Date.now()}-3`,
      uploadId: createdUploads[1].id,
      ncmCode: "87032110",
      productName: "Automóveis de passeio",
      description: "Veículos com motor 1.0 a 1.5",
      quantity: 5,
      unitValue: 45000.00,
      createdAt: new Date(),
    },
  ];

  const createdNCMItems = [];
  for (const ncmItem of ncmItems) {
    const created = await storage.createNCMItem(ncmItem);
    createdNCMItems.push(created);
  }

  // Create demo tributes
  const tributes = [
    // Máquinas de impressão offset
    {
      id: `tribute-${Date.now()}-1`,
      ncmItemId: createdNCMItems[0].id,
      type: "ICMS" as const,
      jurisdiction: "ESTADUAL" as const,
      rate: 18.00,
      calculatedValue: 22500.00,
      validated: new Date(),
      validatedBy: userId,
    },
    {
      id: `tribute-${Date.now()}-2`,
      ncmItemId: createdNCMItems[0].id,
      type: "PIS" as const,
      jurisdiction: "FEDERAL" as const,
      rate: 1.65,
      calculatedValue: 2062.50,
      validated: new Date(),
      validatedBy: userId,
    },
    // Cerveja de malte
    {
      id: `tribute-${Date.now()}-3`,
      ncmItemId: createdNCMItems[1].id,
      type: "ICMS" as const,
      jurisdiction: "ESTADUAL" as const,
      rate: 25.00,
      calculatedValue: 875.00,
    },
    {
      id: `tribute-${Date.now()}-4`,
      ncmItemId: createdNCMItems[1].id,
      type: "PIS" as const,
      jurisdiction: "FEDERAL" as const,
      rate: 2.10,
      calculatedValue: 73.50,
    },
    {
      id: `tribute-${Date.now()}-5`,
      ncmItemId: createdNCMItems[1].id,
      type: "COFINS" as const,
      jurisdiction: "FEDERAL" as const,
      rate: 9.60,
      calculatedValue: 336.00,
    },
    // Automóveis de passeio
    {
      id: `tribute-${Date.now()}-6`,
      ncmItemId: createdNCMItems[2].id,
      type: "ICMS" as const,
      jurisdiction: "ESTADUAL" as const,
      rate: 12.00,
      calculatedValue: 27000.00,
      validated: new Date(),
      validatedBy: userId,
    },
    {
      id: `tribute-${Date.now()}-7`,
      ncmItemId: createdNCMItems[2].id,
      type: "PIS" as const,
      jurisdiction: "FEDERAL" as const,
      rate: 1.65,
      calculatedValue: 3712.50,
    },
    {
      id: `tribute-${Date.now()}-8`,
      ncmItemId: createdNCMItems[2].id,
      type: "COFINS" as const,
      jurisdiction: "FEDERAL" as const,
      rate: 7.60,
      calculatedValue: 17100.00,
      validated: new Date(),
      validatedBy: userId,
    },
  ];

  for (const tribute of tributes) {
    await storage.createTribute(tribute);
  }
}

// Clear demo data function
async function clearDemoData(): Promise<void> {
  // This would clear demo data from the database
  // For now, we'll just reset the storage to use real database queries
  console.log("Demo data cleared - returning to real database queries");
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

export async function registerRoutes(app: Express): Promise<Server> {

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      // Dev: user is already the full object from passport session
      if (process.env.NODE_ENV === 'development') {
        const { password_hash, ...safeUser } = req.user as any;
        return res.json(safeUser);
      }
      const userId = (req.user as any).id ?? (req.user as any).claims?.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard stats (public for demo)
  app.get('/api/dashboard/stats', async (req: any, res) => {
    try {
      const [dbStats, excelRows] = await Promise.all([
        storage.getDashboardStats(req.user?.claims?.sub),
        readNCMsFromExcel().catch(() => []),
      ]);

      const isPreenchido = (r: any) => !!(r["PIS Cumulativo"] || r["PIS Não Cumulativo"]);

      res.json({
        processedFiles: dbStats.processedFiles,
        ncmCodes: excelRows.length,
        completedAnalyses: excelRows.filter(isPreenchido).length,
        pendingValidation: dbStats.pendingValidation,
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // All uploads with uploader and extracted NCMs
  app.get('/api/uploads', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(await getUploadsWithDetails(limit));
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ message: "Failed to fetch uploads" });
    }
  });

  // Legacy uploads shape kept away from the public route.
  app.get('/api/uploads-legacy', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const uploads = await storage.getRecentUploads(limit) as any[];
      if (!uploads.length) return res.json([]);

      // NCMs extraídos por upload — uma query só
      const ids = uploads.map(u => u.id);
      const placeholders = ids.map(() => "?").join(",");
      const ncmRows = await rawAll(
        `SELECT upload_id, ncm_code FROM ncm_items WHERE upload_id IN (${placeholders}) ORDER BY created_at ASC`,
        ids
      ) as any[];
      const ncmsByUpload: Record<string, string[]> = {};
      for (const r of ncmRows) {
        (ncmsByUpload[r.upload_id] ??= []).push(r.ncm_code);
      }

      // Nomes dos usuários que fizeram upload — uma query só
      const userIds = Array.from(new Set(uploads.map(u => u.userId).filter(Boolean)));
      const usersMap: Record<string, string> = {};
      if (userIds.length) {
        const uPlaceholders = userIds.map(() => "?").join(",");
        const uRows = await rawAll(
          `SELECT id, first_name, last_name FROM users WHERE id IN (${uPlaceholders})`,
          userIds
        ) as any[];
        for (const u of uRows) {
          usersMap[u.id] = `${u.first_name} ${u.last_name ?? ""}`.trim();
        }
      }

      res.json(uploads.map(u => ({
        ...u,
        uploaderName: usersMap[u.userId] ?? u.userId ?? "—",
        extractedNcms: ncmsByUpload[u.id] ?? [],
      })));
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ message: "Failed to fetch uploads" });
    }
  });

  // Recent uploads (public for demo)
  app.get('/api/uploads/recent', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const uploads = await storage.getRecentUploads(limit);
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching recent uploads:", error);
      res.status(500).json({ message: "Failed to fetch recent uploads" });
    }
  });

  // Recent analyses — last filled NCMs from Excel
  app.get('/api/analyses/recent', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const rows = await readNCMsFromExcel();

      const isPreenchido = (r: any) => !!(r["PIS Cumulativo"] || r["PIS Não Cumulativo"]);
      const filled = rows.filter(isPreenchido).slice(-3).reverse();

      const analyses = filled.map((r, i) => {
        const tributes: any[] = [];
        if (r["PIS Cumulativo"])
          tributes.push({ id: `pis-cum-${i}`, type: "PIS", rate: r["PIS Cumulativo"], validated: true });
        if (r["COFINS Cumulativo"])
          tributes.push({ id: `cof-cum-${i}`, type: "COFINS", rate: r["COFINS Cumulativo"], validated: true });
        if (r["PIS Não Cumulativo"] && r["PIS Não Cumulativo"] !== r["PIS Cumulativo"])
          tributes.push({ id: `pis-nc-${i}`, type: "PIS", rate: r["PIS Não Cumulativo"], validated: true });
        if (r["COFINS Não Cumulativo"] && r["COFINS Não Cumulativo"] !== r["COFINS Cumulativo"])
          tributes.push({ id: `cof-nc-${i}`, type: "COFINS", rate: r["COFINS Não Cumulativo"], validated: true });

        return {
          id: `excel-${r["NCM"]}-${i}`,
          ncmCode: r["NCM"],
          productName: r["Descrição"] || r["NCM Econet"] || r["NCM"],
          description: r["Descrição"] || "",
          regime: r["Regime"] || "",
          status: "COMPLETED",
          tributes,
        };
      });

      res.json(analyses);
    } catch (error) {
      console.error("Error fetching recent analyses:", error);
      res.status(500).json({ message: "Failed to fetch recent analyses" });
    }
  });

  // Tax distribution — count NCMs from Excel that have each tribute filled
  app.get('/api/dashboard/tax-distribution', async (req, res) => {
    try {
      const rows = await readNCMsFromExcel().catch(() => []);
      const hasPis = (r: any) => !!(r["PIS Cumulativo"] || r["PIS Não Cumulativo"]);
      const hasCofins = (r: any) => !!(r["COFINS Cumulativo"] || r["COFINS Não Cumulativo"]);
      res.json({
        pis: rows.filter(hasPis).length,
        cofins: rows.filter(hasCofins).length,
        icms: 0,
        ipi: 0,
      });
    } catch (error) {
      console.error("Error fetching tax distribution:", error);
      res.status(500).json({ message: "Failed to fetch tax distribution" });
    }
  });

  // Jurisdiction distribution (public for demo)
  app.get('/api/dashboard/jurisdiction-distribution', async (req, res) => {
    try {
      const rows = await readNCMsFromExcel().catch(() => []);
      res.json({ federal: rows.length, estadual: 0 });
    } catch (error) {
      console.error("Error fetching jurisdiction distribution:", error);
      res.status(500).json({ message: "Failed to fetch jurisdiction distribution" });
    }
  });

  // Tax analysis alerts summary
  app.get("/api/tax-analysis/alerts", isAuthenticated, async (_req, res) => {
    try {
      const [excelRows, pendingChanges] = await Promise.all([
        readNCMsFromExcel().catch(() => []),
        (async () => {
          const row = await rawGet(
            "SELECT COUNT(*) AS total FROM ncm_changes WHERE status = 'pending'"
          ) as { total?: number | string } | undefined;
          return Number(row?.total ?? 0);
        })(),
      ]);

      const isPreenchido = (r: any) => !!(r["PIS Cumulativo"] || r["PIS Não Cumulativo"]);

      res.json({
        pendingScans: excelRows.filter((row: any) => !isPreenchido(row)).length,
        pendingChanges,
      });
    } catch (error) {
      console.error("Error fetching tax analysis alerts:", error);
      res.status(500).json({ message: "Failed to fetch tax analysis alerts" });
    }
  });

  // ── Reports ──────────────────────────────────────────────────────────────

  // POST /api/reports/generate
  app.post("/api/reports/generate", isAuthenticated, async (req: any, res) => {
    const { type, format, name } = req.body as { type: ReportType; format: ReportFormat; name: string };
    if (!type || !format || !name) return res.status(400).json({ message: "type, format e name são obrigatórios" });

    const id = randomUUID();
    const userId = (req.user as any)?.id ?? (req.user as any)?.claims?.sub ?? "unknown";

    await rawRun(
      "INSERT INTO reports (id, name, type, format, status, created_by) VALUES (?, ?, ?, ?, 'pending', ?)",
      [id, name, type, format, userId]
    );

    const { id: rUserId, name: rUserName } = getUserInfo(req);
    logAudit(rUserId, rUserName, "REPORT_GENERATED", "report", { name, type, format, reportId: id });

    res.json({ id, status: "pending" });

    // Generate async
    (async () => {
      try {
        const [excelRows, changes, historicoRows] = await Promise.all([
          type === "ncm-analysis" ? readNCMsFromExcelFull().catch(() => []) : readNCMsFromExcel().catch(() => []),
          rawAll("SELECT * FROM ncm_changes ORDER BY scan_date DESC"),
          type === "history-report" ? readHistoricoFromExcel().catch(() => []) : Promise.resolve([]),
        ]);
        const filePath = await generateReportFile(id, name, type, format, excelRows as any, changes, historicoRows as any);
        await rawRun("UPDATE reports SET status='completed', file_path=? WHERE id=?", [filePath, id]);
      } catch (err: any) {
        await rawRun("UPDATE reports SET status='error', error_message=? WHERE id=?", [err.message, id]);
      }
    })();
  });

  // GET /api/reports
  app.get("/api/reports", isAuthenticated, async (_req, res) => {
    const rows = await rawAll(
      `SELECT
         id,
         name,
         type,
         format,
         status,
         file_path,
         created_by,
         datetime(created_at, 'localtime') AS created_at,
         error_message,
         download_count,
         downloaded_by
       FROM reports
       ORDER BY created_at DESC`
    ) as any[];
    const totalDownloadsRow = await rawGet(
      "SELECT COALESCE(SUM(CASE WHEN download_count IS NULL THEN 0 ELSE download_count END), 0) AS total FROM reports"
    ) as { total?: number | string } | undefined;

    res.json({
      reports: rows.map((report) => ({
        ...report,
        download_count: Number(report.download_count ?? 0),
      })),
      totalDownloads: Number(totalDownloadsRow?.total ?? 0),
    });
  });

  // GET /api/reports/:id/download
  app.get("/api/reports/:id/download", isAuthenticated, async (req: any, res) => {
    const report = await rawGet("SELECT * FROM reports WHERE id=?", [req.params.id]) as any;
    if (!report || report.status !== "completed" || !report.file_path) {
      return res.status(404).json({ message: "Arquivo não disponível" });
    }
    if (!fs.existsSync(report.file_path)) {
      return res.status(404).json({ message: "Arquivo não encontrado no servidor" });
    }
    const userId = (req.user as any)?.id ?? (req.user as any)?.claims?.sub ?? "unknown";
    const userName = (req.user as any)?.firstName
      ? `${(req.user as any).firstName} ${(req.user as any).lastName ?? ""}`.trim()
      : userId;
    await rawRun(
      "UPDATE reports SET download_count = download_count + 1, downloaded_by = ? WHERE id = ?",
      [userName, req.params.id]
    );
    logAudit(userId, userName, "REPORT_DOWNLOADED", "report", {
      reportId: req.params.id,
      reportName: report.name,
      format: report.format,
    });
    const ext = report.format === "xlsx" ? "xlsx" : "pdf";
    const safeName = report.name.replace(/[^a-zA-Z0-9\-_]/g, "_");
    res.download(report.file_path, `${safeName}.${ext}`);
  });

  // GET /api/reports/:id/preview
  app.get("/api/reports/:id/preview", isAuthenticated, async (req, res) => {
    const report = await rawGet("SELECT * FROM reports WHERE id=?", [req.params.id]) as any;
    if (!report) return res.status(404).json({ message: "Relatório não encontrado" });
    const [changes, historicoRows, excelRows] = await Promise.all([
      rawAll("SELECT * FROM ncm_changes ORDER BY scan_date DESC"),
      report.type === "history-report" ? readHistoricoFromExcel().catch(() => []) : Promise.resolve([]),
      report.type === "ncm-analysis"
        ? readNCMsFromExcelFull().catch(() => [])
        : readNCMsFromExcel().catch(() => []),
    ]);
    const preview = getPreviewData(report.type as ReportType, excelRows as any, changes, historicoRows as any);
    res.json({ ...preview, reportName: report.name, format: report.format, status: report.status });
  });

  // GET /api/reports/preview-template?type=... (preview sem gerar arquivo)
  app.get("/api/reports/preview-template", isAuthenticated, async (req, res) => {
    const type = req.query.type as ReportType;
    if (!type) return res.status(400).json({ message: "type obrigatório" });
    const [changes, historicoRows, excelRows] = await Promise.all([
      rawAll("SELECT * FROM ncm_changes ORDER BY scan_date DESC"),
      type === "history-report" ? readHistoricoFromExcel().catch(() => []) : Promise.resolve([]),
      type === "ncm-analysis"
        ? readNCMsFromExcelFull().catch(() => [])
        : readNCMsFromExcel().catch(() => []),
    ]);
    const preview = getPreviewData(type, excelRows as any, changes, historicoRows as any);
    const names: Record<string, string> = {
      "tax-summary": "Resumo Tributário",
      "ncm-analysis": "Análise Detalhada de NCMs",
      "trend-analysis": "Análise de Tendências",
      "history-report": "Histórico de Mudanças",
    };
    res.json({ ...preview, reportName: names[type] ?? type });
  });

  // GET /api/reports/:id/status (polling)
  app.get("/api/reports/:id/status", isAuthenticated, async (req, res) => {
    const report = await rawGet("SELECT id, status, error_message FROM reports WHERE id=?", [req.params.id]) as any;
    if (!report) return res.status(404).json({ message: "Não encontrado" });
    res.json(report);
  });

  // File upload
  app.post('/api/uploads', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = (req.user as any).id ?? (req.user as any).claims?.sub;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { fileType, description } = req.body;

      // Validate input
      const uploadData = insertUploadSchema.parse({
        filename: file.originalname,
        fileType,
        description,
      });

      // Create upload record
      const upload = await storage.createUpload({
        ...uploadData,
        userId,
      });

      // Process file asynchronously
      const { id: uId, name: uName } = getUserInfo(req);
      processFileAsync(upload.id, file.buffer.toString('utf-8'), fileType, uId, uName);

      logAudit(uId, uName, "UPLOAD_CREATED", "upload", {
        filename: file.originalname,
        fileType,
        description: description || null,
        uploadId: upload.id,
      });

      res.json({ uploadId: upload.id, message: "File upload started" });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Get uploads for user (legacy shape)
  app.get('/api/uploads-user-legacy', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id ?? (req.user as any).claims?.sub;
      const uploads = await storage.getUploadsByUser(userId);
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ message: "Failed to fetch uploads" });
    }
  });

  // Get upload by ID
  app.get('/api/uploads/:id', isAuthenticated, async (req, res) => {
    try {
      const upload = await storage.getUpload(req.params.id);
      if (!upload) {
        return res.status(404).json({ message: "Upload not found" });
      }
      res.json(upload);
    } catch (error) {
      console.error("Error fetching upload:", error);
      res.status(500).json({ message: "Failed to fetch upload" });
    }
  });

  // Get NCM items for upload
  app.get('/api/uploads/:id/ncm-items', isAuthenticated, async (req, res) => {
    try {
      const ncmItems = await storage.getNCMItemsByUpload(req.params.id);
      res.json(ncmItems);
    } catch (error) {
      console.error("Error fetching NCM items:", error);
      res.status(500).json({ message: "Failed to fetch NCM items" });
    }
  });

  // Get tributes for NCM item
  app.get('/api/ncm-items/:id/tributes', isAuthenticated, async (req, res) => {
    try {
      const tributes = await storage.getTributesByNCMItem(req.params.id);
      res.json(tributes);
    } catch (error) {
      console.error("Error fetching tributes:", error);
      res.status(500).json({ message: "Failed to fetch tributes" });
    }
  });

  // Validate tribute
  app.put('/api/tributes/:id/validate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id ?? (req.user as any).claims?.sub;
      await storage.validateTribute(req.params.id, userId);
      res.json({ message: "Tribute validated successfully" });
    } catch (error) {
      console.error("Error validating tribute:", error);
      res.status(500).json({ message: "Failed to validate tribute" });
    }
  });

  // Delete upload by ID
  app.delete('/api/uploads/:id', isAuthenticated, async (req, res) => {
    try {
      const upload = await storage.getUpload(req.params.id);
      if (!upload) {
        return res.status(404).json({ message: "Upload not found" });
      }

      await storage.deleteUpload(req.params.id);
      res.json({ message: "Upload deleted successfully", id: req.params.id });
    } catch (error) {
      console.error("Error deleting upload:", error);
      res.status(500).json({ message: "Failed to delete upload" });
    }
  });

  // Clear all database (development only)
  app.post('/api/admin/clear-database', async (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
      try {
        await storage.clearAllData();
        res.json({ message: "✅ All database data cleared successfully" });
      } catch (error) {
        console.error("Error clearing database:", error);
        res.status(500).json({ message: "Failed to clear database" });
      }
    } else {
      res.status(403).json({ message: "This endpoint is only available in development mode" });
    }
  });

  // Demo data generation endpoint (public for demo purposes)
  app.post('/api/generate-demo-data', async (req: any, res) => {
    try {
      // The demo data is already built into the storage layer
      // This endpoint just confirms the demo data is active
      res.json({
        message: "Dados de demonstração já estão ativos",
        description: "O sistema já está usando dados de demonstração realistas que correspondem à preview mostrada.",
        data: {
          processedFiles: 247,
          ncmCodes: 1834,
          completedAnalyses: 189,
          pendingValidation: 12,
          queueFiles: 3,
          taxDistribution: {
            icms: 847,
            ipi: 523,
            pis: 1234,
            cofins: 1234
          },
          jurisdictionDistribution: {
            federal: 1247,
            estadual: 587
          }
        }
      });
    } catch (error) {
      console.error("Error with demo data:", error);
      res.status(500).json({ message: "Erro ao acessar dados de demonstração" });
    }
  });

  // Clear demo data endpoint
  app.post('/api/clear-demo-data', async (req: any, res) => {
    try {
      await clearDemoData();
      res.json({ message: "Demo data cleared successfully" });
    } catch (error) {
      console.error("Error clearing demo data:", error);
      res.status(500).json({ message: "Failed to clear demo data" });
    }
  });

  // ====== RPA LEGAL INTELLIGENCE INTEGRATION ENDPOINTS ======

  // RPA webhook endpoint for legal changes
  app.post("/api/rpa/webhook/legal-changes", async (req, res) => {
    try {
      console.log("🔔 RPA Legal Change Webhook received:", {
        portal: req.body.portal,
        severity: req.body.severity,
        title: req.body.title
      });

      const changeData = req.body;

      // Log critical changes with more detail
      if (changeData.severity === 'critical' || changeData.severity === 'high') {
        console.log(`🚨 CRITICAL/HIGH Legal change: ${changeData.portal} - ${changeData.summary}`);
      }

      // TODO: Store in legal_changes table when integrated with RPA database
      // await storage.storeLegalChange(changeData);

      res.json({
        success: true,
        message: "Legal change webhook processed successfully",
        timestamp: new Date().toISOString(),
        change_id: changeData.id || `change-${Date.now()}`
      });
    } catch (error) {
      console.error("❌ Error processing legal change webhook:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process legal change webhook",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // RPA status and monitoring endpoints
  app.get("/api/rpa/status", async (req, res) => {
    try {
      const schedule = await rawGet("SELECT * FROM scan_schedule WHERE id = 1") as any;

      // Last scan execution = last audit_log entry for any scan trigger action
      const lastScanLog = await rawGet(
        `SELECT created_at FROM audit_logs
         WHERE action IN (
           'SCAN_TRIGGERED_TODOS','SCAN_TRIGGERED_INCOMPLETOS',
           'SCAN_TRIGGERED_SELECIONADOS','SCAN_AUTO_TRIGGERED','SCAN_APPROVED_YURI'
         )
         ORDER BY created_at DESC LIMIT 1`
      ) as any;

      let next_scheduled_execution: string | null = null;
      if (schedule?.enabled) {
        const now = new Date();
        const h = schedule.hour ?? 8;
        const m = schedule.minute ?? 0;
        // Find next matching day (up to 31 days ahead)
        for (let i = 1; i <= 31; i++) {
          const candidate = new Date(now);
          candidate.setDate(now.getDate() + i);
          candidate.setHours(h, m, 0, 0);
          const match = schedule.frequency === "monthly"
            ? candidate.getDate() === (schedule.day_of_month ?? 1)
            : candidate.getDay() === (schedule.day_of_week ?? 1);
          if (match) { next_scheduled_execution = candidate.toISOString(); break; }
        }
      }

      res.json({
        service_status: schedule?.enabled ? "active" : "inactive",
        last_execution: lastScanLog?.created_at ?? null,
        next_scheduled_execution,
        system_health: "healthy",
      });
    } catch (error) {
      console.error("Error fetching RPA status:", error);
      res.status(500).json({ service_status: "error", system_health: "unhealthy" });
    }
  });

  // Recent legal changes from RPA
  app.get("/api/rpa/recent-changes", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;

      // Mock data for now - will integrate with RPA database
      const changes = [
        {
          id: "change-001",
          portal_name: "Econet",
          url: "https://www.econeteditora.com.br/legislacao/federal/in-rfb-2175-2025",
          title: "Instrução Normativa RFB nº 2.175/2025 - Alteração ICMS ST",
          change_type: "MODIFIED",
          severity: "critical",
          detected_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          diff_summary: "Alteração nas alíquotas de ICMS ST para produtos industrializados. NCMs 84.83, 87.03 e 22.01 afetados.",
          keywords: ["icms", "substituição tributária", "alíquota", "ncm"]
        },
        {
          id: "change-002",
          portal_name: "Receita Federal do Brasil",
          url: "https://www.gov.br/receitafederal/portaria-me-456-2025",
          title: "Portaria ME nº 456/2025 - Prazo DEFIS 2025",
          change_type: "NEW",
          severity: "high",
          detected_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          diff_summary: "Novo prazo para entrega da DEFIS 2025: 31/03/2025. Multa por atraso: R$ 500,00.",
          keywords: ["defis", "prazo", "multa", "simples nacional"]
        }
      ];

      res.json({
        changes: changes.slice(0, limit),
        total: changes.length,
        last_updated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching recent changes:", error);
      res.status(500).json({
        changes: [],
        message: "Failed to fetch recent changes"
      });
    }
  });

  // Critical legal changes only
  app.get("/api/rpa/critical-changes", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;

      // Mock critical changes - will integrate with RPA database
      const criticalChanges = [
        {
          id: "critical-001",
          portal_name: "Econet",
          title: "🚨 Alíquota ICMS ST alterada para NCM 84.83",
          severity: "critical",
          detected_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          impact_description: "Mudança afeta cálculo de impostos para máquinas industriais",
          requires_immediate_action: true
        }
      ];

      res.json({
        critical_changes: criticalChanges.slice(0, limit),
        total_critical: criticalChanges.length,
        alert_level: criticalChanges.length > 0 ? "high" : "normal"
      });
    } catch (error) {
      console.error("Error fetching critical changes:", error);
      res.status(500).json({
        critical_changes: [],
        message: "Failed to fetch critical changes"
      });
    }
  });

  // RPA execution statistics
  app.get("/api/rpa/statistics", async (req, res) => {
    try {
      const period = req.query.period || "30d";

      // Mock statistics - will integrate with RPA database
      const stats = {
        period,
        total_executions: 89,
        successful_executions: 82,
        failed_executions: 7,
        success_rate: "92.1%",
        total_changes_detected: 23,
        changes_by_severity: {
          critical: 3,
          high: 8,
          medium: 9,
          low: 3
        },
        changes_by_portal: {
          "Econet": 15,
          "Receita Federal do Brasil": 8
        },
        avg_execution_time_minutes: 4.2,
        last_30_days_trend: "stable",
        alerts_sent: 18,
        alert_response_rate: "94.4%"
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching RPA statistics:", error);
      res.status(500).json({ message: "Failed to fetch RPA statistics" });
    }
  });

  // Manual trigger for RPA execution
  app.post("/api/rpa/execute", isAuthenticated, async (req: any, res) => {
    try {
      const { portal_name, force_execution } = req.body;
      const userId = (req.user as any).id ?? (req.user as any).claims?.sub;

      console.log(`🚀 Manual RPA execution requested by user ${userId} for portal: ${portal_name}`);

      // This would trigger actual RPA execution
      // For now, return success response
      const executionId = `exec-${Date.now()}`;

      res.json({
        success: true,
        execution_id: executionId,
        message: `RPA execution started for ${portal_name || 'all portals'}`,
        estimated_duration_minutes: 5,
        status_check_url: `/api/rpa/executions/${executionId}`
      });
    } catch (error) {
      console.error("Error triggering RPA execution:", error);
      res.status(500).json({
        success: false,
        message: "Failed to trigger RPA execution"
      });
    }
  });

  // ─── NCM Scan endpoints (consumed by Python rpa_ncm_scanner) ─────────────

  // GET /api/ncm-scan/pending — returns unique NCMs awaiting Econet scan
  app.get("/api/ncm-scan/pending", async (req, res) => {
    if (!isInternalRequest(req) && !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const pending = await storage.getPendingNCMs();
      res.json({ ncms: pending, total: pending.length });
    } catch (error) {
      console.error("Error fetching pending NCMs:", error);
      res.status(500).json({ message: "Failed to fetch pending NCMs" });
    }
  });

  // POST /api/ncm-scan/save — receives scraped tribute data from Python scraper
  app.post("/api/ncm-scan/save", async (req, res) => {
    if (!isInternalRequest(req)) {
      return res.status(401).json({ message: "Unauthorized — internal endpoint" });
    }
    try {
      const { ncmCode, status, regras, matchedNcm } = req.body as {
        ncmCode: string;
        status: "FOUND" | "NOT_FOUND" | "PARTIAL";
        regras: { regime: string; pis: number; cofins: number; dispositivoLegal: string }[];
        matchedNcm?: string;
      };

      if (!ncmCode || !status) {
        return res.status(400).json({ message: "ncmCode and status are required" });
      }

      const result = await storage.saveNCMTributeData(
        ncmCode,
        status,
        regras ?? [],
        matchedNcm,
      );

      console.log(`[ncm-scan] ${ncmCode} → ${status} | ${result.saved} tribute records saved`);
      res.json({ success: true, ncmCode, status, saved: result.saved });
    } catch (error) {
      console.error("Error saving NCM tribute data:", error);
      res.status(500).json({ message: "Failed to save tribute data" });
    }
  });

  // POST /api/ncm-scan/trigger — triggers the econet_scraper.py process
  // mode: "incompletos" (default) | "todos" | "selecionados" (when ncms[] provided)
  app.post("/api/ncm-scan/trigger", isAuthenticated, async (req: any, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(503).json({ message: 'Não disponível em produção' });
    try {
      const { mode, ncms } = req.body as { mode?: "incompletos" | "todos" | "selecionados"; ncms?: string[] };

      // Build scraper args
      let args: string[];
      if (ncms && ncms.length > 0) {
        args = ["econet_scraper.py", "--ncms", ncms.join(",")];
      } else {
        args = ["econet_scraper.py", ...(mode === "todos" ? ["--todos"] : [])];
      }

      const logDir = path.resolve(".data");
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      const logFd = fs.openSync(path.join(logDir, "scraper.log"), "a");

      // Snapshot before scan (for change detection)
      let snapshot: Record<string, string>[] = [];
      try { snapshot = await readNCMsFromExcel(); } catch {}

      const child = spawn(PYTHON, args, {
        cwd: path.resolve("."),
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });

      child.on("close", async (code) => {
        try { fs.closeSync(logFd); } catch {}
        setActivePid(null);
        console.log(`[ncm-scan] scraper exited (code: ${code})`);
        if (snapshot.length > 0) {
          try {
            const after = await readNCMsFromExcel();
            await detectAndSaveChanges(snapshot, after);
          } catch (err) {
            console.error("[ncm-scan] Erro ao detectar mudanças:", err);
          }
        }
      });

      child.unref();
      if (child.pid) setActivePid(child.pid);

      const modeLabel = ncms?.length ? `selecionados (${ncms.length})` : mode ?? "incompletos";
      console.log(`[ncm-scan] econet_scraper triggered (pid: ${child.pid}) — mode: ${modeLabel} — log: .data/scraper.log`);
      const { id: tUserId, name: tUserName } = getUserInfo(req);
      const scanAction = ncms?.length ? "SCAN_TRIGGERED_SELECIONADOS"
        : mode === "todos" ? "SCAN_TRIGGERED_TODOS"
        : "SCAN_TRIGGERED_INCOMPLETOS";
      logAudit(tUserId, tUserName, scanAction, "scan", {
        mode: modeLabel,
        ncms: ncms ?? null,
        pid: child.pid,
      });
      res.json({
        success: true,
        message: ncms?.length
          ? `Varredura de ${ncms.length} NCM(s) selecionado(s) iniciada`
          : mode === "todos" ? "Varredura completa iniciada" : "Varredura de NCMs incompletos iniciada",
        pid: child.pid,
      });
    } catch (error) {
      console.error("Error triggering scan:", error);
      res.status(500).json({ message: "Failed to trigger NCM scan" });
    }
  });

  // GET /api/ncm-scan/status — checks if the scraper process is still running
  app.get("/api/ncm-scan/status", isAuthenticated, (_req, res) => {
    const pid = getActivePid();
    if (pid === null) {
      return res.json({ running: false });
    }
    try {
      process.kill(pid, 0); // throws if process doesn't exist
      res.json({ running: true, pid });
    } catch {
      setActivePid(null);
      res.json({ running: false });
    }
  });

  // POST /api/ncm-scan/cancel — kills the running scraper process
  app.post("/api/ncm-scan/cancel", isAuthenticated, async (req: any, res) => {
    const pid = getActivePid();
    if (!pid) return res.json({ cancelled: false, message: "Nenhuma varredura em andamento" });
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // process may have already exited — that's fine
    }
    setActivePid(null);
    const { id: cUserId, name: cUserName } = getUserInfo(req);
    logAudit(cUserId, cUserName, "SCAN_CANCELLED", "scan", { pid });
    res.json({ cancelled: true });
  });

  // GET /api/ncm-scan/last — info da última varredura + mudanças detectadas
  app.get("/api/ncm-scan/last", isAuthenticated, async (_req, res) => {
    try {
      const lastLog = await rawGet(
        `SELECT * FROM audit_logs
         WHERE action IN (
           'SCAN_TRIGGERED_TODOS','SCAN_TRIGGERED_INCOMPLETOS',
           'SCAN_TRIGGERED_SELECIONADOS','SCAN_AUTO_TRIGGERED','SCAN_APPROVED_YURI'
         )
         ORDER BY created_at DESC LIMIT 1`
      ) as any;

      if (!lastLog) return res.json(null);

      // Pega somente mudanças criadas depois do disparo desta varredura.
      const latestBatch = await rawGet(
        `SELECT scan_date
         FROM ncm_changes
         WHERE datetime(scan_date) >= datetime(?)
         ORDER BY scan_date DESC
         LIMIT 1`,
        [lastLog.created_at]
      ) as any;

      let changes: any[] = [];
      if (latestBatch?.scan_date) {
        changes = await rawAll(
          "SELECT * FROM ncm_changes WHERE scan_date = ? ORDER BY ncm ASC",
          [latestBatch.scan_date]
        ) as any[];
      }

      res.json({
        triggeredAt: lastLog.created_at,
        triggeredBy: lastLog.user_name,
        action: lastLog.action,
        details: lastLog.details ? JSON.parse(lastLog.details) : null,
        changesDate: latestBatch?.scan_date ?? null,
        changes: changes.map((c: any) => ({
          ncm: c.ncm, field: c.field,
          oldValue: c.old_value, newValue: c.new_value,
          status: c.status,
        })),
      });
    } catch (error) {
      console.error("Error fetching last scan:", error);
      res.status(500).json({ message: "Erro ao buscar última varredura" });
    }
  });

  // GET /api/ncm-scan/history — last N scan events from audit_logs (all users)
  app.get("/api/ncm-scan/history", isAuthenticated, async (_req, res) => {
    try {
      const rows = await rawAll(
        `SELECT * FROM audit_logs
         WHERE action IN (
           'SCAN_TRIGGERED_TODOS','SCAN_TRIGGERED_INCOMPLETOS',
           'SCAN_TRIGGERED_SELECIONADOS','SCAN_AUTO_TRIGGERED','SCAN_APPROVED_YURI',
           'SCAN_CANCELLED'
         )
         ORDER BY created_at DESC LIMIT 50`
      ) as any[];
      res.json(rows.map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        triggeredBy: r.user_name,
        action: r.action,
        details: r.details ? JSON.parse(r.details) : null,
      })));
    } catch (error) {
      console.error("Error fetching scan history:", error);
      res.status(500).json({ message: "Erro ao buscar histórico de varreduras" });
    }
  });

  // GET /api/ncm-origin?ncm=XXXXXXXX — first insertion metadata for a given NCM code
  app.get("/api/ncm-origin", isAuthenticated, async (req, res) => {
    const ncm = (req.query.ncm as string ?? "").trim();
    if (!ncm) return res.status(400).json({ message: "Parâmetro ncm obrigatório" });
    try {
      const row = await rawGet(
        `SELECT
           ni.created_at   AS insertedAt,
           u.filename      AS filename,
           u.uploaded_at   AS uploadedAt,
           u.file_type     AS fileType,
           usr.first_name  AS firstName,
           usr.last_name   AS lastName,
           usr.email       AS email
         FROM ncm_items ni
         JOIN uploads u   ON ni.upload_id = u.id
         LEFT JOIN users usr ON u.user_id = usr.id
         WHERE ni.ncm_code = ?
         ORDER BY ni.created_at ASC
         LIMIT 1`,
        [ncm]
      ) as any;
      if (!row) return res.json(null);
      const uploaderName = row.firstName
        ? `${row.firstName} ${row.lastName ?? ""}`.trim()
        : (row.email ?? null);
      res.json({
        insertedAt: row.insertedAt,
        filename: row.filename,
        fileType: row.fileType,
        uploadedAt: row.uploadedAt,
        uploaderName,
      });
    } catch (error) {
      console.error("Error fetching NCM origin:", error);
      res.status(500).json({ message: "Erro ao buscar origem do NCM" });
    }
  });

  // GET /api/ncm-scan/logs — tail of scraper.log
  app.get("/api/ncm-scan/logs", isAuthenticated, (_req, res) => {
    const logPath = path.resolve(".data/scraper.log");
    if (!fs.existsSync(logPath)) return res.json({ log: "(nenhum log disponível ainda)" });
    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.split("\n");
    res.json({ log: lines.slice(-200).join("\n") });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // User management endpoints (admin only)
  app.get("/api/users", isAdmin, async (_req, res) => {
    try {
      const rows = await rawAll(
        "SELECT id, first_name, last_name, email, role, created_at, updated_at FROM users ORDER BY created_at ASC"
      ) as any[];
      res.json(rows.map(u => ({
        id: u.id, firstName: u.first_name, lastName: u.last_name,
        email: u.email, role: u.role, createdAt: u.created_at, updatedAt: u.updated_at,
      })));
    } catch (error) {
      res.status(500).json({ message: "Erro ao listar usuários" });
    }
  });

  app.post("/api/users", isAdmin, async (req: any, res) => {
    try {
      const { firstName, lastName, email, role, password } = req.body;
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: "Todos os campos são obrigatórios" });
      }
      // id is auto-generated — derive a short slug from email prefix, falling back to UUID
      const rawId = email
        ? email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "")
        : null;
      const baseId = rawId || randomUUID().slice(0, 8);
      // Ensure uniqueness: append numeric suffix if needed
      let id = baseId;
      let suffix = 2;
      while (await rawGet("SELECT id FROM users WHERE id = ?", [id])) {
        id = `${baseId}${suffix++}`;
      }
      const bcrypt = (await import("bcryptjs")).default;
      const hash = await bcrypt.hash(password, 10);
      await rawRun(
        "INSERT INTO users (id, first_name, last_name, email, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
        [id, firstName, lastName ?? "", email ?? "", role ?? "USER", hash]
      );
      const { id: cuUserId, name: cuUserName } = getUserInfo(req);
      logAudit(cuUserId, cuUserName, "USER_CREATED", "user", {
        targetId: id.toLowerCase(),
        targetName: `${firstName} ${lastName ?? ""}`.trim(),
        email: email ?? "",
        role: role ?? "USER",
      });
      res.status(201).json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao criar usuário" });
    }
  });

  app.put("/api/users/:id", isAdmin, async (req: any, res) => {
    try {
      const { firstName, lastName, email, role, password } = req.body;
      const bcrypt = (await import("bcryptjs")).default;
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        await rawRun(
          "UPDATE users SET first_name=?, last_name=?, email=?, role=?, password_hash=?, updated_at=datetime('now') WHERE id=?",
          [firstName, lastName ?? "", email ?? "", role ?? "USER", hash, req.params.id]
        );
      } else {
        await rawRun(
          "UPDATE users SET first_name=?, last_name=?, email=?, role=?, updated_at=datetime('now') WHERE id=?",
          [firstName, lastName ?? "", email ?? "", role ?? "USER", req.params.id]
        );
      }
      const { id: euUserId, name: euUserName } = getUserInfo(req);
      logAudit(euUserId, euUserName, "USER_UPDATED", "user", {
        targetId: req.params.id,
        targetName: `${firstName} ${lastName ?? ""}`.trim(),
        email: email ?? "",
        role: role ?? "USER",
        passwordChanged: !!password,
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar usuário" });
    }
  });

  app.delete("/api/users/:id", isAdmin, async (req: any, res) => {
    try {
      if (req.params.id === (req.user as any).id) return res.status(400).json({ message: "Você não pode excluir sua própria conta" });
      const targetUser = await rawGet(
        "SELECT first_name, last_name, email, role FROM users WHERE id = ?",
        [req.params.id]
      ) as any;
      await rawRun("DELETE FROM users WHERE id = ?", [req.params.id]);
      const { id: duUserId, name: duUserName } = getUserInfo(req);
      logAudit(duUserId, duUserName, "USER_DELETED", "user", {
        targetId: req.params.id,
        targetName: targetUser ? `${targetUser.first_name} ${targetUser.last_name ?? ""}`.trim() : req.params.id,
        email: targetUser?.email ?? "",
        role: targetUser?.role ?? "",
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao excluir usuário" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Schedule endpoints
  app.get("/api/ncm-scan/schedule", isAuthenticated, async (_req, res) => {
    try {
      const rows = await db.select().from(scanSchedule).where(eq(scanSchedule.id, 1));
      if (rows.length === 0) return res.json(null);
      const r = rows[0];
      res.json({
        enabled: !!r.enabled,
        frequency: r.frequency,
        dayOfWeek: r.dayOfWeek,
        dayOfMonth: r.dayOfMonth,
        hour: r.hour,
        minute: r.minute,
        mode: r.mode,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to read schedule" });
    }
  });

  app.post("/api/ncm-scan/schedule", isAuthenticated, async (req: any, res) => {
    try {
      const { enabled, frequency, dayOfWeek, dayOfMonth, hour, minute, mode } = req.body;
      const now = new Date();
      await db.insert(scanSchedule).values({
        id: 1, enabled: enabled ? 1 : 0, frequency, dayOfWeek, dayOfMonth, hour, minute, mode, updatedAt: now,
      }).onConflictDoUpdate({
        target: scanSchedule.id,
        set: { enabled: enabled ? 1 : 0, frequency, dayOfWeek, dayOfMonth, hour, minute, mode, updatedAt: now },
      });
      const rows = await db.select().from(scanSchedule).where(eq(scanSchedule.id, 1));
      if (enabled) applySchedule(rows[0]);
      else cancelSchedule();
      const { id: schUserId, name: schUserName } = getUserInfo(req);
      logAudit(schUserId, schUserName, "SCHEDULE_CONFIGURED", "schedule", {
        enabled,
        frequency,
        dayOfWeek,
        dayOfMonth,
        hour,
        minute,
        mode,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving schedule:", error);
      res.status(500).json({ message: "Failed to save schedule" });
    }
  });

  app.get("/api/ncm-scan/schedule/history", isAuthenticated, async (_req, res) => {
    try {
      const rows = await rawAll(
        `SELECT id, created_at, user_name, action, details
         FROM audit_logs
         WHERE action IN ('SCHEDULE_CONFIGURED', 'SCHEDULE_CANCELLED')
         ORDER BY created_at DESC
         LIMIT 15`
      ) as any[];
      res.json(rows.map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        userName: r.user_name,
        action: r.action,
        details: r.details ? JSON.parse(r.details) : null,
      })));
    } catch (error) {
      console.error("Error fetching schedule history:", error);
      res.status(500).json({ message: "Erro ao buscar histórico de agendamentos" });
    }
  });

  app.delete("/api/ncm-scan/schedule", isAuthenticated, async (req: any, res) => {
    try {
      await db.insert(scanSchedule).values({
        id: 1, enabled: 0, frequency: "weekly", dayOfWeek: 1, dayOfMonth: 1, hour: 8, minute: 0, mode: "incompletos", updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: scanSchedule.id,
        set: { enabled: 0, updatedAt: new Date() },
      });
      cancelSchedule();
      const { id: cschUserId, name: cschUserName } = getUserInfo(req);
      logAudit(cschUserId, cschUserName, "SCHEDULE_CANCELLED", "schedule", {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel schedule" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Scan Request endpoints (workflow de aprovação)

  // POST /api/scan-requests — cria pedido (qualquer usuário autenticado)
  app.post("/api/scan-requests", isAuthenticated, async (req: any, res) => {
    try {
      const { mode, ncms } = req.body as { mode?: string; ncms?: string[] };
      const isSeletivo = Array.isArray(ncms) && ncms.length > 0;
      if (!isSeletivo && (!mode || !["incompletos", "todos"].includes(mode))) {
        return res.status(400).json({ message: "mode deve ser 'incompletos', 'todos' ou fornecer ncms[]" });
      }
      const effectiveMode = isSeletivo ? "selecionados" : mode!;
      const userId = (req.user as any).id;
      const active = await rawGet(
        "SELECT id FROM scan_requests WHERE requested_by = ? AND status IN ('pending_thayssa','pending_yuri')",
        [userId]
      );
      if (active) { return res.status(409).json({ message: "Você já tem uma solicitação ativa." }); }
      const now = new Date().toISOString();
      const ncmsJson = isSeletivo ? JSON.stringify(ncms) : null;
      const result = await rawRun(
        "INSERT INTO scan_requests (requested_by, mode, ncms, status, created_at, updated_at) VALUES (?, ?, ?, 'pending_thayssa', ?, ?)",
        [userId, effectiveMode, ncmsJson, now, now]
      );
      const { id: srUserId, name: srUserName } = getUserInfo(req);
      logAudit(srUserId, srUserName, "SCAN_REQUESTED", "scan", {
        mode: effectiveMode,
        ncms: isSeletivo ? ncms : null,
        requestId: result.lastInsertRowid,
      });
      res.status(201).json({ id: result.lastInsertRowid, status: "pending_thayssa" });
    } catch (error) {
      console.error("Error creating scan request:", error);
      res.status(500).json({ message: "Erro ao criar solicitação" });
    }
  });

  // GET /api/scan-requests/mine — pedido mais recente do usuário logado
  app.get("/api/scan-requests/mine", isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const row = await rawGet(
        "SELECT * FROM scan_requests WHERE requested_by = ? ORDER BY created_at DESC LIMIT 1",
        [userId]
      ) as any;
      if (!row) return res.json(null);
      res.json({
        id: row.id, requestedBy: row.requested_by, mode: row.mode,
        ncms: row.ncms ? JSON.parse(row.ncms) : null,
        status: row.status,
        rejectedBy: row.rejected_by, rejectionNote: row.rejection_note,
        createdAt: row.created_at, updatedAt: row.updated_at,
      });
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar solicitação" });
    }
  });

  // GET /api/scan-requests/pending — pedidos pendentes para o admin logado
  app.get("/api/scan-requests/pending", isAdmin, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      let statusFilter: string;
      if (userId === "thayssa") statusFilter = "pending_thayssa";
      else if (userId === "yuri") statusFilter = "pending_yuri";
      else return res.json([]);
      const rows = await rawAll(
        `SELECT sr.*, u.first_name, u.last_name FROM scan_requests sr
         LEFT JOIN users u ON sr.requested_by = u.id
         WHERE sr.status = ? ORDER BY sr.created_at ASC`,
        [statusFilter]
      ) as any[];
      res.json(rows.map(r => ({
        id: r.id,
        requestedBy: r.requested_by,
        requestedByName: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.requested_by,
        mode: r.mode,
        ncms: r.ncms ? JSON.parse(r.ncms) : null,
        status: r.status,
        createdAt: r.created_at,
      })));
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar solicitações pendentes" });
    }
  });

  // POST /api/scan-requests/:id/approve — aprovar (thayssa ou yuri dependendo do status)
  app.post("/api/scan-requests/:id/approve", isAdmin, async (req: any, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(503).json({ message: 'Não disponível em produção' });
    try {
      const userId = (req.user as any).id;
      const requestId = req.params.id;
      const row = await rawGet("SELECT * FROM scan_requests WHERE id = ?", [requestId]) as any;
      if (!row) { return res.status(404).json({ message: "Solicitação não encontrada" }); }
      const now = new Date().toISOString();
      if (row.status === "pending_thayssa") {
        if (userId !== "thayssa") { return res.status(403).json({ message: "Somente a Thayssa pode aprovar nesta etapa" }); }
        await rawRun("UPDATE scan_requests SET status='pending_yuri', updated_at=? WHERE id=?", [now, requestId]);
        const { id: apUserId, name: apUserName } = getUserInfo(req);
        logAudit(apUserId, apUserName, "SCAN_APPROVED_THAYSSA", "scan", {
          requestId,
          requestedBy: row.requested_by,
          mode: row.mode,
          nextStep: "Aguardando aprovação do Yuri",
        });
        return res.json({ success: true, newStatus: "pending_yuri" });
      }
      if (row.status === "pending_yuri") {
        if (userId !== "yuri") { return res.status(403).json({ message: "Somente o Yuri pode aprovar nesta etapa" }); }
        const activePid = getActivePid();
        if (activePid !== null) {
          try { process.kill(activePid, 0); return res.status(409).json({ message: "Já há uma varredura em andamento. Tente novamente em instantes." }); }
          catch { setActivePid(null); }
        }
        await rawRun("UPDATE scan_requests SET status='approved', updated_at=? WHERE id=?", [now, requestId]);
        let args: string[];
        if (row.ncms) {
          const ncmList: string[] = JSON.parse(row.ncms);
          args = ["econet_scraper.py", "--ncms", ncmList.join(",")];
        } else {
          args = ["econet_scraper.py", ...(row.mode === "todos" ? ["--todos"] : [])];
        }
        const logDir2 = path.resolve(".data");
        if (!fs.existsSync(logDir2)) fs.mkdirSync(logDir2, { recursive: true });
        const logFd2 = fs.openSync(path.join(logDir2, "scraper.log"), "a");
        const child = spawn(PYTHON, args, {
          cwd: path.resolve("."), env: { ...process.env, PYTHONUNBUFFERED: "1" }, detached: true, stdio: ["ignore", logFd2, logFd2],
        });
        child.on("close", (code) => { try { fs.closeSync(logFd2); } catch {} console.log(`[scan-requests] scraper exited (code: ${code})`); });
        child.unref();
        if (child.pid) setActivePid(child.pid);
        console.log(`[scan-requests] Yuri aprovou — scan iniciado (pid: ${child.pid}) mode: ${row.mode} — log: .data/scraper.log`);
        const { id: ap2UserId, name: ap2UserName } = getUserInfo(req);
        logAudit(ap2UserId, ap2UserName, "SCAN_APPROVED_YURI", "scan", {
          requestId,
          requestedBy: row.requested_by,
          mode: row.mode,
          pid: child.pid,
        });
        return res.json({ success: true, newStatus: "approved", pid: child.pid });
      }
      return res.status(400).json({ message: "Solicitação não está em estado aprovável" });
    } catch (error) {
      console.error("Error approving scan request:", error);
      res.status(500).json({ message: "Erro ao aprovar solicitação" });
    }
  });

  // POST /api/scan-requests/:id/reject — rejeitar
  app.post("/api/scan-requests/:id/reject", isAdmin, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const requestId = req.params.id;
      const { note } = req.body as { note?: string };
      const row = await rawGet("SELECT * FROM scan_requests WHERE id = ?", [requestId]) as any;
      if (!row) { return res.status(404).json({ message: "Solicitação não encontrada" }); }
      if (row.status === "pending_thayssa" && userId !== "thayssa") { return res.status(403).json({ message: "Somente a Thayssa pode rejeitar nesta etapa" }); }
      if (row.status === "pending_yuri" && userId !== "yuri") { return res.status(403).json({ message: "Somente o Yuri pode rejeitar nesta etapa" }); }
      if (!["pending_thayssa", "pending_yuri"].includes(row.status)) { return res.status(400).json({ message: "Solicitação não está em estado rejeitável" }); }
      const now = new Date().toISOString();
      await rawRun(
        "UPDATE scan_requests SET status='rejected', rejected_by=?, rejection_note=?, updated_at=? WHERE id=?",
        [userId, note ?? null, now, requestId]
      );
      const { id: rjUserId, name: rjUserName } = getUserInfo(req);
      logAudit(rjUserId, rjUserName, "SCAN_REJECTED", "scan", {
        requestId,
        requestedBy: row.requested_by,
        mode: row.mode,
        note: note ?? null,
      });
      res.json({ success: true, newStatus: "rejected" });
    } catch (error) {
      console.error("Error rejecting scan request:", error);
      res.status(500).json({ message: "Erro ao rejeitar solicitação" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NCM Changes endpoints (detecção de mudanças pela varredura agendada)

  // GET /api/ncm-changes?status=pending|accepted|rejected|all[&ncm=<code>]
  app.get("/api/ncm-changes", isAuthenticated, async (req, res) => {
    try {
      const status = (req.query.status as string) || "pending";
      const ncmFilter = (req.query.ncm as string) || null;

      let rows: any[];
      if (ncmFilter) {
        rows = status === "all"
          ? await rawAll("SELECT * FROM ncm_changes WHERE ncm = ? ORDER BY scan_date DESC", [ncmFilter]) as any[]
          : await rawAll("SELECT * FROM ncm_changes WHERE ncm = ? AND status = ? ORDER BY scan_date DESC", [ncmFilter, status]) as any[];
      } else {
        rows = status === "all"
          ? await rawAll("SELECT * FROM ncm_changes ORDER BY scan_date DESC") as any[]
          : await rawAll("SELECT * FROM ncm_changes WHERE status = ? ORDER BY scan_date DESC", [status]) as any[];
      }

      res.json(rows.map(r => ({
        id: r.id, ncm: r.ncm, field: r.field,
        oldValue: r.old_value, newValue: r.new_value,
        status: r.status, scanDate: r.scan_date, resolvedAt: r.resolved_at,
      })));
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar mudanças" });
    }
  });

  // POST /api/ncm-changes/accept-all — aceita todas as pendentes
  app.post("/api/ncm-changes/accept-all", isAdmin, async (req: any, res) => {
    try {
      const now = new Date().toISOString();
      const result = await rawRun(
        "UPDATE ncm_changes SET status='accepted', resolved_at=? WHERE status='pending'",
        [now]
      );
      const { id: aaUserId, name: aaUserName } = getUserInfo(req);
      logAudit(aaUserId, aaUserName, "NCM_CHANGES_ACCEPTED_ALL", "ncm_change", {
        count: result.changes,
      });
      res.json({ success: true, updated: result.changes });
    } catch (error) {
      res.status(500).json({ message: "Erro ao aceitar mudanças" });
    }
  });

  // POST /api/ncm-changes/:id/accept
  app.post("/api/ncm-changes/:id/accept", isAdmin, async (req: any, res) => {
    try {
      const now = new Date().toISOString();
      const row = await rawGet("SELECT * FROM ncm_changes WHERE id = ?", [req.params.id]) as any;
      if (!row) { return res.status(404).json({ message: "Mudança não encontrada" }); }
      await rawRun("UPDATE ncm_changes SET status='accepted', resolved_at=? WHERE id=?", [now, req.params.id]);
      const { id: acUserId, name: acUserName } = getUserInfo(req);
      logAudit(acUserId, acUserName, "NCM_CHANGE_ACCEPTED", "ncm_change", {
        changeId: req.params.id,
        ncm: row.ncm,
        field: row.field,
        oldValue: row.old_value,
        newValue: row.new_value,
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao aceitar mudança" });
    }
  });

  // POST /api/ncm-changes/:id/reject — rejeita e restaura valor antigo no Excel
  app.post("/api/ncm-changes/:id/reject", isAdmin, async (req: any, res) => {
    try {
      const now = new Date().toISOString();
      const row = await rawGet("SELECT * FROM ncm_changes WHERE id = ?", [req.params.id]) as any;
      if (!row) { return res.status(404).json({ message: "Mudança não encontrada" }); }

      // Restore old value in Excel
      await execFileAsync(PYTHON, ["excel_helper.py", "restore", row.ncm, row.field, row.old_value ?? ""], { cwd: path.resolve(".") });

      await rawRun("UPDATE ncm_changes SET status='rejected', resolved_at=? WHERE id=?", [now, req.params.id]);
      const { id: rjcUserId, name: rjcUserName } = getUserInfo(req);
      logAudit(rjcUserId, rjcUserName, "NCM_CHANGE_REJECTED", "ncm_change", {
        changeId: req.params.id,
        ncm: row.ncm,
        field: row.field,
        oldValue: row.old_value,
        newValue: row.new_value,
        restoredToOldValue: true,
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Erro ao rejeitar mudança:", error);
      res.status(500).json({ message: "Erro ao restaurar valor no Excel: " + (error?.message ?? error) });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Excel NCM data endpoint
  app.get("/api/ncm-excel", isAuthenticated, async (_req, res) => {
    try {
      const rows = await readNCMsFromExcel();
      res.json([...rows].reverse()); // mais recentes primeiro
    } catch (error) {
      console.error("Error reading Excel:", error);
      res.status(500).json({ message: "Failed to read Excel file" });
    }
  });

  // Excel NCM data — todas as colunas (para modal de detalhe)
  app.get("/api/ncm-excel-full", isAuthenticated, async (_req, res) => {
    try {
      const rows = await readNCMsFromExcelFull();
      res.json(rows);
    } catch (error) {
      console.error("Error reading Excel (full):", error);
      res.status(500).json({ message: "Failed to read Excel file" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Audit logs endpoint (admin only)

  app.get("/api/audit-logs", isAdmin, async (req, res) => {
    try {
      const category = (req.query.category as string) || "all";
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      let rows: any[];
      let total: any;
      if (category === "all") {
        rows = await rawAll(
          "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
          [limit, offset]
        ) as any[];
        total = await rawGet("SELECT COUNT(*) AS n FROM audit_logs") as any;
      } else {
        rows = await rawAll(
          "SELECT * FROM audit_logs WHERE category = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
          [category, limit, offset]
        ) as any[];
        total = await rawGet("SELECT COUNT(*) AS n FROM audit_logs WHERE category = ?", [category]) as any;
      }

      res.json({
        logs: rows.map(r => ({
          id: r.id,
          createdAt: r.created_at,
          userId: r.user_id,
          userName: r.user_name,
          action: r.action,
          category: r.category,
          details: r.details ? JSON.parse(r.details) : null,
        })),
        total: Number(total?.n ?? 0),
      });
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Erro ao buscar logs" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────

  const httpServer = createServer(app);
  return httpServer;
}

// Async file processing function — writes extracted NCMs to bcoDados.xlsx
async function processFileAsync(uploadId: string, fileContent: string, fileType: 'SPED' | 'XML' | 'CSV' | 'TXT_NCM', userId = "system", userName = "Sistema") {
  try {
    console.log(`[processFile] Starting: uploadId=${uploadId}, type=${fileType}, contentLength=${fileContent.length}`);

    await storage.updateUploadStatus(uploadId, 'PROCESSING');
    console.log(`[processFile] Status → PROCESSING`);

    const processedItems = await FileProcessor.processFile(fileContent, fileType);
    console.log(`[processFile] Parsed ${processedItems.length} NCM items from file`);

    const ncmCodes = processedItems.map(item => item.ncmCode);
    const result = await addNCMsToExcel(ncmCodes);
    console.log(`[processFile] Excel updated — added: ${result.added.join(", ") || "none (all already present)"}`);

    // Todos os tipos salvam em ncm_items para manter o count correto no dashboard.
    for (const item of processedItems) {
      await storage.createNCMItem({
        ncmCode: item.ncmCode,
        description: item.description ?? null,
        productName: item.productName ?? null,
        uploadId,
      });
    }
    console.log(`[processFile] Saved ${processedItems.length} NCM items to database`);

    await storage.updateUploadStatus(uploadId, 'COMPLETED');
    console.log(`[processFile] Done: uploadId=${uploadId} → COMPLETED`);

    // Log upload processado com NCMs extraídos
    logAudit(userId, userName, "UPLOAD_PROCESSED", "upload", {
      uploadId,
      fileType,
      totalNcms: ncmCodes.length,
      newNcms: result.added,
      alreadyPresent: ncmCodes.filter((c: string) => !result.added.includes(c)),
    });

    // Auto-trigger: se novos NCMs foram adicionados ao Excel, dispara varredura automática
    if (result.added.length > 0) {
      const activePid = getActivePid();
      if (activePid !== null) {
        try { process.kill(activePid, 0); console.log(`[processFile] Scraper já está rodando (pid: ${activePid}) — auto-trigger ignorado`); }
        catch { setActivePid(null); }
      }
      if (getActivePid() === null) {
        console.log(`[processFile] ${result.added.length} NCM(s) novo(s) adicionado(s) — disparando varredura automática (incompletos)...`);
        try {
          const logDir = path.resolve(".data");
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          const logFd = fs.openSync(path.join(logDir, "scraper.log"), "a");

          const child = spawn(PYTHON, ["econet_scraper.py"], {
            cwd: path.resolve("."),
            env: { ...process.env, PYTHONUNBUFFERED: "1" },
            detached: true,
            stdio: ["ignore", logFd, logFd],
          });

          child.on("close", async (code) => {
            try { fs.closeSync(logFd); } catch {}
            setActivePid(null);
            console.log(`[processFile] Auto-scraper finalizado (code: ${code})`);
          });

          child.unref();
          if (child.pid) setActivePid(child.pid);
          console.log(`[processFile] Auto-scraper iniciado (pid: ${child.pid})`);
          logAudit(userId, userName, "SCAN_AUTO_TRIGGERED", "scan", {
            uploadId,
            newNcms: result.added,
            pid: child.pid,
          });
        } catch (spawnErr) {
          console.error("[processFile] Erro ao iniciar auto-scraper:", spawnErr);
        }
      }
    } else {
      console.log(`[processFile] Nenhum NCM novo adicionado — varredura automática não necessária`);
    }
  } catch (error) {
    console.error(`[processFile] ERROR on uploadId=${uploadId}:`, error);
    try {
      await storage.updateUploadStatus(uploadId, 'ERROR', error instanceof Error ? error.message : 'Unknown error');
    } catch (updateError) {
      console.error(`[processFile] Failed to update status to ERROR:`, updateError);
    }
  }
}
