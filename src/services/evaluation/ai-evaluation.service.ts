import { injectable, inject } from 'tsyringe';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import { FallbackLLMProvider } from '../../providers/llm/fallback.provider';

export interface ConversationMessage {
  speaker: 'trainee' | 'client';
  message: string;
  timestamp: Date;
}

export interface EvaluationResult {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
  skillScores: {
    communication: SkillEvaluation;
    negotiation: SkillEvaluation;
    objectionHandling: SkillEvaluation;
    relationshipBuilding: SkillEvaluation;
    productKnowledge: SkillEvaluation;
    closingTechnique: SkillEvaluation;
  };
  conversationMetrics: {
    talkTimeRatio: number;
    averageResponseLength: number;
    questionsAsked: number;
    empathyStatements: number;
    activeListeningIndicators: number;
  };
  highlights: string[];
  improvementAreas: string[];
  recommendations: Recommendation[];
}

export interface SkillEvaluation {
  score: number;
  reasoning: string;
  evidence: string[];
  tips: string[];
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  actionableSteps: string[];
}

export interface IAIEvaluationService {
  evaluateConversation(
    conversation: ConversationMessage[],
    scenarioType: string,
    difficulty: string,
    clientPersona: Record<string, unknown>
  ): Promise<EvaluationResult>;
}

@injectable()
export class AIEvaluationService implements IAIEvaluationService {
  private fallbackProvider: FallbackLLMProvider;

  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {
    // Use fallback provider for faster, more reliable evaluations
    this.fallbackProvider = new FallbackLLMProvider();
  }

  async evaluateConversation(
    conversation: ConversationMessage[],
    scenarioType: string,
    difficulty: string,
    clientPersona: Record<string, unknown>
  ): Promise<EvaluationResult> {
    // Build conversation transcript
    const transcript = conversation
      .map(msg => `${msg.speaker.toUpperCase()}: ${msg.message}`)
      .join('\n\n');

    const traineeMessages = conversation.filter(m => m.speaker === 'trainee');
    const clientMessages = conversation.filter(m => m.speaker === 'client');

    // Calculate basic metrics deterministically
    const questionsAsked = traineeMessages.filter(m => m.message.includes('?')).length;
    const avgResponseLength = traineeMessages.length > 0
      ? Math.round(traineeMessages.reduce((sum, m) => sum + m.message.length, 0) / traineeMessages.length)
      : 0;
    const talkTimeRatio = traineeMessages.length > 0 && clientMessages.length > 0
      ? parseFloat((traineeMessages.reduce((sum, m) => sum + m.message.length, 0) /
        (traineeMessages.reduce((sum, m) => sum + m.message.length, 0) +
         clientMessages.reduce((sum, m) => sum + m.message.length, 0))).toFixed(2))
      : 0.5;

    // Count empathy indicators (English and Arabic)
    const empathyWords = [
      // English
      'understand', 'i see', 'that makes sense', 'i hear you', 'appreciate', 'important to you',
      // Arabic/Saudi
      'أفهم', 'فهمت', 'معك حق', 'أقدر', 'مهم', 'صح', 'طيب', 'تمام', 'فاهم', 'فاهمك',
      'الله يعينك', 'إن شاء الله', 'ما عليك', 'حاضر', 'أكيد'
    ];
    const empathyStatements = traineeMessages.filter(m =>
      empathyWords.some(word => m.message.toLowerCase().includes(word))
    ).length;

    // Count active listening indicators (English and Arabic)
    const listeningWords = [
      // English
      'you mentioned', 'earlier you said', 'so what you\'re saying', 'let me make sure i understand',
      // Arabic/Saudi
      'ذكرت', 'قلت', 'يعني', 'فهمت منك', 'قصدك', 'خليني أتأكد', 'إذا فهمت صح',
      'اللي فهمته', 'قبل شوي قلت', 'تقصد'
    ];
    const activeListeningIndicators = traineeMessages.filter(m =>
      listeningWords.some(word => m.message.toLowerCase().includes(word))
    ).length;

    // Detect if conversation is in Arabic
    const isArabicConversation = this.isArabicText(transcript);

    // Build system prompt based on language
    const systemPrompt = isArabicConversation
      ? this.buildArabicSystemPrompt(scenarioType, difficulty, clientPersona)
      : this.buildEnglishSystemPrompt(scenarioType, difficulty, clientPersona);

    const prompt = `CONVERSATION TRANSCRIPT:

${transcript}

---

Based on this ${conversation.length}-turn conversation, provide your evaluation as JSON:`;

    try {
      // Use fallback provider with reduced tokens for faster response
      const response = await this.fallbackProvider.complete({
        systemPrompt,
        prompt,
        maxTokens: 1500, // Reduced for faster response
        temperature: 0.3, // Lower temperature for more consistent evaluations
        responseFormat: 'json',
      });

      // Parse the JSON response
      let evaluation: {
        overallScore: number;
        summary: string;
        skillScores: Record<string, { score: number; reasoning: string; evidence: string[]; tips: string[] }>;
        highlights: string[];
        improvementAreas: string[];
        recommendations: Recommendation[];
      };

      try {
        // Clean response - remove markdown code blocks if present
        let cleanResponse = response.trim();
        if (cleanResponse.startsWith('```json')) {
          cleanResponse = cleanResponse.slice(7);
        }
        if (cleanResponse.startsWith('```')) {
          cleanResponse = cleanResponse.slice(3);
        }
        if (cleanResponse.endsWith('```')) {
          cleanResponse = cleanResponse.slice(0, -3);
        }

        evaluation = JSON.parse(cleanResponse.trim());
      } catch (parseError) {
        console.error('Failed to parse AI evaluation response:', parseError);
        console.error('Response was:', response);
        // Return a deterministic fallback based on conversation metrics
        return this.generateFallbackEvaluation(
          conversation, questionsAsked, empathyStatements, activeListeningIndicators, talkTimeRatio, avgResponseLength
        );
      }

      // Validate and clamp scores
      const clampScore = (score: number) => Math.min(100, Math.max(0, Math.round(score)));

      const grade = this.scoreToGrade(evaluation.overallScore);

      return {
        overallScore: clampScore(evaluation.overallScore),
        grade,
        summary: evaluation.summary || this.generateSummary(evaluation.overallScore),
        skillScores: {
          communication: this.normalizeSkillScore(evaluation.skillScores?.communication),
          negotiation: this.normalizeSkillScore(evaluation.skillScores?.negotiation),
          objectionHandling: this.normalizeSkillScore(evaluation.skillScores?.objectionHandling),
          relationshipBuilding: this.normalizeSkillScore(evaluation.skillScores?.relationshipBuilding),
          productKnowledge: this.normalizeSkillScore(evaluation.skillScores?.productKnowledge),
          closingTechnique: this.normalizeSkillScore(evaluation.skillScores?.closingTechnique),
        },
        conversationMetrics: {
          talkTimeRatio,
          averageResponseLength: avgResponseLength,
          questionsAsked,
          empathyStatements,
          activeListeningIndicators,
        },
        highlights: evaluation.highlights || [],
        improvementAreas: evaluation.improvementAreas || [],
        recommendations: evaluation.recommendations || [],
      };
    } catch (error) {
      console.error('AI evaluation failed:', error);
      // Return deterministic fallback
      return this.generateFallbackEvaluation(
        conversation, questionsAsked, empathyStatements, activeListeningIndicators, talkTimeRatio, avgResponseLength
      );
    }
  }

  private normalizeSkillScore(skill: { score?: number; reasoning?: string; evidence?: string[]; tips?: string[] } | undefined): SkillEvaluation {
    return {
      score: Math.min(100, Math.max(0, Math.round(skill?.score || 50))),
      reasoning: skill?.reasoning || 'Based on conversation analysis',
      evidence: skill?.evidence || [],
      tips: skill?.tips || [],
    };
  }

  private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private generateSummary(score: number): string {
    if (score >= 90) return 'Outstanding performance demonstrating mastery of key sales techniques.';
    if (score >= 80) return 'Strong performance with minor areas for refinement.';
    if (score >= 70) return 'Competent performance showing solid foundational skills.';
    if (score >= 60) return 'Developing skills with room for significant improvement.';
    return 'This session highlighted important areas requiring focused practice.';
  }

  private generateFallbackEvaluation(
    conversation: ConversationMessage[],
    questionsAsked: number,
    empathyStatements: number,
    activeListeningIndicators: number,
    talkTimeRatio: number,
    avgResponseLength: number
  ): EvaluationResult {
    // Deterministic scoring based on conversation metrics
    const traineeMessages = conversation.filter(m => m.speaker === 'trainee');
    const turnCount = conversation.length;

    // Base score starts at 50
    let baseScore = 50;

    // Add points for conversation length (engagement)
    if (turnCount >= 6) baseScore += 10;
    if (turnCount >= 10) baseScore += 5;

    // Add points for asking questions (discovery skills)
    baseScore += Math.min(15, questionsAsked * 5);

    // Add points for empathy
    baseScore += Math.min(10, empathyStatements * 5);

    // Add points for active listening
    baseScore += Math.min(10, activeListeningIndicators * 5);

    // Balanced talk time is good (0.4-0.6 is ideal)
    if (talkTimeRatio >= 0.35 && talkTimeRatio <= 0.65) baseScore += 5;

    // Response length - not too short, not too long
    if (avgResponseLength >= 50 && avgResponseLength <= 200) baseScore += 5;

    const overallScore = Math.min(100, Math.max(0, Math.round(baseScore)));
    const grade = this.scoreToGrade(overallScore);

    // Calculate individual skill scores deterministically
    const communicationScore = Math.min(100, Math.max(0,
      50 + (avgResponseLength > 30 ? 15 : 0) + (questionsAsked * 5)
    ));
    const negotiationScore = Math.min(100, Math.max(0,
      45 + (turnCount > 8 ? 10 : 0) + (empathyStatements * 3)
    ));
    const objectionHandlingScore = Math.min(100, Math.max(0,
      50 + (activeListeningIndicators * 8) + (empathyStatements * 5)
    ));
    const relationshipScore = Math.min(100, Math.max(0,
      50 + (empathyStatements * 8) + (questionsAsked * 3)
    ));
    const productKnowledgeScore = Math.min(100, Math.max(0,
      45 + (avgResponseLength > 50 ? 10 : 0) + (turnCount > 6 ? 10 : 0)
    ));
    const closingScore = Math.min(100, Math.max(0,
      40 + (turnCount > 10 ? 15 : 0) + (activeListeningIndicators * 5)
    ));

    return {
      overallScore,
      grade,
      summary: this.generateSummary(overallScore),
      skillScores: {
        communication: {
          score: communicationScore,
          reasoning: 'Based on response quality and engagement level',
          evidence: traineeMessages.length > 0 ? [traineeMessages[0].message.substring(0, 100)] : [],
          tips: ['Practice asking open-ended questions', 'Vary your response length based on context'],
        },
        negotiation: {
          score: negotiationScore,
          reasoning: 'Based on conversation flow and persistence',
          evidence: [],
          tips: ['Focus on understanding client needs before proposing solutions'],
        },
        objectionHandling: {
          score: objectionHandlingScore,
          reasoning: 'Based on empathy and active listening indicators',
          evidence: [],
          tips: ['Acknowledge concerns before addressing them', 'Use the LAER method'],
        },
        relationshipBuilding: {
          score: relationshipScore,
          reasoning: 'Based on empathy statements and questioning technique',
          evidence: [],
          tips: ['Show genuine interest in client needs', 'Remember and reference earlier details'],
        },
        productKnowledge: {
          score: productKnowledgeScore,
          reasoning: 'Based on response detail and relevance',
          evidence: [],
          tips: ['Provide specific property details when relevant'],
        },
        closingTechnique: {
          score: closingScore,
          reasoning: 'Based on conversation progression and commitment-seeking',
          evidence: [],
          tips: ['Summarize benefits before asking for commitment', 'Use trial closes throughout'],
        },
      },
      conversationMetrics: {
        talkTimeRatio,
        averageResponseLength: avgResponseLength,
        questionsAsked,
        empathyStatements,
        activeListeningIndicators,
      },
      highlights: this.generateHighlights(questionsAsked, empathyStatements, turnCount),
      improvementAreas: this.generateImprovementAreas(questionsAsked, empathyStatements, talkTimeRatio),
      recommendations: this.generateFallbackRecommendations(overallScore),
    };
  }

  private generateHighlights(questions: number, empathy: number, turns: number): string[] {
    const highlights: string[] = [];
    if (questions >= 3) highlights.push('Good use of questions to understand client needs');
    if (empathy >= 2) highlights.push('Demonstrated empathy and understanding');
    if (turns >= 8) highlights.push('Maintained engagement throughout the conversation');
    if (highlights.length === 0) highlights.push('Completed the simulation exercise');
    return highlights;
  }

  private generateImprovementAreas(questions: number, empathy: number, talkRatio: number): string[] {
    const areas: string[] = [];
    if (questions < 2) areas.push('Ask more discovery questions to understand client needs');
    if (empathy < 2) areas.push('Show more empathy when client expresses concerns');
    if (talkRatio > 0.7) areas.push('Listen more - you dominated the conversation');
    if (talkRatio < 0.3) areas.push('Engage more actively in the conversation');
    if (areas.length === 0) areas.push('Continue practicing to refine your technique');
    return areas;
  }

  private generateFallbackRecommendations(score: number): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (score < 70) {
      recommendations.push({
        priority: 'high',
        category: 'technique',
        title: 'Master Active Listening',
        description: 'Focus on truly understanding client needs before responding',
        actionableSteps: [
          'Paraphrase what the client says before responding',
          'Ask clarifying questions when something is unclear',
          'Take notes on key client concerns',
        ],
      });
    }

    if (score < 80) {
      recommendations.push({
        priority: 'medium',
        category: 'technique',
        title: 'Improve Objection Handling',
        description: 'Learn to address concerns without being defensive',
        actionableSteps: [
          'Acknowledge the concern first',
          'Ask questions to understand the root issue',
          'Provide evidence-based responses',
        ],
      });
    }

    recommendations.push({
      priority: 'low',
      category: 'practice',
      title: 'Practice Different Scenarios',
      description: 'Build versatility by practicing various client types',
      actionableSteps: [
        'Try scenarios with different client personalities',
        'Increase difficulty level gradually',
        'Focus on your weakest skill areas',
      ],
    });

    return recommendations;
  }

  // Helper to detect Arabic text
  private isArabicText(text: string): boolean {
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
    return arabicRegex.test(text);
  }

  // Arabic system prompt for Saudi Arabian context
  private buildArabicSystemPrompt(scenarioType: string, difficulty: string, clientPersona: Record<string, unknown>): string {
    const scenarioArabic: Record<string, string> = {
      'property_showing': 'عرض عقار',
      'price_negotiation': 'تفاوض على السعر',
      'objection_handling': 'معالجة الاعتراضات',
      'closing': 'إغلاق الصفقة',
      'cold_call': 'اتصال بارد',
      'follow_up': 'متابعة',
    };

    const difficultyArabic: Record<string, string> = {
      'easy': 'سهل',
      'medium': 'متوسط',
      'hard': 'صعب',
    };

    return `أنت خبير في تدريب مبيعات العقارات السعودية، تقيّم أداء متدرب في محاكاة تفاعل مع عميل.

السيناريو: ${scenarioArabic[scenarioType] || scenarioType}
مستوى الصعوبة: ${difficultyArabic[difficulty] || difficulty}
شخصية العميل: ${(clientPersona as { personality?: string }).personality || 'عادي'}

قيّم أداء المتدرب بناءً على نص المحادثة. كن عادلاً ولكن صارماً.

معايير التقييم الإضافية للسوق السعودي:
- استخدام اللهجة السعودية بشكل طبيعي ومناسب
- احترام العادات والتقاليد في التعامل
- استخدام عبارات المجاملة السعودية (الله يعطيك العافية، إن شاء الله، إلخ)
- التعامل باحترافية مع المسائل المالية (الريال السعودي، التمويل العقاري)
- سرعة الاستجابة وطلاقة الحوار

يجب أن ترد بكائن JSON فقط (بدون markdown، بدون شرح) بالهيكل التالي:
{
  "overallScore": <رقم 0-100>,
  "summary": "<ملخص الأداء بـ2-3 جمل باللغة العربية>",
  "skillScores": {
    "communication": {
      "score": <رقم 0-100>,
      "reasoning": "<سبب هذه النتيجة بالعربية>",
      "evidence": ["<اقتباس أو سلوك محدد من المحادثة>"],
      "tips": ["<نصيحة محددة للتحسين بالعربية>"]
    },
    "negotiation": {
      "score": <رقم 0-100>,
      "reasoning": "<سبب هذه النتيجة>",
      "evidence": ["<اقتباس أو سلوك محدد>"],
      "tips": ["<نصيحة للتحسين>"]
    },
    "objectionHandling": {
      "score": <رقم 0-100>,
      "reasoning": "<سبب هذه النتيجة>",
      "evidence": ["<اقتباس أو سلوك محدد>"],
      "tips": ["<نصيحة للتحسين>"]
    },
    "relationshipBuilding": {
      "score": <رقم 0-100>,
      "reasoning": "<سبب هذه النتيجة>",
      "evidence": ["<اقتباس أو سلوك محدد>"],
      "tips": ["<نصيحة للتحسين>"]
    },
    "productKnowledge": {
      "score": <رقم 0-100>,
      "reasoning": "<سبب هذه النتيجة>",
      "evidence": ["<اقتباس أو سلوك محدد>"],
      "tips": ["<نصيحة للتحسين>"]
    },
    "closingTechnique": {
      "score": <رقم 0-100>,
      "reasoning": "<سبب هذه النتيجة>",
      "evidence": ["<اقتباس أو سلوك محدد>"],
      "tips": ["<نصيحة للتحسين>"]
    }
  },
  "highlights": ["<ما أجاده المتدرب - محدد بالعربية>", "<نقطة قوة أخرى>"],
  "improvementAreas": ["<ما يحتاج تحسين - محدد بالعربية>", "<نقطة ضعف أخرى>"],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "category": "technique|knowledge|mindset",
      "title": "<عنوان قصير بالعربية>",
      "description": "<ماذا يجب تحسينه>",
      "actionableSteps": ["<خطوة 1>", "<خطوة 2>"]
    }
  ]
}

إرشادات التقييم المهمة:
- 90-100: استثنائي - المتدرب أظهر إتقان
- 80-89: قوي - مجالات بسيطة للتحسين
- 70-79: كفء - جيد لكن يحتاج صقل
- 60-69: متطور - فجوات كبيرة لكن يُظهر إمكانية
- أقل من 60: يحتاج عمل - المهارات الأساسية تحتاج تطوير

كن محدداً مع الأدلة من نص المحادثة الفعلي. لا تعطِ درجات عالية بدون مبرر.`;
  }

  // English system prompt (original)
  private buildEnglishSystemPrompt(scenarioType: string, difficulty: string, clientPersona: Record<string, unknown>): string {
    return `You are an expert real estate sales trainer evaluating a trainee's performance in a simulated client interaction.

SCENARIO: ${scenarioType.replace(/_/g, ' ')}
DIFFICULTY: ${difficulty}
CLIENT PERSONALITY: ${(clientPersona as { personality?: string }).personality || 'neutral'}

Evaluate the trainee's performance based on this conversation transcript. Be fair but rigorous.

You must respond with ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "overallScore": <number 0-100>,
  "summary": "<2-3 sentence performance summary>",
  "skillScores": {
    "communication": {
      "score": <number 0-100>,
      "reasoning": "<why this score>",
      "evidence": ["<specific quote or behavior from transcript>"],
      "tips": ["<specific improvement tip>"]
    },
    "negotiation": {
      "score": <number 0-100>,
      "reasoning": "<why this score>",
      "evidence": ["<specific quote or behavior>"],
      "tips": ["<improvement tip>"]
    },
    "objectionHandling": {
      "score": <number 0-100>,
      "reasoning": "<why this score>",
      "evidence": ["<specific quote or behavior>"],
      "tips": ["<improvement tip>"]
    },
    "relationshipBuilding": {
      "score": <number 0-100>,
      "reasoning": "<why this score>",
      "evidence": ["<specific quote or behavior>"],
      "tips": ["<improvement tip>"]
    },
    "productKnowledge": {
      "score": <number 0-100>,
      "reasoning": "<why this score>",
      "evidence": ["<specific quote or behavior>"],
      "tips": ["<improvement tip>"]
    },
    "closingTechnique": {
      "score": <number 0-100>,
      "reasoning": "<why this score>",
      "evidence": ["<specific quote or behavior>"],
      "tips": ["<improvement tip>"]
    }
  },
  "highlights": ["<what trainee did well - specific>", "<another strength>"],
  "improvementAreas": ["<what needs work - specific>", "<another area>"],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "category": "technique|knowledge|mindset",
      "title": "<short title>",
      "description": "<what to improve>",
      "actionableSteps": ["<step 1>", "<step 2>"]
    }
  ]
}

IMPORTANT SCORING GUIDELINES:
- 90-100: Exceptional - trainee demonstrated mastery
- 80-89: Strong - minor areas for improvement
- 70-79: Competent - solid but needs refinement
- 60-69: Developing - significant gaps but shows potential
- Below 60: Needs work - fundamental skills need development

Be specific with evidence from the actual transcript. Do not give high scores without justification.`;
  }
}
