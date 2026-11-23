import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAndSaveProject,
  getBotRuntimeStatus,
  handleBotTurn,
  startTelegramBot,
} from './src/server/botEngine.ts';
import { suggestProjectTopics } from './src/server/projectGenerator.ts';
import {
  getProject,
  initStore,
  listProjectSummaries,
  resetSession,
} from './src/server/store.ts';
import type {
  ChaptersCount,
  EducationLevel,
  ProjectInput,
  ProjectType,
} from './src/server/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeString(value: unknown, maxLen = 240): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, maxLen);
}

async function createApp() {
  await initStore();
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/bot/status', (_req, res) => {
    res.json(getBotRuntimeStatus());
  });

  app.get('/api/projects', (_req, res) => {
    res.json({ projects: listProjectSummaries() });
  });

  app.get('/api/projects/:id', (req, res) => {
    const id = req.params.id;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({ error: 'Некорректный идентификатор проекта.' });
      return;
    }
    const record = getProject(id);
    if (!record) {
      res.status(404).json({ error: 'Проект не найден.' });
      return;
    }
    res.json({
      id: record.id,
      createdAt: record.createdAt,
      input: record.input,
      content: record.content,
      filename: record.filename,
      pptxFilename: record.pptxFilename,
      speechFilename: record.speechFilename,
      wordCount: record.wordCount,
      estimatedPages: record.estimatedPages,
    });
  });

  app.get('/api/projects/:id/docx', (req, res) => {
    const id = req.params.id;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({ error: 'Некорректный идентификатор проекта.' });
      return;
    }
    const record = getProject(id);
    if (!record) {
      res.status(404).json({ error: 'Файл проекта не найден.' });
      return;
    }

    const safeAsciiName = record.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(safeAsciiName)}`
    );
    res.setHeader('Content-Length', String(record.docxBuffer.length));
    res.send(record.docxBuffer);
  });

  app.get('/api/projects/:id/pptx', (req, res) => {
    const id = req.params.id;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({ error: 'Некорректный идентификатор проекта.' });
      return;
    }
    const record = getProject(id);
    if (!record) {
      res.status(404).json({ error: 'Файл презентации не найден.' });
      return;
    }

    const safeAsciiName = record.pptxFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(safeAsciiName)}`
    );
    res.setHeader('Content-Length', String(record.pptxBuffer.length));
    res.send(record.pptxBuffer);
  });

  app.get('/api/projects/:id/speech-docx', (req, res) => {
    const id = req.params.id;
    if (!UUID_REGEX.test(id)) {
      res.status(400).json({ error: 'Некорректный идентификатор проекта.' });
      return;
    }
    const record = getProject(id);
    if (!record) {
      res.status(404).json({ error: 'Файл речи для защиты не найден.' });
      return;
    }

    const safeAsciiName = record.speechFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAsciiName}"; filename*=UTF-8''${encodeURIComponent(safeAsciiName)}`
    );
    res.setHeader('Content-Length', String(record.speechDocxBuffer.length));
    res.send(record.speechDocxBuffer);
  });

  app.post('/api/topics/suggest', async (req, res) => {
    try {
      const subject = sanitizeString(req.body?.subject, 100) || 'Информатика';
      const level = sanitizeString(req.body?.level, 50) || '10–11 класс';
      const topics = await suggestProjectTopics(subject, level);
      res.json({ topics });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка подбора тем';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/projects/generate', async (req, res) => {
    try {
      const topic = sanitizeString(req.body?.topic, 260);
      if (topic.length < 4) {
        res.status(400).json({ error: 'Укажите тему проекта (минимум 4 символа).' });
        return;
      }

      const validLevels: EducationLevel[] = ['9 класс', '10–11 класс', 'Колледж (СПО)'];
      const validTypes: ProjectType[] = [
        'Исследовательский',
        'Практико-ориентированный',
        'Информационный',
        'Творческий',
      ];

      const rawLevel = sanitizeString(req.body?.level, 40) as EducationLevel;
      const rawType = sanitizeString(req.body?.projectType, 60) as ProjectType;
      const rawChapters = Number(req.body?.chaptersCount);
      const chaptersCount: ChaptersCount =
        rawChapters === 2 || rawChapters === 3 || rawChapters === 4 ? rawChapters : 2;
      const rawPages = Number(req.body?.targetPages);
      const targetPages =
        Number.isFinite(rawPages) && rawPages >= 8 && rawPages <= 20
          ? Math.round(rawPages)
          : 14;

      const input: ProjectInput = {
        topic,
        subject: sanitizeString(req.body?.subject, 100) || 'Информатика',
        level: validLevels.includes(rawLevel) ? rawLevel : '10–11 класс',
        projectType: validTypes.includes(rawType) ? rawType : 'Исследовательский',
        chaptersCount,
        targetPages,
        institution:
          sanitizeString(req.body?.institution, 200) ||
          'МБОУ «Средняя общеобразовательная школа № 1»',
        authorName: sanitizeString(req.body?.authorName, 120) || 'Иванов Алексей Сергеевич',
        authorClass: sanitizeString(req.body?.authorClass, 60) || '10 «А» класс',
        supervisorName:
          sanitizeString(req.body?.supervisorName, 140) ||
          'Петрова Елена Викторовна, учитель',
        city: sanitizeString(req.body?.city, 80) || 'Москва',
        year: /^\d{4}$/.test(sanitizeString(req.body?.year, 10))
          ? sanitizeString(req.body?.year, 10)
          : String(new Date().getFullYear()),
        source: 'studio',
      };

      const record = await createAndSaveProject(input);
      res.json({
        id: record.id,
        createdAt: record.createdAt,
        input: record.input,
        content: record.content,
        filename: record.filename,
        pptxFilename: record.pptxFilename,
        speechFilename: record.speechFilename,
        wordCount: record.wordCount,
        estimatedPages: record.estimatedPages,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось сгенерировать проект';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/projects/generate-stream', async (req, res) => {
    const topic = sanitizeString(req.body?.topic, 260);
    if (topic.length < 4) {
      res.status(400).json({ error: 'Укажите тему проекта (минимум 4 символа).' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, payload: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const validLevels: EducationLevel[] = ['9 класс', '10–11 класс', 'Колледж (СПО)'];
      const validTypes: ProjectType[] = [
        'Исследовательский',
        'Практико-ориентированный',
        'Информационный',
        'Творческий',
      ];

      const rawLevel = sanitizeString(req.body?.level, 40) as EducationLevel;
      const rawType = sanitizeString(req.body?.projectType, 60) as ProjectType;
      const rawChapters = Number(req.body?.chaptersCount);
      const chaptersCount: ChaptersCount =
        rawChapters === 2 || rawChapters === 3 || rawChapters === 4 ? rawChapters : 2;
      const rawPages = Number(req.body?.targetPages);
      const targetPages =
        Number.isFinite(rawPages) && rawPages >= 8 && rawPages <= 20
          ? Math.round(rawPages)
          : 14;

      const input: ProjectInput = {
        topic,
        subject: sanitizeString(req.body?.subject, 100) || 'Информатика',
        level: validLevels.includes(rawLevel) ? rawLevel : '10–11 класс',
        projectType: validTypes.includes(rawType) ? rawType : 'Исследовательский',
        chaptersCount,
        targetPages,
        institution:
          sanitizeString(req.body?.institution, 200) ||
          'МБОУ «Средняя общеобразовательная школа № 1»',
        authorName: sanitizeString(req.body?.authorName, 120) || 'Иванов Алексей Сергеевич',
        authorClass: sanitizeString(req.body?.authorClass, 60) || '10 «А» класс',
        supervisorName:
          sanitizeString(req.body?.supervisorName, 140) ||
          'Петрова Елена Викторовна, учитель',
        city: sanitizeString(req.body?.city, 80) || 'Москва',
        year: /^\d{4}$/.test(sanitizeString(req.body?.year, 10))
          ? sanitizeString(req.body?.year, 10)
          : String(new Date().getFullYear()),
        source: 'studio',
      };

      sendEvent('progress', {
        percent: 5,
        stage: `Запуск генерации (${chaptersCount} глав, ~${targetPages} стр.)...`,
      });

      const record = await createAndSaveProject(input, (update) => {
        sendEvent('progress', update);
      });

      sendEvent('done', {
        id: record.id,
        createdAt: record.createdAt,
        input: record.input,
        content: record.content,
        filename: record.filename,
        pptxFilename: record.pptxFilename,
        speechFilename: record.speechFilename,
        wordCount: record.wordCount,
        estimatedPages: record.estimatedPages,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось сгенерировать проект';
      sendEvent('error', { error: message });
    } finally {
      res.end();
    }
  });

  app.post('/api/simulator/message', async (req, res) => {
    try {
      const rawSessionId = sanitizeString(req.body?.sessionId, 80) || 'default-web';
      const chatKey = `sim:${rawSessionId}`;
      const text =
        typeof req.body?.text === 'string'
          ? req.body.text.trim().slice(0, 400)
          : undefined;
      const callbackData =
        typeof req.body?.callbackData === 'string'
          ? req.body.callbackData.trim().slice(0, 80)
          : undefined;

      const result = await handleBotTurn({
        chatKey,
        userId: rawSessionId,
        displayName: 'Пользователь симулятора',
        source: 'simulator',
        text,
        callbackData,
      });

      res.json({
        replies: result.replies,
        user: {
          userId: result.user.userId,
          username: result.user.username,
          displayName: result.user.displayName,
          credits: result.user.credits,
          generatedCount: result.user.generatedCount,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка симулятора бота';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/simulator/message-stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, payload: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const rawSessionId = sanitizeString(req.body?.sessionId, 80) || 'default-web';
      const chatKey = `sim:${rawSessionId}`;
      const text =
        typeof req.body?.text === 'string'
          ? req.body.text.trim().slice(0, 400)
          : undefined;
      const callbackData =
        typeof req.body?.callbackData === 'string'
          ? req.body.callbackData.trim().slice(0, 80)
          : undefined;

      const result = await handleBotTurn({
        chatKey,
        userId: rawSessionId,
        displayName: 'Пользователь симулятора',
        source: 'simulator',
        text,
        callbackData,
        onProgress: async (update) => {
          sendEvent('progress', update);
        },
      });

      sendEvent('done', {
        replies: result.replies,
        user: {
          userId: result.user.userId,
          username: result.user.username,
          displayName: result.user.displayName,
          credits: result.user.credits,
          generatedCount: result.user.generatedCount,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка симулятора бота';
      sendEvent('error', { error: message });
    } finally {
      res.end();
    }
  });

  app.post('/api/simulator/reset', (req, res) => {
    const rawSessionId = sanitizeString(req.body?.sessionId, 80) || 'default-web';
    resetSession(`sim:${rawSessionId}`);
    res.json({ ok: true });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] ПроектБот ГОСТ запущен на http://0.0.0.0:${PORT}`);
    void startTelegramBot();
  });
}

createApp().catch((err) => {
  console.error('[Server] Критическая ошибка запуска:', err);
  process.exit(1);
});
