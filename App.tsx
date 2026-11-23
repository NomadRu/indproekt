import { useCallback, useEffect, useState } from 'react';
import { DocumentPreview } from './components/DocumentPreview';
import { GostStandardView } from './components/GostStandardView';
import { ProjectsArchive } from './components/ProjectsArchive';
import { QuickGenerateModal } from './components/QuickGenerateModal';
import { TelegramSetupView } from './components/TelegramSetupView';
import { TelegramSimulator } from './components/TelegramSimulator';
import type {
  BotRuntimeStatus,
  FullProject,
  ProjectSummary,
} from './types/client';

type ActiveTab = 'simulator' | 'archive' | 'gost' | 'telegram';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator');
  const [botStatus, setBotStatus] = useState<BotRuntimeStatus | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<FullProject | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isQuickModalOpen, setIsQuickModalOpen] = useState(false);

  const refreshStatus = useCallback(async () => {
    setIsRefreshingStatus(true);
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const data = (await res.json()) as BotRuntimeStatus;
        setBotStatus(data);
      }
    } catch {
      // Ignore network hiccup on status poll
    } finally {
      setIsRefreshingStatus(false);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = (await res.json()) as { projects: ProjectSummary[] };
        setProjects(data.projects);
      }
    } catch {
      // Ignore network hiccup
    }
  }, []);

  const loadFullProject = useCallback(async (id: string) => {
    setIsLoadingProject(true);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (res.ok) {
        const data = (await res.json()) as FullProject;
        setSelectedProject(data);
      }
    } finally {
      setIsLoadingProject(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshProjects();
  }, [refreshStatus, refreshProjects]);

  const handleProjectCreated = (projectId: string) => {
    void refreshProjects();
    void refreshStatus();
    void loadFullProject(projectId);
  };

  const handleOpenPreview = (projectId: string) => {
    setActiveTab('simulator');
    void loadFullProject(projectId);
  };

  const handleQuickCreated = (project: FullProject) => {
    setSelectedProject(project);
    setActiveTab('simulator');
    void refreshProjects();
    void refreshStatus();
  };

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'simulator', label: 'Симулятор бота' },
    { id: 'archive', label: 'Архив проектов' },
    { id: 'gost', label: 'Стандарт ГОСТ' },
    { id: 'telegram', label: 'Telegram-бот' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Three-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left"
          >
            ПроектБот ГОСТ
          </button>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav
            aria-label="Основная навигация"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'text-slate-900 border-blue-700'
                      : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setIsQuickModalOpen(true)}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Создать проект
            </button>
          </div>
        </div>

        {/* Mobile navigation strip */}
        <div className="md:hidden border-t border-slate-200 px-4 py-2 flex items-center gap-4 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'text-slate-900 border-blue-700'
                    : 'text-slate-600 border-transparent'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 text-balance">
              {activeTab === 'simulator' &&
                'Генератор индивидуальных проектов по ГОСТ 7.32-2017'}
              {activeTab === 'archive' && 'Архив созданных индивидуальных проектов'}
              {activeTab === 'gost' &&
                'Спецификация оформления ГОСТ 7.32-2017 и ФГОС'}
              {activeTab === 'telegram' && 'Подключение живого Telegram-бота'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1.5 tabular-nums">
              <span>
                {botStatus?.telegramRunning && botStatus.botUsername
                  ? `Telegram: @${botStatus.botUsername} активен`
                  : 'Telegram: ожидает TELEGRAM_BOT_TOKEN в Secrets'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Формат экспорта: DOCX (ГОСТ) + PPTX (10 слайдов) + Речь</span>
              <span aria-hidden="true">·</span>
              <span>Проектов в сессии: {projects.length}</span>
            </div>
          </div>
        </div>

        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5">
              <TelegramSimulator
                onProjectCreated={handleProjectCreated}
                onOpenPreview={handleOpenPreview}
              />
            </div>
            <div className="lg:col-span-7">
              <DocumentPreview
                project={selectedProject}
                isLoading={isLoadingProject}
                onOpenQuickForm={() => setIsQuickModalOpen(true)}
              />
            </div>
          </div>
        )}

        {activeTab === 'archive' && (
          <ProjectsArchive
            projects={projects}
            onSelectProject={handleOpenPreview}
            onOpenQuickForm={() => setIsQuickModalOpen(true)}
          />
        )}

        {activeTab === 'gost' && <GostStandardView />}

        {activeTab === 'telegram' && (
          <TelegramSetupView
            status={botStatus}
            onRefreshStatus={() => void refreshStatus()}
            isRefreshing={isRefreshingStatus}
          />
        )}
      </main>

      <QuickGenerateModal
        isOpen={isQuickModalOpen}
        onClose={() => setIsQuickModalOpen(false)}
        onCreated={handleQuickCreated}
      />
    </div>
  );
}
