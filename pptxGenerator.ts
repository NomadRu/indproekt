import PptxGenJS from 'pptxgenjs';
import type { GeneratedProjectContent, ProjectInput } from './types.ts';

const SLATE_900 = '0F172A';
const SLATE_700 = '334155';
const SLATE_500 = '64748B';
const SLATE_200 = 'E2E8F0';
const SLATE_50 = 'F8FAFC';
const COBALT = '1D4ED8';
const WHITE = 'FFFFFF';

function clip(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}…`;
}

export async function buildPresentationPptxBuffer(
  input: ProjectInput,
  content: GeneratedProjectContent
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = input.authorName;
  pptx.title = input.topic;
  pptx.subject = `${input.subject} — Индивидуальный проект`;

  const slides = content.presentationSlides.slice(0, 10);

  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i];
    const slide = pptx.addSlide();
    const slideNum = i + 1;

    if (slideData.speakerNote) {
      slide.addNotes(slideData.speakerNote);
    }

    // Layout 1: Title Slide (Slide 1)
    if (slideNum === 1 || slideData.layout === 'title') {
      slide.background = { color: SLATE_900 };

      // Top cobalt accent bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 10,
        h: 0.14,
        fill: { color: COBALT },
      });

      slide.addText(clip(input.institution.toUpperCase(), 110), {
        x: 0.75,
        y: 0.55,
        w: 8.5,
        h: 0.4,
        fontFace: 'Arial',
        fontSize: 11,
        bold: true,
        color: '93C5FD',
      });

      slide.addText('ИНДИВИДУАЛЬНЫЙ ПРОЕКТ', {
        x: 0.75,
        y: 1.25,
        w: 8.5,
        h: 0.4,
        fontFace: 'Arial',
        fontSize: 13,
        bold: true,
        color: 'CBD5E1',
      });

      slide.addText(clip(input.topic, 160), {
        x: 0.75,
        y: 1.75,
        w: 8.5,
        h: 1.7,
        fontFace: 'Arial',
        fontSize: 26,
        bold: true,
        color: WHITE,
        valign: 'top',
      });

      slide.addShape(pptx.ShapeType.rect, {
        x: 0.75,
        y: 3.6,
        w: 1.8,
        h: 0.06,
        fill: { color: COBALT },
      });

      slide.addText(
        `Предмет: ${input.subject}  ·  ${input.projectType}  ·  ${input.level}`,
        {
          x: 0.75,
          y: 3.82,
          w: 8.5,
          h: 0.35,
          fontFace: 'Arial',
          fontSize: 13,
          color: 'E2E8F0',
        }
      );

      slide.addText(
        `Выполнил(а): ${input.authorName} (${input.authorClass})\nРуководитель: ${input.supervisorName}`,
        {
          x: 0.75,
          y: 4.3,
          w: 6.5,
          h: 0.85,
          fontFace: 'Arial',
          fontSize: 12,
          color: 'CBD5E1',
        }
      );

      slide.addText(`${input.city}, ${input.year}`, {
        x: 7.2,
        y: 4.8,
        w: 2.05,
        h: 0.35,
        align: 'right',
        fontFace: 'Arial',
        fontSize: 12,
        color: '94A3B8',
      });
      continue;
    }

    // Layout 5: Closing Slide (Slide 10)
    if (slideNum === slides.length || slideData.layout === 'closing') {
      slide.background = { color: SLATE_900 };
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 10,
        h: 0.14,
        fill: { color: COBALT },
      });

      slide.addText(clip(slideData.title || 'Спасибо за внимание!', 80), {
        x: 0.8,
        y: 1.45,
        w: 8.4,
        h: 0.8,
        fontFace: 'Arial',
        fontSize: 30,
        bold: true,
        color: WHITE,
        align: 'center',
      });

      if (slideData.bullets.length > 0) {
        slide.addText(
          slideData.bullets.slice(0, 4).map((b) => ({
            text: clip(b, 150),
            options: { bullet: true, breakLine: true, paraSpaceAfter: 8 },
          })),
          {
            x: 1.2,
            y: 2.45,
            w: 7.6,
            h: 2.1,
            fontFace: 'Arial',
            fontSize: 14,
            color: 'E2E8F0',
            valign: 'top',
          }
        );
      }

      slide.addText(
        `${input.authorName} · ${input.institution} · ${input.city}, ${input.year}`,
        {
          x: 0.8,
          y: 4.95,
          w: 8.4,
          h: 0.35,
          align: 'center',
          fontFace: 'Arial',
          fontSize: 11,
          color: '94A3B8',
        }
      );
      continue;
    }

    // Standard Content Slide (Slides 2..9)
    slide.background = { color: WHITE };

    // Top thin header stripe
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.08,
      fill: { color: COBALT },
    });

    // Slide header
    slide.addText(clip(slideData.title, 95), {
      x: 0.65,
      y: 0.32,
      w: 8.7,
      h: 0.55,
      fontFace: 'Arial',
      fontSize: 21,
      bold: true,
      color: SLATE_900,
    });

    if (slideData.subtitle) {
      slide.addText(clip(slideData.subtitle, 120), {
        x: 0.65,
        y: 0.85,
        w: 8.7,
        h: 0.3,
        fontFace: 'Arial',
        fontSize: 12,
        color: COBALT,
      });
    }

    // Hairline divider
    slide.addShape(pptx.ShapeType.line, {
      x: 0.65,
      y: 1.2,
      w: 8.7,
      h: 0,
      line: { color: SLATE_200, width: 1 },
    });

    if (
      slideData.layout === 'table' &&
      slideData.tableData &&
      slideData.tableData.headers.length > 0 &&
      slideData.tableData.rows.length > 0
    ) {
      const tableRows: PptxGenJS.TableRow[] = [
        slideData.tableData.headers.map((h) => ({
          text: clip(h, 48),
          options: {
            bold: true,
            color: WHITE,
            fill: { color: SLATE_900 },
            fontFace: 'Arial',
            fontSize: 12,
          },
        })),
        ...slideData.tableData.rows.slice(0, 6).map((row, rIdx) =>
          row.map((cell) => ({
            text: clip(cell, 110),
            options: {
              color: SLATE_900,
              fill: { color: rIdx % 2 === 0 ? WHITE : SLATE_50 },
              fontFace: 'Arial',
              fontSize: 11,
            },
          }))
        ),
      ];

      slide.addTable(tableRows, {
        x: 0.65,
        y: 1.4,
        w: 8.7,
        border: { type: 'solid', pt: 1, color: SLATE_200 },
        margin: [6, 8, 6, 8],
        valign: 'middle',
      });
    } else if (slideData.layout === 'two_column' && slideData.bullets.length >= 2) {
      const mid = Math.ceil(slideData.bullets.length / 2);
      const leftBullets = slideData.bullets.slice(0, mid);
      const rightBullets = slideData.bullets.slice(mid);

      // Left card
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.65,
        y: 1.42,
        w: 4.2,
        h: 3.45,
        fill: { color: SLATE_50 },
        line: { color: SLATE_200, width: 1 },
      });
      slide.addText(
        leftBullets.map((b) => ({
          text: clip(b, 175),
          options: { bullet: true, breakLine: true, paraSpaceAfter: 10 },
        })),
        {
          x: 0.85,
          y: 1.62,
          w: 3.8,
          h: 3.1,
          fontFace: 'Arial',
          fontSize: 13.5,
          color: SLATE_700,
          valign: 'top',
        }
      );

      // Right card
      slide.addShape(pptx.ShapeType.rect, {
        x: 5.15,
        y: 1.42,
        w: 4.2,
        h: 3.45,
        fill: { color: SLATE_50 },
        line: { color: SLATE_200, width: 1 },
      });
      slide.addText(
        rightBullets.map((b) => ({
          text: clip(b, 175),
          options: { bullet: true, breakLine: true, paraSpaceAfter: 10 },
        })),
        {
          x: 5.35,
          y: 1.62,
          w: 3.8,
          h: 3.1,
          fontFace: 'Arial',
          fontSize: 13.5,
          color: SLATE_700,
          valign: 'top',
        }
      );
    } else {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.65,
        y: 1.4,
        w: 8.7,
        h: 3.5,
        fill: { color: SLATE_50 },
        line: { color: SLATE_200, width: 1 },
      });

      slide.addText(
        slideData.bullets.slice(0, 6).map((b) => ({
          text: clip(b, 210),
          options: { bullet: true, breakLine: true, paraSpaceAfter: 10 },
        })),
        {
          x: 0.9,
          y: 1.6,
          w: 8.2,
          h: 3.15,
          fontFace: 'Arial',
          fontSize: 14.5,
          color: SLATE_700,
          valign: 'top',
        }
      );
    }

    // Footer
    slide.addText(clip(input.topic, 75), {
      x: 0.65,
      y: 5.18,
      w: 7.4,
      h: 0.3,
      fontFace: 'Arial',
      fontSize: 10,
      color: SLATE_500,
    });
    slide.addText(`${slideNum} / ${slides.length}`, {
      x: 8.2,
      y: 5.18,
      w: 1.15,
      h: 0.3,
      align: 'right',
      fontFace: 'Arial',
      fontSize: 10,
      bold: true,
      color: SLATE_500,
    });
  }

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as Uint8Array);
}
