import 'reflect-metadata';
import { container } from 'tsyringe';
import { PrismaClient } from '@prisma/client';

// Providers
import { ILLMProvider } from './providers/llm/llm-provider.interface';
import { AnthropicLLMProvider } from './providers/llm/anthropic.provider';
import { MockLLMProvider } from './providers/llm/mock.provider';
import { GroqLLMProvider } from './providers/llm/groq.provider';

// Repositories
import { ITraineeRepository } from './repositories/interfaces/trainee.repository.interface';
import { TraineeRepository } from './repositories/trainee.repository';
import { ISimulationRepository } from './repositories/interfaces/simulation.repository.interface';
import { SimulationRepository } from './repositories/simulation.repository';
import { IObjectionRepository } from './repositories/interfaces/objection.repository.interface';
import { ObjectionRepository } from './repositories/objection.repository';
import { ICourseRepository } from './repositories/interfaces/course.repository.interface';
import { CourseRepository } from './repositories/course.repository';
import { IReportRepository } from './repositories/interfaces/report.repository.interface';
import { ReportRepository } from './repositories/report.repository';

// Services
import { ISimulationService } from './services/interfaces/simulation.interface';
import { SimulationService } from './services/simulation/simulation.service';
import { IObjectionHandlingService } from './services/interfaces/objection-handling.interface';
import { ObjectionHandlingService } from './services/simulation/objection-handling.service';
import { IPersonaGeneratorService } from './services/interfaces/persona-generator.interface';
import { PersonaGeneratorService } from './services/simulation/persona-generator.service';
import { IConversationStateService } from './services/interfaces/conversation-state.interface';
import { ConversationStateService } from './services/simulation/conversation-state.service';
import { IAIAssessmentService } from './services/interfaces/ai-assessment.interface';
import { AIAssessmentService } from './services/assessment/ai-assessment.service';
import { IReportingService } from './services/interfaces/reporting.interface';
import { ReportingService } from './services/reporting/reporting.service';
import { IAuthService } from './services/interfaces/auth.interface';
import { AuthService } from './services/auth/auth.service';
import { ITraineeService } from './services/interfaces/trainee.interface';
import { TraineeService } from './services/trainee/trainee.service';
import { ICourseService } from './services/interfaces/course.interface';
import { CourseService } from './services/course/course.service';
import { IAIEvaluationService } from './services/interfaces/ai-evaluation.interface';
import { AIEvaluationService } from './services/evaluation/ai-evaluation.service';
import { IAdminService } from './services/interfaces/admin.interface';
import { AdminService } from './services/admin/admin.service';
import { ElevenLabsService } from './services/elevenlabs/elevenlabs.service';
import { AITeacherService } from './services/ai-teacher/ai-teacher.service';

// Quiz System
import { IQuizRepository } from './repositories/interfaces/quiz.repository.interface';
import { QuizRepository } from './repositories/quiz.repository';
import { IQuizService } from './services/interfaces/quiz.interface';
import { QuizService } from './services/quiz/quiz.service';

// Initialize Prisma Client
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Register Prisma Client
container.registerInstance('PrismaClient', prisma);

// Register LLM Provider based on environment
const llmProvider = process.env.LLM_PROVIDER || 'mock';
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasGroqKey = !!process.env.GROQ_API_KEY;

if (llmProvider === 'anthropic' && hasAnthropicKey) {
  container.registerSingleton<ILLMProvider>('LLMProvider', AnthropicLLMProvider);
} else if (llmProvider === 'groq' && hasGroqKey) {
  container.registerSingleton<ILLMProvider>('LLMProvider', GroqLLMProvider);
} else if (hasAnthropicKey) {
  // Default to Anthropic if key is available even if LLM_PROVIDER is not set
  container.registerSingleton<ILLMProvider>('LLMProvider', AnthropicLLMProvider);
} else if (hasGroqKey) {
  // Fallback to Groq if available
  container.registerSingleton<ILLMProvider>('LLMProvider', GroqLLMProvider);
} else {
  container.registerSingleton<ILLMProvider>('LLMProvider', MockLLMProvider);
}

// Register Repositories
container.registerSingleton<ITraineeRepository>('TraineeRepository', TraineeRepository);
container.registerSingleton<ISimulationRepository>('SimulationRepository', SimulationRepository);
container.registerSingleton<IObjectionRepository>('ObjectionRepository', ObjectionRepository);
container.registerSingleton<ICourseRepository>('CourseRepository', CourseRepository);
container.registerSingleton<IReportRepository>('ReportRepository', ReportRepository);

// Register Services
container.registerSingleton<IObjectionHandlingService>('ObjectionHandlingService', ObjectionHandlingService);
container.registerSingleton<IPersonaGeneratorService>('PersonaGeneratorService', PersonaGeneratorService);
container.registerSingleton<IConversationStateService>('ConversationStateService', ConversationStateService);
container.registerSingleton<ISimulationService>('SimulationService', SimulationService);
container.registerSingleton<IAIAssessmentService>('AIAssessmentService', AIAssessmentService);
container.registerSingleton<IReportingService>('ReportingService', ReportingService);
container.registerSingleton<IAuthService>('AuthService', AuthService);
container.registerSingleton<ITraineeService>('TraineeService', TraineeService);
container.registerSingleton<ICourseService>('CourseService', CourseService);
container.registerSingleton<IAIEvaluationService>('AIEvaluationService', AIEvaluationService);
container.registerSingleton<IAdminService>('AdminService', AdminService);

// Register ElevenLabs Service
container.registerSingleton(ElevenLabsService, ElevenLabsService);

// Register AI Teacher Service
container.registerSingleton(AITeacherService, AITeacherService);

// Register AV Content Service
import { AVContentService } from './services/av-content/av-content.service';
container.registerSingleton(AVContentService, AVContentService);

// Register Quiz System
container.registerSingleton<IQuizRepository>('QuizRepository', QuizRepository);
container.registerSingleton<IQuizService>('QuizService', QuizService);

// Register Flashcard System
import { IFlashcardRepository } from './repositories/interfaces/flashcard.repository.interface';
import { FlashcardRepository } from './repositories/flashcard.repository';
import { IFlashcardService } from './services/interfaces/flashcard.interface';
import { FlashcardService } from './services/flashcard/flashcard.service';

container.registerSingleton<IFlashcardRepository>('FlashcardRepository', FlashcardRepository);
container.registerSingleton<IFlashcardService>('FlashcardService', FlashcardService);

// Register Diagnostic (Adaptive Learning) System
import { IDiagnosticRepository } from './repositories/interfaces/diagnostic.repository.interface';
import { DiagnosticRepository } from './repositories/diagnostic.repository';
import { IDiagnosticService } from './services/interfaces/diagnostic.interface';
import { DiagnosticService } from './services/diagnostic/diagnostic.service';

container.registerSingleton<IDiagnosticRepository>('DiagnosticRepository', DiagnosticRepository);
container.registerSingleton<IDiagnosticService>('DiagnosticService', DiagnosticService);

export { container, prisma };
