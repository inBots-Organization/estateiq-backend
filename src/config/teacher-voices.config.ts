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
  ahmed: {
    voiceId: 'onwK4e9ZLuTAKqWW03F9', // Arabic male - friendly tone
    personality: 'friendly',
    welcomeMessage: {
      ar: 'أهلاً وسهلاً! أنا أحمد، مستشارك العقاري الودود. كيف أقدر أساعدك اليوم؟',
      en: "Welcome! I'm Ahmed, your friendly real estate advisor. How can I help you today?",
    },
  },
  noura: {
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Female voice - Sarah (expressive)
    personality: 'challenging',
    welcomeMessage: {
      ar: 'مرحباً! أنا نورة، وأنا هنا عشان أتحداك وأطور مهاراتك. مستعد للتحدي؟',
      en: "Hello! I'm Noura, and I'm here to challenge and develop your skills. Ready for the challenge?",
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
