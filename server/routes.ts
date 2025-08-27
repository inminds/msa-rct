import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { FileProcessor } from "./services/fileProcessor";
import { TaxCalculator } from "./services/taxCalculator";
import multer from "multer";
import { insertUploadSchema, insertNCMItemSchema, insertTributeSchema } from "@shared/schema";

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

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Recent uploads
  app.get('/api/uploads/recent', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const uploads = await storage.getRecentUploads(limit);
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching recent uploads:", error);
      res.status(500).json({ message: "Failed to fetch recent uploads" });
    }
  });

  // Recent analyses
  app.get('/api/analyses/recent', isAuthenticated, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const analyses = await storage.getRecentAnalyses(limit);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching recent analyses:", error);
      res.status(500).json({ message: "Failed to fetch recent analyses" });
    }
  });

  // Tax distribution
  app.get('/api/dashboard/tax-distribution', isAuthenticated, async (req, res) => {
    try {
      const distribution = await storage.getTaxDistribution();
      res.json(distribution);
    } catch (error) {
      console.error("Error fetching tax distribution:", error);
      res.status(500).json({ message: "Failed to fetch tax distribution" });
    }
  });

  // Jurisdiction distribution
  app.get('/api/dashboard/jurisdiction-distribution', isAuthenticated, async (req, res) => {
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
