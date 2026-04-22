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
import { spawn } from "child_process";
import path from "path";
import { readNCMsFromExcel, addNCMsToExcel, PYTHON } from "./services/excelService";
import { applySchedule, cancelSchedule } from "./services/schedulerService";
import { setActivePid, getActivePid } from "./services/scanState";

const INTERNAL_API_KEY = process.env.NODE_API_KEY ?? "dev-internal-key";

function isInternalRequest(req: any): boolean {
  return req.headers["x-internal-key"] === INTERNAL_API_KEY;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user?.claims?.sub || 'demo-user';
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // All uploads (public for demo)
  app.get('/api/uploads', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const uploads = await storage.getRecentUploads(limit);
      res.json(uploads);
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

  // Recent analyses (public for demo)
  app.get('/api/analyses/recent', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const analyses = await storage.getRecentAnalyses(limit);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching recent analyses:", error);
      res.status(500).json({ message: "Failed to fetch recent analyses" });
    }
  });

  // Tax distribution (public for demo)
  app.get('/api/dashboard/tax-distribution', async (req, res) => {
    try {
      const distribution = await storage.getTaxDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching tax distribution:", error);
      res.status(500).json({ message: "Failed to fetch tax distribution" });
    }
  });

  // Jurisdiction distribution (public for demo)
  app.get('/api/dashboard/jurisdiction-distribution', async (req, res) => {
    try {
      const distribution = await storage.getJurisdictionDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching jurisdiction distribution:", error);
      res.status(500).json({ message: "Failed to fetch jurisdiction distribution" });
    }
  });

  // File upload
  app.post('/api/uploads', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      processFileAsync(upload.id, file.buffer.toString('utf-8'), fileType);

      res.json({ uploadId: upload.id, message: "File upload started" });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Get uploads for user
  app.get('/api/uploads', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
    if (isDev) {
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
      // Mock status for now - will integrate with actual RPA database
      const status = {
        service_status: "active",
        last_execution: new Date().toISOString(),
        portals_monitored: ["Econet", "Receita Federal do Brasil"],
        total_executions_today: 3,
        successful_executions_today: 2,
        changes_detected_today: 1,
        critical_changes_pending: 0,
        next_scheduled_execution: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // 6 hours
        system_health: "healthy"
      };

      res.json(status);
    } catch (error) {
      console.error("Error fetching RPA status:", error);
      res.status(500).json({
        service_status: "error",
        message: "Failed to fetch RPA status",
        system_health: "unhealthy"
      });
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
      const userId = req.user.claims.sub;

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
  // mode: "incompletos" (default) | "todos"
  app.post("/api/ncm-scan/trigger", isAuthenticated, async (req: any, res) => {
    try {
      const { mode } = req.body as { mode?: "incompletos" | "todos" };
      const args = ["econet_scraper.py", ...(mode === "todos" ? ["--todos"] : [])];

      const child = spawn(PYTHON, args, {
        cwd: path.resolve("."),
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        detached: true,
        stdio: "ignore",
      });

      child.unref();
      if (child.pid) setActivePid(child.pid);

      console.log(`[ncm-scan] econet_scraper triggered (pid: ${child.pid}) — mode: ${mode ?? "incompletos"}`);
      res.json({
        success: true,
        message: mode === "todos" ? "Varredura completa iniciada" : "Varredura de NCMs incompletos iniciada",
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

  // ─────────────────────────────────────────────────────────────────────────
  // User management endpoints (admin only)
  app.get("/api/users", isAdmin, async (_req, res) => {
    try {
      const Database = (await import("better-sqlite3")).default;
      const sqliteDb = new Database(".data/dev.db");
      const rows = sqliteDb.prepare(
        "SELECT id, first_name, last_name, email, role, created_at, updated_at FROM users ORDER BY created_at ASC"
      ).all() as any[];
      sqliteDb.close();
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
      const { id, firstName, lastName, email, role, password } = req.body;
      if (!id || !firstName || !password) return res.status(400).json({ message: "id, nome e senha são obrigatórios" });
      const bcrypt = (await import("bcryptjs")).default;
      const Database = (await import("better-sqlite3")).default;
      const sqliteDb = new Database(".data/dev.db");
      const existing = sqliteDb.prepare("SELECT id FROM users WHERE id = ?").get(id.toLowerCase());
      if (existing) { sqliteDb.close(); return res.status(409).json({ message: "Usuário já existe" }); }
      const hash = await bcrypt.hash(password, 10);
      sqliteDb.prepare(
        "INSERT INTO users (id, first_name, last_name, email, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
      ).run(id.toLowerCase(), firstName, lastName ?? "", email ?? "", role ?? "USER", hash);
      sqliteDb.close();
      res.status(201).json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao criar usuário" });
    }
  });

  app.put("/api/users/:id", isAdmin, async (req: any, res) => {
    try {
      const { firstName, lastName, email, role, password } = req.body;
      const bcrypt = (await import("bcryptjs")).default;
      const Database = (await import("better-sqlite3")).default;
      const sqliteDb = new Database(".data/dev.db");
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        sqliteDb.prepare(
          "UPDATE users SET first_name=?, last_name=?, email=?, role=?, password_hash=?, updated_at=datetime('now') WHERE id=?"
        ).run(firstName, lastName ?? "", email ?? "", role ?? "USER", hash, req.params.id);
      } else {
        sqliteDb.prepare(
          "UPDATE users SET first_name=?, last_name=?, email=?, role=?, updated_at=datetime('now') WHERE id=?"
        ).run(firstName, lastName ?? "", email ?? "", role ?? "USER", req.params.id);
      }
      sqliteDb.close();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar usuário" });
    }
  });

  app.delete("/api/users/:id", isAdmin, async (req: any, res) => {
    try {
      if (req.params.id === (req.user as any).id) return res.status(400).json({ message: "Você não pode excluir sua própria conta" });
      const Database = (await import("better-sqlite3")).default;
      const sqliteDb = new Database(".data/dev.db");
      sqliteDb.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
      sqliteDb.close();
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
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving schedule:", error);
      res.status(500).json({ message: "Failed to save schedule" });
    }
  });

  app.delete("/api/ncm-scan/schedule", isAuthenticated, async (_req, res) => {
    try {
      await db.insert(scanSchedule).values({
        id: 1, enabled: 0, frequency: "weekly", dayOfWeek: 1, dayOfMonth: 1, hour: 8, minute: 0, mode: "incompletos", updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: scanSchedule.id,
        set: { enabled: 0, updatedAt: new Date() },
      });
      cancelSchedule();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel schedule" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Excel NCM data endpoint
  app.get("/api/ncm-excel", isAuthenticated, async (_req, res) => {
    try {
      const rows = await readNCMsFromExcel();
      res.json(rows);
    } catch (error) {
      console.error("Error reading Excel:", error);
      res.status(500).json({ message: "Failed to read Excel file" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────

  const httpServer = createServer(app);
  return httpServer;
}

// Async file processing function — writes extracted NCMs to bcoDados.xlsx
async function processFileAsync(uploadId: string, fileContent: string, fileType: 'SPED' | 'XML' | 'CSV') {
  try {
    console.log(`[processFile] Starting: uploadId=${uploadId}, type=${fileType}, contentLength=${fileContent.length}`);

    await storage.updateUploadStatus(uploadId, 'PROCESSING');
    console.log(`[processFile] Status → PROCESSING`);

    const processedItems = await FileProcessor.processFile(fileContent, fileType);
    console.log(`[processFile] Parsed ${processedItems.length} NCM items from file`);

    const ncmCodes = processedItems.map(item => item.ncmCode);
    const result = await addNCMsToExcel(ncmCodes);
    console.log(`[processFile] Excel updated — added: ${result.added.join(", ") || "none (all already present"}`);

    await storage.updateUploadStatus(uploadId, 'COMPLETED');
    console.log(`[processFile] Done: uploadId=${uploadId} → COMPLETED`);
  } catch (error) {
    console.error(`[processFile] ERROR on uploadId=${uploadId}:`, error);
    try {
      await storage.updateUploadStatus(uploadId, 'ERROR', error instanceof Error ? error.message : 'Unknown error');
    } catch (updateError) {
      console.error(`[processFile] Failed to update status to ERROR:`, updateError);
    }
  }
}
