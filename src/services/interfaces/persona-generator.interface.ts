import { SimulationScenarioType, DifficultyLevel } from '../../types/enums';
import { ClientPersona } from './objection-handling.interface';

export interface PersonaGenerationContext {
  scenarioType: SimulationScenarioType;
  difficultyLevel: DifficultyLevel;
  customConfig?: Partial<ClientPersona>;
}

export interface IPersonaGeneratorService {
  generatePersona(context: PersonaGenerationContext): Promise<ClientPersona>;
  generateInitialMessage(persona: ClientPersona, scenarioType: SimulationScenarioType): Promise<string>;
  getScenarioContext(scenarioType: SimulationScenarioType): string;
  getScenarioTips(scenarioType: SimulationScenarioType): string[];
}
