import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import type {
  BotSessionState,
  ProjectRecord,
  ProjectSummary,
  UserProfile,
} from './types.ts';

export const ADMIN_USERNAME = 'indproekt_help';
export const PROJECT_PRICE_RUB = 300;

const DATA_DIR = path.resolve(
  process.env.DATA_DIR?.trim() || path.join(process.cwd(), 'data')
);
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROJECTS_INDEX_FILE = path.join(DATA_DIR, 'projects-index.json');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

const DATABASE_URL = process.env.DATABASE_URL?.trim() || '';
const usePg = Boolean(DATABASE_URL);

// Neon требует SSL (sslmode=require) и закрывает простаивающие соединения при автопаузе compute
const pool = usePg
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl:
        process.env.PGSSLMODE === 'disable'
          ? false
          : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 15_000,
    })
  : null;

if (pool) {
  pool.on('error', (err) => {
    console.warn('[Store] Фоновая ошибка пула Neon PostgreSQL:', err.message);
  });
}

const MAX_PROJECTS = 60;
const projects = new Map<string, ProjectRecord>();
const projectOrder: string[] = [];
const sessions = new Map<string, BotSessionState>();
const users = new Map<string, UserProfile>();

let initPromise: Promise<void> | null = null;

interface StoredProjectMeta {
  id: string;
  createdAt: string;
  input: ProjectRecord['input'];
  content: ProjectRecord['content'];
  filename: string;
  pptxFilename: string;
  speechFilename: string;
  wordCount: number;
  estimatedPages: number;
}

function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function loadUsersFromDisk(): void {
  try {
    if (!fs.existsSync(USERS_FILE)) return;
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as UserProfile[];
    if (Array.isArray(parsed)) {
      for (const u of parsed) {
        if (u && typeof u.userId === 'string') {
          users.set(u.userId, {
            ...u,
            credits:
              Number.isFinite(u.credits) && u.credits >= 0
                ? Math.floor(u.credits)
                : 0,
            generatedCount:
              Number.isFinite(u.generatedCount) && u.generatedCount >= 0
                ? Math.floor(u.generatedCount)
                : 0,
          });
        }
      }
    }
  } catch (err) {
    console.warn('[Store] Не удалось прочитать users.json:', err);
  }
}

function persistUsersToDisk(): void {
  try {
    ensureDataDirs();
    const list = Array.from(users.values());
    const tmpFile = `${USERS_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf8');
    fs.renameSync(tmpFile, USERS_FILE);
  } catch (err) {
    console.warn('[Store] Не удалось сохранить users.json:', err);
  }
}

function loadProjectsFromDisk(): void {
  try {
    if (!fs.existsSync(PROJECTS_INDEX_FILE)) return;
    const rawIndex = fs.readFileSync(PROJECTS_INDEX_FILE, 'utf8');
    const order = JSON.parse(rawIndex) as string[];
    if (!Array.isArray(order)) return;

    for (const id of order) {
      if (typeof id !== 'string') continue;
      const itemDir = path.join(PROJECTS_DIR, id);
      const metaPath = path.join(itemDir, 'meta.json');
      const docxPath = path.join(itemDir, 'project.docx');
      const pptxPath = path.join(itemDir, 'presentation.pptx');
      const speechPath = path.join(itemDir, 'speech.docx');

      if (
        !fs.existsSync(metaPath) ||
        !fs.existsSync(docxPath) ||
        !fs.existsSync(pptxPath) ||
        !fs.existsSync(speechPath)
      ) {
        continue;
      }

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as StoredProjectMeta;
      const record: ProjectRecord = {
        ...meta,
        docxBuffer: fs.readFileSync(docxPath),
        pptxBuffer: fs.readFileSync(pptxPath),
        speechDocxBuffer: fs.readFileSync(speechPath),
      };

      if (!projects.has(record.id)) {
        projectOrder.push(record.id);
      }
      projects.set(record.id, record);
    }
  } catch (err) {
    console.warn('[Store] Не удалось загрузить проекты с диска:', err);
  }
}

function persistProjectsIndex(): void {
  try {
    ensureDataDirs();
    const tmpFile = `${PROJECTS_INDEX_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(projectOrder, null, 2), 'utf8');
    fs.renameSync(tmpFile, PROJECTS_INDEX_FILE);
  } catch (err) {
    console.warn('[Store] Не удалось сохранить индекс проектов:', err);
  }
}

function persistProjectRecordToDisk(record: ProjectRecord): void {
  try {
    ensureDataDirs();
    const itemDir = path.join(PROJECTS_DIR, record.id);
    fs.mkdirSync(itemDir, { recursive: true });

    const meta: StoredProjectMeta = {
      id: record.id,
      createdAt: record.createdAt,
      input: record.input,
      content: record.content,
      filename: record.filename,
      pptxFilename: record.pptxFilename,
      speechFilename: record.speechFilename,
      wordCount: record.wordCount,
      estimatedPages: record.estimatedPages,
    };

    const metaTmp = path.join(itemDir, 'meta.json.tmp');
    const metaFinal = path.join(itemDir, 'meta.json');
    fs.writeFileSync(metaTmp, JSON.stringify(meta), 'utf8');
    fs.renameSync(metaTmp, metaFinal);

    fs.writeFileSync(path.join(itemDir, 'project.docx'), record.docxBuffer);
    fs.writeFileSync(path.join(itemDir, 'presentation.pptx'), record.pptxBuffer);
    fs.writeFileSync(path.join(itemDir, 'speech.docx'), record.speechDocxBuffer);
  } catch (err) {
    console.warn(`[Store] Не удалось сохранить проект ${record.id} на диск:`, err);
  }
}

function removeProjectFromDisk(id: string): void {
  try {
    const itemDir = path.join(PROJECTS_DIR, id);
    if (fs.existsSync(itemDir)) {
      fs.rmSync(itemDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[Store] Не удалось удалить проект ${id} с диска:`, err);
  }
}

async function initPgSchemaAndLoad(): Promise<void> {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_users (
      user_id TEXT PRIMARY KEY,
      chat_id TEXT,
      username TEXT,
      display_name TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 0,
      generated_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_projects (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL,
      input_json JSONB NOT NULL,
      content_json JSONB NOT NULL,
      filename TEXT NOT NULL,
      pptx_filename TEXT NOT NULL,
      speech_filename TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      estimated_pages INTEGER NOT NULL,
      docx_b64 TEXT NOT NULL,
      pptx_b64 TEXT NOT NULL,
      speech_docx_b64 TEXT NOT NULL
    );
  `);

  const userRes = await pool.query(`
    SELECT
      user_id,
      chat_id,
      username,
      display_name,
      credits,
      generated_count,
      created_at,
      updated_at,
      last_seen_at
    FROM bot_users
  `);

  for (const row of userRes.rows) {
    const profile: UserProfile = {
      userId: String(row.user_id),
      chatId: row.chat_id ? String(row.chat_id) : undefined,
      username: row.username ? String(row.username) : undefined,
      displayName: String(row.display_name),
      credits: Math.max(0, Number(row.credits) || 0),
      generatedCount: Math.max(0, Number(row.generated_count) || 0),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
    };
    users.set(profile.userId, profile);
  }

  const projRes = await pool.query(`
    SELECT
      id,
      created_at,
      input_json,
      content_json,
      filename,
      pptx_filename,
      speech_filename,
      word_count,
      estimated_pages,
      docx_b64,
      pptx_b64,
      speech_docx_b64
    FROM bot_projects
    ORDER BY created_at DESC
    LIMIT $1
  `, [MAX_PROJECTS]);

  projects.clear();
  projectOrder.length = 0;

  for (const row of projRes.rows) {
    const rec: ProjectRecord = {
      id: String(row.id),
      createdAt: new Date(row.created_at).toISOString(),
      input: row.input_json,
      content: row.content_json,
      filename: String(row.filename),
      pptxFilename: String(row.pptx_filename),
      speechFilename: String(row.speech_filename),
      wordCount: Number(row.word_count) || 0,
      estimatedPages: Number(row.estimated_pages) || 0,
      docxBuffer: Buffer.from(String(row.docx_b64), 'base64'),
      pptxBuffer: Buffer.from(String(row.pptx_b64), 'base64'),
      speechDocxBuffer: Buffer.from(String(row.speech_docx_b64), 'base64'),
    };
    projects.set(rec.id, rec);
    projectOrder.push(rec.id);
  }

  console.log(
    `[Store] Neon PostgreSQL подключена: пользователей ${users.size}, проектов ${projects.size}.`
  );
}

async function syncUserToPg(user: UserProfile): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `
      INSERT INTO bot_users (
        user_id, chat_id, username, display_name, credits, generated_count,
        created_at, updated_at, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id) DO UPDATE SET
        chat_id = EXCLUDED.chat_id,
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        credits = EXCLUDED.credits,
        generated_count = EXCLUDED.generated_count,
        updated_at = EXCLUDED.updated_at,
        last_seen_at = EXCLUDED.last_seen_at
      `,
      [
        user.userId,
        user.chatId ?? null,
        user.username ?? null,
        user.displayName,
        user.credits,
        user.generatedCount,
        user.createdAt,
        user.updatedAt,
        user.lastSeenAt,
      ]
    );
  } catch (err) {
    console.warn(`[Store] Ошибка записи пользователя ${user.userId} в Neon:`, err);
  }
}

async function syncProjectToPg(record: ProjectRecord, activeIds: string[]): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `
      INSERT INTO bot_projects (
        id, created_at, input_json, content_json,
        filename, pptx_filename, speech_filename,
        word_count, estimated_pages,
        docx_b64, pptx_b64, speech_docx_b64
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        created_at = EXCLUDED.created_at,
        input_json = EXCLUDED.input_json,
        content_json = EXCLUDED.content_json,
        filename = EXCLUDED.filename,
        pptx_filename = EXCLUDED.pptx_filename,
        speech_filename = EXCLUDED.speech_filename,
        word_count = EXCLUDED.word_count,
        estimated_pages = EXCLUDED.estimated_pages,
        docx_b64 = EXCLUDED.docx_b64,
        pptx_b64 = EXCLUDED.pptx_b64,
        speech_docx_b64 = EXCLUDED.speech_docx_b64
      `,
      [
        record.id,
        record.createdAt,
        JSON.stringify(record.input),
        JSON.stringify(record.content),
        record.filename,
        record.pptxFilename,
        record.speechFilename,
        record.wordCount,
        record.estimatedPages,
        record.docxBuffer.toString('base64'),
        record.pptxBuffer.toString('base64'),
        record.speechDocxBuffer.toString('base64'),
      ]
    );

    if (activeIds.length > 0) {
      await pool.query(
        `DELETE FROM bot_projects WHERE NOT (id = ANY($1::text[]))`,
        [activeIds]
      );
    }
  } catch (err) {
    console.warn(`[Store] Ошибка записи проекта ${record.id} в Neon:`, err);
  }
}

export async function initStore(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    loadUsersFromDisk();
    loadProjectsFromDisk();

    if (usePg) {
      await initPgSchemaAndLoad();
    } else {
      console.warn(
        '[Store] DATABASE_URL не задан — используется локальная файловая система.'
      );
    }
  })();

  return initPromise;
}

if (!usePg) {
  loadUsersFromDisk();
  loadProjectsFromDisk();
}

export function isAdminUsername(username?: string | null): boolean {
  if (!username) return false;
  return username.trim().replace(/^@/, '').toLowerCase() === ADMIN_USERNAME;
}

export function ensureUserProfile(params: {
  userId: string;
  chatId?: string;
  username?: string;
  displayName?: string;
}): UserProfile {
  const now = new Date().toISOString();
  const cleanUsername = params.username?.trim().replace(/^@/, '') || undefined;
  const existing = users.get(params.userId);
  if (existing) {
    let changed = false;
    if (params.chatId && existing.chatId !== params.chatId) {
      existing.chatId = params.chatId;
      changed = true;
    }
    if (cleanUsername && existing.username !== cleanUsername) {
      existing.username = cleanUsername;
      changed = true;
    }
    if (params.displayName && existing.displayName !== params.displayName) {
      existing.displayName = params.displayName;
      changed = true;
    }
    existing.lastSeenAt = now;
    if (changed) {
      existing.updatedAt = now;
    }
    if (usePg) {
      void syncUserToPg(existing);
    } else if (changed) {
      persistUsersToDisk();
    }
    return existing;
  }

  const created: UserProfile = {
    userId: params.userId,
    chatId: params.chatId,
    username: cleanUsername,
    displayName:
      params.displayName?.trim() ||
      (cleanUsername ? `@${cleanUsername}` : `Пользователь ${params.userId}`),
    credits: 0,
    generatedCount: 0,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
  users.set(params.userId, created);

  if (usePg) {
    void syncUserToPg(created);
  } else {
    persistUsersToDisk();
  }
  return created;
}

export function getUserProfile(userId: string): UserProfile | undefined {
  return users.get(userId);
}

export function findUserByIdOrUsername(query: string): UserProfile | undefined {
  const clean = query.trim();
  if (!clean) return undefined;

  const byId = users.get(clean);
  if (byId) return byId;

  const noAt = clean.replace(/^@/, '').toLowerCase();
  for (const user of users.values()) {
    if (user.userId.toLowerCase() === noAt) return user;
    if (user.username && user.username.toLowerCase() === noAt) return user;
  }
  return undefined;
}

export function getOrProvisionTargetUser(query: string): UserProfile | undefined {
  const found = findUserByIdOrUsername(query);
  if (found) return found;

  const clean = query.trim();
  if (/^\d{5,20}$/.test(clean)) {
    return ensureUserProfile({
      userId: clean,
      chatId: clean,
      displayName: `Telegram ID ${clean}`,
    });
  }
  return undefined;
}

export function adjustUserCredits(userId: string, delta: number): UserProfile | undefined {
  const user = users.get(userId);
  if (!user) return undefined;
  user.credits = Math.max(0, user.credits + Math.trunc(delta));
  user.updatedAt = new Date().toISOString();

  if (usePg) {
    void syncUserToPg(user);
  } else {
    persistUsersToDisk();
  }
  return user;
}

export function incrementUserGeneratedCount(userId: string): void {
  const user = users.get(userId);
  if (!user) return;
  user.generatedCount += 1;
  user.updatedAt = new Date().toISOString();

  if (usePg) {
    void syncUserToPg(user);
  } else {
    persistUsersToDisk();
  }
}

export function listRecentUsers(limit = 10): UserProfile[] {
  return Array.from(users.values())
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, limit);
}

export function getUsersStats(): {
  totalUsers: number;
  totalCreditsAvailable: number;
  totalGeneratedByUsers: number;
} {
  let totalCreditsAvailable = 0;
  let totalGeneratedByUsers = 0;
  for (const u of users.values()) {
    totalCreditsAvailable += u.credits;
    totalGeneratedByUsers += u.generatedCount;
  }
  return {
    totalUsers: users.size,
    totalCreditsAvailable,
    totalGeneratedByUsers,
  };
}

export function saveProject(record: ProjectRecord): void {
  if (!projects.has(record.id)) {
    projectOrder.unshift(record.id);
  } else {
    const idx = projectOrder.indexOf(record.id);
    if (idx > 0) {
      projectOrder.splice(idx, 1);
      projectOrder.unshift(record.id);
    }
  }
  projects.set(record.id, record);

  while (projectOrder.length > MAX_PROJECTS) {
    const oldestId = projectOrder.pop();
    if (oldestId) {
      projects.delete(oldestId);
      if (!usePg) {
        removeProjectFromDisk(oldestId);
      }
    }
  }

  if (usePg) {
    void syncProjectToPg(record, [...projectOrder]);
  } else {
    persistProjectRecordToDisk(record);
    persistProjectsIndex();
  }
}

export function getProject(id: string): ProjectRecord | undefined {
  return projects.get(id);
}

export function listProjectSummaries(): ProjectSummary[] {
  const summaries: ProjectSummary[] = [];
  for (const id of projectOrder) {
    const rec = projects.get(id);
    if (!rec) continue;
    summaries.push({
      id: rec.id,
      createdAt: rec.createdAt,
      topic: rec.input.topic,
      subject: rec.input.subject,
      level: rec.input.level,
      projectType: rec.input.projectType,
      chaptersCount: rec.input.chaptersCount,
      targetPages: rec.input.targetPages,
      authorName: rec.input.authorName,
      institution: rec.input.institution,
      filename: rec.filename,
      pptxFilename: rec.pptxFilename,
      speechFilename: rec.speechFilename,
      wordCount: rec.wordCount,
      estimatedPages: rec.estimatedPages,
      source: rec.input.source ?? 'studio',
    });
  }
  return summaries;
}

export function getTotalProjectsCount(): number {
  return projects.size;
}

export function getOrCreateSession(chatKey: string): BotSessionState {
  const existing = sessions.get(chatKey);
  if (existing) {
    return existing;
  }
  const fresh: BotSessionState = {
    step: 'idle',
    draft: {},
    updatedAt: Date.now(),
  };
  sessions.set(chatKey, fresh);
  return fresh;
}

export function updateSession(
  chatKey: string,
  updater: (current: BotSessionState) => BotSessionState
): BotSessionState {
  const current = getOrCreateSession(chatKey);
  const next = updater(current);
  next.updatedAt = Date.now();
  sessions.set(chatKey, next);
  return next;
}

export function resetSession(chatKey: string): BotSessionState {
  const fresh: BotSessionState = {
    step: 'idle',
    draft: {},
    updatedAt: Date.now(),
  };
  sessions.set(chatKey, fresh);
  return fresh;
}
