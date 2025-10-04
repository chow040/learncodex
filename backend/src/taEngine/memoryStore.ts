import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

type Role = 'manager' | 'trader' | 'riskManager';

interface MemoryEntry {
  date: string; // ISO date of trade
  symbol: string;
  role: Role;
  summary: string; // brief reflection/lesson learned
}

interface MemoryFile {
  memories: MemoryEntry[];
}

const resolveMemPath = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // store alongside backend/logs for simplicity
  const dir = path.resolve(__dirname, '..', '..', 'logs');
  const file = path.join(dir, 'ta_memories.json');
  return { dir, file };
};

async function ensureMemFile() {
  const { dir, file } = resolveMemPath();
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
  try {
    await fs.access(file);
  } catch {
    const init: MemoryFile = { memories: [] };
    await fs.writeFile(file, JSON.stringify(init, null, 2), 'utf8');
  }
}

async function readAll(): Promise<MemoryFile> {
  const { file } = resolveMemPath();
  await ensureMemFile();
  const raw = await fs.readFile(file, 'utf8');
  try {
    return JSON.parse(raw) as MemoryFile;
  } catch {
    return { memories: [] };
  }
}

export async function getPastMemories(symbol: string, role: Role, limit = 5): Promise<string> {
  const all = await readAll();
  const filtered = all.memories
    .filter((m) => m.symbol === symbol && m.role === role)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
  if (filtered.length === 0) return '';
  return filtered
    .map((m) => `${m.date} [${m.role}] ${m.summary}`)
    .join('\n');
}

export async function appendMemory(entry: MemoryEntry): Promise<void> {
  const { file } = resolveMemPath();
  await ensureMemFile();
  const all = await readAll();
  all.memories.push(entry);
  await fs.writeFile(file, JSON.stringify(all, null, 2), 'utf8');
}

export type { Role as MemoryRole, MemoryEntry };
