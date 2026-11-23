import crypto from 'node:crypto';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import {
  buildDefenseSpeechDocxBuffer,
  buildGostDocxBuffer,
  countProjectWords,
  makeSafeDocxFilename,
  makeSafePptxFilename,
  makeSafeSpeechFilename,
} from './gostDocx.ts';
import { buildPresentationPptxBuffer } from './pptxGenerator.ts';
import {
  generateGostProjectContent,
  suggestProjectTopics,
} from './projectGenerator.ts';
import {
  ADMIN_USERNAME,
  PROJECT_PRICE_RUB,
  adjustUserCredits,
  ensureUserProfile,
  getOrCreateSession,
  getOrProvisionTargetUser,
  getProject,
  getTotalProjectsCount,
  getUserProfile,
  getUsersStats,
  incrementUserGeneratedCount,
  isAdminUsername,
  listRecentUsers,
  resetSession,
  saveProject,
  updateSession,
} from './store.ts';
import type {
  BotReplyMessage,
  BotRuntimeStatus,
  ChaptersCount,
  EducationLevel,
  InlineButton,
  ProgressUpdate,
  ProjectInput,
  ProjectRecord,
  ProjectType,
  UserProfile,
} from './types.ts';

const SUPPORT_URL = `https://t.me/${ADMIN_USERNAME}`;

const SUBJECTS = [
  'Информатика',
  'История',
  'Обществознание',
  'Биология',
  'Физика',
  'Экономика',
  'Литература',
  'Химия',
  'География',
  'Математика',
];

const LEVELS: EducationLevel[] = ['9 класс', '10–11 класс', 'Колледж (СПО)'];

const PROJECT_TYPES: ProjectType[] = [
  'Исследовательский',
  'Практико-ориентированный',
  'Информационный',
  'Творческий',
];

const CHAPTER_OPTIONS: { count: ChaptersCount; label: string }[] = [
  { count: 2, label: '2 главы (классика)' },
  { count: 3, label: '3 главы (углублённый)' },
  { count: 4, label: '4 главы (максимальный)' },
];

const PAGE_OPTIONS: { pages: number; label: string }[] = [
  { pages: 10, label: '10 страниц' },
  { pages: 14, label: '14 страниц' },
  { pages: 18, label: '18 страниц' },
  { pages: 20, label: '20 страниц (макс.)' },
];

const activeGenerations = new Set<string>();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderTelegramProgressBar(percent: number, stage: string): string {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round(clamped / 10);
  const bar = '🟩'.repeat(filled) + '⬜'.repeat(10 - filled);
  return (
    `⏳ <b>Генерация проекта по ГОСТ</b>\n\n` +
    `${bar} <b>${clamped}%</b>\n` +
    `<i>${escapeHtml(stage)}</i>`
  );
}

function getGostSummaryHtml(): string {
  const year = new Date().getFullYear();
  const minYear = year - 7;
  return (
    `📐 <b>Стандарты оформления (ГОСТ 7.32-2017)</b>\n\n` +
    `<blockquote>` +
    `• <b>Формат:</b> A4 (210 × 297 мм)\n` +
    `• <b>Поля:</b> левое 30 мм, правое 15 мм, верх/низ 20 мм\n` +
    `• <b>Шрифт:</b> Times New Roman, 14 пт, чёрный\n` +
    `• <b>Интервал:</b> 1,5 строки · красная строка 1,25 см\n` +
    `• <b>Структура:</b> 2–4 главы, до 20 стр., таблицы и блок-схемы, без Приложения А\n` +
    `• <b>Источники:</b> строго не старше 7 лет (${minYear}–${year} гг.) по ГОСТ Р 7.0.5-2008` +
    `</blockquote>\n\n` +
    `🎁 <b>В комплекте к каждому проекту всегда идут:</b>\n` +
    `1. Документ проекта <code>.docx</code> по ГОСТ\n` +
    `2. Презентация PowerPoint <code>.pptx</code> ровно на <b>10 слайдов</b>\n` +
    `3. Текст речи для защиты <code>.docx</code> + ответы на вопросы комиссии`
  );
}

let telegramBotInstance: Bot | null = null;
let telegramStatus: Omit<BotRuntimeStatus, 'totalProjects'> = {
  telegramConfigured: false,
  telegramRunning: false,
  botUsername: null,
  botName: null,
  lastError: null,
  gostStandard: 'ГОСТ 7.32-2017',
  supportUsername: `@${ADMIN_USERNAME}`,
};

export function getBotRuntimeStatus(): BotRuntimeStatus {
  return {
    ...telegramStatus,
    totalProjects: getTotalProjectsCount(),
  };
}

function defaultProjectDraft(
  partial: Partial<ProjectInput>,
  source: 'telegram' | 'simulator' | 'studio'
): ProjectInput {
  const currentYear = String(new Date().getFullYear());
  return {
    topic: (partial.topic ?? 'Цифровая грамотность в современном образовании').trim(),
    subject: (partial.subject ?? 'Информатика').trim(),
    level: partial.level ?? '10–11 класс',
    projectType: partial.projectType ?? 'Исследовательский',
    chaptersCount: partial.chaptersCount ?? 2,
    targetPages: Math.min(20, Math.max(8, partial.targetPages ?? 14)),
    institution: (
      partial.institution ?? 'МБОУ «Средняя общеобразовательная школа № 1»'
    ).trim(),
    authorName: (partial.authorName ?? 'Иванов Алексей Сергеевич').trim(),
    authorClass: (partial.authorClass ?? '10 «А» класс').trim(),
    supervisorName: (
      partial.supervisorName ?? 'Петрова Елена Викторовна, учитель'
    ).trim(),
    city: (partial.city ?? 'Москва').trim(),
    year: (partial.year ?? currentYear).trim(),
    source,
  };
}

export async function createAndSaveProject(
  input: ProjectInput,
  onProgress?: (update: ProgressUpdate) => void | Promise<void>
): Promise<ProjectRecord> {
  const content = await generateGostProjectContent(input, onProgress);

  if (onProgress) {
    await Promise.resolve(
      onProgress({
        percent: 88,
        stage: 'Верстаю проект (.docx), презентацию (10 слайдов .pptx) и речь...',
      })
    ).catch(() => {});
  }

  const [docxBuffer, pptxBuffer, speechDocxBuffer] = await Promise.all([
    buildGostDocxBuffer(input, content),
    buildPresentationPptxBuffer(input, content),
    buildDefenseSpeechDocxBuffer(input, content),
  ]);

  if (onProgress) {
    await Promise.resolve(
      onProgress({
        percent: 100,
        stage: 'Готово! Сохраняю и отправляю комплект файлов...',
      })
    ).catch(() => {});
  }

  const wordCount = countProjectWords(content);
  const estimatedPages = Math.min(20, Math.max(8, Math.round(wordCount / 255) + 3));
  const id = crypto.randomUUID();

  const record: ProjectRecord = {
    id,
    createdAt: new Date().toISOString(),
    input,
    content,
    docxBuffer,
    pptxBuffer,
    speechDocxBuffer,
    filename: makeSafeDocxFilename(input.topic),
    pptxFilename: makeSafePptxFilename(input.topic),
    speechFilename: makeSafeSpeechFilename(input.topic),
    wordCount,
    estimatedPages,
  };

  saveProject(record);
  return record;
}

function subjectButtons(): InlineButton[][] {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < SUBJECTS.length; i += 2) {
    const row: InlineButton[] = [
      { text: SUBJECTS[i], callbackData: `subj:${i}`, style: 'primary' },
    ];
    if (SUBJECTS[i + 1]) {
      row.push({
        text: SUBJECTS[i + 1],
        callbackData: `subj:${i + 1}`,
        style: 'primary',
      });
    }
    rows.push(row);
  }
  rows.push([{ text: '✖️ Отменить', callbackData: 'action:cancel', style: 'danger' }]);
  return rows;
}

function mainMenuButtons(isAdmin: boolean): InlineButton[][] {
  const rows: InlineButton[][] = [
    [
      {
        text: '🚀 Создать проект по ГОСТ',
        callbackData: 'action:new',
        style: 'success',
      },
    ],
    [
      { text: '👤 Профиль', callbackData: 'action:profile', style: 'primary' },
      {
        text: `💳 Купить проект · ${PROJECT_PRICE_RUB}₽`,
        callbackData: 'action:buy',
        style: 'primary',
      },
    ],
    [
      { text: '📐 Стандарт ГОСТ', callbackData: 'action:gost', style: 'primary' },
      { text: '🆘 Поддержка', url: SUPPORT_URL, style: 'primary' },
    ],
  ];

  if (isAdmin) {
    rows.push([
      {
        text: '👑 Админ-панель (@indproekt_help)',
        callbackData: 'admin:menu',
        style: 'danger',
      },
    ]);
  }
  return rows;
}

function noCreditsKeyboard(): InlineButton[][] {
  return [
    [
      {
        text: `💳 Купить проект — ${PROJECT_PRICE_RUB}₽`,
        callbackData: 'action:buy',
        style: 'success',
      },
    ],
    [
      {
        text: `💬 Написать @${ADMIN_USERNAME}`,
        url: SUPPORT_URL,
        style: 'primary',
      },
      { text: '👤 Мой профиль и ID', callbackData: 'action:profile', style: 'primary' },
    ],
    [{ text: '⬅️ Главное меню', callbackData: 'action:menu', style: 'primary' }],
  ];
}

function confirmKeyboard(): InlineButton[][] {
  return [
    [
      {
        text: '✅ Сгенерировать проект, слайды и речь (1 ген.)',
        callbackData: 'action:generate',
        style: 'success',
      },
    ],
    [
      { text: '✏️ Изменить тему', callbackData: 'action:edit_topic', style: 'primary' },
      { text: '🔄 Сбросить', callbackData: 'action:cancel', style: 'danger' },
    ],
  ];
}

function buildProfileReply(user: UserProfile, isAdmin: boolean): BotReplyMessage {
  return {
    text:
      `👤 <b>Ваш профиль</b>\n\n` +
      `<blockquote>` +
      `🆔 <b>Ваш ID:</b> <code>${escapeHtml(user.userId)}</code> <i>(нажмите, чтобы скопировать)</i>\n` +
      `👤 <b>Аккаунт:</b> ${escapeHtml(user.displayName)}${user.username ? ` (@${escapeHtml(user.username)})` : ''}\n` +
      `🎟 <b>Доступно генераций:</b> <b>${user.credits}</b>\n` +
      `📁 <b>Создано проектов:</b> <b>${user.generatedCount}</b>` +
      `</blockquote>\n\n` +
      `💡 <i>Чтобы пополнить генерации (${PROJECT_PRICE_RUB}₽ / 1 проект), отправьте ваш ID <code>${escapeHtml(user.userId)}</code> администратору @${ADMIN_USERNAME}.</i>`,
    parseMode: 'HTML',
    inlineKeyboard: [
      [
        {
          text: `💳 Купить генерацию — ${PROJECT_PRICE_RUB}₽`,
          callbackData: 'action:buy',
          style: 'success',
        },
      ],
      [
        {
          text: `🆘 Поддержка @${ADMIN_USERNAME}`,
          url: SUPPORT_URL,
          style: 'primary',
        },
        ...(user.credits > 0
          ? [
              {
                text: '🚀 Создать проект',
                callbackData: 'action:new',
                style: 'primary' as const,
              },
            ]
          : []),
      ],
      ...(isAdmin
        ? [
            [
              {
                text: '👑 Админ-панель',
                callbackData: 'admin:menu',
                style: 'danger' as const,
              },
            ],
          ]
        : []),
      [{ text: '⬅️ Главное меню', callbackData: 'action:menu', style: 'primary' }],
    ],
  };
}

function buildBuyReply(user: UserProfile): BotReplyMessage {
  return {
    text:
      `💳 <b>Купить генерацию проекта — ${PROJECT_PRICE_RUB}₽</b>\n\n` +
      `За <b>${PROJECT_PRICE_RUB}₽</b> вы получаете <b>1 полную генерацию</b> под ключ:\n` +
      `<blockquote>` +
      `📄 Проект <code>.docx</code> по ГОСТ 7.32-2017 (2–4 главы, до 20 стр., таблицы и блок-схемы)\n` +
      `📚 Список источников не старше 7 лет по ГОСТ Р 7.0.5-2008\n` +
      `📊 Презентация <code>.pptx</code> ровно на <b>10 слайдов</b>\n` +
      `🎤 Текст речи для защиты <code>.docx</code> + ответы комиссии` +
      `</blockquote>\n\n` +
      `🆔 <b>Ваш ID для начисления:</b> <code>${escapeHtml(user.userId)}</code>\n` +
      `🎟 <b>Текущий баланс:</b> <b>${user.credits}</b> генераций\n\n` +
      `📌 <b>Как купить:</b>\n` +
      `1. Нажмите на ваш ID выше — он скопируется.\n` +
      `2. Напишите в личные сообщения @${ADMIN_USERNAME} и отправьте ваш ID.\n` +
      `3. После оплаты администратор сразу начислит генерацию, и бот пришлёт уведомление.`,
    parseMode: 'HTML',
    inlineKeyboard: [
      [
        {
          text: `💬 Написать @${ADMIN_USERNAME} (${PROJECT_PRICE_RUB}₽)`,
          url: SUPPORT_URL,
          style: 'success',
        },
      ],
      [
        { text: '👤 Мой профиль и ID', callbackData: 'action:profile', style: 'primary' },
        { text: '⬅️ В меню', callbackData: 'action:menu', style: 'primary' },
      ],
    ],
  };
}

function buildNoCreditsReply(user: UserProfile): BotReplyMessage {
  return {
    text:
      `🔒 <b>Недостаточно генераций (баланс: ${user.credits})</b>\n\n` +
      `Для создания проекта, презентации (10 слайдов) и речи для защиты нужна минимум <b>1 генерация</b>.\n\n` +
      `💳 Стоимость: <b>${PROJECT_PRICE_RUB}₽</b>\n` +
      `🆔 Ваш ID для выдачи доступа: <code>${escapeHtml(user.userId)}</code>\n\n` +
      `Напишите администратору @${ADMIN_USERNAME} и передайте ваш ID, чтобы получить доступ.`,
    parseMode: 'HTML',
    inlineKeyboard: noCreditsKeyboard(),
  };
}

function buildAdminMenuReply(adminUser: UserProfile): BotReplyMessage {
  const stats = getUsersStats();
  return {
    text:
      `👑 <b>Админ-панель @${ADMIN_USERNAME}</b>\n\n` +
      `<blockquote>` +
      `👥 Пользователей в базе: <b>${stats.totalUsers}</b>\n` +
      `🎟 Суммарно неиспользованных генераций: <b>${stats.totalCreditsAvailable}</b>\n` +
      `📁 Сгенерировано проектов пользователями: <b>${stats.totalGeneratedByUsers}</b>\n` +
      `🆔 Ваш админ-ID: <code>${escapeHtml(adminUser.userId)}</code> (баланс: <b>${adminUser.credits}</b>)` +
      `</blockquote>\n\n` +
      `<b>Быстрая команда в чате:</b>\n` +
      `<code>/add ID</code> — выдать 1 генерацию пользователю\n` +
      `<code>/add ID 3</code> — выдать 3 генерации\n` +
      `<code>/add @username</code> — выдать по username`,
    parseMode: 'HTML',
    inlineKeyboard: [
      [
        {
          text: '➕ Выдать 1 генерацию по ID',
          callbackData: 'admin:prompt_add',
          style: 'success',
        },
      ],
      [
        {
          text: '👥 Пользователи и выдача в 1 клик',
          callbackData: 'admin:users',
          style: 'primary',
        },
      ],
      [
        {
          text: '⚡ Выдать +1 себе',
          callbackData: `admin:give1:${adminUser.userId}`,
          style: 'success',
        },
        {
          text: '📊 Статистика',
          callbackData: 'admin:stats',
          style: 'primary',
        },
      ],
      [{ text: '⬅️ Главное меню', callbackData: 'action:menu', style: 'primary' }],
    ],
  };
}

function buildAdminUsersReply(): BotReplyMessage {
  const recent = listRecentUsers(8);
  if (recent.length === 0) {
    return {
      text: '👥 Пользователей пока нет.',
      parseMode: 'HTML',
      inlineKeyboard: [
        [{ text: '⬅️ В админ-панель', callbackData: 'admin:menu', style: 'primary' }],
      ],
    };
  }

  const lines = recent.map(
    (u, idx) =>
      `<b>${idx + 1}.</b> ${escapeHtml(u.displayName)}${
        u.username ? ` (@${escapeHtml(u.username)})` : ''
      }\n    🆔 <code>${escapeHtml(u.userId)}</code> · 🎟 <b>${u.credits}</b> · 📁 ${u.generatedCount}`
  );

  const kb: InlineButton[][] = recent.map((u) => [
    {
      text: `👤 ${u.username ? `@${u.username}` : u.userId} (${u.credits})`,
      callbackData: `admin:user:${u.userId}`,
      style: 'primary' as const,
    },
    {
      text: '➕ +1',
      callbackData: `admin:give1:${u.userId}`,
      style: 'success' as const,
    },
  ]);
  kb.push([{ text: '⬅️ В админ-панель', callbackData: 'admin:menu', style: 'primary' }]);

  return {
    text:
      `👥 <b>Последние пользователи (${recent.length})</b>\n\n` +
      lines.join('\n\n') +
      `\n\nНажмите <b>➕ +1</b> справа от пользователя для мгновенной выдачи генерации:`,
    parseMode: 'HTML',
    inlineKeyboard: kb,
  };
}

function buildAdminSingleUserReply(target: UserProfile): BotReplyMessage {
  return {
    text:
      `👤 <b>Управление пользователем</b>\n\n` +
      `<blockquote>` +
      `🆔 <b>ID:</b> <code>${escapeHtml(target.userId)}</code>\n` +
      `👤 <b>Имя:</b> ${escapeHtml(target.displayName)}${
        target.username ? ` (@${escapeHtml(target.username)})` : ''
      }\n` +
      `🎟 <b>Доступно генераций:</b> <b>${target.credits}</b>\n` +
      `📁 <b>Создано проектов:</b> <b>${target.generatedCount}</b>` +
      `</blockquote>`,
    parseMode: 'HTML',
    inlineKeyboard: [
      [
        {
          text: '➕ Выдать +1 (300₽)',
          callbackData: `admin:give1:${target.userId}`,
          style: 'success',
        },
        {
          text: '➕ Выдать +3',
          callbackData: `admin:give3:${target.userId}`,
          style: 'primary',
        },
      ],
      [
        {
          text: '➖ Списать -1',
          callbackData: `admin:take1:${target.userId}`,
          style: 'danger',
        },
      ],
      [
        { text: '⬅️ К списку', callbackData: 'admin:users', style: 'primary' },
        { text: '👑 Админ-панель', callbackData: 'admin:menu', style: 'primary' },
      ],
    ],
  };
}

function creditUserAndBuildReply(params: {
  targetQuery: string;
  amount: number;
  adminUser: UserProfile;
}): BotReplyMessage {
  const { targetQuery, amount, adminUser } = params;
  const target = getOrProvisionTargetUser(targetQuery);
  if (!target) {
    return {
      text:
        `❌ Пользователь <code>${escapeHtml(targetQuery)}</code> не найден.\n\n` +
        `Укажите числовой ID пользователя из его профиля (или <code>@username</code>, если он уже запускал бота).`,
      parseMode: 'HTML',
      inlineKeyboard: [
        [{ text: '👥 Список пользователей', callbackData: 'admin:users', style: 'primary' }],
        [{ text: '👑 Админ-панель', callbackData: 'admin:menu', style: 'primary' }],
      ],
    };
  }

  const updated = adjustUserCredits(target.userId, amount)!;
  const actionLabel = amount >= 0 ? `начислено +${amount}` : `списано ${amount}`;

  return {
    text:
      `✅ <b>Баланс обновлён (${actionLabel})</b>\n\n` +
      `<blockquote>` +
      `🆔 <b>ID:</b> <code>${escapeHtml(updated.userId)}</code>\n` +
      `👤 <b>Пользователь:</b> ${escapeHtml(updated.displayName)}${
        updated.username ? ` (@${escapeHtml(updated.username)})` : ''
      }\n` +
      `🎟 <b>Новый баланс:</b> <b>${updated.credits}</b> генераций` +
      `</blockquote>`,
    parseMode: 'HTML',
    inlineKeyboard: [
      [
        {
          text: '➕ Ещё +1',
          callbackData: `admin:give1:${updated.userId}`,
          style: 'success',
        },
        {
          text: '👤 Карточка',
          callbackData: `admin:user:${updated.userId}`,
          style: 'primary',
        },
      ],
      [
        { text: '👥 Пользователи', callbackData: 'admin:users', style: 'primary' },
        { text: '👑 Админ-панель', callbackData: 'admin:menu', style: 'primary' },
      ],
    ],
    ...(amount > 0 && updated.chatId && updated.userId !== adminUser.userId
      ? {
          notifyTelegramUser: {
            chatId: updated.chatId,
            text:
              `🎉 <b>Вам начислено +${amount} генерация(и) проекта!</b>\n\n` +
              `🎟 Текущий баланс: <b>${updated.credits}</b>\n` +
              `Нажмите зелёную кнопку ниже, чтобы создать проект по ГОСТ 7.32-2017, презентацию на 10 слайдов и речь для защиты 👇`,
            inlineKeyboard: [
              [
                {
                  text: '🚀 Создать проект по ГОСТ',
                  callbackData: 'action:new',
                  style: 'success',
                },
              ],
            ],
          },
        }
      : {}),
  };
}

function formatDraftProgress(draft: Partial<ProjectInput>): string {
  const lines: string[] = [];
  if (draft.subject) lines.push(`📚 Предмет: <b>${escapeHtml(draft.subject)}</b>`);
  if (draft.level) lines.push(`🎓 Уровень: <b>${escapeHtml(draft.level)}</b>`);
  if (draft.projectType) lines.push(`🧭 Тип: <b>${escapeHtml(draft.projectType)}</b>`);
  if (draft.chaptersCount) lines.push(`📑 Глав: <b>${draft.chaptersCount}</b>`);
  if (draft.targetPages) lines.push(`📄 Объём: <b>~${draft.targetPages} стр.</b>`);
  if (draft.topic) lines.push(`📝 Тема: <i>«${escapeHtml(draft.topic)}»</i>`);
  if (lines.length === 0) return '';
  return `<blockquote>${lines.join('\n')}</blockquote>\n\n`;
}

function formatSummaryHtml(draft: Partial<ProjectInput>): string {
  const full = defaultProjectDraft(draft, 'simulator');
  const minYear = new Date().getFullYear() - 7;
  return (
    `📋 <b>Проверьте параметры индивидуального проекта</b>\n\n` +
    `<blockquote>` +
    `• <b>Предмет:</b> ${escapeHtml(full.subject)}\n` +
    `• <b>Уровень:</b> ${escapeHtml(full.level)}\n` +
    `• <b>Тип:</b> ${escapeHtml(full.projectType)}\n` +
    `• <b>Объём:</b> ${full.chaptersCount} глав(ы), ~${full.targetPages} стр. (до 20 стр.)\n` +
    `• <b>Тема:</b> «${escapeHtml(full.topic)}»\n` +
    `• <b>Учреждение:</b> ${escapeHtml(full.institution)}\n` +
    `• <b>Автор:</b> ${escapeHtml(full.authorName)} (${escapeHtml(full.authorClass)})\n` +
    `• <b>Руководитель:</b> ${escapeHtml(full.supervisorName)}\n` +
    `• <b>Город и год:</b> ${escapeHtml(full.city)}, ${escapeHtml(full.year)}` +
    `</blockquote>\n\n` +
    `✨ В пакет войдут: проект <code>.docx</code> по ГОСТ 7.32-2017 (с таблицами и схемами, источники ${minYear}–${new Date().getFullYear()} гг., без Приложения А), презентация <b>10 слайдов</b> <code>.pptx</code> и <b>речь для защиты</b>.`
  );
}

export async function handleBotTurn(params: {
  chatKey: string;
  userId?: string;
  telegramChatId?: string;
  username?: string;
  displayName?: string;
  source: 'telegram' | 'simulator';
  text?: string;
  callbackData?: string;
  onProgress?: (update: ProgressUpdate) => Promise<void>;
}): Promise<{ replies: BotReplyMessage[]; user: UserProfile; isAdmin: boolean }> {
  const {
    chatKey,
    userId: explicitUserId,
    telegramChatId,
    username,
    displayName,
    source,
    text,
    callbackData,
    onProgress,
  } = params;

  const resolvedUserId = explicitUserId || chatKey;
  const user = ensureUserProfile({
    userId: resolvedUserId,
    chatId: telegramChatId,
    username,
    displayName,
  });
  const isAdmin = source === 'telegram' && isAdminUsername(username);

  const trimmedText = text?.trim() ?? '';
  const data = callbackData?.trim() ?? '';

  const wrap = (replies: BotReplyMessage[]) => ({ replies, user, isAdmin });

  if (trimmedText === '/start' || trimmedText === '/menu' || data === 'action:menu') {
    resetSession(chatKey);
    return wrap([
      {
        text:
          `👋 <b>Добро пожаловать в ПроектБот ГОСТ!</b>\n\n` +
          `Я создам для вас готовый индивидуальный проект под ключ строго по <b>ГОСТ 7.32-2017</b>:\n\n` +
          `<blockquote>` +
          `📄 <b>Текст проекта (.docx)</b> — от 2 до 4 глав, до 20 страниц, с таблицами и блок-схемами\n` +
          `📚 <b>Свежие источники</b> — не старше 7 лет по ГОСТ Р 7.0.5-2008\n` +
          `📊 <b>Презентация (.pptx)</b> — ровно 10 слайдов с заметками спикера\n` +
          `🎤 <b>Текст для защиты (.docx)</b> — готовая речь по слайдам + ответы комиссии` +
          `</blockquote>\n\n` +
          `🆔 Ваш ID: <code>${escapeHtml(user.userId)}</code> · 🎟 Доступно генераций: <b>${user.credits}</b>\n\n` +
          `Выберите действие ниже 👇`,
        parseMode: 'HTML',
        inlineKeyboard: mainMenuButtons(isAdmin),
      },
    ]);
  }

  if (trimmedText === '/profile' || data === 'action:profile') {
    return wrap([buildProfileReply(user, isAdmin)]);
  }

  if (trimmedText === '/buy' || data === 'action:buy') {
    return wrap([buildBuyReply(user)]);
  }

  if (trimmedText === '/support' || data === 'action:support') {
    return wrap([
      {
        text:
          `🆘 <b>Поддержка и оплата</b>\n\n` +
          `По всем вопросам работы бота и покупке генераций (${PROJECT_PRICE_RUB}₽ / 1 проект) обращайтесь к администратору @${ADMIN_USERNAME}.\n\n` +
          `🆔 Не забудьте приложить ваш ID: <code>${escapeHtml(user.userId)}</code>`,
        parseMode: 'HTML',
        inlineKeyboard: [
          [
            {
              text: `💬 Написать @${ADMIN_USERNAME}`,
              url: SUPPORT_URL,
              style: 'success',
            },
          ],
          [
            { text: '👤 Мой профиль', callbackData: 'action:profile', style: 'primary' },
            { text: '⬅️ В меню', callbackData: 'action:menu', style: 'primary' },
          ],
        ],
      },
    ]);
  }

  if (trimmedText === '/cancel' || data === 'action:cancel') {
    resetSession(chatKey);
    return wrap([
      {
        text: '✖️ Действие отменено. Выберите нужный раздел ниже.',
        parseMode: 'HTML',
        inlineKeyboard: mainMenuButtons(isAdmin),
      },
    ]);
  }

  if (trimmedText === '/gost' || data === 'action:gost') {
    return wrap([
      {
        text: getGostSummaryHtml(),
        parseMode: 'HTML',
        inlineKeyboard: [
          [
            {
              text:
                user.credits > 0
                  ? '🚀 Создать проект по ГОСТ'
                  : `💳 Купить проект — ${PROJECT_PRICE_RUB}₽`,
              callbackData: user.credits > 0 ? 'action:new' : 'action:buy',
              style: 'success',
            },
          ],
          [{ text: '⬅️ Главное меню', callbackData: 'action:menu', style: 'primary' }],
        ],
      },
    ]);
  }

  if (trimmedText === '/help' || data === 'action:help') {
    return wrap([
      {
        text:
          `📖 <b>Доступные команды бота</b>\n\n` +
          `<code>/start</code> — главное меню\n` +
          `<code>/profile</code> — профиль, ваш ID и баланс генераций\n` +
          `<code>/buy</code> — купить генерацию проекта (${PROJECT_PRICE_RUB}₽)\n` +
          `<code>/new</code> — создать проект, 10 слайдов и речь\n` +
          `<code>/gost</code> — стандарты ГОСТ 7.32-2017\n` +
          `<code>/support</code> — связь с поддержкой @${ADMIN_USERNAME}\n` +
          `<code>/cancel</code> — сбросить текущий шаг` +
          (isAdmin
            ? `\n\n👑 <b>Команды администратора:</b>\n<code>/admin</code> — админ-панель\n<code>/add ID [кол-во]</code> — выдать генерацию пользователю`
            : ''),
        parseMode: 'HTML',
        inlineKeyboard: mainMenuButtons(isAdmin),
      },
    ]);
  }

  // ==================== ADMIN COMMANDS & CALLBACKS (@indproekt_help ONLY) ====================
  const isAdminTextCommand =
    trimmedText === '/admin' ||
    trimmedText.startsWith('/add') ||
    trimmedText.startsWith('/give');

  if (isAdminTextCommand || data.startsWith('admin:')) {
    if (!isAdmin) {
      return wrap([
        {
          text: `⛔ Доступ запрещён. Эти команды и кнопки работают только для администратора @${ADMIN_USERNAME}.`,
          parseMode: 'HTML',
          inlineKeyboard: mainMenuButtons(false),
        },
      ]);
    }

    if (trimmedText === '/admin' || data === 'admin:menu') {
      resetSession(chatKey);
      return wrap([buildAdminMenuReply(user)]);
    }

    if (trimmedText.startsWith('/add') || trimmedText.startsWith('/give')) {
      const parts = trimmedText.split(/\s+/).filter(Boolean);
      const targetQuery = parts[1];
      const rawAmount = parts[2] ? Number(parts[2]) : 1;
      const amount =
        Number.isFinite(rawAmount) && rawAmount >= 1 && rawAmount <= 100
          ? Math.trunc(rawAmount)
          : 1;

      if (!targetQuery) {
        return wrap([
          {
            text:
              `👑 <b>Выдача генераций</b>\n\n` +
              `Формат команды: <code>/add ID</code> или <code>/add ID количество</code>\n` +
              `Например: <code>/add 5192837412</code> или <code>/add @username 1</code>`,
            parseMode: 'HTML',
            inlineKeyboard: [
              [
                {
                  text: '👥 Выбрать из списка',
                  callbackData: 'admin:users',
                  style: 'primary',
                },
              ],
            ],
          },
        ]);
      }

      return wrap([creditUserAndBuildReply({ targetQuery, amount, adminUser: user })]);
    }

    if (data === 'admin:prompt_add') {
      updateSession(chatKey, () => ({
        step: 'awaiting_admin_add_target',
        draft: {},
        updatedAt: Date.now(),
      }));
      return wrap([
        {
          text:
            `➕ <b>Выдача генерации по ID</b>\n\n` +
            `Отправьте в чат <b>ID пользователя</b> (или <code>@username</code>), чтобы начислить <b>+1 генерацию</b>.\n` +
            `Можно указать количество через пробел, например: <code>123456789 2</code>`,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '✖️ Отмена', callbackData: 'admin:menu', style: 'danger' }],
          ],
        },
      ]);
    }

    if (data === 'admin:users') {
      return wrap([buildAdminUsersReply()]);
    }

    if (data === 'admin:stats') {
      const stats = getUsersStats();
      return wrap([
        {
          text:
            `📊 <b>Статистика бота</b>\n\n` +
            `<blockquote>` +
            `👥 Всего пользователей: <b>${stats.totalUsers}</b>\n` +
            `🎟 Доступных генераций на балансах: <b>${stats.totalCreditsAvailable}</b>\n` +
            `📁 Проектов создано пользователями: <b>${stats.totalGeneratedByUsers}</b>\n` +
            `📦 Проектов в памяти сервера: <b>${getTotalProjectsCount()}</b>` +
            `</blockquote>`,
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: '⬅️ В админ-панель', callbackData: 'admin:menu', style: 'primary' }],
          ],
        },
      ]);
    }

    if (data.startsWith('admin:user:')) {
      const targetId = data.slice('admin:user:'.length);
      const target = getUserProfile(targetId);
      if (!target) {
        return wrap([
          {
            text: 'Пользователь не найден.',
            inlineKeyboard: [
              [{ text: '⬅️ К списку', callbackData: 'admin:users', style: 'primary' }],
            ],
          },
        ]);
      }
      return wrap([buildAdminSingleUserReply(target)]);
    }

    if (
      data.startsWith('admin:give1:') ||
      data.startsWith('admin:give3:') ||
      data.startsWith('admin:take1:')
    ) {
      const [prefix, targetId] = [data.slice(0, 12), data.slice(12)];
      const delta = prefix === 'admin:give3:' ? 3 : prefix === 'admin:take1:' ? -1 : 1;
      return wrap([
        creditUserAndBuildReply({
          targetQuery: targetId,
          amount: delta,
          adminUser: user,
        }),
      ]);
    }
  }

  // ==================== START NEW PROJECT ====================
  if (trimmedText === '/new' || data === 'action:new') {
    if (user.credits <= 0) {
      return wrap([buildNoCreditsReply(user)]);
    }
    updateSession(chatKey, () => ({
      step: 'awaiting_subject',
      draft: {},
      updatedAt: Date.now(),
    }));
    return wrap([
      {
        text:
          `<b>Шаг 1 из 7 · Предмет</b>\n\n` +
          `Выберите учебную дисциплину кнопкой ниже или напишите свой предмет в чат:`,
        parseMode: 'HTML',
        inlineKeyboard: subjectButtons(),
      },
    ]);
  }

  const session = getOrCreateSession(chatKey);

  if (data) {
    if (data.startsWith('subj:')) {
      const idx = Number(data.slice(5));
      const chosen = SUBJECTS[idx];
      if (!chosen) {
        return wrap([
          { text: 'Предмет не распознан. Выберите из списка или введите текстом.' },
        ]);
      }
      const next = updateSession(chatKey, (s) => ({
        ...s,
        step: 'awaiting_level',
        draft: { ...s.draft, subject: chosen },
      }));
      return wrap([
        {
          text:
            `<b>Шаг 2 из 7 · Уровень обучения</b>\n\n` +
            formatDraftProgress(next.draft) +
            `Выберите ваш класс или уровень образования:`,
          parseMode: 'HTML',
          inlineKeyboard: [
            ...LEVELS.map((lvl, i) => [
              { text: lvl, callbackData: `lvl:${i}`, style: 'primary' as const },
            ]),
            [{ text: '✖️ Отменить', callbackData: 'action:cancel', style: 'danger' as const }],
          ],
        },
      ]);
    }

    if (data.startsWith('lvl:')) {
      const idx = Number(data.slice(4));
      const chosen = LEVELS[idx];
      if (!chosen) {
        return wrap([{ text: 'Уровень не распознан. Попробуйте снова.' }]);
      }
      const next = updateSession(chatKey, (s) => ({
        ...s,
        step: 'awaiting_type',
        draft: { ...s.draft, level: chosen },
      }));
      return wrap([
        {
          text:
            `<b>Шаг 3 из 7 · Тип проекта</b>\n\n` +
            formatDraftProgress(next.draft) +
            `Выберите характер работы:`,
          parseMode: 'HTML',
          inlineKeyboard: [
            ...PROJECT_TYPES.map((t, i) => [
              { text: t, callbackData: `type:${i}`, style: 'primary' as const },
            ]),
            [{ text: '✖️ Отменить', callbackData: 'action:cancel', style: 'danger' as const }],
          ],
        },
      ]);
    }

    if (data.startsWith('type:')) {
      const idx = Number(data.slice(5));
      const chosen = PROJECT_TYPES[idx];
      if (!chosen) {
        return wrap([{ text: 'Тип проекта не распознан. Попробуйте снова.' }]);
      }
      const next = updateSession(chatKey, (s) => ({
        ...s,
        step: 'awaiting_chapters',
        draft: { ...s.draft, projectType: chosen },
      }));
      return wrap([
        {
          text:
            `<b>Шаг 4 из 7 · Количество глав</b>\n\n` +
            formatDraftProgress(next.draft) +
            `Сколько глав должно быть в работе (от 2 до 4)?`,
          parseMode: 'HTML',
          inlineKeyboard: [
            ...CHAPTER_OPTIONS.map((opt) => [
              {
                text: opt.label,
                callbackData: `chap:${opt.count}`,
                style: 'primary' as const,
              },
            ]),
            [{ text: '✖️ Отменить', callbackData: 'action:cancel', style: 'danger' as const }],
          ],
        },
      ]);
    }

    if (data.startsWith('chap:')) {
      const count = Number(data.slice(5)) as ChaptersCount;
      if (count !== 2 && count !== 3 && count !== 4) {
        return wrap([{ text: 'Выберите от 2 до 4 глав.' }]);
      }
      const next = updateSession(chatKey, (s) => ({
        ...s,
        step: 'awaiting_pages',
        draft: { ...s.draft, chaptersCount: count },
      }));
      return wrap([
        {
          text:
            `<b>Шаг 5 из 7 · Объём страниц (до 20 стр.)</b>\n\n` +
            formatDraftProgress(next.draft) +
            `Выберите целевое количество страниц или введите число от <code>8</code> до <code>20</code> в чат:`,
          parseMode: 'HTML',
          inlineKeyboard: [
            [
              {
                text: PAGE_OPTIONS[0].label,
                callbackData: `pages:${PAGE_OPTIONS[0].pages}`,
                style: 'primary',
              },
              {
                text: PAGE_OPTIONS[1].label,
                callbackData: `pages:${PAGE_OPTIONS[1].pages}`,
                style: 'primary',
              },
            ],
            [
              {
                text: PAGE_OPTIONS[2].label,
                callbackData: `pages:${PAGE_OPTIONS[2].pages}`,
                style: 'primary',
              },
              {
                text: PAGE_OPTIONS[3].label,
                callbackData: `pages:${PAGE_OPTIONS[3].pages}`,
                style: 'primary',
              },
            ],
            [{ text: '✖️ Отменить', callbackData: 'action:cancel', style: 'danger' }],
          ],
        },
      ]);
    }

    if (data.startsWith('pages:')) {
      const pages = Number(data.slice(6));
      if (!Number.isFinite(pages) || pages < 8 || pages > 20) {
        return wrap([{ text: 'Укажите количество страниц от 8 до 20.' }]);
      }
      const next = updateSession(chatKey, (s) => ({
        ...s,
        step: s.draft.topic ? 'awaiting_title_choice' : 'awaiting_topic',
        draft: { ...s.draft, targetPages: pages },
      }));

      if (next.step === 'awaiting_title_choice') {
        return wrap([
          {
            text:
              `<b>Шаг 7 из 7 · Титульный лист</b>\n\n` +
              formatDraftProgress(next.draft) +
              `Как оформить титульный лист?`,
            parseMode: 'HTML',
            inlineKeyboard: [
              [
                {
                  text: '✅ Стандартный шаблон (быстро)',
                  callbackData: 'title:default',
                  style: 'success',
                },
              ],
              [
                {
                  text: '✏️ Заполнить ФИО, школу и руководителя',
                  callbackData: 'title:custom',
                  style: 'primary',
                },
              ],
            ],
          },
        ]);
      }

      return wrap([
        {
          text:
            `<b>Шаг 6 из 7 · Тема проекта</b>\n\n` +
            formatDraftProgress(next.draft) +
            `Напишите тему вашего проекта в чат или нажмите кнопку, чтобы ИИ предложил 5 сильных тем:`,
          parseMode: 'HTML',
          inlineKeyboard: [
            [
              {
                text: '💡 Подобрать 5 актуальных тем',
                callbackData: 'action:suggest_topics',
                style: 'primary',
              },
            ],
            [{ text: '✖️ Отменить', callbackData: 'action:cancel', style: 'danger' }],
          ],
        },
      ]);
    }

    if (data === 'action:suggest_topics') {
      const subj = session.draft.subject ?? 'Информатика';
      const lvl = session.draft.level ?? '10–11 класс';
      if (onProgress) {
        await onProgress({
          percent: 25,
          stage: `Подбираю 5 актуальных тем по предмету «${subj}»...`,
        });
      }
      const topics = await suggestProjectTopics(subj, lvl);
      updateSession(chatKey, (s) => ({
        ...s,
        step: 'awaiting_topic',
        suggestedTopics: topics,
      }));
      return wrap([
        {
          text:
            `💡 <b>5 актуальных тем по предмету «${escapeHtml(subj)}» (${escapeHtml(lvl)})</b>\n\n` +
            topics.map((t, i) => `<b>${i + 1}.</b> ${escapeHtml(t)}`).join('\n\n') +
            `\n\nНажмите на понравившуюся тему или отправьте свой вариант в чат:`,
          parseMode: 'HTML',
          inlineKeyboard: topics.map((t, i) => [
            {
              text: `${i + 1}. ${t.length > 46 ? `${t.slice(0, 44)}…` : t}`,
              callbackData: `pick_topic:${i}`,
              style: 'primary' as const,
            },
          ]),
        },
      ]);
    }

    if (data.startsWith('pick_topic:')) {
      const idx = Number(data.slice(11));
      const chosen = session.suggestedTopics?.[idx];
      if (!chosen) {
        return wrap([
          { text: 'Список тем устарел. Напишите тему текстом или запросите идеи заново.' },
        ]);
      }
      const next = updateSession(chatKey, (s) => ({
        ...s,
        step: 'awaiting_title_choice',
        draft: { ...s.draft, topic: chosen },
      }));
      return wrap([
        {
          text:
            `<b>Шаг 7 из 7 · Титульный лист</b>\n\n` +
            formatDraftProgress(next.draft) +
            `Как оформить титульный лист?`,
          parseMode: 'HTML',
          inlineKeyboard: [
            [
              {
                text: '✅ Стандартный шаблон (быстро)',
                callbackData: 'title:default',
                style: 'success',
              },
            ],
            [
              {
                text: '✏️ Заполнить ФИО, школу и руководителя',
                callbackData: 'title:custom',
                style: 'primary',
              },
            ],
          ],
        },
      ]);
    }

    if (data === 'action:edit_topic') {
      updateSession(chatKey, (s) => ({
        ...s,
        step: 'awaiting_topic',
      }));
      return wrap([
        {
          text: 'Введите новую тему проекта в чат или выберите подбор идей:',
          parseMode: 'HTML',
          inlineKeyboard: [
            [
              {
                text: '💡 Подобрать 5 актуальных тем',
                callbackData: 'action:suggest_topics',
                style: 'primary',
              },
            ],
          ],
        },
      ]);
    }

    if (data === 'title:default') {
      const updated = updateSession(chatKey, (s) => ({
        ...s,
        step: 'ready_confirm',
      }));
      return wrap([
        {
          text: formatSummaryHtml(updated.draft),
          parseMode: 'HTML',
          inlineKeyboard: confirmKeyboard(),
        },
      ]);
    }

    if (data === 'title:custom') {
      updateSession(chatKey, (s) => ({
        ...s,
        step: 'awaiting_institution',
      }));
      return wrap([
        {
          text: '🏫 Введите полное название учебного заведения (например: <code>МБОУ «Лицей № 15»</code>):',
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: 'Пропустить →', callbackData: 'skip:institution', style: 'primary' }],
          ],
        },
      ]);
    }

    if (data === 'skip:institution') {
      updateSession(chatKey, (s) => ({ ...s, step: 'awaiting_author' }));
      return wrap([
        {
          text: '👤 Введите ФИО автора и класс/группу через запятую (например: <code>Смирнова Анна Павловна, 10 «Б» класс</code>):',
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: 'Пропустить →', callbackData: 'skip:author', style: 'primary' }],
          ],
        },
      ]);
    }

    if (data === 'skip:author') {
      updateSession(chatKey, (s) => ({ ...s, step: 'awaiting_supervisor' }));
      return wrap([
        {
          text: '👨‍🏫 Введите ФИО и должность руководителя проекта (например: <code>Козлов Игорь Николаевич, учитель истории</code>):',
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: 'Пропустить →', callbackData: 'skip:supervisor', style: 'primary' }],
          ],
        },
      ]);
    }

    if (data === 'skip:supervisor') {
      updateSession(chatKey, (s) => ({ ...s, step: 'awaiting_city_year' }));
      return wrap([
        {
          text: '📍 Введите город и год через запятую (например: <code>Казань, 2026</code>):',
          parseMode: 'HTML',
          inlineKeyboard: [
            [{ text: 'Пропустить →', callbackData: 'skip:city_year', style: 'primary' }],
          ],
        },
      ]);
    }

    if (data === 'skip:city_year') {
      const updated = updateSession(chatKey, (s) => ({
        ...s,
        step: 'ready_confirm',
      }));
      return wrap([
        {
          text: formatSummaryHtml(updated.draft),
          parseMode: 'HTML',
          inlineKeyboard: confirmKeyboard(),
        },
      ]);
    }

    if (data === 'action:generate') {
      const current = getOrCreateSession(chatKey);
      if (!current.draft.topic) {
        return wrap([
          {
            text: 'Сначала укажите тему проекта.',
            parseMode: 'HTML',
            inlineKeyboard: mainMenuButtons(isAdmin),
          },
        ]);
      }

      if (user.credits <= 0) {
        return wrap([buildNoCreditsReply(user)]);
      }

      if (activeGenerations.has(user.userId)) {
        return wrap([
          {
            text: '⏳ Ваш проект уже генерируется. Пожалуйста, дождитесь завершения.',
            parseMode: 'HTML',
          },
        ]);
      }

      activeGenerations.add(user.userId);
      try {
        if (onProgress) {
          await onProgress({
            percent: 5,
            stage: `Запуск генерации (${current.draft.chaptersCount ?? 2} глав, ~${current.draft.targetPages ?? 14} стр.)...`,
          });
        }

        const input = defaultProjectDraft(current.draft, source);
        const record = await createAndSaveProject(input, onProgress);

        // Deduct 1 credit only after successful project creation
        const afterUser = adjustUserCredits(user.userId, -1) ?? user;
        incrementUserGeneratedCount(user.userId);
        resetSession(chatKey);

        const previewSpeech = record.content.defenseSpeech.fullText
          .split('\n')
          .filter(Boolean)
          .slice(0, 3)
          .join('\n');

        return wrap([
          {
            text:
              `✅ <b>Готово! Ваш комплект к защите сформирован</b>\n\n` +
              `<blockquote>` +
              `📌 <b>Тема:</b> «${escapeHtml(record.input.topic)}»\n` +
              `📄 <b>Проект:</b> ${record.input.chaptersCount} глав(ы) · ${record.wordCount} слов (~${record.estimatedPages} стр. ГОСТ)\n` +
              `📊 <b>Презентация:</b> ${record.content.presentationSlides.length} слайдов (.pptx)\n` +
              `🎤 <b>Речь защиты:</b> ~${record.content.defenseSpeech.estimatedMinutes} мин. + 5 ответов комиссии\n` +
              `🎟 <b>Осталось генераций:</b> <b>${afterUser.credits}</b>` +
              `</blockquote>\n\n` +
              `<b>Фрагмент речи для защиты:</b>\n<i>${escapeHtml(previewSpeech.slice(0, 420))}${previewSpeech.length > 420 ? '…' : ''}</i>\n\n` +
              `Все 3 файла прикреплены выше 👆`,
            parseMode: 'HTML',
            document: {
              projectId: record.id,
              filename: record.filename,
              pptxFilename: record.pptxFilename,
              speechFilename: record.speechFilename,
              wordCount: record.wordCount,
              estimatedPages: record.estimatedPages,
              chaptersCount: record.input.chaptersCount,
              slidesCount: record.content.presentationSlides.length,
            },
            attachments: [
              {
                kind: 'project',
                projectId: record.id,
                filename: record.filename,
                label: `Проект по ГОСТ (${record.estimatedPages} стр.)`,
                downloadUrl: `/api/projects/${record.id}/docx`,
              },
              {
                kind: 'pptx',
                projectId: record.id,
                filename: record.pptxFilename,
                label: `Презентация (${record.content.presentationSlides.length} слайдов)`,
                downloadUrl: `/api/projects/${record.id}/pptx`,
              },
              {
                kind: 'speech',
                projectId: record.id,
                filename: record.speechFilename,
                label: 'Речь для защиты + ответы комиссии',
                downloadUrl: `/api/projects/${record.id}/speech-docx`,
              },
            ],
            inlineKeyboard: [
              [
                {
                  text:
                    afterUser.credits > 0
                      ? '🚀 Создать ещё один проект'
                      : `💳 Купить ещё проект (${PROJECT_PRICE_RUB}₽)`,
                  callbackData: afterUser.credits > 0 ? 'action:new' : 'action:buy',
                  style: 'success',
                },
              ],
              [
                { text: '👤 Профиль', callbackData: 'action:profile', style: 'primary' },
                { text: '⬅️ В меню', callbackData: 'action:menu', style: 'primary' },
              ],
            ],
          },
        ]);
      } finally {
        activeGenerations.delete(user.userId);
      }
    }
  }

  // Handle plain text inputs
  if (trimmedText) {
    switch (session.step) {
      case 'awaiting_admin_add_target': {
        if (!isAdmin) {
          resetSession(chatKey);
          return wrap([
            {
              text: '⛔ Доступ запрещён.',
              inlineKeyboard: mainMenuButtons(false),
            },
          ]);
        }
        const parts = trimmedText.split(/\s+/).filter(Boolean);
        const targetQuery = parts[0];
        const rawAmount = parts[1] ? Number(parts[1]) : 1;
        const amount =
          Number.isFinite(rawAmount) && rawAmount >= 1 && rawAmount <= 100
            ? Math.trunc(rawAmount)
            : 1;
        resetSession(chatKey);
        return wrap([creditUserAndBuildReply({ targetQuery, amount, adminUser: user })]);
      }

      case 'idle': {
        if (user.credits <= 0) {
          return wrap([buildNoCreditsReply(user)]);
        }
        const next = updateSession(chatKey, () => ({
          step: 'awaiting_subject',
          draft: { topic: trimmedText },
          updatedAt: Date.now(),
        }));
        return wrap([
          {
            text:
              `<b>Шаг 1 из 7 · Предмет</b>\n\n` +
              formatDraftProgress(next.draft) +
              `Выберите учебный предмет или напишите свой:`,
            parseMode: 'HTML',
            inlineKeyboard: subjectButtons(),
          },
        ]);
      }

      case 'awaiting_subject': {
        const next = updateSession(chatKey, (s) => ({
          ...s,
          step: 'awaiting_level',
          draft: { ...s.draft, subject: trimmedText },
        }));
        return wrap([
          {
            text:
              `<b>Шаг 2 из 7 · Уровень обучения</b>\n\n` +
              formatDraftProgress(next.draft) +
              `Выберите уровень образования:`,
            parseMode: 'HTML',
            inlineKeyboard: [
              ...LEVELS.map((lvl, i) => [
                { text: lvl, callbackData: `lvl:${i}`, style: 'primary' as const },
              ]),
            ],
          },
        ]);
      }

      case 'awaiting_pages': {
        const num = Number(trimmedText.replace(/[^\d]/g, ''));
        if (!Number.isFinite(num) || num < 8 || num > 20) {
          return wrap([
            {
              text: '⚠️ Введите число от <code>8</code> до <code>20</code> (например, <code>15</code>) или нажмите кнопку выше.',
              parseMode: 'HTML',
            },
          ]);
        }
        const next = updateSession(chatKey, (s) => ({
          ...s,
          step: s.draft.topic ? 'awaiting_title_choice' : 'awaiting_topic',
          draft: { ...s.draft, targetPages: num },
        }));
        if (next.step === 'awaiting_title_choice') {
          return wrap([
            {
              text:
                `<b>Шаг 7 из 7 · Титульный лист</b>\n\n` +
                formatDraftProgress(next.draft) +
                `Как оформить титульный лист?`,
              parseMode: 'HTML',
              inlineKeyboard: [
                [
                  {
                    text: '✅ Стандартный шаблон (быстро)',
                    callbackData: 'title:default',
                    style: 'success',
                  },
                ],
                [
                  {
                    text: '✏️ Заполнить ФИО, школу и руководителя',
                    callbackData: 'title:custom',
                    style: 'primary',
                  },
                ],
              ],
            },
          ]);
        }
        return wrap([
          {
            text:
              `<b>Шаг 6 из 7 · Тема проекта</b>\n\n` +
              formatDraftProgress(next.draft) +
              `Напишите тему проекта или запросите подбор идей:`,
            parseMode: 'HTML',
            inlineKeyboard: [
              [
                {
                  text: '💡 Подобрать 5 актуальных тем',
                  callbackData: 'action:suggest_topics',
                  style: 'primary',
                },
              ],
            ],
          },
        ]);
      }

      case 'awaiting_topic': {
        const hasAllConfig =
          session.draft.level &&
          session.draft.projectType &&
          session.draft.chaptersCount &&
          session.draft.targetPages;
        const nextStep = hasAllConfig ? 'awaiting_title_choice' : 'awaiting_level';
        const next = updateSession(chatKey, (s) => ({
          ...s,
          step: nextStep,
          draft: { ...s.draft, topic: trimmedText },
        }));

        if (nextStep === 'awaiting_level') {
          return wrap([
            {
              text:
                `<b>Шаг 2 из 7 · Уровень обучения</b>\n\n` +
                formatDraftProgress(next.draft) +
                `Выберите уровень обучения:`,
              parseMode: 'HTML',
              inlineKeyboard: LEVELS.map((lvl, i) => [
                { text: lvl, callbackData: `lvl:${i}`, style: 'primary' as const },
              ]),
            },
          ]);
        }

        return wrap([
          {
            text:
              `<b>Шаг 7 из 7 · Титульный лист</b>\n\n` +
              formatDraftProgress(next.draft) +
              `Как оформить титульный лист?`,
            parseMode: 'HTML',
            inlineKeyboard: [
              [
                {
                  text: '✅ Стандартный шаблон (быстро)',
                  callbackData: 'title:default',
                  style: 'success',
                },
              ],
              [
                {
                  text: '✏️ Заполнить ФИО, школу и руководителя',
                  callbackData: 'title:custom',
                  style: 'primary',
                },
              ],
            ],
          },
        ]);
      }

      case 'awaiting_institution': {
        updateSession(chatKey, (s) => ({
          ...s,
          step: 'awaiting_author',
          draft: { ...s.draft, institution: trimmedText },
        }));
        return wrap([
          {
            text: '👤 Введите ФИО автора и класс/группу через запятую (например: <code>Смирнова Анна Павловна, 10 «Б» класс</code>):',
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: 'Пропустить →', callbackData: 'skip:author', style: 'primary' }],
            ],
          },
        ]);
      }

      case 'awaiting_author': {
        const [authorPart, classPart] = trimmedText.split(',').map((p) => p.trim());
        updateSession(chatKey, (s) => ({
          ...s,
          step: 'awaiting_supervisor',
          draft: {
            ...s.draft,
            authorName: authorPart || trimmedText,
            authorClass: classPart || s.draft.authorClass || '10 класс',
          },
        }));
        return wrap([
          {
            text: '👨‍🏫 Введите ФИО и должность руководителя проекта (например: <code>Козлов Игорь Николаевич, учитель истории</code>):',
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: 'Пропустить →', callbackData: 'skip:supervisor', style: 'primary' }],
            ],
          },
        ]);
      }

      case 'awaiting_supervisor': {
        updateSession(chatKey, (s) => ({
          ...s,
          step: 'awaiting_city_year',
          draft: { ...s.draft, supervisorName: trimmedText },
        }));
        return wrap([
          {
            text: '📍 Введите город и год через запятую (например: <code>Санкт-Петербург, 2026</code>):',
            parseMode: 'HTML',
            inlineKeyboard: [
              [{ text: 'Пропустить →', callbackData: 'skip:city_year', style: 'primary' }],
            ],
          },
        ]);
      }

      case 'awaiting_city_year': {
        const [cityPart, yearPart] = trimmedText.split(',').map((p) => p.trim());
        const updated = updateSession(chatKey, (s) => ({
          ...s,
          step: 'ready_confirm',
          draft: {
            ...s.draft,
            city: cityPart || trimmedText,
            year:
              yearPart && /^\d{4}$/.test(yearPart)
                ? yearPart
                : String(new Date().getFullYear()),
          },
        }));
        return wrap([
          {
            text: formatSummaryHtml(updated.draft),
            parseMode: 'HTML',
            inlineKeyboard: confirmKeyboard(),
          },
        ]);
      }

      default: {
        return wrap([
          {
            text: 'Используйте кнопки выше или нажмите <code>/cancel</code> для возврата в меню.',
            parseMode: 'HTML',
            inlineKeyboard: mainMenuButtons(isAdmin),
          },
        ]);
      }
    }
  }

  return wrap([
    {
      text: 'Нажмите кнопку ниже, чтобы начать работу.',
      parseMode: 'HTML',
      inlineKeyboard: mainMenuButtons(isAdmin),
    },
  ]);
}

function toGrammyKeyboard(buttons?: InlineButton[][]): InlineKeyboard | undefined {
  if (!buttons || buttons.length === 0) return undefined;
  const kb = new InlineKeyboard();
  buttons.forEach((row, rIdx) => {
    row.forEach((btn) => {
      if (btn.url) {
        kb.url(btn.text, btn.url);
      } else {
        kb.text(btn.text, btn.callbackData ?? 'noop');
      }
      if (btn.style) {
        kb.style(btn.style);
      }
    });
    if (rIdx < buttons.length - 1) {
      kb.row();
    }
  });
  return kb;
}

async function sendRepliesToTelegram(
  bot: Bot,
  replyFn: {
    reply: (text: string, other?: Record<string, unknown>) => Promise<unknown>;
    replyWithDocument: (doc: InputFile, other?: Record<string, unknown>) => Promise<unknown>;
  },
  replies: BotReplyMessage[]
): Promise<void> {
  for (const reply of replies) {
    if (reply.document) {
      const record = getProject(reply.document.projectId);
      if (record) {
        await replyFn.replyWithDocument(
          new InputFile(record.docxBuffer, record.filename),
          {
            caption: `1️⃣ Индивидуальный проект по ГОСТ 7.32-2017 (${record.input.chaptersCount} глав(ы), ${record.wordCount} слов, ~${record.estimatedPages} стр.)`,
          }
        );
        await replyFn.replyWithDocument(
          new InputFile(record.pptxBuffer, record.pptxFilename),
          {
            caption: `2️⃣ Презентация к защите (ровно ${record.content.presentationSlides.length} слайдов с заметками спикера)`,
          }
        );
        await replyFn.replyWithDocument(
          new InputFile(record.speechDocxBuffer, record.speechFilename),
          {
            caption: `3️⃣ Текст речи для защиты (~${record.content.defenseSpeech.estimatedMinutes} мин.) + ответы на вопросы комиссии`,
          }
        );
      }
    }

    await replyFn.reply(reply.text, {
      ...(reply.parseMode ? { parse_mode: reply.parseMode } : {}),
      reply_markup: toGrammyKeyboard(reply.inlineKeyboard),
    });

    if (reply.notifyTelegramUser) {
      const target = reply.notifyTelegramUser;
      await bot.api
        .sendMessage(target.chatId, target.text, {
          parse_mode: 'HTML',
          reply_markup: toGrammyKeyboard(target.inlineKeyboard),
        })
        .catch(() => {});
    }
  }
}

export async function startTelegramBot(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    telegramStatus = {
      telegramConfigured: false,
      telegramRunning: false,
      botUsername: null,
      botName: null,
      lastError: null,
      gostStandard: 'ГОСТ 7.32-2017',
      supportUsername: `@${ADMIN_USERNAME}`,
    };
    console.log(
      '[Telegram] TELEGRAM_BOT_TOKEN не задан. Веб-симулятор и генератор полностью активны.'
    );
    return;
  }

  telegramStatus.telegramConfigured = true;

  try {
    const bot = new Bot(token);
    telegramBotInstance = bot;

    bot.on('message:text', async (ctx) => {
      const chatId = String(ctx.chat.id);
      const chatKey = `tg:${chatId}`;
      const userId = String(ctx.from.id);
      const displayName = [ctx.from.first_name, ctx.from.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      let progressMsgId: number | null = null;
      let lastRenderedBar = '';
      await ctx.replyWithChatAction('typing').catch(() => {});

      try {
        const result = await handleBotTurn({
          chatKey,
          userId,
          telegramChatId: chatId,
          username: ctx.from.username,
          displayName: displayName || undefined,
          source: 'telegram',
          text: ctx.message.text,
          onProgress: async (update) => {
            const html = renderTelegramProgressBar(update.percent, update.stage);
            if (html === lastRenderedBar) return;
            lastRenderedBar = html;

            if (progressMsgId === null) {
              const sent = await ctx.reply(html, { parse_mode: 'HTML' });
              progressMsgId = sent.message_id;
            } else {
              await ctx.api
                .editMessageText(ctx.chat.id, progressMsgId, html, { parse_mode: 'HTML' })
                .catch(() => {});
            }
            await ctx.replyWithChatAction('typing').catch(() => {});
          },
        });

        await sendRepliesToTelegram(
          bot,
          {
            reply: (t, o) => ctx.reply(t, o),
            replyWithDocument: (d, o) => ctx.replyWithDocument(d, o),
          },
          result.replies
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка генерации';
        await ctx.reply(`Произошла ошибка: ${message}`);
      } finally {
        if (progressMsgId !== null) {
          ctx.api.deleteMessage(ctx.chat.id, progressMsgId).catch(() => {});
        }
      }
    });

    bot.on('callback_query:data', async (ctx) => {
      const chatId = String(ctx.chat?.id ?? ctx.from.id);
      const chatKey = `tg:${chatId}`;
      const userId = String(ctx.from.id);
      const displayName = [ctx.from.first_name, ctx.from.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.replyWithChatAction('typing').catch(() => {});
      let progressMsgId: number | null = null;
      let lastRenderedBar = '';

      try {
        const result = await handleBotTurn({
          chatKey,
          userId,
          telegramChatId: chatId,
          username: ctx.from.username,
          displayName: displayName || undefined,
          source: 'telegram',
          callbackData: ctx.callbackQuery.data,
          onProgress: async (update) => {
            const html = renderTelegramProgressBar(update.percent, update.stage);
            if (html === lastRenderedBar) return;
            lastRenderedBar = html;

            if (progressMsgId === null) {
              const sent = await ctx.reply(html, { parse_mode: 'HTML' });
              progressMsgId = sent.message_id;
            } else {
              await ctx.api
                .editMessageText(chatId, progressMsgId, html, { parse_mode: 'HTML' })
                .catch(() => {});
            }
            await ctx.replyWithChatAction('typing').catch(() => {});
          },
        });

        await sendRepliesToTelegram(
          bot,
          {
            reply: (t, o) => ctx.reply(t, o),
            replyWithDocument: (d, o) => ctx.replyWithDocument(d, o),
          },
          result.replies
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Внутренняя ошибка генерации';
        await ctx.reply(`Произошла ошибка: ${message}`);
      } finally {
        if (progressMsgId !== null && ctx.chat?.id) {
          ctx.api.deleteMessage(ctx.chat.id, progressMsgId).catch(() => {});
        }
      }
    });

    bot.catch((err) => {
      console.error('[Telegram] Ошибка обработчика:', err.message);
      telegramStatus.lastError = err.message;
    });

    const me = await bot.api.getMe();
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    await bot.api.setMyCommands([
      { command: 'start', description: 'Главное меню бота' },
      { command: 'profile', description: 'Мой профиль, ID и баланс генераций' },
      { command: 'buy', description: `Купить проект (${PROJECT_PRICE_RUB}₽)` },
      { command: 'new', description: 'Создать проект, слайды и речь по ГОСТ' },
      { command: 'gost', description: 'Стандарты ГОСТ 7.32-2017' },
      { command: 'support', description: `Поддержка (@${ADMIN_USERNAME})` },
      { command: 'cancel', description: 'Сбросить текущую анкету' },
      { command: 'help', description: 'Справка по командам' },
    ]);

    telegramStatus = {
      telegramConfigured: true,
      telegramRunning: true,
      botUsername: me.username ?? null,
      botName: me.first_name ?? null,
      lastError: null,
      gostStandard: 'ГОСТ 7.32-2017',
      supportUsername: `@${ADMIN_USERNAME}`,
    };

    console.log(`[Telegram] Бот @${me.username} запущен (профиль, прогресс-бар, оплата 300₽, админ @${ADMIN_USERNAME}).`);

    bot.start().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Telegram] Остановка polling:', msg);
      telegramStatus.telegramRunning = false;
      telegramStatus.lastError = msg;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Telegram] Не удалось инициализировать бота:', msg);
    telegramStatus = {
      telegramConfigured: true,
      telegramRunning: false,
      botUsername: null,
      botName: null,
      lastError: 'Не удалось подключиться к Telegram API. Проверьте TELEGRAM_BOT_TOKEN.',
      gostStandard: 'ГОСТ 7.32-2017',
      supportUsername: `@${ADMIN_USERNAME}`,
    };
  }
}

export function stopTelegramBot(): void {
  if (telegramBotInstance) {
    telegramBotInstance.stop();
    telegramBotInstance = null;
  }
}
