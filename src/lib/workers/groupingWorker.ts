/// <reference lib="webworker" />

import type { GroupingConfig, GroupingRequest, GroupingResult, GroupingIssue, LearnerRecord } from '$lib/types';

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<GroupingRequest>) => {
  try {
    const result = buildGroups(event.data.learners, event.data.config);
    ctx.postMessage(result satisfies GroupingResult);
  } catch (error) {
    ctx.postMessage({
      groups: [],
      unassigned: [],
      issues: [
        {
          type: 'conflict',
          message: error instanceof Error ? error.message : 'Unbekannter Fehler beim Bilden der Gruppen.'
        }
      ]
    } satisfies GroupingResult);
  }
});

const PERFORMANCE_WEIGHT: Record<LearnerRecord['performance'], number> = {
  low: 1,
  medium: 2,
  high: 3
};

interface InternalGroup {
  id: string;
  members: LearnerRecord[];
  score: number;
}

function buildGroups(learners: LearnerRecord[], config: GroupingConfig): GroupingResult {
  const activeLearners = [...learners];
  const issues: GroupingIssue[] = [];

  if (activeLearners.length === 0) {
    return { groups: [], unassigned: [], issues };
  }

  const groupCount = determineGroupCount(activeLearners.length, config);
  const capacities = determineCapacities(activeLearners.length, groupCount, config);
  const groups: InternalGroup[] = Array.from({ length: groupCount }, (_, index) => ({
    id: `Gruppe ${index + 1}`,
    members: [],
    score: 0
  }));

  const sortedLearners = activeLearners.sort((a, b) => {
    const perfDelta = PERFORMANCE_WEIGHT[b.performance] - PERFORMANCE_WEIGHT[a.performance];
    if (perfDelta !== 0) return perfDelta;
    return b.prefer.length - a.prefer.length;
  });

  const unassigned: LearnerRecord[] = [];

  for (const learner of sortedLearners) {
    const placed = placeLearner(groups, capacities, learner, config, issues);
    if (!placed) {
      unassigned.push(learner);
      issues.push({
        type: 'conflict',
        message: `${learner.name} konnte wegen widersprüchlicher Regeln keiner Gruppe zugewiesen werden.`,
        learnerIds: [learner.id]
      });
    }
  }

  evaluatePreferences(groups, issues);

  return {
    groups: groups.map(({ id, members }) => ({ id, members })),
    unassigned,
    issues
  };
}

function determineGroupCount(total: number, config: GroupingConfig): number {
  if (config.mode === 'groupSize' && config.groupSize) {
    return Math.max(1, Math.ceil(total / Math.max(1, config.groupSize)));
  }
  if (config.mode === 'groupCount' && config.groupCount) {
    return Math.max(1, config.groupCount);
  }
  return Math.max(1, Math.round(Math.sqrt(total)));
}

function determineCapacities(total: number, groupCount: number, config: GroupingConfig): number[] {
  if (config.mode === 'groupSize' && config.groupSize) {
    return Array.from({ length: groupCount }, () => Math.max(1, config.groupSize!));
  }

  const base = Math.floor(total / groupCount);
  const remainder = total % groupCount;
  return Array.from({ length: groupCount }, (_, index) => base + (index < remainder ? 1 : 0) || 1);
}

function placeLearner(
  groups: InternalGroup[],
  capacities: number[],
  learner: LearnerRecord,
  config: GroupingConfig,
  issues: GroupingIssue[]
): boolean {
  const avoidSet = new Set(learner.avoid);
  const preferSet = new Set(learner.prefer);

  let candidates = groups
    .map((group, index) => ({
      group,
      index,
      capacity: capacities[index]
    }))
    .filter((entry) => entry.group.members.length < entry.capacity);

  if (candidates.length === 0) {
    candidates = groups.map((group, index) => ({
      group,
      index,
      capacity: capacities[index] + 1
    }));
  }

  if (candidates.length === 0) {
    return false;
  }

  const safeCandidates = candidates.filter(
    ({ group }) => !group.members.some((member) => avoidSet.has(member.id))
  );

  const preferCandidates = safeCandidates.filter(({ group }) =>
    group.members.some((member) => preferSet.has(member.id))
  );

  const ranking = preferCandidates.length > 0 ? preferCandidates : safeCandidates.length > 0 ? safeCandidates : candidates;

  const chosen = selectBestGroup(ranking, learner, config.balancePerformance ?? true);

  if (!chosen) {
    return false;
  }

  if (safeCandidates.length === 0) {
    issues.push({
      type: 'warning',
      message: `${learner.name} musste trotz Konflikt zu einer bestehenden Gruppe hinzugefügt werden.`,
      learnerIds: [learner.id]
    });
  }

  chosen.group.members.push(learner);
  chosen.group.score += PERFORMANCE_WEIGHT[learner.performance];
  return true;
}

function selectBestGroup(
  candidates: Array<{ group: InternalGroup; index: number; capacity: number }>,
  learner: LearnerRecord,
  balancePerformance: boolean
): { group: InternalGroup; index: number; capacity: number } | null {
  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((a, b) => {
    if (balancePerformance) {
      const scoreDelta = a.group.score - b.group.score;
      if (scoreDelta !== 0) return scoreDelta;
    }
    const sizeDelta = a.group.members.length - b.group.members.length;
    if (sizeDelta !== 0) return sizeDelta;
    const preferMatchesA = countMatches(a.group.members, learner.prefer);
    const preferMatchesB = countMatches(b.group.members, learner.prefer);
    return preferMatchesB - preferMatchesA;
  });

  return sorted[0];
}

function countMatches(members: LearnerRecord[], ids: string[]): number {
  if (!ids.length) return 0;
  const set = new Set(ids);
  return members.reduce((acc, member) => (set.has(member.id) ? acc + 1 : acc), 0);
}

function evaluatePreferences(groups: InternalGroup[], issues: GroupingIssue[]) {
  const membership = new Map<string, { groupId: string; name: string }>();
  for (const group of groups) {
    for (const member of group.members) {
      membership.set(member.id, { groupId: group.id, name: member.name });
    }
  }

  for (const group of groups) {
    for (const member of group.members) {
      for (const avoidId of member.avoid) {
        const peer = group.members.find((candidate) => candidate.id === avoidId);
        if (peer) {
          issues.push({
            type: 'conflict',
            message: `${member.name} sollte nicht mit ${peer.name} zusammenarbeiten.`,
            learnerIds: [member.id, avoidId]
          });
        }
      }

      for (const preferId of member.prefer) {
        const preferred = membership.get(preferId);
        if (!preferred) continue;
        if (preferred.groupId !== group.id) {
          issues.push({
            type: 'warning',
            message: `${member.name} wurde nicht mit ${preferred.name} gruppiert.`,
            learnerIds: [member.id, preferId]
          });
        }
      }
    }
  }
}

export {};
