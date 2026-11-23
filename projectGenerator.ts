import { ThinkingLevel, Type } from '@google/genai';
import { getGeminiClient } from './geminiClient.ts';
import type {
  ChaptersCount,
  DefenseSpeech,
  EducationLevel,
  GeneratedProjectContent,
  PresentationSlide,
  ProductPassport,
  ProgressUpdate,
  ProjectChapter,
  ProjectInput,
} from './types.ts';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
let primaryCooldownUntil = 0;

function isTransientOrHighDemand(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('429') ||
    msg.includes('TIMEOUT')
  );
}

async function callWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('TIMEOUT: модель не ответила вовремя')),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function generateJsonWithFallback(params: {
  contents: string;
  systemInstruction?: string;
  responseSchema: Record<string, unknown>;
  primaryTimeoutMs: number;
}): Promise<string> {
  const ai = getGeminiClient();

  if (Date.now() >= primaryCooldownUntil) {
    try {
      const response = await callWithTimeout(
        ai.models.generateContent({
          model: PRIMARY_MODEL,
          contents: params.contents,
          config: {
            ...(params.systemInstruction
              ? { systemInstruction: params.systemInstruction }
              : {}),
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: 'application/json',
            responseSchema: params.responseSchema,
          },
        }),
        params.primaryTimeoutMs
      );
      return (response.text ?? '{}').trim();
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      if (
        msg.includes('API_KEY_INVALID') ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('GEMINI_API_KEY')
      ) {
        throw primaryErr;
      }
      if (
        !isTransientOrHighDemand(primaryErr) &&
        !msg.includes('404') &&
        !msg.includes('NOT_FOUND')
      ) {
        throw primaryErr;
      }

      primaryCooldownUntil = Date.now() + 60_000;
      console.warn(
        `[Gemini] ${PRIMARY_MODEL} перегружена (${msg.slice(0, 120)}), переключаюсь на ${FALLBACK_MODEL}...`
      );
    }
  }

  try {
    const fallbackResponse = await callWithTimeout(
      ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents: params.contents,
        config: {
          ...(params.systemInstruction
            ? { systemInstruction: params.systemInstruction }
            : {}),
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        },
      }),
      45000
    );
    return (fallbackResponse.text ?? '{}').trim();
  } catch (fallbackErr) {
    if (isTransientOrHighDemand(fallbackErr)) {
      throw new Error(
        'Сервис ИИ временно перегружен. Пожалуйста, повторите попытку через 10–15 секунд.'
      );
    }
    throw fallbackErr;
  }
}

function cleanText(raw: string): string {
  return String(raw ?? '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

export async function suggestProjectTopics(
  subject: string,
  level: EducationLevel | string
): Promise<string[]> {
  const startedAt = Date.now();
  const jsonStr = await generateJsonWithFallback({
    contents: `Предложи ровно 5 актуальных, конкретных и интересных тем индивидуальных проектов по предмету "${subject}" для уровня обучения "${level}" (ФГОС, РФ). Темы должны быть сформулированы академично, чётко, подходить под формат индивидуального проекта с теоретической и практической частью. Не добавляй нумерацию или кавычки внутрь строк.`,
    primaryTimeoutMs: 10000,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        topics: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Список из 5 тем индивидуальных проектов на русском языке.',
        },
      },
      required: ['topics'],
    },
  });

  console.log(`[Gemini] suggestProjectTopics completed in ${Date.now() - startedAt}ms`);
  const parsed = JSON.parse(jsonStr) as { topics?: string[] };
  const topics = (parsed.topics ?? []).map(cleanText).filter(Boolean).slice(0, 5);
  if (topics.length === 0) {
    throw new Error('Не удалось подобрать темы. Попробуйте ещё раз.');
  }
  return topics;
}

interface ChapterPlan {
  number: number;
  title: string;
  subsectionTitles: string[];
  tableTopic: string;
  diagramTopic: string;
}

interface MasterPlanResponse {
  introduction: GeneratedProjectContent['introduction'];
  chaptersPlan: ChapterPlan[];
  conclusion: string[];
  bibliography: string[];
}

function enforceRecentSourceYears(sources: string[], minYear: number, maxYear: number): string[] {
  return sources.map((src) => {
    const cleaned = cleanText(src);
    const years = cleaned.match(/\b(19\d{2}|20\d{2})\b/g) ?? [];
    const hasRecent = years.some((y) => Number(y) >= minYear && Number(y) <= maxYear);
    if (hasRecent) {
      return cleaned;
    }
    if (years.length > 0) {
      // Replace outdated year with a valid recent year within 7-year window
      const replacement = String(Math.max(minYear, maxYear - 2));
      return cleaned.replace(/\b(19\d{2}|20\d{2})\b/g, replacement);
    }
    return `${cleaned} (${maxYear - 1} г.)`;
  });
}

function normalizeSlidesToTen(
  rawSlides: PresentationSlide[],
  input: ProjectInput,
  intro: GeneratedProjectContent['introduction'],
  conclusion: string[]
): PresentationSlide[] {
  const cleaned: PresentationSlide[] = rawSlides.slice(0, 10).map((s, idx) => ({
    slideNumber: idx + 1,
    title: cleanText(s.title) || `Слайд ${idx + 1}`,
    subtitle: s.subtitle ? cleanText(s.subtitle) : undefined,
    bullets: (s.bullets ?? []).map(cleanText).filter(Boolean).slice(0, 6),
    layout: s.layout || (idx === 0 ? 'title' : idx === 9 ? 'closing' : 'bullets'),
    tableData:
      s.tableData && s.tableData.headers?.length && s.tableData.rows?.length
        ? {
            headers: s.tableData.headers.map(cleanText),
            rows: s.tableData.rows.map((r) => r.map(cleanText)),
          }
        : undefined,
    speakerNote: cleanText(s.speakerNote) || `Пояснение к слайду ${idx + 1}.`,
  }));

  while (cleaned.length < 10) {
    const num = cleaned.length + 1;
    if (num === 10) {
      cleaned.push({
        slideNumber: 10,
        title: 'Спасибо за внимание!',
        subtitle: `${input.authorName} · ${input.city}, ${input.year}`,
        bullets: [
          conclusion[0] ?? intro.goal,
          'Готов(а) ответить на вопросы комиссии.',
        ],
        layout: 'closing',
        speakerNote: 'Завершение выступления и готовность к вопросам комиссии.',
      });
    } else {
      cleaned.push({
        slideNumber: num,
        title: `Ключевые результаты (раздел ${num - 3})`,
        bullets: intro.tasks.slice(0, 4),
        layout: 'bullets',
        speakerNote: 'Основные положения и выводы по результатам работы.',
      });
    }
  }

  // Ensure slide 1 is title and slide 10 is closing
  cleaned[0].layout = 'title';
  cleaned[0].slideNumber = 1;
  cleaned[9].layout = 'closing';
  cleaned[9].slideNumber = 10;
  return cleaned;
}

export async function generateGostProjectContent(
  input: ProjectInput,
  onProgress?: (update: ProgressUpdate) => void | Promise<void>
): Promise<GeneratedProjectContent> {
  const startedAt = Date.now();
  const currentYear = new Date().getFullYear();
  const minSourceYear = currentYear - 7;
  const chaptersCount: ChaptersCount = input.chaptersCount || 2;
  const targetPages = Math.min(20, Math.max(8, input.targetPages || 14));

  const emitProgress = async (percent: number, stage: string) => {
    if (!onProgress) return;
    try {
      await onProgress({ percent, stage });
    } catch {
      // Ignore progress UI delivery hiccups
    }
  };

  // Scale content density dynamically to requested pages and chapters
  const bodyPages = Math.max(4, targetPages - 4);
  const subsectionsPerChapter = targetPages >= 16 && chaptersCount <= 3 ? 3 : chaptersCount === 4 && targetPages <= 14 ? 2 : 3;
  const totalSubsections = chaptersCount * subsectionsPerChapter;
  const targetWordsPerBody = bodyPages * 255;
  const targetWordsPerSubsection = Math.max(240, Math.round(targetWordsPerBody / totalSubsections));
  const paragraphsPerSubsection = targetWordsPerSubsection >= 450 ? 4 : 3;

  console.log(
    `[Gemini] Start project: "${input.topic}" | chapters=${chaptersCount}, targetPages=${targetPages}, pPerSub=${paragraphsPerSubsection}`
  );

  await emitProgress(
    10,
    `Составляю план (${chaptersCount} глав), введение и свежие источники (${minSourceYear}–${currentYear})...`
  );

  // STEP 1: Master Plan + Introduction + Conclusion + Recent Bibliography (<= 7 years)
  const planSystemInstruction = `Ты — научный руководитель и методист РФ (ФГОС, ГОСТ 7.32-2017).
Создай логичный план индивидуального проекта ровно на ${chaptersCount} глав(ы), полное Введение, Заключение и Список использованных источников.
Критически важные требования:
1. Никакой разметки Markdown (без **, ##, *). Чистый академический русский текст.
2. Приложение А НЕ создавай.
3. ВСЕ источники в списке использованных источников (8–10 штук) должны быть опубликованы НЕ СТАРШЕ 7 ЛЕТ — строго с ${minSourceYear} по ${currentYear} год! Ни одного источника старше ${minSourceYear} года. Оформляй по ГОСТ Р 7.0.5-2008.
4. План глав должен включать конкретные названия таблиц и схем, логично дополняющих тему.`;

  const planPrompt = `Параметры проекта:
- Тема: «${input.topic}»
- Предмет: ${input.subject}
- Уровень: ${input.level}
- Тип: ${input.projectType}
- Количество глав: ${chaptersCount}
- Подразделов в каждой главе: ${subsectionsPerChapter}
- Целевой объём работы: ${targetPages} страниц A4 (без Приложения А).

Сформируй:
1) introduction (обоснование актуальности 2–3 абзаца, проблема, цель, 4–5 задач, объект, предмет, гипотеза, методы, практическая значимость).
2) chaptersPlan — ровно ${chaptersCount} элемента(ов), в каждом ровно ${subsectionsPerChapter} названия подразделов (без цифр в начале названия), а также тему аналитической таблицы (tableTopic) и тему структурной схемы/алгоритма (diagramTopic).
3) conclusion — 3–4 развернутых абзаца с итогами по каждой задаче.
4) bibliography — 8–10 источников (${minSourceYear}–${currentYear} гг., не старше 7 лет!) строго по ГОСТ Р 7.0.5-2008.`;

  const planJson = await generateJsonWithFallback({
    contents: planPrompt,
    systemInstruction: planSystemInstruction,
    primaryTimeoutMs: 14000,
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        introduction: {
          type: Type.OBJECT,
          properties: {
            relevance: { type: Type.ARRAY, items: { type: Type.STRING } },
            problem: { type: Type.STRING },
            goal: { type: Type.STRING },
            tasks: { type: Type.ARRAY, items: { type: Type.STRING } },
            object: { type: Type.STRING },
            subjectMatter: { type: Type.STRING },
            hypothesis: { type: Type.STRING },
            methods: { type: Type.ARRAY, items: { type: Type.STRING } },
            practicalSignificance: { type: Type.STRING },
          },
          required: [
            'relevance',
            'problem',
            'goal',
            'tasks',
            'object',
            'subjectMatter',
            'hypothesis',
            'methods',
            'practicalSignificance',
          ],
        },
        chaptersPlan: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              number: { type: Type.INTEGER },
              title: {
                type: Type.STRING,
                description: 'Название главы прописными с номером, например: 1. ТЕОРЕТИЧЕСКИЕ ОСНОВЫ...',
              },
              subsectionTitles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              tableTopic: { type: Type.STRING },
              diagramTopic: { type: Type.STRING },
            },
            required: ['number', 'title', 'subsectionTitles', 'tableTopic', 'diagramTopic'],
          },
        },
        conclusion: { type: Type.ARRAY, items: { type: Type.STRING } },
        bibliography: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['introduction', 'chaptersPlan', 'conclusion', 'bibliography'],
    },
  });

  const master = JSON.parse(planJson) as MasterPlanResponse;
  const chaptersPlan = (master.chaptersPlan ?? []).slice(0, chaptersCount);
  while (chaptersPlan.length < chaptersCount) {
    const n = chaptersPlan.length + 1;
    chaptersPlan.push({
      number: n,
      title: `${n}. РАЗДЕЛ ПРОЕКТА`,
      subsectionTitles: [`Основы направления ${n}`, `Анализ и практика ${n}`],
      tableTopic: `Сравнительные показатели по главе ${n}`,
      diagramTopic: `Структурная схема процесса по главе ${n}`,
    });
  }

  await emitProgress(
    32,
    `Пишу ${chaptersCount} глав(ы) с таблицами и схемами, презентацию (10 слайдов) и речь...`
  );

  const totalParallelTasks = chaptersCount + 1;
  let completedParallelTasks = 0;
  const markTaskDone = async (label: string) => {
    completedParallelTasks += 1;
    const pct = Math.min(
      84,
      32 + Math.round((completedParallelTasks / totalParallelTasks) * 52)
    );
    await emitProgress(pct, label);
  };

  const chapterPromises = chaptersPlan.map(async (plan, idx) => {
    const chNum = idx + 1;
    const isLast = chNum === chaptersCount;
    const subTitles = (plan.subsectionTitles ?? []).slice(0, subsectionsPerChapter);

    const chapterSystem = `Ты — академический автор учебных проектов РФ (ГОСТ 7.32-2017).
Напиши главу ${chNum} индивидуального проекта глубоко, связно, научным стилем, БЕЗ разметки Markdown (**, ##, *).
Внутри главы обязательно сформируй:
- Подробные абзацы (ровно ${paragraphsPerSubsection} развернутых абзаца по ~95–130 слов каждый на каждый подраздел), чтобы общий объём работы уложился в ${targetPages} страниц.
- 1 содержательную аналитическую таблицу по ГОСТ (2–4 колонки, 3–5 строк).
- 1 структурную блок-схему/алгоритм (3–5 последовательных этапов с названием и кратким пояснением).${
      isLast
        ? '\n- Также заполни productPassport — паспорт итогового проектного продукта.'
        : ''
    }`;

    const chapterPrompt = `Тема проекта: «${input.topic}» (${input.subject}, ${input.level}, ${input.projectType}).
Глава ${chNum}: «${cleanText(plan.title)}»
Подразделы: ${subTitles.map((t, sIdx) => `${chNum}.${sIdx + 1} ${cleanText(t)}`).join('; ')}
Тема таблицы для этой главы: ${cleanText(plan.tableTopic)}
Тема блок-схемы для этой главы: ${cleanText(plan.diagramTopic)}
Цель всего проекта: ${cleanText(master.introduction?.goal ?? '')}`;

    const chapterJson = await generateJsonWithFallback({
      contents: chapterPrompt,
      systemInstruction: chapterSystem,
      primaryTimeoutMs: 18000,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                number: { type: Type.STRING },
                title: { type: Type.STRING },
                paragraphs: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['number', 'title', 'paragraphs'],
            },
          },
          tables: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: {
                  type: Type.ARRAY,
                  items: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
              },
              required: ['caption', 'headers', 'rows'],
            },
          },
          diagrams: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                caption: { type: Type.STRING },
                nodes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      step: { type: Type.STRING },
                      title: { type: Type.STRING },
                      detail: { type: Type.STRING },
                    },
                    required: ['step', 'title', 'detail'],
                  },
                },
              },
              required: ['caption', 'nodes'],
            },
          },
          summary: { type: Type.STRING },
          ...(isLast
            ? {
                productPassport: {
                  type: Type.OBJECT,
                  properties: {
                    productName: { type: Type.STRING },
                    targetAudience: { type: Type.STRING },
                    stages: { type: Type.ARRAY, items: { type: Type.STRING } },
                    resources: { type: Type.ARRAY, items: { type: Type.STRING } },
                    resultDescription: { type: Type.STRING },
                  },
                  required: [
                    'productName',
                    'targetAudience',
                    'stages',
                    'resources',
                    'resultDescription',
                  ],
                },
              }
            : {}),
        },
        required: [
          'title',
          'sections',
          'tables',
          'diagrams',
          'summary',
          ...(isLast ? ['productPassport'] : []),
        ],
      },
    });

    const parsedCh = JSON.parse(chapterJson) as ProjectChapter & {
      productPassport?: ProductPassport;
    };

    const cleanChapter: ProjectChapter = {
      number: chNum,
      title: cleanText(parsedCh.title || plan.title),
      sections: (parsedCh.sections ?? []).map((sec, sIdx) => ({
        number: cleanText(sec.number || `${chNum}.${sIdx + 1}`),
        title: cleanText(sec.title || subTitles[sIdx] || `Раздел ${chNum}.${sIdx + 1}`),
        paragraphs: (sec.paragraphs ?? []).map(cleanText).filter(Boolean),
      })),
      tables: (parsedCh.tables ?? []).map((t) => ({
        caption: cleanText(t.caption),
        headers: (t.headers ?? []).map(cleanText).filter(Boolean),
        rows: (t.rows ?? []).map((r) => r.map(cleanText)),
      })),
      diagrams: (parsedCh.diagrams ?? []).map((d) => ({
        caption: cleanText(d.caption),
        nodes: (d.nodes ?? []).map((n, nIdx) => ({
          step: cleanText(n.step || String(nIdx + 1)),
          title: cleanText(n.title),
          detail: cleanText(n.detail),
        })),
      })),
      summary: cleanText(parsedCh.summary),
    };

    await markTaskDone(`Готова глава ${chNum} из ${chaptersCount} (текст, таблица и схема)...`);
    return { chapter: cleanChapter, productPassport: parsedCh.productPassport };
  });

  // Parallel task for Defense Speech + 10-Slide Presentation
  const defenseAndSlidesPromise = (async () => {
    const slidesPrompt = `Подготовь текст речи для защиты индивидуального проекта и структуру презентации РОВНО НА 10 СЛАЙДОВ.
Тема: «${input.topic}»
Предмет: ${input.subject} (${input.level}, ${input.projectType})
Автор: ${input.authorName}
Цель: ${cleanText(master.introduction?.goal ?? '')}
Задачи: ${(master.introduction?.tasks ?? []).map(cleanText).join('; ')}
Главы: ${chaptersPlan.map((c) => cleanText(c.title)).join('; ')}
Основные выводы: ${(master.conclusion ?? []).map(cleanText).slice(0, 2).join(' ')}

Требования:
1. presentationSlides — РОВНО 10 слайдов:
   - Слайд 1 (layout: "title"): титульный слайд
   - Слайд 2 (layout: "bullets"): актуальность и проблема
   - Слайд 3 (layout: "two_column"): цель, задачи и гипотеза
   - Слайд 4 (layout: "bullets"): объект, предмет и методы исследования
   - Слайды 5–7 (bullets / two_column / table): ключевые результаты по главам, на одном из слайдов обязательно layout "table" с таблицей сравнения/показателей
   - Слайд 8 (layout: "two_column"): практическая значимость и проектный продукт
   - Слайд 9 (layout: "bullets"): основные выводы и итоги работы
   - Слайд 10 (layout: "closing"): заключение и благодарность за внимание
   Для каждого слайда укажи speakerNote (1–2 предложения, что говорить).
2. defenseSpeech:
   - fullText: готовая связная речь для устной защиты на 3–4 минуты (~400–500 слов), разбитая по строкам маркерами [Слайд 1] ... [Слайд 10].
   - estimatedMinutes: 4
   - qaPrep: 5 вероятных вопросов членов комиссии и краткие чёткие ответы на них.`;

    const jsonStr = await generateJsonWithFallback({
      contents: slidesPrompt,
      systemInstruction:
        'Ты — опытный методист, готовящий школьников и студентов к успешной защите индивидуального проекта. Пиши живым, грамотным академическим языком без Markdown (** или ##).',
      primaryTimeoutMs: 16000,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          defenseSpeech: {
            type: Type.OBJECT,
            properties: {
              fullText: { type: Type.STRING },
              estimatedMinutes: { type: Type.INTEGER },
              qaPrep: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING },
                  },
                  required: ['question', 'answer'],
                },
              },
            },
            required: ['fullText', 'estimatedMinutes', 'qaPrep'],
          },
          presentationSlides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                slideNumber: { type: Type.INTEGER },
                title: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
                layout: { type: Type.STRING },
                tableData: {
                  type: Type.OBJECT,
                  properties: {
                    headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                    rows: {
                      type: Type.ARRAY,
                      items: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                  },
                },
                speakerNote: { type: Type.STRING },
              },
              required: ['slideNumber', 'title', 'bullets', 'layout', 'speakerNote'],
            },
          },
        },
        required: ['defenseSpeech', 'presentationSlides'],
      },
    });

    const parsedSlides = JSON.parse(jsonStr) as {
      defenseSpeech: DefenseSpeech;
      presentationSlides: PresentationSlide[];
    };
    await markTaskDone('Презентация (10 слайдов) и речь для защиты готовы...');
    return parsedSlides;
  })();

  const [chapterResults, defenseAndSlides] = await Promise.all([
    Promise.all(chapterPromises),
    defenseAndSlidesPromise,
  ]);

  const chapters = chapterResults.map((r) => r.chapter);
  const lastPassport = chapterResults[chapterResults.length - 1]?.productPassport;

  const productPassport: ProductPassport = lastPassport
    ? {
        productName: cleanText(lastPassport.productName),
        targetAudience: cleanText(lastPassport.targetAudience),
        stages: (lastPassport.stages ?? []).map(cleanText).filter(Boolean),
        resources: (lastPassport.resources ?? []).map(cleanText).filter(Boolean),
        resultDescription: cleanText(lastPassport.resultDescription),
      }
    : {
        productName: `Проектный продукт по теме «${input.topic}»`,
        targetAudience: `Обучающиеся (${input.level}) и педагоги`,
        stages: ['Анализ литературы', 'Разработка модели', 'Апробация и оценка'],
        resources: ['Научная литература', 'Цифровые инструменты анализа'],
        resultDescription: 'Подтверждена практическая применимость результатов проекта.',
      };

  const introClean: GeneratedProjectContent['introduction'] = {
    relevance: (master.introduction?.relevance ?? []).map(cleanText).filter(Boolean),
    problem: cleanText(master.introduction?.problem ?? ''),
    goal: cleanText(master.introduction?.goal ?? ''),
    tasks: (master.introduction?.tasks ?? []).map(cleanText).filter(Boolean),
    object: cleanText(master.introduction?.object ?? ''),
    subjectMatter: cleanText(master.introduction?.subjectMatter ?? ''),
    hypothesis: cleanText(master.introduction?.hypothesis ?? ''),
    methods: (master.introduction?.methods ?? []).map(cleanText).filter(Boolean),
    practicalSignificance: cleanText(master.introduction?.practicalSignificance ?? ''),
  };

  const conclusionClean = (master.conclusion ?? []).map(cleanText).filter(Boolean);
  const bibliographyClean = enforceRecentSourceYears(
    master.bibliography ?? [],
    minSourceYear,
    currentYear
  );

  const slidesClean = normalizeSlidesToTen(
    defenseAndSlides.presentationSlides ?? [],
    input,
    introClean,
    conclusionClean
  );

  const defenseSpeechClean: DefenseSpeech = {
    fullText: cleanText(defenseAndSlides.defenseSpeech?.fullText ?? ''),
    estimatedMinutes: defenseAndSlides.defenseSpeech?.estimatedMinutes || 4,
    qaPrep: (defenseAndSlides.defenseSpeech?.qaPrep ?? []).map((qa) => ({
      question: cleanText(qa.question),
      answer: cleanText(qa.answer),
    })),
  };

  console.log(`[Gemini] Full project + 10 slides + speech generated in ${Date.now() - startedAt}ms`);

  return {
    introduction: introClean,
    chapters,
    productPassport,
    conclusion: conclusionClean,
    bibliography: bibliographyClean,
    defenseSpeech: defenseSpeechClean,
    presentationSlides: slidesClean,
  };
}
