import { useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  RefreshCw,
} from 'lucide-react';
import type { BotRuntimeStatus } from '../types/client';

interface TelegramSetupViewProps {
  status: BotRuntimeStatus | null;
  onRefreshStatus: () => void;
  isRefreshing: boolean;
}

const BOTFATHER_COMMANDS = `start - Главное меню бота
profile - Мой профиль, ID и баланс генераций
buy - Купить генерацию проекта (300₽)
new - Создать индивидуальный проект по ГОСТу
gost - Требования ГОСТ 7.32-2017
support - Поддержка (@indproekt_help)
cancel - Сбросить текущую анкету
help - Справка по командам`;

export function TelegramSetupView({
  status,
  onRefreshStatus,
  isRefreshing,
}: TelegramSetupViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCommands = async () => {
    try {
      await navigator.clipboard.writeText(BOTFATHER_COMMANDS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Состояние Telegram-бота
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Серверный модуль grammy (long-polling)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefreshStatus}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
        </div>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-slate-600">Статус подключения</span>
            {status?.telegramRunning ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Активен в Telegram</span>
              </span>
            ) : status?.telegramConfigured ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Ошибка токена</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Ожидает токен в Secrets</span>
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-slate-600">Имя бота</span>
            <span className="font-mono text-xs font-medium text-slate-900">
              {status?.botUsername ? `@${status.botUsername}` : 'Не подключён'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-slate-600">Стандарт сборки</span>
            <span className="font-medium text-slate-900">
              {status?.gostStandard ?? 'ГОСТ 7.32-2017'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-slate-600">Сгенерировано проектов</span>
            <span className="font-medium text-slate-900 tabular-nums">
              {status?.totalProjects ?? 0}
            </span>
          </div>
        </div>

        {status?.lastError && (
          <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 leading-relaxed">
            {status.lastError}
          </div>
        )}

        {status?.botUsername && (
          <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 leading-relaxed">
            Бот @{status.botUsername} запущен и отвечает пользователям в Telegram. Отправьте ему команду /start в приложении Telegram.
          </div>
        )}
      </section>

      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Как подключить своего Telegram-бота за 2 минуты
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Сервер автоматически запускает бота при наличии переменной окружения{' '}
            <code className="font-mono text-xs px-1.5 py-0.5 bg-slate-100 rounded">
              TELEGRAM_BOT_TOKEN
            </code>
            .
          </p>
        </div>

        <ol className="space-y-4 text-sm text-slate-700">
          <li className="pb-4 border-b border-slate-200">
            <div className="font-semibold text-slate-900">
              1. Создайте бота в @BotFather
            </div>
            <p className="mt-1 leading-relaxed text-slate-600">
              Откройте Telegram, найдите официальный бот <span className="font-mono text-slate-900">@BotFather</span>, отправьте команду <span className="font-mono text-slate-900">/newbot</span>, задайте отображаемое имя (например, «Проекты по ГОСТу») и уникальный username, заканчивающийся на <span className="font-mono text-slate-900">bot</span>.
            </p>
          </li>

          <li className="pb-4 border-b border-slate-200">
            <div className="font-semibold text-slate-900">
              2. Добавьте токен в Settings &gt; Secrets
            </div>
            <p className="mt-1 leading-relaxed text-slate-600">
              Скопируйте полученный HTTP API токен и сохраните его в панели <span className="font-medium text-slate-900">Settings &gt; Secrets</span> под именем{' '}
              <code className="font-mono text-xs px-1.5 py-0.5 bg-slate-100 rounded text-slate-900">
                TELEGRAM_BOT_TOKEN
              </code>
              . Перезапустите сервер — бот сразу подключится и начнёт принимать запросы.
            </p>
          </li>

          <li>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-semibold text-slate-900">
                3. Настройте меню команд через /setcommands в @BotFather
              </span>
              <button
                type="button"
                onClick={handleCopyCommands}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Скопировано' : 'Копировать'}</span>
              </button>
            </div>
            <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 overflow-x-auto leading-relaxed">
              {BOTFATHER_COMMANDS}
            </pre>
          </li>
        </ol>
      </section>
    </div>
  );
}
