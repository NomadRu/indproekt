import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
} from 'docx';
import type {
  GeneratedProjectContent,
  GostDiagram,
  GostTable,
  ProjectInput,
} from './types.ts';

const FONT_NAME = 'Times New Roman';
const FONT_SIZE_14PT = 28;
const FONT_SIZE_12PT = 24;
const LINE_SPACING_1_5 = 360;
const LINE_SPACING_1_0 = 240;
const INDENT_1_25_CM = convertMillimetersToTwip(12.5);

function textRun(
  text: string,
  options?: {
    bold?: boolean;
    italic?: boolean;
    size?: number;
    allCaps?: boolean;
  }
): TextRun {
  return new TextRun({
    text,
    font: FONT_NAME,
    size: options?.size ?? FONT_SIZE_14PT,
    color: '000000',
    bold: options?.bold ?? false,
    italics: options?.italic ?? false,
    allCaps: options?.allCaps ?? false,
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: INDENT_1_25_CM },
    spacing: {
      before: 0,
      after: 0,
      line: LINE_SPACING_1_5,
      lineRule: LineRuleType.AUTO,
    },
    children: [textRun(text)],
  });
}

function labeledBodyParagraph(label: string, text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: INDENT_1_25_CM },
    spacing: {
      before: 0,
      after: 0,
      line: LINE_SPACING_1_5,
      lineRule: LineRuleType.AUTO,
    },
    children: [textRun(`${label}: `, { bold: true }), textRun(text)],
  });
}

function structuralHeading(title: string, withPageBreak = true): Paragraph {
  const children = [];
  if (withPageBreak) {
    children.push(new PageBreak());
  }
  children.push(textRun(title.toUpperCase().replace(/\.+$/, ''), { bold: true }));

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    keepNext: true,
    spacing: {
      before: 0,
      after: 280,
      line: LINE_SPACING_1_5,
      lineRule: LineRuleType.AUTO,
    },
    children,
  });
}

function chapterHeading(title: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { firstLine: INDENT_1_25_CM },
    keepNext: true,
    spacing: {
      before: 0,
      after: 280,
      line: LINE_SPACING_1_5,
      lineRule: LineRuleType.AUTO,
    },
    children: [
      new PageBreak(),
      textRun(title.toUpperCase().replace(/\.+$/, ''), { bold: true }),
    ],
  });
}

function subsectionHeading(number: string, title: string): Paragraph {
  const cleanTitle = title.replace(/^\d+(\.\d+)*\.?\s*/, '').replace(/\.+$/, '');
  const text = cleanTitle ? `${number} ${cleanTitle}` : number;
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    indent: { firstLine: INDENT_1_25_CM },
    keepNext: true,
    spacing: {
      before: 280,
      after: 200,
      line: LINE_SPACING_1_5,
      lineRule: LineRuleType.AUTO,
    },
    children: [textRun(text, { bold: true })],
  });
}

function buildTitlePage(input: ProjectInput): (Paragraph | Table)[] {
  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };

  const centerLine = (
    text: string,
    opts?: { bold?: boolean; size?: number; spaceBefore?: number; spaceAfter?: number }
  ) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: {
        before: opts?.spaceBefore ?? 0,
        after: opts?.spaceAfter ?? 0,
        line: LINE_SPACING_1_5,
        lineRule: LineRuleType.AUTO,
      },
      children: [
        textRun(text, {
          bold: opts?.bold ?? false,
          size: opts?.size ?? FONT_SIZE_14PT,
        }),
      ],
    });

  const rightLine = (text: string, bold = false) =>
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: {
        before: 0,
        after: 60,
        line: LINE_SPACING_1_5,
        lineRule: LineRuleType.AUTO,
      },
      children: [textRun(text, { bold })],
    });

  const authorTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 48, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: 52, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [
              rightLine('Выполнил(а):', true),
              rightLine(`обучающийся(аяся) ${input.authorClass}`),
              rightLine(input.authorName),
              new Paragraph({ spacing: { before: 180, after: 0 }, children: [] }),
              rightLine('Руководитель проекта:', true),
              rightLine(input.supervisorName),
            ],
          }),
        ],
      }),
    ],
  });

  return [
    centerLine(input.institution.toUpperCase(), { bold: true, spaceAfter: 120 }),
    centerLine(`Учебная дисциплина: ${input.subject}`, { spaceAfter: 1600 }),
    centerLine('ИНДИВИДУАЛЬНЫЙ ПРОЕКТ', { bold: true, size: 32, spaceAfter: 200 }),
    centerLine(`по теме: «${input.topic}»`, { bold: true, spaceAfter: 180 }),
    centerLine(`Тип проекта: ${input.projectType} (${input.level})`, {
      spaceAfter: 1600,
    }),
    authorTable,
    new Paragraph({ spacing: { before: 2200, after: 0 }, children: [] }),
    centerLine(`${input.city}, ${input.year}`, { bold: false }),
  ];
}

function buildGostDataTable(
  tableNumber: number,
  table: GostTable
): (Paragraph | Table)[] {
  if (!table.headers.length || !table.rows.length) return [];

  const thinBorder = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const borders = {
    top: thinBorder,
    bottom: thinBorder,
    left: thinBorder,
    right: thinBorder,
  };

  const colCount = table.headers.length;
  const colWidth = Math.floor(100 / colCount);
  const cleanCaption = table.caption
    .replace(/^Таблица\s*\d*\s*[–—-]\s*/i, '')
    .replace(/\.+$/, '');

  const headerRow = new TableRow({
    tableHeader: true,
    children: table.headers.map(
      (h) =>
        new TableCell({
          width: { size: colWidth, type: WidthType.PERCENTAGE },
          borders,
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 0, after: 0, line: LINE_SPACING_1_0 },
              children: [textRun(h, { bold: true, size: FONT_SIZE_12PT })],
            }),
          ],
        })
    ),
  });

  const dataRows = table.rows.map(
    (row) =>
      new TableRow({
        children: table.headers.map((_, cIdx) => {
          const cellVal = row[cIdx] ?? '';
          return new TableCell({
            width: { size: colWidth, type: WidthType.PERCENTAGE },
            borders,
            margins: { top: 70, bottom: 70, left: 100, right: 100 },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                spacing: { before: 0, after: 0, line: LINE_SPACING_1_0 },
                children: [
                  textRun(cellVal, { bold: cIdx === 0, size: FONT_SIZE_12PT }),
                ],
              }),
            ],
          });
        }),
      })
  );

  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      keepNext: true,
      spacing: { before: 240, after: 100, line: LINE_SPACING_1_5 },
      children: [textRun(`Таблица ${tableNumber} – ${cleanCaption}`)],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }),
    new Paragraph({
      spacing: { before: 160, after: 0 },
      children: [],
    }),
  ];
}

function buildGostDiagramBlock(
  figureNumber: number,
  diagram: GostDiagram
): (Paragraph | Table)[] {
  if (!diagram.nodes.length) return [];

  const boxBorder = { style: BorderStyle.SINGLE, size: 8, color: '000000' };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = {
    top: noBorder,
    bottom: noBorder,
    left: noBorder,
    right: noBorder,
  };
  const boxBorders = {
    top: boxBorder,
    bottom: boxBorder,
    left: boxBorder,
    right: boxBorder,
  };

  const rows: TableRow[] = [];
  diagram.nodes.forEach((node, idx) => {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            borders: boxBorders,
            margins: { top: 90, bottom: 90, left: 140, right: 140 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 40, line: LINE_SPACING_1_0 },
                children: [
                  textRun(`${node.step ? `${node.step}. ` : ''}${node.title}`, {
                    bold: true,
                    size: FONT_SIZE_12PT,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0, line: LINE_SPACING_1_0 },
                children: [textRun(node.detail, { size: FONT_SIZE_12PT })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 15, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [new Paragraph({ children: [] })],
          }),
        ],
      })
    );

    if (idx < diagram.nodes.length - 1) {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 15, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [new Paragraph({ children: [] })],
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              borders: noBorders,
              margins: { top: 20, bottom: 20, left: 0, right: 0 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 0, after: 0, line: LINE_SPACING_1_0 },
                  children: [textRun('↓', { bold: true, size: FONT_SIZE_14PT })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 15, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [new Paragraph({ children: [] })],
            }),
          ],
        })
      );
    }
  });

  const cleanCaption = diagram.caption
    .replace(/^Рисунок\s*\d*\s*[–—-]\s*/i, '')
    .replace(/\.+$/, '');

  return [
    new Paragraph({
      spacing: { before: 200, after: 0 },
      keepNext: true,
      children: [],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 200, line: LINE_SPACING_1_5 },
      children: [textRun(`Рисунок ${figureNumber} – ${cleanCaption}`)],
    }),
  ];
}

export async function buildGostDocxBuffer(
  input: ProjectInput,
  content: GeneratedProjectContent
): Promise<Buffer> {
  const tocEntries = [
    'ВВЕДЕНИЕ',
    ...content.chapters.flatMap((ch) => [
      ch.title.toUpperCase().replace(/\.+$/, ''),
      ...ch.sections.map((s) => {
        const clean = s.title.replace(/^\d+(\.\d+)*\.?\s*/, '').replace(/\.+$/, '');
        return `    ${s.number} ${clean}`;
      }),
    ]),
    'ЗАКЛЮЧЕНИЕ',
    'СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ',
  ];

  let tableCounter = 1;
  let figureCounter = 1;

  const chapterElements: (Paragraph | Table)[] = [];
  content.chapters.forEach((chapter, cIdx) => {
    chapterElements.push(chapterHeading(chapter.title));

    chapter.sections.forEach((section) => {
      chapterElements.push(subsectionHeading(section.number, section.title));
      section.paragraphs.forEach((p) => {
        chapterElements.push(bodyParagraph(p));
      });
    });

    (chapter.tables ?? []).forEach((tbl) => {
      const built = buildGostDataTable(tableCounter, tbl);
      if (built.length > 0) {
        chapterElements.push(...built);
        tableCounter += 1;
      }
    });

    (chapter.diagrams ?? []).forEach((diag) => {
      const built = buildGostDiagramBlock(figureCounter, diag);
      if (built.length > 0) {
        chapterElements.push(...built);
        figureCounter += 1;
      }
    });

    // Place Product Passport table in the last chapter
    if (cIdx === content.chapters.length - 1 && content.productPassport) {
      const passportTable: GostTable = {
        caption: 'Паспорт проектного продукта',
        headers: ['Характеристика', 'Содержание'],
        rows: [
          ['Наименование продукта', content.productPassport.productName],
          ['Целевая аудитория', content.productPassport.targetAudience],
          ['Этапы реализации', content.productPassport.stages.join('; ')],
          ['Ресурсы и инструменты', content.productPassport.resources.join('; ')],
          ['Ожидаемый результат', content.productPassport.resultDescription],
        ],
      };
      chapterElements.push(...buildGostDataTable(tableCounter, passportTable));
      tableCounter += 1;
    }

    chapterElements.push(subsectionHeading(`Выводы по главе ${chapter.number}`, ''));
    chapterElements.push(bodyParagraph(chapter.summary));
  });

  const children: (Paragraph | Table)[] = [
    ...buildTitlePage(input),

    // СОДЕРЖАНИЕ (страница 2)
    structuralHeading('СОДЕРЖАНИЕ', true),
    ...tocEntries.map(
      (entry) =>
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: {
            before: 40,
            after: 40,
            line: LINE_SPACING_1_5,
            lineRule: LineRuleType.AUTO,
          },
          children: [
            textRun(entry, {
              bold: !entry.startsWith('    '),
            }),
          ],
        })
    ),

    // ВВЕДЕНИЕ
    structuralHeading('ВВЕДЕНИЕ', true),
    ...content.introduction.relevance.map((p) => bodyParagraph(p)),
    labeledBodyParagraph('Проблема исследования', content.introduction.problem),
    labeledBodyParagraph('Цель проекта', content.introduction.goal),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { firstLine: INDENT_1_25_CM },
      spacing: { before: 0, after: 0, line: LINE_SPACING_1_5 },
      children: [textRun('Задачи проекта:', { bold: true })],
    }),
    ...content.introduction.tasks.map((task, idx) =>
      bodyParagraph(`${idx + 1}) ${task.replace(/\.$/, '')};`)
    ),
    labeledBodyParagraph('Объект исследования', content.introduction.object),
    labeledBodyParagraph('Предмет исследования', content.introduction.subjectMatter),
    labeledBodyParagraph('Гипотеза (проектная идея)', content.introduction.hypothesis),
    labeledBodyParagraph(
      'Методы исследования',
      content.introduction.methods.join(', ') + '.'
    ),
    labeledBodyParagraph(
      'Практическая значимость',
      content.introduction.practicalSignificance
    ),

    // ГЛАВЫ 1..N (без Приложения А)
    ...chapterElements,

    // ЗАКЛЮЧЕНИЕ
    structuralHeading('ЗАКЛЮЧЕНИЕ', true),
    ...content.conclusion.map((p) => bodyParagraph(p)),

    // СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ
    structuralHeading('СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ', true),
    ...content.bibliography.map((source, idx) => {
      const cleaned = source.replace(/^\d+[.)]\s*/, '');
      return bodyParagraph(`${idx + 1}. ${cleaned}`);
    }),
  ];

  const doc = new Document({
    creator: input.authorName,
    title: input.topic,
    description: `Индивидуальный проект по ГОСТ 7.32-2017 (${input.subject})`,
    styles: {
      default: {
        document: {
          run: {
            font: FONT_NAME,
            size: FONT_SIZE_14PT,
            color: '000000',
          },
          paragraph: {
            spacing: {
              line: LINE_SPACING_1_5,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(30),
              right: convertMillimetersToTwip(15),
            },
          },
        },
        footers: {
          first: new Footer({ children: [] }),
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT_NAME,
                    size: FONT_SIZE_12PT,
                    color: '000000',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export async function buildDefenseSpeechDocxBuffer(
  input: ProjectInput,
  content: GeneratedProjectContent
): Promise<Buffer> {
  const speechLines = content.defenseSpeech.fullText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120, line: LINE_SPACING_1_5 },
      children: [textRun('ТЕКСТ РЕЧИ ДЛЯ ЗАЩИТЫ ИНДИВИДУАЛЬНОГО ПРОЕКТА', { bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 280, line: LINE_SPACING_1_5 },
      children: [textRun(`Тема: «${input.topic}»`, { italic: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 200, line: LINE_SPACING_1_5 },
      children: [
        textRun(`Автор: ${input.authorName} (${input.authorClass}) · Ориентировочное время выступления: ${content.defenseSpeech.estimatedMinutes} мин.`, {
          size: FONT_SIZE_12PT,
        }),
      ],
    }),
    ...speechLines.map((line) => {
      const slideMatch = line.match(/^(\[Слайд\s+\d+\])\s*(.*)$/i);
      if (slideMatch) {
        return new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { firstLine: INDENT_1_25_CM },
          spacing: { before: 80, after: 80, line: LINE_SPACING_1_5 },
          children: [
            textRun(`${slideMatch[1]} `, { bold: true }),
            textRun(slideMatch[2]),
          ],
        });
      }
      return new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: INDENT_1_25_CM },
        spacing: { before: 60, after: 60, line: LINE_SPACING_1_5 },
        children: [textRun(line)],
      });
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 200, line: LINE_SPACING_1_5 },
      children: [textRun('ВОЗМОЖНЫЕ ВОПРОСЫ КОМИССИИ И ОТВЕТЫ', { bold: true })],
    }),
    ...content.defenseSpeech.qaPrep.flatMap((qa, idx) => [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 120, after: 40, line: LINE_SPACING_1_5 },
        children: [textRun(`Вопрос ${idx + 1}. ${qa.question}`, { bold: true })],
      }),
      bodyParagraph(`Ответ: ${qa.answer}`),
    ]),
  ];

  const doc = new Document({
    creator: input.authorName,
    title: `Речь для защиты — ${input.topic}`,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(25),
              right: convertMillimetersToTwip(15),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export function countProjectWords(content: GeneratedProjectContent): number {
  const parts: string[] = [
    ...content.introduction.relevance,
    content.introduction.problem,
    content.introduction.goal,
    ...content.introduction.tasks,
    content.introduction.object,
    content.introduction.subjectMatter,
    content.introduction.hypothesis,
    ...content.introduction.methods,
    content.introduction.practicalSignificance,
    ...content.chapters.flatMap((ch) => [
      ch.title,
      ...ch.sections.flatMap((s) => [s.title, ...s.paragraphs]),
      ...ch.tables.flatMap((t) => [t.caption, ...t.headers, ...t.rows.flat()]),
      ...ch.diagrams.flatMap((d) => [
        d.caption,
        ...d.nodes.flatMap((n) => [n.title, n.detail]),
      ]),
      ch.summary,
    ]),
    content.productPassport.productName,
    content.productPassport.targetAudience,
    ...content.productPassport.stages,
    ...content.productPassport.resources,
    content.productPassport.resultDescription,
    ...content.conclusion,
    ...content.bibliography,
  ];

  const text = parts.join(' ').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function makeSlug(topic: string): string {
  const translitMap: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };

  return (
    topic
      .toLowerCase()
      .split('')
      .map((ch) => translitMap[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 44) || 'document'
  );
}

export function makeSafeDocxFilename(topic: string): string {
  return `GOST_Proekt_${makeSlug(topic)}.docx`;
}

export function makeSafePptxFilename(topic: string): string {
  return `Prezentatsiya_10_slaydov_${makeSlug(topic)}.pptx`;
}

export function makeSafeSpeechFilename(topic: string): string {
  return `Rech_zashchita_${makeSlug(topic)}.docx`;
}
