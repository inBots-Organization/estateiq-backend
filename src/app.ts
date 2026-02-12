import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { container } from 'tsyringe';

// Import controllers
import { SimulationController } from './controllers/simulation.controller';
import { TraineeController } from './controllers/trainee.controller';
import { ReportController } from './controllers/report.controller';
import { CourseController } from './controllers/course.controller';
import { AuthController } from './controllers/auth.controller';
import { ElevenLabsController } from './controllers/elevenlabs.controller';
import { VoiceController } from './controllers/voice.controller';
import { AITeacherController } from './controllers/ai-teacher.controller';
import { QuizController } from './controllers/quiz.controller';
import { FlashcardController } from './controllers/flashcard.controller';
import { DiagnosticController } from './controllers/diagnostic.controller';
import { BrainController } from './controllers/brain.controller';

// Import routes
import adminRoutes from './routes/admin.routes';
import groupRoutes from './routes/group.routes';
import notesRoutes from './routes/notes.routes';
import notificationsRoutes from './routes/notifications.routes';
import settingsRoutes from './routes/settings.routes';
import superAdminRoutes from './routes/super-admin.routes';
import aiTeachersRoutes from './routes/ai-teachers.routes';

// Import middleware
import { errorHandler } from './middleware/error-handler.middleware';

const app: Application = express();

// Security middleware
app.use(helmet());
// Allow frontend origins
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "http://localhost:3000",
        "http://167.86.97.76:3000",
        "https://frontend-inbotsteam.vercel.app",
        "https://estateiq-app.vercel.app",
        "https://inlearn.macsoft.ai"
      ];

      // Allow any Vercel preview URLs or macsoft.ai subdomains
      if (origin.endsWith('.vercel.app') || origin.endsWith('.macsoft.ai') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);


// Compression middleware - compress all responses (especially important for large base64 images)
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API routes
const apiRouter = express.Router();

// Register controllers
const simulationController = container.resolve(SimulationController);
const traineeController = container.resolve(TraineeController);
const reportController = container.resolve(ReportController);
const courseController = container.resolve(CourseController);
const authController = container.resolve(AuthController);
const elevenLabsController = container.resolve(ElevenLabsController);
const voiceController = container.resolve(VoiceController);
const aiTeacherController = container.resolve(AITeacherController);

apiRouter.use('/auth', authController.router);
apiRouter.use('/simulations', simulationController.router);
apiRouter.use('/trainees', traineeController.router);
apiRouter.use('/reports', reportController.router);
apiRouter.use('/courses', courseController.router);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/admin/ai-teachers', aiTeachersRoutes);
apiRouter.use('/groups', groupRoutes);
apiRouter.use('/notes', notesRoutes);
apiRouter.use('/notifications', notificationsRoutes);
apiRouter.use('/settings', settingsRoutes);
apiRouter.use('/super-admin', superAdminRoutes);
apiRouter.use('/elevenlabs', elevenLabsController.router);
apiRouter.use('/voice', voiceController.router);
apiRouter.use('/ai-teacher', aiTeacherController.router);

const quizController = container.resolve(QuizController);
apiRouter.use('/quizzes', quizController.router);

const flashcardController = container.resolve(FlashcardController);
apiRouter.use('/flashcards', flashcardController.router);

const diagnosticController = container.resolve(DiagnosticController);
apiRouter.use('/diagnostics', diagnosticController.router);

const brainController = container.resolve(BrainController);
apiRouter.use('/brain', brainController.router);

app.use('/api', apiRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use(errorHandler);

export { app };
