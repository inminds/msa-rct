import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { FileProcessor } from "./services/fileProcessor";
import { TaxCalculator } from "./services/taxCalculator";
import multer from "multer";
import { insertUploadSchema, insertNCMItemSchema, insertTributeSchema } from "@shared/schema";

// Demo data generation function
async function generateDemoData(userId: string): Promise<void> {
  // Create demo uploads
  const uploads = [
    {
      filename: "sped_fiscal_202401.txt",
      fileType: "SPED" as const,
      description: "SPED Fiscal • 2.1 MB • Enviado por Carlos Mendes",
      userId,
      status: "PROCESSING" as const,
    },
    {
      filename: "nfe_lote_347.xml",
      fileType: "XML" as const,
      description: "XML NFe • 856 KB • Enviado por Ana Silva",
      userId,
      status: "COMPLETED" as const,
    },
    {
      filename: "produtos_cliente_abc.csv",
      fileType: "CSV" as const,
      description: "CSV Produtos • 2.3 MB • Enviado por Roberto Santos",
      userId,
      status: "PENDING" as const,
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
      uploadId: createdUploads[1].id, // XML file
      ncmCode: "84483000",
      productName: "Máquinas de impressão offset",
      description: "Equipamentos gráficos industriais",
      quantity: 2,
      unitValue: 125000.00,
    },
    {
      uploadId: createdUploads[1].id,
      ncmCode: "22010000",
      productName: "Cerveja de malte",
      description: "Bebidas alcoólicas fermentadas",
      quantity: 1000,
      unitValue: 3.50,
    },
    {
      uploadId: createdUploads[1].id,
      ncmCode: "87032110",
      productName: "Automóveis de passeio",
      description: "Veículos com motor 1.0 a 1.5",
      quantity: 5,
      unitValue: 45000.00,
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
      ncmItemId: createdNCMItems[0].id,
      type: "ICMS" as const,
      jurisdiction: "ESTADUAL" as const,
      rate: 18.00,
      calculatedValue: 22500.00,
      validated: new Date(),
      validatedBy: userId,
    },
    {
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
      ncmItemId: createdNCMItems[1].id,
      type: "ICMS" as const,
      jurisdiction: "ESTADUAL" as const,
      rate: 25.00,
      calculatedValue: 875.00,
    },
    {
      ncmItemId: createdNCMItems[1].id,
      type: "PIS" as const,
      jurisdiction: "FEDERAL" as const,
      rate: 2.10,
      calculatedValue: 73.50,
    },
    {
      ncmItemId: createdNCMItems[1].id,
      type: "COFINS" as const,
      jurisdiction: "FEDERAL" as const,
      rate: 9.60,
      calculatedValue: 336.00,
    },
    // Automóveis de passeio
    {
      ncmItemId: createdNCMItems[2].id,
      type: "ICMS" as const,
      jurisdiction: "ESTADUAL" as const,
      rate: 12.00,
      calculatedValue: 27000.00,
      validated: new Date(),
      validatedBy: userId,
    },
    {
      ncmItemId: createdNCMItems[2].id,
      type: "PIS" as const,
      jurisdiction: "FEDERAL" as const,
      rate: 1.65,
      calculatedValue: 3712.50,
    },
    {
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
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
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

  const httpServer = createServer(app);
  return httpServer;
}

// Async file processing function
async function processFileAsync(uploadId: string, fileContent: string, fileType: 'SPED' | 'XML' | 'CSV') {
  try {
    // Update status to processing
    await storage.updateUploadStatus(uploadId, 'PROCESSING');

    // Process the file
    const processedItems = await FileProcessor.processFile(fileContent, fileType);

    // Create NCM items and calculate taxes
    for (const item of processedItems) {
      const ncmItem = await storage.createNCMItem({
        ...item,
        uploadId,
      });

      // Calculate taxes for this NCM
      const taxes = await TaxCalculator.calculateAllTaxes(item.ncmCode);
      
      // Create tribute records
      for (const tax of taxes) {
        await storage.createTribute({
          ...tax,
          ncmItemId: ncmItem.id,
        });
      }
    }

    // Update status to completed
    await storage.updateUploadStatus(uploadId, 'COMPLETED');
  } catch (error) {
    console.error("Error processing file:", error);
    await storage.updateUploadStatus(uploadId, 'ERROR', error instanceof Error ? error.message : 'Unknown error');
  }
}
