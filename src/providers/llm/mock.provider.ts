import { injectable } from 'tsyringe';
import { ILLMProvider, LLMCompletionOptions, LLMCompletionResult } from './llm-provider.interface';

interface ConversationContext {
  turnNumber: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  state: string;
}

@injectable()
export class MockLLMProvider implements ILLMProvider {
  private conversationTurns: Map<string, number> = new Map();

  async complete(options: LLMCompletionOptions): Promise<string> {
    const result = await this.completeWithMetadata(options);
    return result.content;
  }

  async completeWithMetadata(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const { responseFormat, prompt, systemPrompt } = options;

    // Simulate realistic API delay (100-300ms)
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    if (responseFormat === 'json') {
      return {
        content: JSON.stringify(this.getMockJsonResponse(prompt)),
        usage: { inputTokens: 150, outputTokens: 75 },
      };
    }

    return {
      content: this.getMockTextResponse(prompt, systemPrompt || ''),
      usage: { inputTokens: 150, outputTokens: 75 },
    };
  }

  private getMockTextResponse(prompt: string, systemPrompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    const lowerSystem = systemPrompt.toLowerCase();

    // Extract context from the prompt
    const context = this.extractContext(prompt);
    const personality = this.extractPersonality(systemPrompt);
    const traineeMessage = this.extractTraineeMessage(prompt);

    // Handle initial greeting
    if (lowerPrompt.includes('initial') || context.turnNumber === 0) {
      return this.generateInitialMessage(personality);
    }

    // Handle objection scenarios
    if (lowerPrompt.includes('express this concern')) {
      const objection = this.extractObjection(prompt);
      return this.generateObjectionResponse(objection, personality, traineeMessage);
    }

    // Regular conversation responses
    return this.generateContextualResponse(traineeMessage, personality, context);
  }

  private extractContext(prompt: string): ConversationContext {
    const turnMatch = prompt.match(/turn(?:s?):\s*(\d+)/i);
    const stateMatch = prompt.match(/state:\s*(\w+)/i);

    return {
      turnNumber: turnMatch ? parseInt(turnMatch[1]) : 0,
      sentiment: this.detectSentiment(prompt),
      state: stateMatch ? stateMatch[1].toLowerCase() : 'opening',
    };
  }

  private extractPersonality(systemPrompt: string): string {
    const personalities = ['friendly', 'skeptical', 'demanding', 'indecisive', 'analytical'];
    for (const p of personalities) {
      if (systemPrompt.toLowerCase().includes(p)) {
        return p;
      }
    }
    return 'friendly';
  }

  private extractTraineeMessage(prompt: string): string {
    const match = prompt.match(/(?:agent|trainee).*?(?:said|says?):\s*["']?([^"'\n]+)/i);
    return match ? match[1].trim() : '';
  }

  private extractObjection(prompt: string): string {
    const match = prompt.match(/express this concern.*?["']([^"']+)["']/i);
    return match ? match[1] : '';
  }

  private detectSentiment(text: string): 'positive' | 'neutral' | 'negative' {
    const positiveWords = ['great', 'perfect', 'excellent', 'love', 'interested', 'sounds good', 'like'];
    const negativeWords = ['expensive', 'too much', 'concerned', 'worried', 'not sure', 'problem', 'issue'];

    const lowerText = text.toLowerCase();
    const posCount = positiveWords.filter(w => lowerText.includes(w)).length;
    const negCount = negativeWords.filter(w => lowerText.includes(w)).length;

    if (posCount > negCount) return 'positive';
    if (negCount > posCount) return 'negative';
    return 'neutral';
  }

  private generateInitialMessage(personality: string): string {
    const initialMessages: Record<string, string[]> = {
      friendly: [
        "Hi there! I'm so excited to be looking at properties today. My family is ready for a change and we really want to find something special. What can you show me?",
        "Hello! Thanks for meeting with me. We've been searching for a new home for a while now and I have a good feeling about today. Where should we start?",
        "Good morning! I appreciate you taking the time to help us. We're looking for a place that really feels like home, you know?",
      ],
      skeptical: [
        "Hi. I've looked at a lot of properties already and haven't been impressed. I hope you can show me something that's actually worth my time.",
        "Hello. I should tell you upfront - I've done my research and I know the market well. I won't be pressured into anything.",
        "Good morning. I'm interested in seeing the property, but I have some concerns about the listing that I'd like to address first.",
      ],
      demanding: [
        "Good morning. I have very specific requirements and my time is valuable. Let's get straight to business.",
        "Hi. I need a property that meets ALL my criteria - no compromises. Show me what you've got.",
        "Hello. I expect excellent service and properties that match exactly what I've asked for. Let's not waste time.",
      ],
      indecisive: [
        "Um, hi there. I'm looking for a home, but I'm not entirely sure what I want yet. Maybe you can help me figure that out?",
        "Hello. We're thinking about buying, but we're also looking at a few other areas. We're just exploring our options really.",
        "Hi... sorry, I hope I'm not wasting your time. We're kind of new to this whole house-hunting thing.",
      ],
      analytical: [
        "Good morning. Before we begin, I'd like to understand the exact square footage, the property tax history, and any recent comparable sales in this area.",
        "Hello. I've prepared a list of questions about the property specifications, neighborhood data, and market trends. Shall we go through them?",
        "Hi. I believe in making data-driven decisions. Can you provide the inspection reports and any documentation on the property's history?",
      ],
    };

    const messages = initialMessages[personality] || initialMessages.friendly;
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private generateObjectionResponse(objection: string, personality: string, traineeMessage: string): string {
    const objectionResponses: Record<string, string[]> = {
      friendly: [
        `I really appreciate what you're saying, but I have to be honest - ${objection.toLowerCase()} This is a big decision for us.`,
        `That's a good point, and I'm trying to stay open-minded, but ${objection.toLowerCase()} Can you help me understand better?`,
        `I hear you, I really do, but ${objection.toLowerCase()} I want to make sure we're making the right choice.`,
      ],
      skeptical: [
        `See, this is what I was worried about. ${objection.toLowerCase()} I've seen agents oversell properties before.`,
        `I'm not convinced yet. ${objection.toLowerCase()} What proof do you have that addresses this?`,
        `That sounds nice in theory, but ${objection.toLowerCase()} I need more than just your word on this.`,
      ],
      demanding: [
        `That's not acceptable. ${objection.toLowerCase()} I need this resolved before we can move forward.`,
        `Look, I'm serious about buying, but ${objection.toLowerCase()} This needs to be addressed immediately.`,
        `I appreciate the effort, but frankly, ${objection.toLowerCase()} What are you going to do about it?`,
      ],
      indecisive: [
        `Oh, I'm not sure... ${objection.toLowerCase()} Maybe we should look at something else? Or maybe not, I don't know.`,
        `Well, the thing is... ${objection.toLowerCase()} Do you think that's something we should be worried about?`,
        `Hmm, that makes me a bit nervous because ${objection.toLowerCase()} What do you think we should do?`,
      ],
      analytical: [
        `Based on my research, ${objection.toLowerCase()} The data suggests this might be a significant issue.`,
        `Interesting, but looking at the numbers, ${objection.toLowerCase()} How does this compare to market averages?`,
        `I've analyzed this, and ${objection.toLowerCase()} Can you provide documentation to address this concern?`,
      ],
    };

    const responses = objectionResponses[personality] || objectionResponses.friendly;
    return responses[Math.floor(Math.random() * responses.length)];
  }

  private generateContextualResponse(traineeMessage: string, personality: string, context: ConversationContext): string {
    const lowerMessage = traineeMessage.toLowerCase();

    // Price/value discussions
    if (lowerMessage.includes('price') || lowerMessage.includes('value') || lowerMessage.includes('cost')) {
      return this.generatePriceResponse(personality, context.sentiment);
    }

    // Questions about the property
    if (lowerMessage.includes('?') || lowerMessage.includes('tell me') || lowerMessage.includes('what about')) {
      return this.generateQuestionResponse(personality);
    }

    // Positive statements
    if (context.sentiment === 'positive') {
      return this.generatePositiveResponse(personality);
    }

    // Default responses
    return this.generateDefaultResponse(personality);
  }

  private generatePriceResponse(personality: string, sentiment: 'positive' | 'neutral' | 'negative'): string {
    const responses: Record<string, string[]> = {
      friendly: [
        "I understand, budget is definitely important. We want to make sure we're getting good value for our investment.",
        "That's really helpful to know. We're trying to be smart about this - it's our biggest purchase, after all!",
        "Thanks for explaining that. It does make me feel better about the price point.",
      ],
      skeptical: [
        "I've seen similar properties listed for less. What makes this one worth the premium?",
        "Those numbers don't quite add up with what I've researched. Can you break that down?",
        "I'd need to see more evidence before I'm convinced that's a fair price.",
      ],
      demanding: [
        "That price needs to come down. What's the best you can do?",
        "I expect a better deal than that. My business is valuable - show me you want it.",
        "Let's talk real numbers here. What's the bottom line?",
      ],
      indecisive: [
        "Is that a good price? I honestly can't tell. We might need to think about it more.",
        "I'm not sure if we can afford that... but maybe if we adjusted our other plans...",
        "My partner and I would need to discuss the financial side more. It's a lot to consider.",
      ],
      analytical: [
        "Can you show me the price per square foot compared to recent sales in this zip code?",
        "What's the ROI potential if we factor in the property tax trajectory and maintenance costs?",
        "I'd like to see a detailed cost breakdown including closing costs and annual carrying costs.",
      ],
    };

    const personalityResponses = responses[personality] || responses.friendly;
    return personalityResponses[Math.floor(Math.random() * personalityResponses.length)];
  }

  private generateQuestionResponse(personality: string): string {
    const responses: Record<string, string[]> = {
      friendly: [
        "Oh, that's a great question! I'd love to know more about that too.",
        "Yes, please tell me more! This is exactly the kind of thing we need to understand.",
        "I was wondering about that myself. Thanks for bringing it up!",
      ],
      skeptical: [
        "That's what I'd like to know. Do you have documentation to back that up?",
        "Interesting question. I've had agents dodge that before. What's the honest answer?",
        "Let's see the proof. Words are easy - I need facts.",
      ],
      demanding: [
        "I expect a complete answer. Don't leave anything out.",
        "That better be a thorough explanation. I don't have time for half-answers.",
        "Give me all the details. I need the full picture to make my decision.",
      ],
      indecisive: [
        "Um, is that something we should be concerned about? I'm not sure what to think.",
        "I don't know if I understand... could you explain it differently?",
        "That's confusing. Maybe we should look at other options too?",
      ],
      analytical: [
        "Please be specific. I want exact figures and technical specifications.",
        "That requires a detailed answer. I'll be comparing this data to my research.",
        "Can you provide that information in writing? I'd like to verify it.",
      ],
    };

    const personalityResponses = responses[personality] || responses.friendly;
    return personalityResponses[Math.floor(Math.random() * personalityResponses.length)];
  }

  private generatePositiveResponse(personality: string): string {
    const responses: Record<string, string[]> = {
      friendly: [
        "This is really starting to feel right! I can see us being happy here.",
        "I'm getting excited! This might actually be the one we've been looking for.",
        "You know what? I like what I'm hearing. Let's keep talking.",
      ],
      skeptical: [
        "Alright, you're making some valid points. I'm not completely convinced, but I'm listening.",
        "That's more like what I was hoping to hear. Continue.",
        "Okay, that addresses some of my concerns. What else should I know?",
      ],
      demanding: [
        "Good. Now we're getting somewhere. Keep this level of service up.",
        "That's acceptable. Now let's discuss the other requirements.",
        "Finally, some progress. Let's move this along.",
      ],
      indecisive: [
        "That does sound nice... but I'm still not 100% sure. Maybe... maybe it could work?",
        "Oh, that's encouraging! Though I probably need more time to think...",
        "You're making this really tempting... but I don't want to rush into anything.",
      ],
      analytical: [
        "The data supports what you're saying. That's a positive indicator.",
        "Interesting. The numbers are starting to align. Let's look at more details.",
        "That meets my criteria. Please continue with the remaining specifications.",
      ],
    };

    const personalityResponses = responses[personality] || responses.friendly;
    return personalityResponses[Math.floor(Math.random() * personalityResponses.length)];
  }

  private generateDefaultResponse(personality: string): string {
    const responses: Record<string, string[]> = {
      friendly: [
        "That's interesting! Can you tell me more about that?",
        "I appreciate you explaining that. It really helps us understand better.",
        "Oh, I see what you mean. That gives me something to think about!",
      ],
      skeptical: [
        "I see. I'll need to verify that information.",
        "Noted. But I have more questions before I'm satisfied.",
        "That's your perspective. I'm still evaluating.",
      ],
      demanding: [
        "Moving on. What's next on the agenda?",
        "Fine. Let's proceed to the important details.",
        "Acknowledged. Now let's talk about what really matters.",
      ],
      indecisive: [
        "Hmm, okay... I'm still trying to process everything.",
        "I think I understand? Maybe? This is a lot to take in.",
        "Right, right... let me just think about that for a moment.",
      ],
      analytical: [
        "I'll add that to my notes. Please continue with the technical details.",
        "That's one data point. What are the other relevant metrics?",
        "Noted. I'll cross-reference that with my research.",
      ],
    };

    const personalityResponses = responses[personality] || responses.friendly;
    return personalityResponses[Math.floor(Math.random() * personalityResponses.length)];
  }

  private getMockJsonResponse(prompt: string): Record<string, unknown> {
    const lowerPrompt = prompt.toLowerCase();

    // Analysis response
    if (lowerPrompt.includes('analyze') || lowerPrompt.includes('state')) {
      const sentiments = ['positive', 'neutral', 'negative'];
      const states = ['opening', 'discovery', 'presenting', 'negotiating', 'closing'];
      const intents = [
        'building_rapport',
        'gathering_information',
        'presenting_benefits',
        'handling_objection',
        'asking_for_commitment',
        'addressing_concerns',
      ];
      const hints = [
        'Try asking an open-ended question to learn more about their needs',
        'Acknowledge their concern before providing a solution',
        'Use specific examples to illustrate your points',
        'Find common ground to build rapport',
        'Summarize their needs to show you understand',
        'Ask about their timeline to gauge urgency',
        'Share a relevant success story from a similar client',
      ];

      return {
        state: states[Math.floor(Math.random() * states.length)],
        sentiment: sentiments[Math.floor(Math.random() * sentiments.length)],
        intent: intents[Math.floor(Math.random() * intents.length)],
        hints: [hints[Math.floor(Math.random() * hints.length)]],
      };
    }

    // Evaluation response
    if (lowerPrompt.includes('evaluat')) {
      return {
        acknowledged: Math.random() > 0.3,
        empathyShown: Math.random() > 0.4,
        addressedDirectly: Math.random() > 0.3,
        providedValue: Math.random() > 0.4,
        askedFollowUp: Math.random() > 0.5,
        dismissive: Math.random() < 0.2,
        argumentative: Math.random() < 0.1,
        ignoredConcern: Math.random() < 0.2,
        score: 60 + Math.floor(Math.random() * 30),
        techniquesUsed: ['acknowledge_and_pivot', 'reframe_value'],
        strengths: [
          'Good acknowledgment of the concern',
          'Maintained professional tone',
          'Provided relevant information',
        ],
        improvements: [
          'Could have asked a follow-up question',
          'Consider using more empathetic language',
        ],
      };
    }

    // Persona generation
    if (lowerPrompt.includes('persona') || lowerPrompt.includes('generate')) {
      const names = ['Sarah Johnson', 'Michael Chen', 'Emma Williams', 'David Rodriguez', 'Lisa Thompson'];
      const personalities: Array<'friendly' | 'skeptical' | 'demanding' | 'indecisive' | 'analytical'> = [
        'friendly', 'skeptical', 'demanding', 'indecisive', 'analytical'
      ];
      const backgrounds = [
        'First-time homebuyer looking for a starter home',
        'Growing family needs more space',
        'Professional relocating for a new job',
        'Empty nester looking to downsize',
        'Investor seeking rental property',
      ];

      return {
        name: names[Math.floor(Math.random() * names.length)],
        background: backgrounds[Math.floor(Math.random() * backgrounds.length)],
        personality: personalities[Math.floor(Math.random() * personalities.length)],
        budget: `$${350 + Math.floor(Math.random() * 400)},000 - $${450 + Math.floor(Math.random() * 400)},000`,
        motivations: [
          'Good school district',
          'Safe neighborhood',
          'Modern amenities',
          'Room for a home office',
          'Outdoor space',
        ].slice(0, 3),
        objections: [
          'Price seems high for the area',
          'Concerned about maintenance costs',
          'The commute might be too long',
          'Not sure about the neighborhood',
        ].slice(0, 2),
        hiddenConcerns: [
          'Worried about property value stability',
          'Uncertain about long-term plans',
          'Previous bad experience with agents',
        ].slice(0, 2),
      };
    }

    // Objection decision
    if (lowerPrompt.includes('objection') && lowerPrompt.includes('inject')) {
      return {
        shouldInject: Math.random() > 0.5,
        reason: 'Natural conversation flow point',
      };
    }

    // Default response
    return {
      success: true,
      message: 'Mock response generated successfully',
    };
  }
}
