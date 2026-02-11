/**
 * Teacher Voice Configuration for ElevenLabs TTS
 * Each teacher has a unique voice ID and personality traits
 */

export interface TeacherVoiceConfig {
  voiceId: string;
  personality: 'professional' | 'friendly' | 'wise' | 'challenging';
  welcomeMessage: {
    ar: string;
    en: string;
  };
}

export const TEACHER_VOICES: Record<string, TeacherVoiceConfig> = {
  // Welcome bot for new trainees (no assessment yet)
  sara: {
    voiceId: 'XrExE9yKIg1WjnnlVkGX', // Arabic female - warm, welcoming Saudi voice
    personality: 'friendly',
    welcomeMessage: {
      ar: 'يا هلا والله! أنا سارة، مرشدتك للبداية. سعيدة إنك معانا! خلينا نبدأ رحلتك ونكتشف مستواك عشان نختارلك أفضل معلم.',
      en: "Hello and welcome! I'm Sara, your onboarding guide. So happy you're here! Let's start your journey and discover your level to match you with the best teacher.",
    },
  },
  ahmed: {
    voiceId: 'onwK4e9ZLuTAKqWW03F9', // Arabic male - friendly tone
    personality: 'friendly',
    welcomeMessage: {
      ar: 'أهلاً وسهلاً! أنا أحمد، مستشارك العقاري الودود. كيف أقدر أساعدك اليوم؟',
      en: "Welcome! I'm Ahmed, your friendly real estate advisor. How can I help you today?",
    },
  },
  noura: {
    voiceId: 'meAbY2VpJkt1q46qk56T', // Hoda - Egyptian Arabic female voice (clear feminine)
    personality: 'challenging',
    welcomeMessage: {
      ar: 'السلام عليكم! أنا نورة، معلمتك الخاصة في عالم العقارات. أنا هنا أساعدك وأطور مهاراتك خطوة بخطوة. يلا نبدأ رحلتنا!',
      en: "Peace be upon you! I'm Noura, your personal real estate teacher. I'm here to help and develop your skills step by step. Let's start our journey!",
    },
  },
  anas: {
    voiceId: 'pFZP5JQG7iQjIQuC4Bku', // Arabic male - professional
    personality: 'professional',
    welcomeMessage: {
      ar: 'أهلاً بك. أنا أنس، مستشارك المتخصص في السوق العقاري السعودي. تفضل بسؤالك.',
      en: "Welcome. I'm Anas, your specialist in the Saudi real estate market. Please ask your question.",
    },
  },
  abdullah: {
    voiceId: 'onwK4e9ZLuTAKqWW03F9', // Arabic male - wise tone
    personality: 'wise',
    welcomeMessage: {
      ar: 'السلام عليكم. أنا عبدالله، ومعي خبرة طويلة في المجال العقاري. شاركني استفسارك.',
      en: "Peace be upon you. I'm Abdullah, with extensive experience in real estate. Share your inquiry with me.",
    },
  },
};

/**
 * Get voice configuration for a teacher
 * Falls back to Ahmed if teacher not found
 */
export function getTeacherVoice(teacherName: string): TeacherVoiceConfig {
  const normalizedName = teacherName.toLowerCase();
  return TEACHER_VOICES[normalizedName] || TEACHER_VOICES.ahmed;
}

/**
 * Get just the voice ID for a teacher
 */
export function getTeacherVoiceId(teacherName: string): string {
  return getTeacherVoice(teacherName).voiceId;
}

/**
 * Get welcome message for a teacher
 */
export function getTeacherWelcome(teacherName: string, language: 'ar' | 'en'): string {
  const config = getTeacherVoice(teacherName);
  return config.welcomeMessage[language];
}
