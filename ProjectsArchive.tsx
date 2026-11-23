import { useMemo, useState } from 'react';
import { Download, Eye, Plus, Presentation, Search } from 'lucide-react';
import type { ProjectSummary } from '../types/client';

interface ProjectsArchiveProps {
  projects: ProjectSummary[];
  onSelectProject: (id: string) => void;
  onOpenQuickForm: () => void;
}

const SOURCE_LABELS: Record<'all' | 'telegram' | 'simulator' | 'studio', string> = {
  all: 'Все каналы',
  telegram: 'Telegram',
  simulator: 'Симулятор',
  studio: 'Быстрая форма',
};

export function ProjectsArchive({
  projects,
  onSelectProject,
  onOpenQuickForm,
}: ProjectsArchiveProps) {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'telegram' | 'simulator' | 'studio'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (sourceFilter !== 'all' && p.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        p.topic.toLowerCase().includes(q) ||
        p.subject.toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q)
      );
    });
  }, [projects, query, sourceFilter]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Архив сгенерированных проектов
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            Всего комплектов в текущей сессии сервера: {projects.length}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по теме, предмету, автору..."
              className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white w-64"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'telegram', 'simulator', 'studio'] as const).map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setSourceFilter(src)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  sourceFilter === src
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {SOURCE_LABELS[src]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="py-16 px-6 text-center max-w-md mx-auto">
          <h3 className="text-sm font-semibold text-slate-900">
            Пока нет созданных проектов
          </h3>
          <p className="text-sm text-slate-600 mt-1.5">
            Сгенерируйте комплект (проект по ГОСТ, презентация 10 слайдов и речь защиты) через симулятор, Telegram-бота или быструю форму.
          </p>
          <button
            type="button"
            onClick={onOpenQuickForm}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Создать первый проект</span>
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 px-6 text-center text-sm text-slate-500">
          По вашему запросу проекты не найдены.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                <th className="py-2.5 px-6">Тема проекта</th>
                <th className="py-2.5 px-4">Предмет</th>
                <th className="py-2.5 px-4">Автор</th>
                <th className="py-2.5 px-4">Канал</th>
                <th className="py-2.5 px-4 text-right">Объём</th>
                <th className="py-2.5 px-4 text-right">Время</th>
                <th className="py-2.5 px-6 text-right">Файлы</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-6 max-w-xs">
                    <div className="font-medium text-slate-900 truncate">
                      {item.topic}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5 tabular-nums">
                      {item.projectType} · {item.chaptersCount} глав(ы) · {item.level}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                    {item.subject}
                  </td>
                  <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                    {item.authorName}
                  </td>
                  <td className="py-3 px-4 text-slate-600 text-xs whitespace-nowrap">
                    {SOURCE_LABELS[item.source]}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-700 tabular-nums whitespace-nowrap">
                    {item.wordCount} сл. · ~{item.estimatedPages} с.
                  </td>
                  <td className="py-3 px-4 text-right text-slate-500 text-xs tabular-nums whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-6 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectProject(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Открыть</span>
                      </button>
                      <a
                        href={`/api/projects/${item.id}/docx`}
                        download={item.filename}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>DOCX</span>
                      </a>
                      <a
                        href={`/api/projects/${item.id}/pptx`}
                        download={item.pptxFilename}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors"
                      >
                        <Presentation className="w-3.5 h-3.5" />
                        <span>PPTX</span>
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
