import { injectable, inject } from 'tsyringe';
import { SimulationScenarioType, DifficultyLevel } from '../../types/enums';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import { IPersonaGeneratorService, PersonaGenerationContext } from '../interfaces/persona-generator.interface';
import { ClientPersona } from '../interfaces/objection-handling.interface';

@injectable()
export class PersonaGeneratorService implements IPersonaGeneratorService {
  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {}

  async generatePersona(context: PersonaGenerationContext): Promise<ClientPersona> {
    const { scenarioType, difficultyLevel, customConfig } = context;

    // Use fast template-based generation (no LLM call for speed)
    // This reduces startup time from ~5s to ~10ms
    const basePersona = this.getBasePersona(scenarioType, difficultyLevel);

    if (customConfig) {
      return { ...basePersona, ...customConfig };
    }

    // Return base persona immediately for fast startup
    // The persona is already well-crafted with Saudi Arabic content
    return basePersona;
  }

  async generateInitialMessage(persona: ClientPersona, scenarioType: SimulationScenarioType): Promise<string> {
    // Use fast template-based initial messages for quick startup
    // These are pre-written in authentic Saudi Arabic dialect
    const templateMessages = this.getTemplateInitialMessages(scenarioType, persona.personality);
    const selectedTemplate = templateMessages[Math.floor(Math.random() * templateMessages.length)];

    // Replace placeholders with persona data
    return selectedTemplate
      .replace('{name}', persona.name)
      .replace('{budget}', persona.budget)
      .replace('{motivation}', persona.motivations[0] || 'أدور على عقار مناسب');
  }

  private getTemplateInitialMessages(scenarioType: SimulationScenarioType, personality: ClientPersona['personality']): string[] {
    // Pre-written Saudi Arabic initial messages for each scenario type
    const messages: Record<string, Record<string, string[]>> = {
      property_showing: {
        friendly: [
          'السلام عليكم! كيف حالك؟ أنا حجزت موعد معاكم لمعاينة العقار. الله يعطيك العافية على وقتك.',
          'هلا والله! أنا اللي كلمتكم أمس عن الشقة. متحمس أشوفها إن شاء الله.',
          'مرحبا، الله يسعدك. جيت أشوف العقار اللي عندكم. وش تقدر تقولي عنه؟',
        ],
        skeptical: [
          'السلام عليكم. جيت أشوف العقار. بس خلني أقولك، شفت عقارات كثير وما لقيت اللي يناسبني.',
          'مرحبا. أبي أشوف العقار بنفسي. الصور ما تكفي عشان أحكم.',
          'هلا. جيت للمعاينة. أتمنى يكون العقار زي ما هو معروض وما فيه مفاجآت.',
        ],
        demanding: [
          'السلام عليكم. وقتي ضيق فخلنا ندخل بالموضوع مباشرة. وين العقار؟',
          'مرحبا. أبي أشوف كل شي بالتفصيل. عندي معايير عالية وما أقبل أقل منها.',
          'هلا. خلنا نشوف العقار. وإذا عجبني، نتفاوض على السعر بعدين.',
        ],
        indecisive: [
          'السلام عليكم. جيت أشوف العقار... بس لسه ما قررت بالضبط وش أبي.',
          'مرحبا. أنا أدور على شي مناسب، بس المشكلة عندي خيارات كثير وما أدري أختار وش.',
          'هلا. حبيت أشوف العقار. زوجتي تبي شي وأنا أبي شي ثاني، فمحتاج مساعدتك.',
        ],
        analytical: [
          'السلام عليكم. جيت للمعاينة. عندي أسئلة كثير عن المساحة والموقع والخدمات.',
          'مرحبا. أبي أفهم كل التفاصيل التقنية للعقار قبل ما أقرر.',
          'هلا. سويت بحث عن المنطقة وعندي استفسارات محددة. نبدأ؟',
        ],
      },
      price_negotiation: {
        friendly: [
          'السلام عليكم! العقار عجبني صراحة، بس السعر شوي فوق ميزانيتي. نقدر نتفاهم؟',
          'هلا والله! المكان حلو ماشاء الله. بس حبيت نتكلم عن السعر شوي.',
          'مرحبا، الله يعطيك العافية. أنا مهتم جداً بس أحتاج نناقش الشروط.',
        ],
        skeptical: [
          'السلام عليكم. السعر المطلوب أشوفه مرتفع مقارنة بالسوق. وش المبرر؟',
          'مرحبا. شفت عقارات مشابهة بأسعار أقل. ليش هذا غالي؟',
          'هلا. قبل نتكلم، أبي أفهم كيف وصلتوا لهذا السعر.',
        ],
        demanding: [
          'السلام عليكم. السعر لازم ينزل. ما عندي وقت لمفاوضات طويلة.',
          'مرحبا. أعطني أفضل سعر عندك مباشرة. ما أحب اللف والدوران.',
          'هلا. أنا جاد بالشراء بس بسعر معقول. وش أقل شي تقدر تسوي؟',
        ],
        indecisive: [
          'السلام عليكم. العقار حلو بس ما أدري السعر مناسب ولا لا...',
          'مرحبا. أنا محتار. السعر يناسب ميزانيتي بس قلقان أندم.',
          'هلا. نقدر نتكلم عن السعر؟ يمكن لو نزل شوي أقدر أقرر.',
        ],
        analytical: [
          'السلام عليكم. سويت مقارنة سوقية وعندي ملاحظات على التسعير. نناقشها؟',
          'مرحبا. بناءً على تحليلي للسوق، أشوف السعر يحتاج تعديل.',
          'هلا. عندي أرقام ومقارنات. خلنا نشوف إذا السعر منطقي.',
        ],
      },
      objection_handling: {
        friendly: [
          'السلام عليكم. أنا مهتم بالعقار بس عندي بعض المخاوف أبي أناقشها معك.',
          'هلا والله. قبل ما أقرر، فيه نقاط محتاج أفهمها أكثر.',
          'مرحبا، الله يسعدك. العقار حلو بس عندي تساؤلات مهمة.',
        ],
        skeptical: [
          'السلام عليكم. صراحة عندي شكوك كثيرة. تقدر تطمني؟',
          'مرحبا. قبل أي شي، لازم تجاوب على أسئلتي بصراحة.',
          'هلا. سمعت قصص عن وسطاء ما يوفون بكلامهم. إنت مختلف؟',
        ],
        demanding: [
          'السلام عليكم. عندي مشاكل مع هذا العرض وأبي حلول فورية.',
          'مرحبا. ما راح أقبل أي شي أقل من الكمال. عندي اعتراضات.',
          'هلا. فيه أشياء ما تعجبني وأبي تحلها قبل نكمل.',
        ],
        indecisive: [
          'السلام عليكم. أنا مهتم بس قلقان من أشياء كثير. ما أدري أقرر كيف.',
          'مرحبا. كل ما أفكر ألقى مشكلة جديدة. ساعدني أفهم.',
          'هلا. عندي تردد كبير. الموضوع كبير وأخاف أغلط.',
        ],
        analytical: [
          'السلام عليكم. بعد التحليل، لقيت نقاط ضعف محتاج تفسير لها.',
          'مرحبا. عندي قائمة بالمخاوف مرتبة حسب الأهمية. نبدأ؟',
          'هلا. البيانات اللي جمعتها تثير تساؤلات. خلنا نناقشها.',
        ],
      },
      first_contact: {
        friendly: [
          'السلام عليكم! شفت إعلانكم وحبيت أتواصل. أدور على عقار مناسب.',
          'هلا والله! صديقي نصحني فيكم. قال خدمتكم ممتازة.',
          'مرحبا، الله يعطيك العافية. أول مرة أتعامل معكم وأتمنى نتفاهم.',
        ],
        skeptical: [
          'السلام عليكم. أدور على وسيط موثوق. كيف أتأكد إنكم الصح؟',
          'مرحبا. قبل ما نبدأ، أبي أعرف أكثر عن شركتكم وسمعتكم.',
          'هلا. جربت وسطاء قبل وما كانت التجربة حلوة. وش يميزكم؟',
        ],
        demanding: [
          'السلام عليكم. أبي وسيط يفهم احتياجاتي ويشتغل بسرعة. تقدر؟',
          'مرحبا. ما عندي وقت أضيعه. عندك عقارات تناسب معاييري؟',
          'هلا. أبي أفضل خدمة ممكنة. الميزانية مفتوحة للصح.',
        ],
        indecisive: [
          'السلام عليكم. أفكر أشتري عقار بس ما أدري من وين أبدأ.',
          'مرحبا. أنا جديد بالموضوع ومحتاج توجيه. تقدر تساعدني؟',
          'هلا. لسه ما قررت إذا الوقت مناسب للشراء. وش رأيك؟',
        ],
        analytical: [
          'السلام عليكم. أبي أفهم السوق قبل ما أبدأ. عندك تحليلات؟',
          'مرحبا. أحتاج بيانات عن المنطقة والأسعار والتوقعات.',
          'هلا. أبي نتكلم بالأرقام والحقائق. وش الفرص المتاحة؟',
        ],
      },
      closing_deal: {
        friendly: [
          'السلام عليكم! قررت أشتري العقار. خلنا نتكلم عن الخطوات الجاية.',
          'هلا والله! الحمدلله اقتنعت. وش المطلوب مني عشان نتمم؟',
          'مرحبا، الله يسعدك. جاهز للشراء إن شاء الله. نبدأ؟',
        ],
        skeptical: [
          'السلام عليكم. قررت أمشي بس أبي كل شي مكتوب وواضح.',
          'مرحبا. موافق على العرض بس عندي شروط قبل التوقيع.',
          'هلا. قبل ما نتمم، لازم أتأكد من كل التفاصيل القانونية.',
        ],
        demanding: [
          'السلام عليكم. جاهز أوقع بس أبي أفضل شروط ممكنة.',
          'مرحبا. الصفقة ماشية بس أبي تحسينات على العرض.',
          'هلا. خلنا ننهي الموضوع اليوم. وش أفضل شي تقدر تسوي؟',
        ],
        indecisive: [
          'السلام عليكم. أظن جاهز أقرر... بس عندي تردد بسيط.',
          'مرحبا. وصلت لقرار بس أبي طمأنة أخيرة قبل التوقيع.',
          'هلا. ٩٠٪ مقتنع. ساعدني أوصل ١٠٠٪.',
        ],
        analytical: [
          'السلام عليكم. راجعت كل الأرقام ومستعد للمرحلة الأخيرة.',
          'مرحبا. التحليل يقول هذي صفقة جيدة. خلنا نتمم.',
          'هلا. عندي قائمة بالنقاط النهائية قبل التوقيع.',
        ],
      },
      difficult_client: {
        friendly: [
          'السلام عليكم. أنا عادة صعب أرضى، بس خلنا نشوف وش عندك.',
          'هلا والله. الناس يقولون أنا صعب، بس أنا بس أبي الأفضل.',
          'مرحبا. معاييري عالية بس إذا لقيت الصح، أنا كريم.',
        ],
        skeptical: [
          'السلام عليكم. ما أثق بأحد بسهولة. لازم تثبت نفسك.',
          'مرحبا. كل الوسطاء يقولون نفس الكلام. وش يخليك مختلف؟',
          'هلا. جربت كثير وكلهم خيبوا أملي. أنت بتكون مختلف؟',
        ],
        demanding: [
          'السلام عليكم. وقتي ثمين وتوقعاتي عالية. لا تضيع وقتي.',
          'مرحبا. أبي أفضل عقار بأفضل سعر بأسرع وقت. ممكن؟',
          'هلا. ما أقبل أقل من الممتاز. إذا ما تقدر، قول من الحين.',
        ],
        indecisive: [
          'السلام عليكم. ما أدري بالضبط وش أبي بس أعرف لما أشوفه.',
          'مرحبا. عندي معايير كثير ومتناقضة أحياناً. صعب ترضيني.',
          'هلا. غيرت رأيي مرات كثير. أتمنى هالمرة ألقى الصح.',
        ],
        analytical: [
          'السلام عليكم. عندي معايير دقيقة جداً وما أتنازل عنها.',
          'مرحبا. راح أحلل كل شي بالتفصيل. استعد لأسئلة كثيرة.',
          'هلا. البيانات والأرقام هي اللي تقنعني، مو الكلام الحلو.',
        ],
      },
    };

    // Fallback to property_showing if scenario not found
    const scenarioMessages = messages[scenarioType] || messages['property_showing'];
    return scenarioMessages[personality] || scenarioMessages['friendly'];
  }

  getScenarioContext(scenarioType: SimulationScenarioType): string {
    // Saudi Arabic scenario contexts
    const contexts: Record<string, string> = {
      property_showing: 'تقابل وسيط عقاري لمعاينة عقار. حجزت موعد لمشاهدة عقار لفت انتباهك على الإنترنت.',
      price_negotiation: 'وجدت عقار عجبك، لكن السعر فوق ميزانيتك. تقابل الوسيط لمناقشة الشروط والتفاوض على السعر.',
      objection_handling: 'مهتم بعقار لكن عندك عدة مخاوف وتحفظات تحتاج تُعالج قبل ما تقرر.',
      // New scenario types
      first_contact: 'هذه أول مرة تتعامل مع هذا الوسيط العقاري. تواصلوا معك عن فرصة عقارية.',
      closing_deal: 'مهتم جداً بالعقار ومستعد تناقش الشروط النهائية وتقدم عرض شراء أو إيجار.',
      relationship_building: 'تبني علاقة جديدة مع وسيط عقاري. تبحث عن شخص تثق فيه لمساعدتك في قراراتك العقارية.',
      difficult_client: 'عميل صعب المراس، لديه توقعات عالية جداً ويتطلب خدمة استثنائية.',
      // Legacy types (keep for backwards compatibility)
      closing: 'مهتم جداً بالعقار ومستعد تناقش الشروط النهائية وتقدم عرض شراء أو إيجار.',
      cold_call: 'هذه أول مرة تتعامل مع هذا الوسيط العقاري. تواصلوا معك عن فرصة عقارية.',
      follow_up: 'كان عندك محادثة سابقة مع هذا الوسيط وهو يتابع معك. لا زلت تفكر في خياراتك.',
    };

    return contexts[scenarioType] || contexts.property_showing;
  }

  getScenarioTips(scenarioType: SimulationScenarioType): string[] {
    // Saudi Arabic tips for the trainee
    const tips: Record<string, string[]> = {
      property_showing: [
        'استمع جيداً لفهم تفضيلات العميل',
        'أبرز المميزات اللي تناسب احتياجاته',
        'كن مستعد للإجابة على الأسئلة التفصيلية',
        'انتبه لردود فعله على جوانب العقار المختلفة',
      ],
      price_negotiation: [
        'افهم حدود ميزانية العميل',
        'ركز على القيمة مش بس السعر',
        'جهز بيانات المقارنة السوقية',
        'اعرف حدود التفاوض مسبقاً',
      ],
      objection_handling: [
        'استمع للنهاية قبل ما ترد',
        'اعترف بالمخاوف قبل ما تعالجها',
        'استخدم أمثلة وبيانات محددة',
        'اسأل أسئلة توضيحية لفهم المشكلة الحقيقية',
      ],
      // New scenario types
      first_contact: [
        'اعمل انطباع أول قوي بسرعة',
        'اسأل أسئلة مفتوحة عن احتياجاته',
        'احترم وقته',
        'حدد الخطوات القادمة إذا أبدى اهتمام',
      ],
      closing_deal: [
        'لخص الفوائد الرئيسية اللي أبدى اهتمامه فيها',
        'عالج أي مخاوف متبقية مباشرة',
        'وضح الخطوات القادمة في العملية',
        'اخلق إحساس بالضرورة بدون ما تضغط',
      ],
      relationship_building: [
        'أظهر اهتمام حقيقي بالعميل كإنسان',
        'اسأل عن عائلته وأهدافه المستقبلية',
        'شارك خبراتك ومعرفتك بالسوق',
        'كن صادق وشفاف في تعاملك',
      ],
      difficult_client: [
        'ابق هادئ ومحترف مهما كان الضغط',
        'استمع للشكاوى بدون مقاطعة',
        'ركز على إيجاد حلول عملية',
        'لا تأخذ الانتقادات بشكل شخصي',
      ],
      // Legacy types (keep for backwards compatibility)
      closing: [
        'لخص الفوائد الرئيسية اللي أبدى اهتمامه فيها',
        'عالج أي مخاوف متبقية مباشرة',
        'وضح الخطوات القادمة في العملية',
        'اخلق إحساس بالضرورة بدون ما تضغط',
      ],
      cold_call: [
        'اعمل انطباع أول قوي بسرعة',
        'اسأل أسئلة مفتوحة عن احتياجاته',
        'احترم وقته',
        'حدد الخطوات القادمة إذا أبدى اهتمام',
      ],
      follow_up: [
        'أشر للمحادثات السابقة',
        'قدم معلومات جديدة مفيدة',
        'كن مثابر بدون ما تكون مزعج',
        'استمع لأي تغييرات في وضعه',
      ],
    };

    return tips[scenarioType] || tips.property_showing;
  }

  private getArabicPersonality(personality: ClientPersona['personality']): string {
    const arabicPersonalities: Record<ClientPersona['personality'], string> = {
      friendly: 'ودود ومتعاون',
      skeptical: 'متشكك وحذر',
      demanding: 'متطلب وصارم',
      indecisive: 'متردد وغير حاسم',
      analytical: 'تحليلي ودقيق',
    };
    return arabicPersonalities[personality] || 'ودود';
  }

  private getBasePersona(scenarioType: SimulationScenarioType, difficulty: DifficultyLevel): ClientPersona {
    const personalities: Record<DifficultyLevel, ClientPersona['personality']> = {
      easy: 'friendly',
      medium: 'analytical',
      hard: 'demanding',
    };

    // Saudi Arabic base personas
    const basePersonas: Partial<Record<SimulationScenarioType, Partial<ClientPersona>>> = {
      cold_call: {
        motivations: ['أبحث عن وسيط موثوق', 'أفهم السوق العقاري', 'أبدأ البحث عن عقار'],
        objections: ['ما أبي ألتزم الحين', 'أبي أقارن بين الوسطاء'],
      },
      price_negotiation: {
        motivations: ['أحصل على أفضل قيمة', 'أبقى ضمن ميزانيتي', 'أضمن صفقة عادلة'],
        objections: ['السعر مرتفع', 'لقيت عقارات مشابهة أرخص', 'قلق من التكاليف المخفية'],
      },
      objection_handling: {
        personality: 'skeptical',
        motivations: ['ما أبي أحد يضحك علي', 'أبي خدمة ممتازة'],
        objections: ['تجارب سيئة سابقة', 'مشاكل ثقة', 'توقعات عالية'],
      },
    };

    const base = basePersonas[scenarioType] || {};

    return {
      name: this.generateSaudiName(),
      background: this.generateArabicBackground(scenarioType),
      personality: base.personality || personalities[difficulty],
      budget: this.generateSaudiBudget(difficulty),
      motivations: base.motivations || ['ألقى العقار المناسب', 'استثمار جيد', 'موقع مريح'],
      objections: base.objections || ['السعر غالي شوي', 'أحتاج وقت أفكر'],
      hiddenConcerns: ['قلقان من اتخاذ قرار خاطئ', 'ما أنا متأكد من التمويل'],
    };
  }

  private buildPersonaPrompt(scenarioType: SimulationScenarioType, difficulty: DifficultyLevel): string {
    const scenarioArabic: Record<string, string> = {
      property_showing: 'عرض عقار',
      price_negotiation: 'تفاوض على السعر',
      objection_handling: 'معالجة الاعتراضات',
      first_contact: 'أول تواصل',
      closing_deal: 'إتمام الصفقة',
      relationship_building: 'بناء العلاقة',
      difficult_client: 'عميل صعب',
      // Legacy
      closing: 'إغلاق الصفقة',
      cold_call: 'اتصال بارد',
      follow_up: 'متابعة',
    };

    const difficultyArabic: Record<DifficultyLevel, string> = {
      easy: 'سهل',
      medium: 'متوسط',
      hard: 'صعب',
    };

    return `
أنشئ شخصية عميل واقعية لسيناريو عقاري: ${scenarioArabic[scenarioType] || scenarioType}
مستوى الصعوبة: ${difficultyArabic[difficulty] || difficulty}

أرجع كائن JSON بالشكل التالي:
{
  "name": "اسم سعودي كامل (مثل: أبو محمد العتيبي)",
  "background": "خلفية مختصرة بجملتين أو ثلاث باللهجة السعودية",
  "personality": "واحد من: friendly, skeptical, demanding, indecisive, analytical",
  "budget": "نطاق الميزانية بالريال السعودي",
  "motivations": ["دافع1 باللهجة السعودية", "دافع2", "دافع3"],
  "objections": ["اعتراض محتمل1", "اعتراض2"],
  "hiddenConcerns": ["قلق خفي1", "قلق خفي2"]
}

اجعل الشخصية واقعية ومناسبة لسيناريو تدريب بمستوى ${difficultyArabic[difficulty]}.
استخدم اللهجة السعودية العامية في جميع النصوص العربية.`;
  }

  private generateSaudiName(): string {
    // Common Saudi first names
    const maleFirstNames = ['محمد', 'عبدالله', 'فهد', 'سعود', 'خالد', 'عبدالرحمن', 'أحمد', 'سلطان', 'ناصر', 'تركي'];
    const femaleFirstNames = ['نورة', 'سارة', 'فاطمة', 'منيرة', 'هند', 'ريم', 'لولوة', 'العنود', 'مها', 'أمل'];
    const familyNames = ['العتيبي', 'القحطاني', 'الدوسري', 'الشمري', 'الغامدي', 'الحربي', 'المطيري', 'السبيعي', 'الزهراني', 'العنزي'];

    // 50% chance for male or female name
    const isMale = Math.random() > 0.5;
    const firstNames = isMale ? maleFirstNames : femaleFirstNames;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const familyName = familyNames[Math.floor(Math.random() * familyNames.length)];

    // Sometimes add "أبو/أم" prefix for more authenticity
    if (isMale && Math.random() > 0.7) {
      const childNames = ['محمد', 'عبدالله', 'فهد', 'سعود'];
      const childName = childNames[Math.floor(Math.random() * childNames.length)];
      return `أبو ${childName} ${familyName}`;
    }

    return `${firstName} ${familyName}`;
  }

  private generateArabicBackground(scenarioType: SimulationScenarioType): string {
    const backgrounds: Record<string, string[]> = {
      property_showing: [
        'أول مرة أشتري بيت، وأدور على منزل عائلي قريب من مدارس زينة.',
        'شاب موظف انتقل للرياض عشان الشغل، ومحتاج سكن بسرعة.',
        'عائلة توسعت ومحتاجين مكان أكبر من الشقة الحالية.',
        'متقاعد أبحث عن شقة هادية في حي راقي.',
      ],
      price_negotiation: [
        'مشتري ذكي وسوّيت بحث كثير عن السوق.',
        'مستثمر أدور على عائد جيد من العقار.',
        'عائلة تبني مستقبلها وهذا أكبر شراء في حياتهم.',
        'رجل أعمال أبحث عن صفقة ممتازة.',
      ],
      objection_handling: [
        'مشتري حذر عنده أسئلة كثيرة ومخاوف.',
        'صاحب خبرة في العقارات ويعرف وش يبي بالضبط.',
        'زوجين عندهم أولويات مختلفة ويحاولون يتفقون.',
        'شخص تعرض لتجربة سيئة مع وسيط قبل كذا.',
      ],
      // New scenario types
      first_contact: [
        'لسه يستكشف فكرة الشراء.',
        'صديقه نصحه بالوسيط هذا.',
        'شاف إعلان على الإنترنت ولفت انتباهه.',
        'يفكر يستثمر في العقار لأول مرة.',
      ],
      closing_deal: [
        'شاف عقارات كثيرة ولقى اللي يناسبه.',
        'جاهز يقدم عرض بس يبي أفضل الشروط.',
        'مشتري متحمس وعنده جدول زمني واضح.',
        'قرر يشتري بس يبي طمأنة أخيرة.',
      ],
      relationship_building: [
        'يدور على وسيط يثق فيه على المدى الطويل.',
        'يبي يفهم السوق قبل ما يلتزم.',
        'عنده استثمارات مستقبلية ويبي يبني علاقة مع وسيط موثوق.',
        'نقل للمدينة جديد ويبحث عن شخص يساعده يتعرف على الأحياء.',
      ],
      difficult_client: [
        'مشتري صعب ومتطلب جداً، عنده توقعات عالية.',
        'مر بتجارب سيئة كثير مع وسطاء وما يثق بسهولة.',
        'رجل أعمال مشغول جداً وما عنده صبر.',
        'عميل يعرف وش يبي بالضبط وما يقبل أقل منه.',
      ],
      // Legacy types
      closing: [
        'شاف عقارات كثيرة ولقى اللي يناسبه.',
        'جاهز يقدم عرض بس يبي أفضل الشروط.',
        'مشتري متحمس وعنده جدول زمني واضح.',
        'قرر يشتري بس يبي طمأنة أخيرة.',
      ],
      cold_call: [
        'لسه يستكشف فكرة الشراء.',
        'صديقه نصحه بالوسيط هذا.',
        'شاف إعلان على الإنترنت ولفت انتباهه.',
        'يفكر يستثمر في العقار لأول مرة.',
      ],
      follow_up: [
        'يخطط يشتري خلال ٦-١٢ شهر.',
        'يدور على وسيط يثق فيه على المدى الطويل.',
        'يبي يفهم السوق قبل ما يلتزم.',
        'كان مشغول وما قدر يكمل البحث.',
      ],
    };

    const options = backgrounds[scenarioType] || backgrounds.property_showing;
    return options[Math.floor(Math.random() * options.length)];
  }

  private generateSaudiBudget(difficulty: DifficultyLevel): string {
    // Saudi Riyal budgets
    const ranges: Record<DifficultyLevel, string[]> = {
      easy: ['من ٥٠٠ ألف إلى ٨٠٠ ألف ريال', 'من ٦٠٠ ألف إلى مليون ريال', 'حوالي ٧٠٠ ألف ريال'],
      medium: ['من مليون إلى مليون ونص ريال', 'من ٨٠٠ ألف إلى مليون ومئتين ريال', 'ميزانية مرنة حول المليون'],
      hard: ['من ٣٠٠ إلى ٥٠٠ ألف ريال (محدودة جداً)', 'فوق المليونين (بس يبي تفاوض قوي)', 'مليون ريال بس الشروط لازم ممتازة'],
    };

    const options = ranges[difficulty];
    return options[Math.floor(Math.random() * options.length)];
  }
}
