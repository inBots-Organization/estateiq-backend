import { injectable, inject } from 'tsyringe';
import { ILLMProvider } from '../../providers/llm/llm-provider.interface';
import {
  IAIAssessmentService,
  AssessmentInput,
  AssessmentResult,
  ConversationAssessment,
} from '../interfaces/ai-assessment.interface';
import { ConversationTurn, ClientPersona } from '../interfaces/objection-handling.interface';

@injectable()
export class AIAssessmentService implements IAIAssessmentService {
  constructor(
    @inject('LLMProvider') private llmProvider: ILLMProvider
  ) {}

  async assessLectureCompletion(input: AssessmentInput): Promise<AssessmentResult> {
    const prompt = this.buildLectureAssessmentPrompt(input);

    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 500,
      temperature: 0.3,
      responseFormat: 'json',
    });

    try {
      const result = JSON.parse(response);
      return {
        score: result.score || 70,
        passed: (result.score || 70) >= 70,
        feedback: result.feedback || 'Assessment completed.',
        strengths: result.strengths || [],
        areasForImprovement: result.areasForImprovement || [],
        recommendedReview: result.recommendedReview || [],
      };
    } catch {
      return this.getDefaultAssessmentResult();
    }
  }

  async assessConversation(
    conversationHistory: ConversationTurn[],
    persona: ClientPersona,
    scenarioType: string
  ): Promise<ConversationAssessment> {
    const prompt = this.buildConversationAssessmentPrompt(conversationHistory, persona, scenarioType);

    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 600,
      temperature: 0.3,
      responseFormat: 'json',
    });

    try {
      const result = JSON.parse(response);
      return {
        overallScore: result.overallScore || 70,
        communicationScore: result.communicationScore || 70,
        technicalKnowledgeScore: result.technicalKnowledgeScore || 70,
        problemSolvingScore: result.problemSolvingScore || 70,
        feedback: result.feedback || 'Conversation assessment completed.',
        keyInsights: result.keyInsights || [],
      };
    } catch {
      return this.getDefaultConversationAssessment();
    }
  }

  async generateFeedback(score: number, context: string): Promise<string> {
    const prompt = `
Generate constructive feedback for a real estate trainee who scored ${score}/100 in the following context:
${context}

Provide:
1. A brief summary of their performance
2. One specific strength to maintain
3. One area for improvement
4. An encouraging closing statement

Keep the feedback concise (3-4 sentences total).`;

    const response = await this.llmProvider.complete({
      prompt,
      maxTokens: 200,
      temperature: 0.5,
    });

    return response.trim();
  }

  private buildLectureAssessmentPrompt(input: AssessmentInput): string {
    const responsesText = input.responses
      .map(r => `Question ${r.questionId}: ${r.answer}`)
      .join('\n');

    return `
Assess this trainee's responses to lecture comprehension questions.

Trainee ID: ${input.traineeId}
Lecture ID: ${input.lectureId}

Responses:
${responsesText}

Evaluate the responses and return JSON:
{
  "score": number (0-100),
  "feedback": "Overall assessment feedback",
  "strengths": ["strength1", "strength2"],
  "areasForImprovement": ["area1", "area2"],
  "recommendedReview": ["topic1", "topic2"]
}

Consider:
- Accuracy of the responses
- Depth of understanding shown
- Application of concepts`;
  }

  private buildConversationAssessmentPrompt(
    history: ConversationTurn[],
    persona: ClientPersona,
    scenarioType: string
  ): string {
    const conversationText = history
      .map(t => `${t.speaker === 'trainee' ? 'Agent' : 'Client'}: ${t.message}`)
      .join('\n');

    return `
Assess this real estate sales conversation.

Scenario: ${scenarioType}
Client Persona: ${persona.name} (${persona.personality})
Client Background: ${persona.background}

Conversation:
${conversationText}

Evaluate the trainee's performance and return JSON:
{
  "overallScore": number (0-100),
  "communicationScore": number (0-100),
  "technicalKnowledgeScore": number (0-100),
  "problemSolvingScore": number (0-100),
  "feedback": "Detailed feedback on the conversation",
  "keyInsights": ["insight1", "insight2", "insight3"]
}

Consider:
- How well did they understand the client's needs?
- Did they address concerns effectively?
- Was the communication professional and clear?
- Did they demonstrate product/market knowledge?
- How well did they handle objections?`;
  }

  private getDefaultAssessmentResult(): AssessmentResult {
    return {
      score: 70,
      passed: true,
      feedback: 'Assessment completed. Review the materials to strengthen your understanding.',
      strengths: ['Completed the assessment'],
      areasForImprovement: ['Consider reviewing the lecture materials'],
      recommendedReview: [],
    };
  }

  private getDefaultConversationAssessment(): ConversationAssessment {
    return {
      overallScore: 70,
      communicationScore: 70,
      technicalKnowledgeScore: 70,
      problemSolvingScore: 70,
      feedback: 'Good effort in the conversation. Continue practicing to improve.',
      keyInsights: ['Practice makes perfect'],
    };
  }
}
