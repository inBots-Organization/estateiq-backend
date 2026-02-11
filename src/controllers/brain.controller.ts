import { injectable, inject } from 'tsyringe';
import { Router, Request, Response, NextFunction } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { BrainService } from '../services/brain/brain.service';
import { getSupportedMimeTypes } from '../utils/document-parser';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Multer config for brain document uploads
const uploadConfig = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
    files: 1,
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedTypes = getSupportedMimeTypes();
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}. Accepted: PDF, DOCX, TXT`));
    }
  },
});

const upload = uploadConfig.single('file');

@injectable()
export class BrainController {
  public router: Router;

  constructor(
    @inject(BrainService) private brainService: BrainService
  ) {
    this.router = Router();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Upload document — org_admin and saas_super_admin only
    this.router.post(
      '/documents',
      authMiddleware(['org_admin', 'saas_super_admin']),
      upload,
      this.uploadDocument.bind(this)
    );

    // List documents for org
    this.router.get(
      '/documents',
      authMiddleware(['org_admin', 'saas_super_admin', 'trainer']),
      this.listDocuments.bind(this)
    );

    // Delete document
    this.router.delete(
      '/documents/:documentId',
      authMiddleware(['org_admin', 'saas_super_admin']),
      this.deleteDocument.bind(this)
    );

    // Query brain (RAG retrieval) — accessible by all authenticated roles
    this.router.post(
      '/query',
      authMiddleware(['trainee', 'trainer', 'org_admin', 'saas_super_admin']),
      this.queryBrain.bind(this)
    );

    // Get document processing status
    this.router.get(
      '/documents/:documentId/status',
      authMiddleware(['org_admin', 'saas_super_admin']),
      this.getDocumentStatus.bind(this)
    );
  }

  private async uploadDocument(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Send a file with field name "file".' });
        return;
      }

      const organizationId = await this.getOrganizationId(req);
      if (!organizationId) {
        res.status(400).json({ error: 'Organization context required.' });
        return;
      }

      // Parse optional metadata from form fields
      const contentLevel = req.body.contentLevel || 'general';
      const targetPersona = req.body.targetPersona || null;
      let tags: string[] = [];
      if (req.body.tags) {
        try {
          tags = JSON.parse(req.body.tags);
        } catch {
          tags = [];
        }
      }

      const result = await this.brainService.uploadDocument({
        file: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        organizationId,
        uploadedBy: req.user!.userId,
        contentLevel,
        targetPersona,
        tags,
      });

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('Unsupported file type') ||
        error.message.includes('File too large') ||
        error.message.includes('Document limit') ||
        error.message.includes('already exists')
      )) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async listDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = await this.getOrganizationId(req);
      if (!organizationId) {
        res.status(400).json({ error: 'Organization context required.' });
        return;
      }

      const result = await this.brainService.listDocuments({
        organizationId,
        includeSystemDefaults: req.query.includeDefaults !== 'false',
        status: req.query.status as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = await this.getOrganizationId(req);
      if (!organizationId) {
        res.status(400).json({ error: 'Organization context required.' });
        return;
      }

      const result = await this.brainService.deleteDocument({
        documentId: req.params.documentId,
        organizationId,
        userRole: req.user!.role,
      });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('not found') ||
        error.message.includes('permission')
      )) {
        res.status(error.message.includes('not found') ? 404 : 403).json({ error: error.message });
        return;
      }
      next(error);
    }
  }

  private async queryBrain(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = await this.getOrganizationId(req);
      if (!organizationId) {
        res.status(400).json({ error: 'Organization context required.' });
        return;
      }

      const { query, topK, scoreThreshold } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({ error: 'Query is required and must be a string.' });
        return;
      }

      const result = await this.brainService.queryBrain({
        query,
        organizationId,
        topK: topK ? parseInt(topK, 10) : undefined,
        scoreThreshold: scoreThreshold ? parseFloat(scoreThreshold) : undefined,
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  private async getDocumentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Direct repo access via service would be cleaner, but keeping it simple
      const result = await this.brainService.listDocuments({
        organizationId: await this.getOrganizationId(req) || '',
        includeSystemDefaults: true,
      });

      const doc = result.documents.find(d => d.id === req.params.documentId);
      if (!doc) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }

      res.status(200).json({
        id: doc.id,
        status: doc.status,
        chunkCount: doc.chunkCount,
        errorMessage: doc.errorMessage,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get organization ID from the authenticated user's context.
   * Super admins must pass orgId as query param when managing system-default docs.
   */
  private async getOrganizationId(req: Request): Promise<string | null> {
    // Super admin can target system-default org
    if (req.user!.role === 'saas_super_admin') {
      const targetOrg = req.query.orgId as string;
      if (targetOrg) return targetOrg;
      // For super admin queries without orgId, use system-default
      return 'system-default';
    }

    // For org_admin/trainer, get org from user record
    return req.user!.organizationId || null;
  }
}
