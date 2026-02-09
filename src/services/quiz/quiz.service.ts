import { injectable, inject } from 'tsyringe';
import {
  IQuizService,
  QuizDetail,
  QuizListItem,
  QuestionDetail,
  OptionDetail,
  QuizAttemptResult,
  ResponseResult,
  TraineeAttemptHistoryItem,
  AdminAttemptItem,
} from '../interfaces/quiz.interface';
import { IQuizRepository, QuizWithQuestions, QuizWithCount } from '../../repositories/interfaces/quiz.repository.interface';
import { CreateQuizInput, UpdateQuizInput, SubmitResponseInput, GenerateQuizInput } from '../../dtos/validation/quiz.validation';

@injectable()
export class QuizService implements IQuizService {
  constructor(
    @inject('QuizRepository') private quizRepository: IQuizRepository
  ) {}

  // ==========================================
  // Quiz Management (Admin/Trainer)
  // ==========================================

  async createQuiz(creatorId: string, orgId: string | null, data: CreateQuizInput): Promise<QuizDetail> {
    // Create the quiz record
    const quiz = await this.quizRepository.create({
      createdById: creatorId,
      organizationId: orgId,
      courseId: data.courseId || null,
      title: data.title,
      titleAr: data.titleAr,
      description: data.description,
      descriptionAr: data.descriptionAr,
      quizType: 'manual',
      difficulty: data.difficulty,
      timeLimit: data.timeLimit || null,
      passingScore: data.passingScore,
      shuffleQuestions: data.shuffleQuestions,
      showCorrectAnswers: data.showCorrectAnswers,
      maxAttempts: data.maxAttempts || null,
    });

    // Create questions and options
    for (const qInput of data.questions) {
      const question = await this.quizRepository.createQuestion({
        quizId: quiz.id,
        questionText: qInput.questionText,
        questionTextAr: qInput.questionTextAr,
        questionType: qInput.questionType,
        explanation: qInput.explanation,
        explanationAr: qInput.explanationAr,
        points: qInput.points,
        orderInQuiz: qInput.orderInQuiz,
      });

      for (const oInput of qInput.options) {
        await this.quizRepository.createOption({
          questionId: question.id,
          optionText: oInput.optionText,
          optionTextAr: oInput.optionTextAr,
          isCorrect: oInput.isCorrect,
          orderInQuestion: oInput.orderInQuestion,
        });
      }
    }

    // Fetch and return complete quiz
    return this.getQuizForAdmin(quiz.id);
  }

  async updateQuiz(quizId: string, data: UpdateQuizInput): Promise<QuizDetail> {
    const existing = await this.quizRepository.findById(quizId);
    if (!existing) throw new Error('Quiz not found');

    // Update quiz metadata
    await this.quizRepository.update(quizId, {
      title: data.title ?? existing.title,
      titleAr: data.titleAr !== undefined ? data.titleAr : existing.titleAr,
      description: data.description ?? existing.description,
      descriptionAr: data.descriptionAr !== undefined ? data.descriptionAr : existing.descriptionAr,
      courseId: data.courseId !== undefined ? data.courseId : existing.courseId,
      difficulty: data.difficulty ?? existing.difficulty,
      timeLimit: data.timeLimit !== undefined ? data.timeLimit : existing.timeLimit,
      passingScore: data.passingScore ?? existing.passingScore,
      shuffleQuestions: data.shuffleQuestions ?? existing.shuffleQuestions,
      showCorrectAnswers: data.showCorrectAnswers ?? existing.showCorrectAnswers,
      maxAttempts: data.maxAttempts !== undefined ? data.maxAttempts : existing.maxAttempts,
    });

    // If questions provided, replace all
    if (data.questions) {
      await this.quizRepository.deleteQuestionsByQuiz(quizId);
      for (const qInput of data.questions) {
        const question = await this.quizRepository.createQuestion({
          quizId,
          questionText: qInput.questionText,
          questionTextAr: qInput.questionTextAr,
          questionType: qInput.questionType,
          explanation: qInput.explanation,
          explanationAr: qInput.explanationAr,
          points: qInput.points,
          orderInQuiz: qInput.orderInQuiz,
        });

        for (const oInput of qInput.options) {
          await this.quizRepository.createOption({
            questionId: question.id,
            optionText: oInput.optionText,
            optionTextAr: oInput.optionTextAr,
            isCorrect: oInput.isCorrect,
            orderInQuestion: oInput.orderInQuestion,
          });
        }
      }
    }

    return this.getQuizForAdmin(quizId);
  }

  async deleteQuiz(quizId: string): Promise<void> {
    const existing = await this.quizRepository.findById(quizId);
    if (!existing) throw new Error('Quiz not found');
    await this.quizRepository.delete(quizId);
  }

  async publishQuiz(quizId: string, publish: boolean): Promise<void> {
    const existing = await this.quizRepository.findById(quizId);
    if (!existing) throw new Error('Quiz not found');

    if (publish) {
      // Validate quiz has at least 1 question with correct answer
      const full = await this.quizRepository.findByIdWithQuestions(quizId);
      if (!full || full.questions.length === 0) {
        throw new Error('Cannot publish quiz with no questions');
      }
      for (const q of full.questions) {
        const hasCorrect = q.options.some(o => o.isCorrect);
        if (!hasCorrect) {
          throw new Error(`Question "${q.questionText}" has no correct answer marked`);
        }
      }
    }

    await this.quizRepository.update(quizId, { isPublished: publish } as any);
  }

  async getQuizForAdmin(quizId: string): Promise<QuizDetail> {
    const quiz = await this.quizRepository.findByIdWithQuestions(quizId);
    if (!quiz) throw new Error('Quiz not found');
    return this.mapQuizToDetail(quiz, true);
  }

  async listQuizzesForAdmin(orgId: string | null, userId: string, userRole: string): Promise<QuizListItem[]> {
    let quizzes: QuizWithCount[];

    if (orgId) {
      quizzes = await this.quizRepository.findByOrganization(orgId);
    } else {
      quizzes = await this.quizRepository.findByCreator(userId);
    }

    return quizzes.map(q => this.mapQuizToListItem(q));
  }

  async getQuizAttempts(quizId: string): Promise<AdminAttemptItem[]> {
    const attempts = await this.quizRepository.findAttemptsByQuiz(quizId);
    return attempts.map(a => ({
      attemptId: a.id,
      traineeFirstName: a.trainee.firstName,
      traineeLastName: a.trainee.lastName,
      traineeEmail: a.trainee.email,
      score: a.score,
      passed: a.passed,
      status: a.status,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      timeSpentSeconds: a.timeSpentSeconds,
    }));
  }

  // ==========================================
  // Quiz Taking (Trainee)
  // ==========================================

  async getAvailableQuizzes(courseId?: string): Promise<QuizListItem[]> {
    const quizzes = await this.quizRepository.findPublished(courseId);
    return quizzes.map(q => this.mapQuizToListItem(q));
  }

  async getQuizForTaking(quizId: string, traineeId: string): Promise<QuizDetail> {
    const quiz = await this.quizRepository.findByIdWithQuestions(quizId);
    if (!quiz) throw new Error('Quiz not found');
    if (!quiz.isPublished) throw new Error('Quiz is not available');

    // Strip correct answers for trainee view
    return this.mapQuizToDetail(quiz, false);
  }

  async startAttempt(traineeId: string, quizId: string): Promise<{ attemptId: string }> {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new Error('Quiz not found');
    if (!quiz.isPublished) throw new Error('Quiz is not available');

    // Check max attempts
    if (quiz.maxAttempts) {
      const count = await this.quizRepository.countAttemptsByTraineeAndQuiz(traineeId, quizId);
      if (count >= quiz.maxAttempts) {
        throw new Error(`Maximum attempts (${quiz.maxAttempts}) reached for this quiz`);
      }
    }

    const attempt = await this.quizRepository.createAttempt({ quizId, traineeId });
    return { attemptId: attempt.id };
  }

  async submitAttempt(
    attemptId: string,
    traineeId: string,
    responses: SubmitResponseInput[]
  ): Promise<QuizAttemptResult> {
    // Validate attempt ownership
    const attempt = await this.quizRepository.findAttemptById(attemptId);
    if (!attempt) throw new Error('Attempt not found');
    if (attempt.traineeId !== traineeId) throw new Error('Unauthorized');
    if (attempt.status === 'completed') throw new Error('Attempt already completed');

    // Get full quiz with answers
    const quiz = await this.quizRepository.findByIdWithQuestions(attempt.quizId);
    if (!quiz) throw new Error('Quiz not found');

    // Build answer map: questionId -> correct optionId
    const questionMap = new Map(
      quiz.questions.map(q => [q.id, q])
    );

    // Score each response
    let totalPoints = 0;
    let earnedPoints = 0;
    const responseData: { attemptId: string; questionId: string; selectedOptionId: string | null; isCorrect: boolean }[] = [];

    for (const q of quiz.questions) {
      totalPoints += q.points;
    }

    for (const resp of responses) {
      const question = questionMap.get(resp.questionId);
      if (!question) continue;

      const correctOption = question.options.find(o => o.isCorrect);
      const isCorrect = resp.selectedOptionId != null && resp.selectedOptionId === correctOption?.id;

      if (isCorrect) {
        earnedPoints += question.points;
      }

      responseData.push({
        attemptId,
        questionId: resp.questionId,
        selectedOptionId: resp.selectedOptionId || null,
        isCorrect,
      });
    }

    // Save responses
    await this.quizRepository.createManyResponses(responseData);

    // Calculate score
    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;
    const timeSpentSeconds = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);

    // Update attempt
    await this.quizRepository.updateAttempt(attemptId, {
      status: 'completed',
      completedAt: new Date(),
      score,
      totalPoints,
      earnedPoints,
      passed,
      timeSpentSeconds,
    } as any);

    // Build result
    return this.buildAttemptResult(attemptId, quiz, responseData, score, totalPoints, earnedPoints, passed, timeSpentSeconds);
  }

  async getAttemptResult(attemptId: string, traineeId: string): Promise<QuizAttemptResult> {
    const attempt = await this.quizRepository.findAttemptById(attemptId);
    if (!attempt) throw new Error('Attempt not found');
    if (attempt.traineeId !== traineeId) throw new Error('Unauthorized');
    if (attempt.status !== 'completed') throw new Error('Attempt not completed yet');

    const quiz = await this.quizRepository.findByIdWithQuestions(attempt.quizId);
    if (!quiz) throw new Error('Quiz not found');

    const responses = await this.quizRepository.findResponsesByAttempt(attemptId);

    const responseResults: ResponseResult[] = responses.map(r => {
      const correctOption = r.question.options.find(o => o.isCorrect);
      return {
        questionId: r.questionId,
        questionText: r.question.questionText,
        questionTextAr: r.question.questionTextAr,
        selectedOptionId: r.selectedOptionId,
        correctOptionId: correctOption?.id || '',
        isCorrect: r.isCorrect,
        explanation: r.question.explanation,
        explanationAr: r.question.explanationAr,
        points: r.question.points,
        earnedPoints: r.isCorrect ? r.question.points : 0,
      };
    });

    return {
      attemptId: attempt.id,
      quizId: attempt.quizId,
      quizTitle: quiz.title,
      score: attempt.score || 0,
      totalPoints: attempt.totalPoints || 0,
      earnedPoints: attempt.earnedPoints || 0,
      passed: attempt.passed || false,
      timeSpentSeconds: attempt.timeSpentSeconds || 0,
      showCorrectAnswers: quiz.showCorrectAnswers,
      responses: responseResults,
    };
  }

  async getTraineeHistory(traineeId: string): Promise<TraineeAttemptHistoryItem[]> {
    const attempts = await this.quizRepository.findAttemptsByTrainee(traineeId);
    return attempts.map(a => ({
      attemptId: a.id,
      quizId: a.quizId,
      quizTitle: a.quiz.title,
      quizTitleAr: a.quiz.titleAr,
      score: a.score,
      passed: a.passed,
      passingScore: a.quiz.passingScore,
      status: a.status,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      timeSpentSeconds: a.timeSpentSeconds,
    }));
  }

  // ==========================================
  // AI Generation (Mock Fallback)
  // ==========================================

  async generateQuiz(creatorId: string, orgId: string | null, input: GenerateQuizInput): Promise<QuizDetail> {
    // Generate sample quiz questions (mock - works without API keys)
    const topic = input.topic || 'Real Estate Fundamentals';
    const numQuestions = input.numberOfQuestions || 5;
    const difficulty = input.difficulty || 'medium';

    const sampleQuestions = this.generateSampleQuestions(topic, numQuestions, difficulty);

    // Create the quiz using the regular createQuiz flow
    const quizData: CreateQuizInput = {
      title: `AI Generated: ${topic}`,
      titleAr: `إنشاء تلقائي: ${topic}`,
      description: `Auto-generated quiz about ${topic}`,
      descriptionAr: `اختبار تلقائي حول ${topic}`,
      courseId: input.courseId || null,
      difficulty,
      passingScore: 70,
      shuffleQuestions: true,
      showCorrectAnswers: true,
      questions: sampleQuestions,
    };

    const quiz = await this.createQuiz(creatorId, orgId, quizData);

    // Mark as AI generated
    await this.quizRepository.update(quiz.id, { quizType: 'ai_generated' } as any);

    return { ...quiz, quizType: 'ai_generated' };
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private mapQuizToDetail(quiz: QuizWithQuestions, includeCorrectAnswers: boolean): QuizDetail {
    return {
      id: quiz.id,
      title: quiz.title,
      titleAr: quiz.titleAr,
      description: quiz.description,
      descriptionAr: quiz.descriptionAr,
      courseId: quiz.courseId,
      difficulty: quiz.difficulty,
      quizType: quiz.quizType,
      timeLimit: quiz.timeLimit,
      passingScore: quiz.passingScore,
      isPublished: quiz.isPublished,
      shuffleQuestions: quiz.shuffleQuestions,
      showCorrectAnswers: quiz.showCorrectAnswers,
      maxAttempts: quiz.maxAttempts,
      createdAt: quiz.createdAt,
      questions: quiz.questions.map(q => ({
        id: q.id,
        questionText: q.questionText,
        questionTextAr: q.questionTextAr,
        questionType: q.questionType,
        explanation: includeCorrectAnswers ? q.explanation : null,
        explanationAr: includeCorrectAnswers ? q.explanationAr : null,
        points: q.points,
        orderInQuiz: q.orderInQuiz,
        options: q.options.map(o => ({
          id: o.id,
          optionText: o.optionText,
          optionTextAr: o.optionTextAr,
          isCorrect: includeCorrectAnswers ? o.isCorrect : false,
          orderInQuestion: o.orderInQuestion,
        })),
      })),
    };
  }

  private mapQuizToListItem(quiz: QuizWithCount): QuizListItem {
    return {
      id: quiz.id,
      title: quiz.title,
      titleAr: quiz.titleAr,
      description: quiz.description,
      descriptionAr: quiz.descriptionAr,
      courseId: quiz.courseId,
      difficulty: quiz.difficulty,
      questionCount: quiz._count.questions,
      attemptCount: quiz._count.attempts,
      timeLimit: quiz.timeLimit,
      passingScore: quiz.passingScore,
      isPublished: quiz.isPublished,
      maxAttempts: quiz.maxAttempts,
      quizType: quiz.quizType,
      createdAt: quiz.createdAt,
    };
  }

  private buildAttemptResult(
    attemptId: string,
    quiz: QuizWithQuestions,
    responseData: { questionId: string; selectedOptionId: string | null; isCorrect: boolean }[],
    score: number,
    totalPoints: number,
    earnedPoints: number,
    passed: boolean,
    timeSpentSeconds: number
  ): QuizAttemptResult {
    const responseMap = new Map(responseData.map(r => [r.questionId, r]));

    const responses: ResponseResult[] = quiz.questions.map(q => {
      const resp = responseMap.get(q.id);
      const correctOption = q.options.find(o => o.isCorrect);
      return {
        questionId: q.id,
        questionText: q.questionText,
        questionTextAr: q.questionTextAr,
        selectedOptionId: resp?.selectedOptionId || null,
        correctOptionId: correctOption?.id || '',
        isCorrect: resp?.isCorrect || false,
        explanation: q.explanation,
        explanationAr: q.explanationAr,
        points: q.points,
        earnedPoints: resp?.isCorrect ? q.points : 0,
      };
    });

    return {
      attemptId,
      quizId: quiz.id,
      quizTitle: quiz.title,
      score,
      totalPoints,
      earnedPoints,
      passed,
      timeSpentSeconds,
      showCorrectAnswers: quiz.showCorrectAnswers,
      responses,
    };
  }

  private generateSampleQuestions(topic: string, count: number, difficulty: string) {
    // Sample real estate questions for mock generation
    const samplePool = [
      {
        questionText: 'What is the most important factor when pricing a property?',
        questionTextAr: 'ما هو العامل الأهم عند تسعير عقار؟',
        explanation: 'Comparable market analysis (CMA) is the most reliable method.',
        explanationAr: 'تحليل السوق المقارن هو الأسلوب الأكثر موثوقية.',
        options: [
          { optionText: 'Comparable market analysis', optionTextAr: 'تحليل السوق المقارن', isCorrect: true },
          { optionText: 'Owner\'s desired price', optionTextAr: 'السعر المرغوب للمالك', isCorrect: false },
          { optionText: 'Property size only', optionTextAr: 'مساحة العقار فقط', isCorrect: false },
          { optionText: 'Neighborhood reputation', optionTextAr: 'سمعة الحي', isCorrect: false },
        ],
      },
      {
        questionText: 'A buyer expresses concern about the price. What is the best approach?',
        questionTextAr: 'يعبر المشتري عن قلقه بشأن السعر. ما هو أفضل نهج؟',
        explanation: 'Acknowledge concerns and justify value with data.',
        explanationAr: 'اعترف بالمخاوف وبرر القيمة بالبيانات.',
        options: [
          { optionText: 'Immediately offer a discount', optionTextAr: 'تقديم خصم فوري', isCorrect: false },
          { optionText: 'Acknowledge and justify with comparable data', optionTextAr: 'الاعتراف والتبرير ببيانات مقارنة', isCorrect: true },
          { optionText: 'Ignore the concern', optionTextAr: 'تجاهل القلق', isCorrect: false },
          { optionText: 'Pressure to decide quickly', optionTextAr: 'الضغط لاتخاذ قرار سريع', isCorrect: false },
        ],
      },
      {
        questionText: 'What is the purpose of a property inspection?',
        questionTextAr: 'ما هو الغرض من فحص العقار؟',
        explanation: 'Property inspections identify structural and safety issues.',
        explanationAr: 'فحص العقار يحدد المشاكل الهيكلية ومشاكل السلامة.',
        options: [
          { optionText: 'To identify structural and safety issues', optionTextAr: 'لتحديد المشاكل الهيكلية ومشاكل السلامة', isCorrect: true },
          { optionText: 'To determine property value', optionTextAr: 'لتحديد قيمة العقار', isCorrect: false },
          { optionText: 'To satisfy legal requirements only', optionTextAr: 'لتلبية المتطلبات القانونية فقط', isCorrect: false },
          { optionText: 'To negotiate a lower price', optionTextAr: 'للتفاوض على سعر أقل', isCorrect: false },
        ],
      },
      {
        questionText: 'Which document transfers property ownership?',
        questionTextAr: 'أي وثيقة تنقل ملكية العقار؟',
        explanation: 'A deed is the legal document that transfers property ownership.',
        explanationAr: 'صك الملكية هو الوثيقة القانونية التي تنقل ملكية العقار.',
        options: [
          { optionText: 'Purchase agreement', optionTextAr: 'اتفاقية الشراء', isCorrect: false },
          { optionText: 'Property deed', optionTextAr: 'صك الملكية', isCorrect: true },
          { optionText: 'Mortgage note', optionTextAr: 'سند الرهن', isCorrect: false },
          { optionText: 'Insurance policy', optionTextAr: 'وثيقة التأمين', isCorrect: false },
        ],
      },
      {
        questionText: 'What is the first step in a client meeting?',
        questionTextAr: 'ما هي الخطوة الأولى في اجتماع العميل؟',
        explanation: 'Building rapport establishes trust before discussing business.',
        explanationAr: 'بناء العلاقة يؤسس الثقة قبل مناقشة الأعمال.',
        options: [
          { optionText: 'Present property listings', optionTextAr: 'عرض القوائم العقارية', isCorrect: false },
          { optionText: 'Discuss pricing', optionTextAr: 'مناقشة التسعير', isCorrect: false },
          { optionText: 'Build rapport and understand needs', optionTextAr: 'بناء العلاقة وفهم الاحتياجات', isCorrect: true },
          { optionText: 'Sign paperwork', optionTextAr: 'توقيع الأوراق', isCorrect: false },
        ],
      },
      {
        questionText: 'True or False: A real estate agent must always disclose known defects.',
        questionTextAr: 'صح أم خطأ: يجب على الوكيل العقاري الإفصاح دائمًا عن العيوب المعروفة.',
        explanation: 'Disclosure of known defects is a legal requirement in most jurisdictions.',
        explanationAr: 'الإفصاح عن العيوب المعروفة هو متطلب قانوني في معظم الولايات القضائية.',
        options: [
          { optionText: 'True', optionTextAr: 'صح', isCorrect: true },
          { optionText: 'False', optionTextAr: 'خطأ', isCorrect: false },
        ],
      },
      {
        questionText: 'What is "ROI" in real estate investment?',
        questionTextAr: 'ما هو "العائد على الاستثمار" في الاستثمار العقاري؟',
        explanation: 'ROI measures the profitability of an investment relative to its cost.',
        explanationAr: 'العائد على الاستثمار يقيس ربحية الاستثمار بالنسبة لتكلفته.',
        options: [
          { optionText: 'Return on Investment', optionTextAr: 'العائد على الاستثمار', isCorrect: true },
          { optionText: 'Rate of Interest', optionTextAr: 'معدل الفائدة', isCorrect: false },
          { optionText: 'Rental Operating Income', optionTextAr: 'دخل التشغيل الإيجاري', isCorrect: false },
          { optionText: 'Real Owner Interest', optionTextAr: 'فائدة المالك الحقيقي', isCorrect: false },
        ],
      },
    ];

    const selected = samplePool.slice(0, Math.min(count, samplePool.length));

    return selected.map((q, index) => ({
      questionText: q.questionText,
      questionTextAr: q.questionTextAr,
      questionType: q.options.length === 2 ? 'true_false' as const : 'multiple_choice' as const,
      explanation: q.explanation,
      explanationAr: q.explanationAr,
      points: 1,
      orderInQuiz: index,
      options: q.options.map((o, oIndex) => ({
        optionText: o.optionText,
        optionTextAr: o.optionTextAr,
        isCorrect: o.isCorrect,
        orderInQuestion: oIndex,
      })),
    }));
  }
}
