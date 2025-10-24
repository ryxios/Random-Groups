export type PerformanceLevel = 'low' | 'medium' | 'high';

export interface LearnerRecord {
  id: string;
  name: string;
  performance: PerformanceLevel;
  prefer: string[];
  avoid: string[];
  notes?: string;
}

export interface ClassData {
  learners: LearnerRecord[];
}

export interface StoredClass {
  id: string;
  name: string;
  updatedAt: string;
  data: ClassData;
}

export type GroupingMode = 'groupSize' | 'groupCount';

export interface GroupingConfig {
  mode: GroupingMode;
  groupSize?: number;
  groupCount?: number;
  balancePerformance: boolean;
}

export interface GroupingRequest {
  learners: LearnerRecord[];
  config: GroupingConfig;
}

export interface GroupingIssue {
  type: 'warning' | 'conflict';
  message: string;
  learnerIds?: string[];
}

export interface GroupingResult {
  groups: Array<{ id: string; members: LearnerRecord[] }>;
  unassigned: LearnerRecord[];
  issues: GroupingIssue[];
}
