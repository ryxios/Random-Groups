import Dexie, { type Table } from 'dexie';
import { browser } from '$app/environment';
import type { ClassData, StoredClass } from '$lib/types';

class ClassDatabase extends Dexie {
  classes!: Table<StoredClass, string>;

  constructor() {
    super('random-groups-db');
    this.version(1).stores({
      classes: '&id, name, updatedAt'
    });
  }
}

let db: ClassDatabase | null = null;

function getDb(): ClassDatabase | null {
  if (!browser) return null;
  if (!db) {
    db = new ClassDatabase();
  }
  return db;
}

export async function listClasses(): Promise<StoredClass[]> {
  const database = getDb();
  if (!database) return [];
  return database.classes.orderBy('name').toArray();
}

export async function loadClass(id: string): Promise<StoredClass | undefined> {
  const database = getDb();
  if (!database) return undefined;
  return database.classes.get(id);
}

export async function deleteClass(id: string): Promise<void> {
  const database = getDb();
  if (!database) return;
  await database.classes.delete(id);
}

export async function saveClass(
  payload: Omit<StoredClass, 'updatedAt'> & Partial<Pick<StoredClass, 'updatedAt'>>
): Promise<StoredClass> {
  const database = getDb();
  if (!database) throw new Error('Dexie is only available in the browser.');

  const entry: StoredClass = {
    ...payload,
    updatedAt: payload.updatedAt ?? new Date().toISOString()
  };

  await database.classes.put(entry);
  return entry;
}

export function createEmptyClass(name: string): StoredClass {
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  const data: ClassData = { learners: [] };
  return { id, name, data, updatedAt: new Date().toISOString() };
}
