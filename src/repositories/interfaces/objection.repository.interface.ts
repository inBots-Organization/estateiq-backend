import { SimulationScenarioType, ObjectionCategory, ObjectionSeverity } from '../../types/enums';
import { GeneratedObjection } from '../../services/interfaces/objection-handling.interface';

export interface ObjectionTemplateData {
  scenarioType: SimulationScenarioType;
  category: ObjectionCategory;
  severity: ObjectionSeverity;
  coreContent: string;
  variations: string[];
  triggerConditions: string[];
  idealResponses: string[];
  commonMistakes: string[];
}

export interface IObjectionRepository {
  getByScenarioType(scenarioType: SimulationScenarioType): Promise<GeneratedObjection[]>;
  getByCategory(category: ObjectionCategory): Promise<GeneratedObjection[]>;
  getCommonObjections(): Promise<GeneratedObjection[]>;
  save(data: ObjectionTemplateData): Promise<void>;
  seedDefaultObjections(): Promise<void>;
}
