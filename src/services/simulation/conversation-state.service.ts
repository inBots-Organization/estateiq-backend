import { injectable, inject } from 'tsyringe';
import { Sentiment } from '../../types/enums';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import {
  IConversationStateService,
  ConversationAnalysis,
} from '../interfaces/conversation-state.interface';
import {
  ConversationState,
  ConversationTurn,
  ClientPersona,
} from '../interfaces/objection-handling.interface';

@injectable()
export class ConversationStateService implements IConversationStateService {
  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {}

  async analyzeMessage(
    message: string,
    conversationHistory: ConversationTurn[],
    persona: ClientPersona
  ): Promise<ConversationAnalysis> {
    const prompt = this.buildAnalysisPrompt(message, conversationHistory);

    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 300,
      temperature: 0.3,
      responseFormat: 'json',
    });

    try {
      const analysis = JSON.parse(response);
      return {
        currentState: this.mapToConversationState(analysis.state),
        sentiment: this.mapToSentiment(analysis.sentiment),
        detectedIntent: analysis.intent || null,
        suggestedHints: analysis.hints || [],
      };
    } catch {
      return this.getDefaultAnalysis(conversationHistory);
    }
  }

  determineNextState(
    currentState: ConversationState,
    analysis: ConversationAnalysis,
    turnNumber: number
  ): ConversationState {
    // State transitions based on conversation progress
    const stateProgressions: Record<ConversationState, ConversationState[]> = {
      opening: ['opening', 'discovery'],
      discovery: ['discovery', 'presenting'],
      presenting: ['presenting', 'negotiating'],
      negotiating: ['negotiating', 'closing'],
      closing: ['closing', 'ended'],
      ended: ['ended'],
    };

    const possibleStates = stateProgressions[currentState];

    // Progress faster with positive sentiment
    if (analysis.sentiment === 'positive' && turnNumber > 2) {
      const nextIndex = Math.min(1, possibleStates.length - 1);
      return possibleStates[nextIndex];
    }

    // Stay in current state with negative sentiment
    if (analysis.sentiment === 'negative') {
      return currentState;
    }

    // Natural progression based on turn number
    if (turnNumber > 4 && currentState === 'opening') return 'discovery';
    if (turnNumber > 8 && currentState === 'discovery') return 'presenting';
    if (turnNumber > 12 && currentState === 'presenting') return 'negotiating';
    if (turnNumber > 16 && currentState === 'negotiating') return 'closing';

    return currentState;
  }

  async generateClientResponse(
    traineeMessage: string,
    persona: ClientPersona,
    conversationHistory: ConversationTurn[],
    state: ConversationState,
    injectedObjection?: string
  ): Promise<string> {
    const prompt = this.buildResponsePrompt(
      traineeMessage,
      persona,
      conversationHistory,
      state,
      injectedObjection
    );

    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 200,
      temperature: 0.7,
      systemPrompt: this.getPersonaSystemPrompt(persona),
    });

    return response.trim();
  }

  private buildAnalysisPrompt(message: string, history: ConversationTurn[]): string {
    const recentHistory = history.slice(-4);

    return `
حلل رسالة المحادثة العقارية هذه.

المحادثة الأخيرة:
${recentHistory.map(t => `${t.speaker === 'trainee' ? 'المتدرب' : 'العميل'}: ${t.message}`).join('\n')}

آخر رسالة من المتدرب: "${message}"

أرجع JSON:
{
  "state": "واحد من: opening, discovery, presenting, negotiating, closing, ended",
  "sentiment": "positive أو neutral أو negative",
  "intent": "وش يحاول المتدرب يسوي",
  "hints": ["نصائح مفيدة للمتدرب باللهجة السعودية"]
}`;
  }

  private buildResponsePrompt(
    traineeMessage: string,
    persona: ClientPersona,
    history: ConversationTurn[],
    state: ConversationState,
    injectedObjection?: string
  ): string {
    const recentHistory = history.slice(-6);

    const stateArabic: Record<ConversationState, string> = {
      opening: 'الافتتاحية - تعارف أولي',
      discovery: 'الاكتشاف - سؤال عن التفاصيل',
      presenting: 'العرض - مناقشة الخيارات',
      negotiating: 'التفاوض - مناقشة السعر والشروط',
      closing: 'الإغلاق - اتخاذ القرار',
      ended: 'انتهت',
    };

    const stateGuidance: Record<ConversationState, string> = {
      opening: 'اسأل أسئلة عامة عن العقار والمنطقة، عرّف عن نفسك واحتياجاتك',
      discovery: 'اسأل عن التفاصيل الدقيقة: المساحة، عدد الغرف، المرافق، الجيران',
      presenting: 'ناقش الخيارات المتاحة، قارن بين العقارات، أبدِ رأيك',
      negotiating: 'تفاوض على السعر، اطلب تخفيض أو مزايا إضافية، ناقش طريقة الدفع',
      closing: 'قرر إذا تبي تمشي بالصفقة أو لا، اطلب وقت للتفكير أو اتخذ قرار',
      ended: 'ودّع الوسيط',
    };

    let prompt = `أنت تلعب دور عميل عقاري سعودي حقيقي في محادثة تدريبية.

معلوماتك:
- الاسم: ${persona.name}
- الشخصية: ${this.getArabicPersonalityDesc(persona.personality)}
- الخلفية: ${persona.background}
- الميزانية: ${persona.budget}
- ما تبحث عنه: ${persona.motivations.slice(0, 2).join('، ')}

مرحلة المحادثة الحالية: ${stateArabic[state]}
توجيه لهذه المرحلة: ${stateGuidance[state]}

سجل المحادثة:
${recentHistory.map(t => `[${t.speaker === 'trainee' ? 'الوسيط العقاري' : 'أنت (العميل)'}]: ${t.message}`).join('\n')}

---
الوسيط العقاري قال الآن: "${traineeMessage}"
---
`;

    if (injectedObjection) {
      prompt += `
⚠️ مهم: أثناء ردك، أضف هذا القلق أو الاعتراض بشكل طبيعي: "${injectedObjection}"
`;
    }

    prompt += `
اكتب ردك كعميل. التزم بهذه القواعد:

1. استخدم اللهجة السعودية العامية فقط (لا فصحى)
2. رد بجملة واحدة إلى ثلاث جمل فقط - كن مختصراً
3. لا تكرر ما قلته سابقاً في المحادثة
4. تصرف حسب شخصيتك (${this.getArabicPersonalityDesc(persona.personality)})
5. تفاعل مع ما قاله الوسيط بشكل مباشر
6. لا تبدأ بـ "يا هلا" أو "مرحبا" في كل رد - نوّع في بدايات ردودك

ردك (باللهجة السعودية):`;

    return prompt;
  }

  private getArabicPersonalityDesc(personality: ClientPersona['personality']): string {
    const descriptions: Record<ClientPersona['personality'], string> = {
      friendly: 'ودود ومتعاون',
      skeptical: 'متشكك وحذر',
      demanding: 'متطلب وصارم',
      indecisive: 'متردد وغير حاسم',
      analytical: 'تحليلي ودقيق',
    };
    return descriptions[personality] || 'ودود';
  }

  private getPersonaSystemPrompt(persona: ClientPersona): string {
    const personalityGuides: Record<ClientPersona['personality'], string> = {
      friendly: 'كن ودود ومتحمس. استجب بإيجابية للعروض الجيدة. سهّل الأمور على الوسيط.',
      skeptical: 'شكك في الادعاءات. اطلب إثباتات. قل "متأكد؟" و "كيف أعرف؟". لا تصدق بسهولة.',
      demanding: 'كن صعب الإرضاء. عبّر عن عدم رضاك. اطلب الأفضل دائماً. استخدم "ما أبي" و "هذا مو كافي".',
      indecisive: 'تردد كثيراً. قل "مدري" و "خليني أفكر". اسأل "فيه خيارات ثانية؟". صعّب القرار.',
      analytical: 'اطلب أرقام وبيانات. قل "كم بالضبط؟". قارن بالسوق. اسأل عن التفاصيل الدقيقة.',
    };

    return `أنت ممثل محترف تلعب دور عميل عقاري سعودي اسمه "${persona.name}".

شخصيتك: ${this.getArabicPersonalityDesc(persona.personality)}
${personalityGuides[persona.personality]}

خلفيتك: ${persona.background}

مخاوف خفية في ذهنك: ${persona.hiddenConcerns.join(' | ')}

===== قواعد صارمة =====
1. تحدث فقط باللهجة السعودية العامية (لا فصحى أبداً)
2. كلامك قصير ومباشر (جملة إلى 3 جمل)
3. نوّع في بدايات ردودك - لا تبدأ دائماً بنفس الكلمة
4. تفاعل مع كلام الوسيط مباشرة
5. لا تكرر نفس الكلام أو الأسئلة

كلمات سعودية تستخدمها: طيب، والله، يعني، إن شاء الله، أوكي، كيذا، وش، ليش، أبي، مو، شوي`;
  }

  private mapToConversationState(state: string): ConversationState {
    const validStates: ConversationState[] = ['opening', 'discovery', 'presenting', 'negotiating', 'closing', 'ended'];
    const normalized = state?.toLowerCase() as ConversationState;
    return validStates.includes(normalized) ? normalized : 'discovery';
  }

  private mapToSentiment(sentiment: string): Sentiment {
    const normalized = sentiment?.toLowerCase();
    if (normalized === 'positive') return 'positive';
    if (normalized === 'negative') return 'negative';
    return 'neutral';
  }

  private getDefaultAnalysis(history: ConversationTurn[]): ConversationAnalysis {
    const turnCount = history.length;

    let state: ConversationState = 'opening';
    if (turnCount > 4) state = 'discovery';
    if (turnCount > 8) state = 'presenting';
    if (turnCount > 12) state = 'negotiating';

    return {
      currentState: state,
      sentiment: 'neutral',
      detectedIntent: null,
      suggestedHints: [],
    };
  }
}
