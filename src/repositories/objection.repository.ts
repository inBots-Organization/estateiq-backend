import { injectable, inject } from 'tsyringe';
import { PrismaClient } from '@prisma/client';
import { IObjectionRepository, ObjectionTemplateData } from './interfaces/objection.repository.interface';
import { GeneratedObjection, ObjectionCategory as LocalObjectionCategory } from '../services/interfaces/objection-handling.interface';
import { SimulationScenarioType, ObjectionCategory } from '../types/enums';

@injectable()
export class ObjectionRepository implements IObjectionRepository {
  constructor(
    @inject('PrismaClient') private prisma: PrismaClient
  ) {}

  private parseJsonArray(value: string | string[]): string[] {
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  private mapToGeneratedObjection(template: {
    id: string;
    category: string;
    severity: string;
    coreContent: string;
    variations: string;
    triggerConditions: string;
    idealResponses: string;
    commonMistakes: string;
  }): GeneratedObjection {
    return {
      id: template.id,
      category: template.category.toLowerCase() as LocalObjectionCategory,
      severity: template.severity.toLowerCase() as 'soft' | 'moderate' | 'strong',
      coreContent: template.coreContent,
      variations: this.parseJsonArray(template.variations),
      triggerConditions: this.parseJsonArray(template.triggerConditions),
      idealResponses: this.parseJsonArray(template.idealResponses),
      commonMistakes: this.parseJsonArray(template.commonMistakes),
    };
  }

  async getByScenarioType(scenarioType: SimulationScenarioType): Promise<GeneratedObjection[]> {
    const templates = await this.prisma.objectionTemplate.findMany({
      where: {
        scenarioType,
        isActive: true,
      },
    });

    return templates.map(t => this.mapToGeneratedObjection(t));
  }

  async getByCategory(category: ObjectionCategory): Promise<GeneratedObjection[]> {
    const templates = await this.prisma.objectionTemplate.findMany({
      where: {
        category,
        isActive: true,
      },
    });

    return templates.map(t => this.mapToGeneratedObjection(t));
  }

  async getCommonObjections(): Promise<GeneratedObjection[]> {
    const templates = await this.prisma.objectionTemplate.findMany({
      where: { isActive: true },
      take: 20,
    });

    return templates.map(t => this.mapToGeneratedObjection(t));
  }

  async save(data: ObjectionTemplateData): Promise<void> {
    await this.prisma.objectionTemplate.create({
      data: {
        scenarioType: data.scenarioType,
        category: data.category,
        severity: data.severity,
        coreContent: data.coreContent,
        variations: JSON.stringify(data.variations),
        triggerConditions: JSON.stringify(data.triggerConditions),
        idealResponses: JSON.stringify(data.idealResponses),
        commonMistakes: JSON.stringify(data.commonMistakes),
      },
    });
  }

  async seedDefaultObjections(): Promise<void> {
    const count = await this.prisma.objectionTemplate.count();
    if (count > 0) return;

    const defaultObjections: ObjectionTemplateData[] = [
      {
        scenarioType: 'price_negotiation',
        category: 'price',
        severity: 'moderate',
        coreContent: 'The property is above my budget',
        variations: [
          "This is more than I wanted to spend",
          "I was hoping for something in a lower price range",
          "My budget doesn't quite stretch that far",
        ],
        triggerConditions: ['price mentioned', 'budget discussed', 'financials topic'],
        idealResponses: [
          'Acknowledge their budget concerns and explore flexible options',
          'Discuss value proposition relative to comparable properties',
          'Offer to explore financing options or negotiate terms',
        ],
        commonMistakes: [
          'Dismissing their budget concerns',
          'Immediately dropping the price without understanding needs',
          'Being defensive about the pricing',
        ],
      },
      {
        scenarioType: 'property_showing',
        category: 'trust',
        severity: 'soft',
        coreContent: 'I am not sure about this neighborhood',
        variations: [
          "I don't know much about this area",
          "Is this neighborhood safe?",
          "What's the community like here?",
        ],
        triggerConditions: ['neighborhood mentioned', 'location discussed', 'area questions'],
        idealResponses: [
          'Share specific data about crime rates and school ratings',
          'Highlight community amenities and nearby attractions',
          'Offer to provide testimonials from current residents',
        ],
        commonMistakes: [
          'Being vague about the neighborhood',
          'Avoiding the question',
          'Making unsubstantiated claims',
        ],
      },
      {
        scenarioType: 'objection_handling',
        category: 'timing',
        severity: 'moderate',
        coreContent: 'I need more time to think about it',
        variations: [
          "This is a big decision, I can't rush into it",
          "Let me discuss with my spouse first",
          "I want to see a few more properties before deciding",
        ],
        triggerConditions: ['decision pressure', 'commitment asked', 'closing attempted'],
        idealResponses: [
          'Validate their need for time while creating urgency appropriately',
          'Offer to schedule a follow-up call to address any concerns',
          'Provide additional information they can review at their leisure',
        ],
        commonMistakes: [
          'Being pushy or creating false urgency',
          'Not respecting their decision-making process',
          'Failing to set a concrete follow-up time',
        ],
      },
      {
        scenarioType: 'closing',
        category: 'trust',
        severity: 'strong',
        coreContent: 'How do I know you are being honest with me?',
        variations: [
          "I've heard agents say anything to make a sale",
          "Can I trust these market figures you're sharing?",
          "What's in it for you in this deal?",
        ],
        triggerConditions: ['trust questioned', 'credentials challenged', 'honesty doubted'],
        idealResponses: [
          'Be transparent about your commission and motivations',
          'Provide verifiable data and third-party sources',
          'Share testimonials and references from past clients',
        ],
        commonMistakes: [
          'Becoming defensive',
          'Making promises you cannot keep',
          'Avoiding the question of compensation',
        ],
      },
      {
        scenarioType: 'cold_call',
        category: 'competition',
        severity: 'soft',
        coreContent: 'I am already working with another agent',
        variations: [
          "I've been talking to a few agents",
          "My friend recommended their agent to me",
          "I found some listings through another service",
        ],
        triggerConditions: ['initial contact', 'lead qualification', 'relationship building'],
        idealResponses: [
          'Ask about their experience and what they value in an agent',
          'Highlight your unique value proposition without criticizing competitors',
          'Offer a no-pressure consultation to demonstrate your expertise',
        ],
        commonMistakes: [
          'Speaking negatively about competitors',
          'Being too aggressive in trying to win them over',
          'Not asking about their current situation',
        ],
      },
    ];

    for (const objection of defaultObjections) {
      await this.save(objection);
    }
  }
}
