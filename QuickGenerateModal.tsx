import { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import type {
  ChaptersCount,
  EducationLevel,
  FullProject,
  ProgressUpdate,
  ProjectType,
} from '../types/client';
import { postSseStream } from '../utils/sseClient';

interface QuickGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: FullProject) => void;
}

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
const TYPES: ProjectType[] = [
  'Исследовательский',
  'Практико-ориентированный',
  'Информационный',
  'Творческий',
];
const PAGE_PRESETS = [10, 14, 18, 20];

export function QuickGenerateModal({
  isOpen,
  onClose,
  onCreated,
}: QuickGenerateModalProps) {
  const [topic, setTopic] = useState('');
  const [subject, setSubject] = useState('Информатика');
  const [level, setLevel] = useState<EducationLevel>('10–11 класс');
  const [projectType, setProjectType] = useState<ProjectType>('Исследовательский');
  const [chaptersCount, setChaptersCount] = useState<ChaptersCount>(2);
  const [targetPages, setTargetPages] = useState<number>(14);
  const [institution, setInstitution] = useState(
    'МБОУ «Средняя общеобразовательная школа № 1»'
  );
  const [authorName, setAuthorName] = useState('Иванов Алексей Сергеевич');
  const [authorClass, setAuthorClass] = useState('10 «А» класс');
  const [supervisorName, setSupervisorName] = useState(
    'Петрова Елена Викторовна, учитель информатики'
  );
  const [city, setCity] = useState('Москва');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSuggest = async () => {
    setError(null);
    setIsSuggesting(true);
    try {
      const res = await fetch('/api/topics/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, level }),
      });
      const data = (await res.json()) as { topics?: string[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Не удалось подобрать темы');
      }
      setSuggestedTopics(data.topics ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка подбора тем');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (topic.trim().length < 4) {
      setError('Введите тему проекта (минимум 4 символа).');
      return;
    }

    setError(null);
    setIsGenerating(true);
    setProgress({ percent: 5, stage: 'Подключение к генератору...' });
    try {
      const data = await postSseStream<FullProject>({
        url: '/api/projects/generate-stream',
        body: {
          topic: topic.trim(),
          subject,
          level,
          projectType,
          chaptersCount,
          targetPages,
          institution,
          authorName,
          authorClass,
          supervisorName,
          city,
          year,
        },
        onProgress: (update) => setProgress(update),
      });
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации проекта');
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-generate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="quick-generate-title" className="text-base font-semibold text-slate-900">
            Создать проект, презентацию (10 слайдов) и речь
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Закрыть окно"
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Предмет
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={isGenerating}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Уровень обучения
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value as EducationLevel)}
                disabled={isGenerating}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Тип проекта
              </label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value as ProjectType)}
                disabled={isGenerating}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Количество глав (2–4)
              </label>
              <div className="flex items-center gap-1.5">
                {([2, 3, 4] as ChaptersCount[]).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setChaptersCount(cnt)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      chaptersCount === cnt
                        ? 'bg-blue-700 border-blue-700 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {cnt} главы
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Объём страниц (до 20 стр.)
                </label>
                <span className="text-xs font-semibold text-blue-700 tabular-nums">
                  {targetPages} стр.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={8}
                  max={20}
                  value={targetPages}
                  disabled={isGenerating}
                  onChange={(e) => setTargetPages(Number(e.target.value))}
                  className="flex-1 accent-blue-700"
                />
                <div className="flex items-center gap-1">
                  {PAGE_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => setTargetPages(p)}
                      className={`px-2 py-1 text-[11px] font-medium rounded border tabular-nums ${
                        targetPages === p
                          ? 'bg-blue-700 border-blue-700 text-white'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label className="text-xs font-medium text-slate-700">
                Тема индивидуального проекта
              </label>
              <button
                type="button"
                onClick={handleSuggest}
                disabled={isSuggesting || isGenerating}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800 disabled:opacity-50"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>
                  {isSuggesting ? 'Подбираю темы...' : 'Подобрать актуальные темы'}
                </span>
              </button>
            </div>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isGenerating}
              placeholder="Например: Применение алгоритмов машинного обучения в школьном образовании"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {suggestedTopics.length > 0 && (
              <div className="mt-2 space-y-1">
                {suggestedTopics.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTopic(item)}
                    className="block w-full text-left px-3 py-1.5 text-xs text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-800 border border-slate-200 rounded-md transition-colors"
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 space-y-4">
            <h3 className="text-xs font-semibold text-slate-900">
              Данные для титульного листа
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Учебное заведение
              </label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                disabled={isGenerating}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ФИО автора
                </label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Класс или группа
                </label>
                <input
                  type="text"
                  value={authorClass}
                  onChange={(e) => setAuthorClass(e.target.value)}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ФИО и должность руководителя
                </label>
                <input
                  type="text"
                  value={supervisorName}
                  onChange={(e) => setSupervisorName(e.target.value)}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Город
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    disabled={isGenerating}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Год
                  </label>
                  <input
                    type="text"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    disabled={isGenerating}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {isGenerating && progress && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-900">
                  Формирование комплекта по ГОСТ
                </span>
                <span className="font-mono font-semibold text-blue-700 tabular-nums">
                  {progress.percent}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, Math.min(100, progress.percent))}%` }}
                />
              </div>
              <p className="text-xs text-slate-600">{progress.stage}</p>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {isGenerating && (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>
                {isGenerating
                  ? `Генерация (${progress?.percent ?? 0}%)...`
                  : 'Сгенерировать комплект'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
