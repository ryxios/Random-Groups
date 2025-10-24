import Papa from 'papaparse';
import { z } from 'zod';
import type { ClassData, LearnerRecord, PerformanceLevel } from '$lib/types';
import { generateId } from '$lib/utils/id';

const performanceSchema = z.enum(['low', 'medium', 'high']);

const learnerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Der Name darf nicht leer sein.'),
  performance: performanceSchema.default('medium'),
  prefer: z.array(z.string()).optional(),
  avoid: z.array(z.string()).optional(),
  notes: z.string().optional()
});

const classSchema = z.object({
  learners: z.array(learnerSchema)
});

type RawLearner = z.infer<typeof learnerSchema>;

export interface ImportResult {
  data: ClassData;
  warnings: string[];
}

export async function importFromJson(file: File): Promise<ImportResult> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const { learners } = classSchema.parse(parsed);
  return normalizeLearners(learners);
}

export async function importFromCsv(file: File): Promise<ImportResult> {
  const text = await file.text();
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transform: (value) => value.trim()
  });

  if (result.errors.length) {
    throw new Error(result.errors.map((err) => err.message).join('\n'));
  }

  const learners: RawLearner[] = result.data
    .filter((row) => row.name)
    .map((row) => ({
      id: row.id || undefined,
      name: row.name,
      performance: toPerformance(row.performance),
      prefer: parseList(row.prefer ?? row.prefers ?? ''),
      avoid: parseList(row.avoid ?? row.conflicts ?? ''),
      notes: row.notes || undefined
    }));

  return normalizeLearners(learners);
}

export function exportToJson(data: ClassData, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, ensureExtension(filename, '.json'));
}

export function exportToCsv(data: ClassData, filename: string): void {
  const rows = data.learners.map((learner) => ({
    id: learner.id,
    name: learner.name,
    performance: learner.performance,
    prefer: learner.prefer
      .map((id) => data.learners.find((l) => l.id === id)?.name ?? '')
      .filter(Boolean)
      .join('; '),
    avoid: learner.avoid
      .map((id) => data.learners.find((l) => l.id === id)?.name ?? '')
      .filter(Boolean)
      .join('; '),
    notes: learner.notes ?? ''
  }));

  const csv = Papa.unparse(rows, { quotes: false });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, ensureExtension(filename, '.csv'));
}

function ensureExtension(name: string, extension: string): string {
  return name.endsWith(extension) ? name : `${name}${extension}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function normalizeLearners(raw: RawLearner[]): ImportResult {
  const warnings: string[] = [];
  const learnersWithIds = raw.map((entry) => ({
    ...entry,
    id: entry.id && entry.id.trim().length > 0 ? entry.id : generateId('learner')
  }));

  const nameToId = new Map<string, string>();
  learnersWithIds.forEach((entry) => nameToId.set(entry.name, entry.id!));

  const learners: LearnerRecord[] = learnersWithIds.map((entry) => ({
    id: entry.id!,
    name: entry.name,
    performance: entry.performance,
    notes: entry.notes,
    prefer: (entry.prefer ?? [])
      .map((nameOrId) => resolveReference(nameOrId, nameToId))
      .filter((value): value is string => value !== null),
    avoid: (entry.avoid ?? [])
      .map((nameOrId) => resolveReference(nameOrId, nameToId))
      .filter((value): value is string => value !== null)
  }));

  const invalidRefs = learnersWithIds.flatMap((entry) => {
    const refs = [...(entry.prefer ?? []), ...(entry.avoid ?? [])];
    return refs.filter((ref) => !resolveReference(ref, nameToId));
  });

  if (invalidRefs.length) {
    warnings.push(
      `Einige Beziehungen konnten nicht zugeordnet werden: ${[...new Set(invalidRefs)].join(', ')}`
    );
  }

  return { data: { learners }, warnings };
}

function resolveReference(value: string, nameToId: Map<string, string>): string | null {
  if (!value) return null;
  if (nameToId.has(value)) return nameToId.get(value)!;
  return value.length > 4 ? value : null;
}

function parseList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toPerformance(value: string | undefined): PerformanceLevel {
  if (!value) return 'medium';
  const lowered = value.toLowerCase();
  if (lowered.startsWith('h')) return 'high';
  if (lowered.startsWith('l')) return 'low';
  return 'medium';
}
