import { useState } from 'react';
import {
  ArrowDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Mic,
  Plus,
  Presentation,
} from 'lucide-react';
import type { FullProject } from '../types/client';

interface DocumentPreviewProps {
  project: FullProject | null;
  isLoading: boolean;
  onOpenQuickForm: () => void;
}

type PreviewSection =
  | 'title'
  | 'intro'
  | 'chapters'
  | 'conclusion'
  | 'speech'
  | 'slides';

export function DocumentPreview({
  project,
  isLoading,
  onOpenQuickForm,
}: DocumentPreviewProps) {
  const [section, setSection] = useState<PreviewSection>('title');
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

  const currentYear = new Date().getFullYear();
  const minSourceYear = currentYear - 7;

  const GOST_RULES = [
    { param: 'Формат и поля', value: 'A4 · Левое 30 мм · Правое 15 мм · Верх/низ 20 мм' },
    { param: 'Шрифт и интервал', value: 'Times New Roman · 14 пт · 1,5 строки · Отступ 1,25 см' },
    { param: 'Главы и объём', value: 'От 2 до 4 глав · До 20 страниц · Без Приложения А' },
    { param: 'Иллюстрации в тексте', value: 'Таблицы по ГОСТ и структурные блок-схемы' },
    { param: 'Свежесть источников', value: `Не старше 7 лет (${minSourceYear}–${currentYear} гг.) · ГОСТ Р 7.0.5-2008` },
    { param: 'Комплект к защите', value: 'Проект .docx + Презентация 10 слайдов .pptx + Речь .docx' },
  ];

  if (isLoading) {
    return (
      <section className="h-[700px] bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="h-6 w-2/3 bg-slate-100 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
          <div className="h-[520px] bg-slate-50 border border-slate-200 rounded-lg animate-pulse" />
        </div>
      </section>
    );
  }

  if (!project) {
    return (
      <section className="h-[700px] bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between overflow-y-auto">
        <div>
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Предпросмотр проекта, презентации и речи
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Запустите диалог в симуляторе слева или заполните единую форму, чтобы получить полный пакет к защите.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenQuickForm}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Быстрая форма</span>
            </button>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Параметры сборки под ключ
            </h3>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
              {GOST_RULES.map((rule) => (
                <div
                  key={rule.param}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <span className="text-slate-600">{rule.param}</span>
                  <span className="font-medium text-slate-900 text-right tabular-nums">
                    {rule.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Что входит в каждый сгенерированный комплект
            </h3>
            <ol className="space-y-2.5 text-sm text-slate-700">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Документ проекта (.docx) с 2–4 главами, таблицами, схемами и списком литературы за 7 лет</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Готовая презентация PowerPoint (.pptx) ровно на 10 слайдов с заметками выступающего</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Текст речи для защиты (.docx) с привязкой к слайдам и ответами на 5 вопросов комиссии</span>
              </li>
            </ol>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Форматы экспорта: DOCX + PPTX</span>
          <span>Совместимость: Microsoft Office, LibreOffice, Google Docs / Slides</span>
        </div>
      </section>
    );
  }

  const tabs: { id: PreviewSection; label: string }[] = [
    { id: 'title', label: 'Титульный лист' },
    { id: 'intro', label: 'Содержание и Введение' },
    { id: 'chapters', label: `Главы (1–${project.content.chapters.length})` },
    { id: 'conclusion', label: 'Заключение и Источники' },
    { id: 'speech', label: 'Речь для защиты' },
    { id: 'slides', label: `Презентация (${project.content.presentationSlides.length} слайдов)` },
  ];

  let tableNum = 0;
  let figureNum = 0;
  const slides = project.content.presentationSlides;
  const safeSlideIdx = Math.min(activeSlideIdx, Math.max(0, slides.length - 1));
  const currentSlide = slides[safeSlideIdx];

  return (
    <section
      aria-label="Предпросмотр комплекта проекта"
      className="flex flex-col h-[700px] bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Top Preview Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            {project.input.topic}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5 tabular-nums">
            <span>{project.input.subject}</span>
            <span aria-hidden="true">·</span>
            <span>{project.input.chaptersCount} глав(ы)</span>
            <span aria-hidden="true">·</span>
            <span>{project.wordCount} слов</span>
            <span aria-hidden="true">·</span>
            <span>~{project.estimatedPages} стр.</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={`/api/projects/${project.id}/docx`}
            download={project.filename}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Проект .docx</span>
          </a>
          <a
            href={`/api/projects/${project.id}/pptx`}
            download={project.pptxFilename}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Presentation className="w-3.5 h-3.5" />
            <span>Слайды .pptx</span>
          </a>
          <a
            href={`/api/projects/${project.id}/speech-docx`}
            download={project.speechFilename}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Речь .docx</span>
          </a>
        </div>
      </div>

      {/* Section Switcher */}
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              section === tab.id
                ? 'bg-white text-slate-900 border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-5 bg-slate-100">
        {section !== 'slides' && section !== 'speech' && (
          <div className="gost-paper mx-auto max-w-[680px] min-h-[540px] border border-slate-300 px-10 py-10 text-[15px] leading-[1.6]">
            {section === 'title' && (
              <div className="flex flex-col justify-between min-h-[460px] text-center">
                <div className="space-y-2">
                  <p className="font-bold uppercase">{project.input.institution}</p>
                  <p>Учебная дисциплина: {project.input.subject}</p>
                </div>

                <div className="my-10 space-y-3">
                  <p className="font-bold text-lg tracking-wide">
                    ИНДИВИДУАЛЬНЫЙ ПРОЕКТ
                  </p>
                  <p className="font-bold">по теме: «{project.input.topic}»</p>
                  <p className="text-sm">
                    Тип проекта: {project.input.projectType} ({project.input.level})
                  </p>
                </div>

                <div className="ml-auto w-[60%] text-left space-y-3 text-sm">
                  <div>
                    <p className="font-bold">Выполнил(а):</p>
                    <p>обучающийся(аяся) {project.input.authorClass}</p>
                    <p>{project.input.authorName}</p>
                  </div>
                  <div>
                    <p className="font-bold">Руководитель проекта:</p>
                    <p>{project.input.supervisorName}</p>
                  </div>
                </div>

                <div className="pt-10">
                  <p>
                    {project.input.city}, {project.input.year}
                  </p>
                </div>
              </div>
            )}

            {section === 'intro' && (
              <div className="space-y-4 text-justify">
                <h3 className="font-bold text-center uppercase mb-4">СОДЕРЖАНИЕ</h3>
                <div className="space-y-1 text-left border-b border-slate-200 pb-5 mb-6">
                  <p className="font-bold">ВВЕДЕНИЕ</p>
                  {project.content.chapters.map((ch) => (
                    <div key={ch.number}>
                      <p className="font-bold">{ch.title}</p>
                      {ch.sections.map((s) => (
                        <p key={s.number} className="pl-6">
                          {s.number} {s.title.replace(/^\d+(\.\d+)*\.?\s*/, '')}
                        </p>
                      ))}
                    </div>
                  ))}
                  <p className="font-bold">ЗАКЛЮЧЕНИЕ</p>
                  <p className="font-bold">СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ</p>
                </div>

                <h3 className="font-bold text-center uppercase mb-4">ВВЕДЕНИЕ</h3>
                {project.content.introduction.relevance.map((p, idx) => (
                  <p key={idx} style={{ textIndent: '1.25cm' }}>
                    {p}
                  </p>
                ))}
                <p style={{ textIndent: '1.25cm' }}>
                  <strong>Проблема исследования:</strong>{' '}
                  {project.content.introduction.problem}
                </p>
                <p style={{ textIndent: '1.25cm' }}>
                  <strong>Цель проекта:</strong> {project.content.introduction.goal}
                </p>
                <p style={{ textIndent: '1.25cm' }}>
                  <strong>Задачи проекта:</strong>
                </p>
                {project.content.introduction.tasks.map((task, idx) => (
                  <p key={idx} style={{ textIndent: '1.25cm' }}>
                    {idx + 1}) {task}
                  </p>
                ))}
                <p style={{ textIndent: '1.25cm' }}>
                  <strong>Объект исследования:</strong>{' '}
                  {project.content.introduction.object}
                </p>
                <p style={{ textIndent: '1.25cm' }}>
                  <strong>Предмет исследования:</strong>{' '}
                  {project.content.introduction.subjectMatter}
                </p>
                <p style={{ textIndent: '1.25cm' }}>
                  <strong>Гипотеза (проектная идея):</strong>{' '}
                  {project.content.introduction.hypothesis}
                </p>
                <p style={{ textIndent: '1.25cm' }}>
                  <strong>Методы исследования:</strong>{' '}
                  {project.content.introduction.methods.join(', ')}.
                </p>
                <p style={{ textIndent: '1.25cm' }}>
                  <strong>Практическая значимость:</strong>{' '}
                  {project.content.introduction.practicalSignificance}
                </p>
              </div>
            )}

            {section === 'chapters' && (
              <div className="space-y-8 text-justify">
                {project.content.chapters.map((ch, cIdx) => {
                  const isLast = cIdx === project.content.chapters.length - 1;
                  return (
                    <div
                      key={ch.number}
                      className="space-y-4 pb-6 border-b border-slate-200 last:border-b-0"
                    >
                      <h3 className="font-bold uppercase" style={{ textIndent: '1.25cm' }}>
                        {ch.title}
                      </h3>

                      {ch.sections.map((sec) => (
                        <div key={sec.number} className="space-y-3 pt-1">
                          <h4 className="font-bold" style={{ textIndent: '1.25cm' }}>
                            {sec.number} {sec.title.replace(/^\d+(\.\d+)*\.?\s*/, '')}
                          </h4>
                          {sec.paragraphs.map((p, idx) => (
                            <p key={idx} style={{ textIndent: '1.25cm' }}>
                              {p}
                            </p>
                          ))}
                        </div>
                      ))}

                      {(ch.tables ?? []).map((tbl, tIdx) => {
                        tableNum += 1;
                        return (
                          <div key={`t-${tIdx}`} className="pt-2">
                            <p className="mb-1.5 text-left text-sm">
                              Таблица {tableNum} –{' '}
                              {tbl.caption.replace(/^Таблица\s*\d*\s*[–—-]\s*/i, '')}
                            </p>
                            <table className="w-full border-collapse border border-black text-xs text-left">
                              <thead>
                                <tr>
                                  {tbl.headers.map((h, hIdx) => (
                                    <th
                                      key={hIdx}
                                      className="border border-black p-2 font-bold"
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {tbl.rows.map((row, rIdx) => (
                                  <tr key={rIdx}>
                                    {tbl.headers.map((_, colIdx) => (
                                      <td
                                        key={colIdx}
                                        className={`border border-black p-2 ${
                                          colIdx === 0 ? 'font-bold' : ''
                                        }`}
                                      >
                                        {row[colIdx] ?? ''}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}

                      {(ch.diagrams ?? []).map((diag, dIdx) => {
                        figureNum += 1;
                        return (
                          <div key={`d-${dIdx}`} className="pt-3">
                            <div className="flex flex-col items-center space-y-1.5">
                              {diag.nodes.map((node, nIdx) => (
                                <div
                                  key={nIdx}
                                  className="w-full max-w-[440px] flex flex-col items-center"
                                >
                                  <div className="w-full border border-black px-4 py-2.5 text-center text-xs">
                                    <div className="font-bold">
                                      {node.step ? `${node.step}. ` : ''}
                                      {node.title}
                                    </div>
                                    <div className="mt-0.5">{node.detail}</div>
                                  </div>
                                  {nIdx < diag.nodes.length - 1 && (
                                    <ArrowDown className="w-4 h-4 my-1 text-black" />
                                  )}
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-center text-sm">
                              Рисунок {figureNum} –{' '}
                              {diag.caption.replace(/^Рисунок\s*\d*\s*[–—-]\s*/i, '')}
                            </p>
                          </div>
                        );
                      })}

                      {isLast && project.content.productPassport && (
                        <div className="pt-2">
                          {(() => {
                            tableNum += 1;
                            return (
                              <p className="mb-1.5 text-left text-sm">
                                Таблица {tableNum} – Паспорт проектного продукта
                              </p>
                            );
                          })()}
                          <table className="w-full border-collapse border border-black text-xs text-left">
                            <thead>
                              <tr>
                                <th className="border border-black p-2 w-1/3 font-bold">
                                  Характеристика
                                </th>
                                <th className="border border-black p-2 font-bold">
                                  Содержание
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="border border-black p-2 font-bold">
                                  Наименование продукта
                                </td>
                                <td className="border border-black p-2">
                                  {project.content.productPassport.productName}
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black p-2 font-bold">
                                  Целевая аудитория
                                </td>
                                <td className="border border-black p-2">
                                  {project.content.productPassport.targetAudience}
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black p-2 font-bold">
                                  Этапы реализации
                                </td>
                                <td className="border border-black p-2">
                                  {project.content.productPassport.stages.join('; ')}
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black p-2 font-bold">
                                  Ресурсы и инструменты
                                </td>
                                <td className="border border-black p-2">
                                  {project.content.productPassport.resources.join('; ')}
                                </td>
                              </tr>
                              <tr>
                                <td className="border border-black p-2 font-bold">
                                  Ожидаемый результат
                                </td>
                                <td className="border border-black p-2">
                                  {project.content.productPassport.resultDescription}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="pt-1 space-y-2">
                        <h4 className="font-bold" style={{ textIndent: '1.25cm' }}>
                          Выводы по главе {ch.number}
                        </h4>
                        <p style={{ textIndent: '1.25cm' }}>{ch.summary}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {section === 'conclusion' && (
              <div className="space-y-4 text-justify">
                <h3 className="font-bold text-center uppercase mb-4">ЗАКЛЮЧЕНИЕ</h3>
                {project.content.conclusion.map((p, idx) => (
                  <p key={idx} style={{ textIndent: '1.25cm' }}>
                    {p}
                  </p>
                ))}

                <h3 className="font-bold text-center uppercase pt-6 mb-4">
                  СПИСОК ИСПОЛЬЗОВАННЫХ ИСТОЧНИКОВ
                </h3>
                <div className="space-y-2">
                  {project.content.bibliography.map((source, idx) => (
                    <p key={idx} style={{ textIndent: '1.25cm' }}>
                      {idx + 1}. {source.replace(/^\d+[.)]\s*/, '')}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {section === 'speech' && (
          <div className="mx-auto max-w-[680px] bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Текст речи для устной защиты
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  Ориентировочное время выступления: ~{project.content.defenseSpeech.estimatedMinutes} мин. · Привязка к 10 слайдам
                </p>
              </div>
              <a
                href={`/api/projects/${project.id}/speech-docx`}
                download={project.speechFilename}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать речь (.docx)</span>
              </a>
            </div>

            <div className="space-y-3 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {project.content.defenseSpeech.fullText}
            </div>

            <div className="pt-5 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-900 mb-3">
                Возможные вопросы комиссии и готовые ответы
              </h4>
              <div className="space-y-3">
                {project.content.defenseSpeech.qaPrep.map((qa, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-sm space-y-1"
                  >
                    <div className="font-semibold text-slate-900">
                      {idx + 1}. {qa.question}
                    </div>
                    <div className="text-slate-700 leading-relaxed">{qa.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {section === 'slides' && currentSlide && (
          <div className="mx-auto max-w-[720px] space-y-4">
            {/* 16:9 Slide Stage */}
            <div
              className={`aspect-video rounded-xl border border-slate-300 overflow-hidden flex flex-col justify-between p-8 ${
                currentSlide.layout === 'title' || currentSlide.layout === 'closing'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-900'
              }`}
            >
              {currentSlide.layout === 'title' ? (
                <div className="flex flex-col justify-between h-full">
                  <div className="text-xs font-semibold text-sky-300 uppercase tracking-wide">
                    {project.input.institution}
                  </div>
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-slate-300 uppercase">
                      Индивидуальный проект
                    </div>
                    <h3 className="text-2xl font-bold leading-snug text-white">
                      {project.input.topic}
                    </h3>
                    <div className="w-16 h-1 bg-blue-600" />
                    <div className="text-xs text-slate-300">
                      {project.input.subject} · {project.input.projectType} ·{' '}
                      {project.input.level}
                    </div>
                  </div>
                  <div className="flex items-end justify-between text-xs text-slate-300">
                    <div>
                      <div>
                        Выполнил(а): {project.input.authorName} ({project.input.authorClass})
                      </div>
                      <div>Руководитель: {project.input.supervisorName}</div>
                    </div>
                    <div>
                      {project.input.city}, {project.input.year}
                    </div>
                  </div>
                </div>
              ) : currentSlide.layout === 'closing' ? (
                <div className="flex flex-col justify-center items-center text-center h-full space-y-4">
                  <h3 className="text-3xl font-bold text-white">
                    {currentSlide.title}
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-200 max-w-lg">
                    {currentSlide.bullets.slice(0, 3).map((b, idx) => (
                      <li key={idx}>{b}</li>
                    ))}
                  </ul>
                  <div className="pt-4 text-xs text-slate-400">
                    {project.input.authorName} · {project.input.city},{' '}
                    {project.input.year}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between h-full">
                  <div>
                    <div className="pb-3 border-b border-slate-200">
                      <h3 className="text-lg font-bold text-slate-900">
                        {currentSlide.title}
                      </h3>
                      {currentSlide.subtitle && (
                        <p className="text-xs text-blue-700 mt-0.5">
                          {currentSlide.subtitle}
                        </p>
                      )}
                    </div>

                    <div className="mt-4">
                      {currentSlide.layout === 'table' && currentSlide.tableData ? (
                        <table className="w-full border-collapse border border-slate-300 text-xs">
                          <thead>
                            <tr className="bg-slate-900 text-white">
                              {currentSlide.tableData.headers.map((h, i) => (
                                <th key={i} className="p-2 text-left font-semibold">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {currentSlide.tableData.rows.slice(0, 5).map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                              >
                                {row.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="p-2 border-t border-slate-200"
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : currentSlide.layout === 'two_column' ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                            <ul className="space-y-2 text-xs text-slate-700 list-disc pl-4">
                              {currentSlide.bullets
                                .slice(0, Math.ceil(currentSlide.bullets.length / 2))
                                .map((b, i) => (
                                  <li key={i}>{b}</li>
                                ))}
                            </ul>
                          </div>
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                            <ul className="space-y-2 text-xs text-slate-700 list-disc pl-4">
                              {currentSlide.bullets
                                .slice(Math.ceil(currentSlide.bullets.length / 2))
                                .map((b, i) => (
                                  <li key={i}>{b}</li>
                                ))}
                            </ul>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                          <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
                            {currentSlide.bullets.slice(0, 6).map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2">
                    <span className="truncate max-w-[75%]">{project.input.topic}</span>
                    <span className="font-semibold tabular-nums">
                      {safeSlideIdx + 1} / {slides.length}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Slide Controls & Speaker Note */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {slides.map((s, idx) => (
                    <button
                      key={s.slideNumber}
                      type="button"
                      onClick={() => setActiveSlideIdx(idx)}
                      className={`w-8 h-8 text-xs font-medium rounded-md tabular-nums transition-colors shrink-0 ${
                        idx === safeSlideIdx
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={safeSlideIdx === 0}
                    onClick={() => setActiveSlideIdx((i) => Math.max(0, i - 1))}
                    aria-label="Предыдущий слайд"
                    className="p-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={safeSlideIdx >= slides.length - 1}
                    onClick={() =>
                      setActiveSlideIdx((i) => Math.min(slides.length - 1, i + 1))
                    }
                    aria-label="Следующий слайд"
                    className="p-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">
                  Заметка спикера (Слайд {safeSlideIdx + 1}):{' '}
                </span>
                <span>{currentSlide.speakerNote}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
