import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { BrainService } from '../brain/brain.service';
import { FallbackLLMProvider } from '../../providers/llm/fallback.provider';
import {
  IEvaluatorService,
  EvaluatorInput,
  EvaluatorReport,
  TeacherAssignment,
  AITeacherName,
} from '../interfaces/evaluator.interface';

const TEACHER_PROFILES: Record<AITeacherName, Omit<TeacherAssignment, 'assignmentReason'>> = {
  ahmed: {
    teacherName: 'ahmed',
    teacherDisplayName: { ar: 'أحمد', en: 'Ahmed' },
    teacherDescription: {
      ar: 'معلم الأساسيات - متخصص في بناء المهارات الأساسية للمبتدئين',
      en: 'Fundamentals Teacher - Specializes in building core skills for beginners',
    },
  },
  noura: {
    teacherName: 'noura',
    teacherDisplayName: { ar: 'نورة', en: 'Noura' },
    teacherDescription: {
      ar: 'معلمة الاستراتيجية - متخصصة في تطوير التقنيات المتقدمة والاستراتيجيات',
      en: 'Strategy Teacher - Specializes in developing advanced techniques and strategies',
    },
  },
  anas: {
    teacherName: 'anas',
    teacherDisplayName: { ar: 'أنس', en: 'Anas' },
    teacherDescription: {
      ar: 'معلم المتقدمين - متخصص في صقل مهارات الخبراء والتميز المهني',
      en: 'Advanced Teacher - Specializes in refining expert skills and professional excellence',
    },
  },
};

@injectable()
export class EvaluatorService implements IEvaluatorService {
  private fallbackProvider: FallbackLLMProvider;

  constructor(
    @inject('PrismaClient') private prisma: PrismaClient,
    @inject(BrainService) private brainService: BrainService
  ) {
    this.fallbackProvider = new FallbackLLMProvider();
  }

  async evaluate(input: EvaluatorInput): Promise<EvaluatorReport> {
    console.log(`[EvaluatorService] Starting evaluation for trainee ${input.traineeId}`);

    // Mark status as processing
    await this.prisma.dailySkillReport.update({
      where: { id: input.dailySkillReportId },
      data: { evaluatorStatus: 'processing' },
    });

    try {
      // 1. Fetch last 5 reports for history context
      const historyReports = await this.prisma.dailySkillReport.findMany({
        where: { traineeId: input.traineeId },
        orderBy: { date: 'desc' },
        take: 5,
      });

      // 2. Build brain query from weaknesses + knowledge gaps
      let brainContext = '';
      let brainContextUsed = false;
      if (input.organizationId && (input.weaknesses.length > 0 || input.knowledgeGaps.length > 0)) {
        try {
          const brainQuery = [
            ...input.weaknesses.map(w => `improving ${w} skills`),
            ...input.knowledgeGaps.map(g => `knowledge about ${g}`),
          ].join(', ');

          const brainResult = await this.brainService.queryBrain({
            query: brainQuery,
            organizationId: input.organizationId,
            topK: 3,
            scoreThreshold: 0.3,
          });

          if (brainResult.results.length > 0) {
            brainContext = brainResult.results
              .map(r => `[${r.documentTitle}]: ${r.content}`)
              .join('\n\n');
            brainContextUsed = true;
          }
        } catch (err) {
          console.warn('[EvaluatorService] Brain query failed (non-fatal):', err);
        }
      }

      // 3. Build history trend
      const historyTrend = historyReports.map(r => ({
        date: r.date,
        score: r.overallScore,
        level: r.level,
      }));

      // 4. Build LLM prompt
      const systemPrompt = `You are Bot 5 - the AI Evaluator for a real estate training platform.
Your job is to analyze a trainee's skill diagnostic results and provide a detailed, bilingual (Arabic/English) evaluation report.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no code blocks, no extra text.

Response JSON format:
{
  "skillAnalyses": [
    {
      "skillName": "communication",
      "score": 65,
      "level": "competent",
      "analysis": { "ar": "...", "en": "..." },
      "improvementTips": [{ "ar": "...", "en": "..." }]
    }
  ],
  "overallNarrative": { "ar": "...", "en": "..." },
  "improvementPlan": {
    "shortTerm": [{ "ar": "...", "en": "..." }],
    "mediumTerm": [{ "ar": "...", "en": "..." }],
    "longTerm": [{ "ar": "...", "en": "..." }]
  }
}

Skill level mapping: 0-20=weak, 21-40=developing, 41-60=competent, 61-80=strong, 81-100=excellent

Provide 1-2 improvement tips per skill. Keep analyses concise but actionable.
The improvement plan should have 2-3 items per timeframe.
shortTerm = 1-2 weeks, mediumTerm = 1-2 months, longTerm = 3+ months.
Write Arabic text in formal Arabic suitable for Saudi professionals.`;

      const userPrompt = `Evaluate this trainee's diagnostic results:

SKILL SCORES:
${Object.entries(input.skillScores).map(([k, v]) => `- ${k}: ${v}/100`).join('\n')}

OVERALL: ${input.overallScore}/100 (${input.level})

STRENGTHS: ${input.strengths.join(', ') || 'None identified'}
WEAKNESSES: ${input.weaknesses.join(', ') || 'None identified'}
KNOWLEDGE GAPS: ${input.knowledgeGaps.join(', ') || 'None identified'}

HISTORY TREND (last 5):
${historyTrend.length > 0 ? historyTrend.map(h => `- ${h.date}: ${h.score}/100 (${h.level})`).join('\n') : 'No previous data'}

${brainContext ? `ORGANIZATION KNOWLEDGE BASE CONTEXT:\n${brainContext}` : ''}

Provide the evaluation JSON.`;

      // 5. Call LLM
      const result = await this.fallbackProvider.completeWithMetadata({
        systemPrompt,
        prompt: userPrompt,
        temperature: 0.4,
        maxTokens: 2000,
        responseFormat: 'json',
      });

      // 6. Parse response
      const parsed = this.parseEvaluatorResponse(result.content);

      // 7. Build teacher assignment
      const teacherAssignment = this.getTeacherForScore(input.overallScore);

      // 8. Assemble full report
      const evaluatorReport: EvaluatorReport = {
        skillAnalyses: parsed.skillAnalyses,
        overallNarrative: parsed.overallNarrative,
        improvementPlan: parsed.improvementPlan,
        teacherAssignment,
        generatedAt: new Date().toISOString(),
        modelUsed: 'fallback-provider',
        brainContextUsed,
      };

      // 9. Store evaluator report on DailySkillReport
      await this.prisma.dailySkillReport.update({
        where: { id: input.dailySkillReportId },
        data: {
          evaluatorReport: JSON.stringify(evaluatorReport),
          evaluatorStatus: 'completed',
        },
      });

      // 10. Update trainee's assigned teacher
      await this.prisma.trainee.update({
        where: { id: input.traineeId },
        data: {
          assignedTeacher: teacherAssignment.teacherName,
          assignedTeacherAt: new Date(),
        },
      });

      console.log(`[EvaluatorService] Evaluation complete for trainee ${input.traineeId} — teacher: ${teacherAssignment.teacherName}`);
      return evaluatorReport;
    } catch (error) {
      console.error('[EvaluatorService] Evaluation failed:', error);

      // Mark as failed
      await this.prisma.dailySkillReport.update({
        where: { id: input.dailySkillReportId },
        data: { evaluatorStatus: 'failed' },
      }).catch(() => { /* ignore update failures */ });

      throw error;
    }
  }

  getTeacherForScore(score: number): TeacherAssignment {
    let teacherName: AITeacherName;
    let reason: { ar: string; en: string };

    if (score <= 40) {
      teacherName = 'ahmed';
      reason = {
        ar: 'بناءً على نتيجتك، ستتعلم الأساسيات مع أحمد لبناء قاعدة قوية',
        en: 'Based on your score, you will learn fundamentals with Ahmed to build a strong foundation',
      };
    } else if (score <= 75) {
      teacherName = 'noura';
      reason = {
        ar: 'بناءً على نتيجتك، ستتعلم الاستراتيجيات المتقدمة مع نورة لتطوير مهاراتك',
        en: 'Based on your score, you will learn advanced strategies with Noura to develop your skills',
      };
    } else {
      teacherName = 'anas';
      reason = {
        ar: 'بناءً على نتيجتك المتميزة، ستعمل مع أنس لصقل مهاراتك والوصول للتميز المهني',
        en: 'Based on your excellent score, you will work with Anas to refine your skills and achieve professional excellence',
      };
    }

    return {
      ...TEACHER_PROFILES[teacherName],
      assignmentReason: reason,
    };
  }

  private parseEvaluatorResponse(content: string): {
    skillAnalyses: EvaluatorReport['skillAnalyses'];
    overallNarrative: EvaluatorReport['overallNarrative'];
    improvementPlan: EvaluatorReport['improvementPlan'];
  } {
    try {
      // Clean potential markdown code blocks
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      return {
        skillAnalyses: Array.isArray(parsed.skillAnalyses) ? parsed.skillAnalyses : [],
        overallNarrative: parsed.overallNarrative || { ar: '', en: '' },
        improvementPlan: {
          shortTerm: Array.isArray(parsed.improvementPlan?.shortTerm) ? parsed.improvementPlan.shortTerm : [],
          mediumTerm: Array.isArray(parsed.improvementPlan?.mediumTerm) ? parsed.improvementPlan.mediumTerm : [],
          longTerm: Array.isArray(parsed.improvementPlan?.longTerm) ? parsed.improvementPlan.longTerm : [],
        },
      };
    } catch (error) {
      console.error('[EvaluatorService] Failed to parse LLM response:', error);
      return {
        skillAnalyses: [],
        overallNarrative: {
          ar: 'لم يتمكن النظام من إنشاء تقييم مفصل. يرجى المحاولة مرة أخرى.',
          en: 'The system could not generate a detailed evaluation. Please try again.',
        },
        improvementPlan: { shortTerm: [], mediumTerm: [], longTerm: [] },
      };
    }
  }
}
