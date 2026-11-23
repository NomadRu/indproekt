import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Download,
  ExternalLink,
  FileText,
  Mic,
  Presentation,
  RotateCcw,
  Send,
  User,
} from 'lucide-react';
import type {
  BotAttachment,
  BotReplyMessage,
  InlineButton,
  ProgressUpdate,
  TelegramButtonStyle,
  UserProfile,
} from '../types/client';
import { postSseStream } from '../utils/sseClient';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  parseMode?: 'HTML';
  timestamp: string;
  inlineKeyboard?: InlineButton[][];
  document?: BotReplyMessage['document'];
  attachments?: BotAttachment[];
}

interface TelegramSimulatorProps {
  onProjectCreated: (projectId: string) => void;
  onOpenPreview: (projectId: string) => void;
}

function getOrCreateStableSessionId(): string {
  const storageKey = 'proektbot_sim_user_id';
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing && /^[a-zA-Z0-9_-]{4,40}$/.test(existing)) {
      return existing;
    }
    const fresh = `sim-${Math.floor(100000 + Math.random() * 900000)}`;
    window.localStorage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    return `sim-${Math.floor(100000 + Math.random() * 900000)}`;
  }
}

function formatTime(): string {
  return new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function renderInlineFormatting(text: string, keyPrefix: string): ReactNode[] {
  const tokenRegex = /(<b>.*?<\/b>|<i>.*?<\/i>|<code>.*?<\/code>)/gs;
  const parts = text.split(tokenRegex);
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (part.startsWith('<b>') && part.endsWith('</b>')) {
      return (
        <strong key={key} className="font-semibold text-slate-900">
          {renderInlineFormatting(part.slice(3, -4), key)}
        </strong>
      );
    }
    if (part.startsWith('<i>') && part.endsWith('</i>')) {
      return (
        <em key={key} className="italic text-slate-700">
          {renderInlineFormatting(part.slice(3, -4), key)}
        </em>
      );
    }
    if (part.startsWith('<code>') && part.endsWith('</code>')) {
      return (
        <code
          key={key}
          className="font-mono text-xs px-1.5 py-0.5 bg-slate-100 text-slate-900 rounded"
        >
          {decodeHtmlEntities(part.slice(6, -7))}
        </code>
      );
    }
    return <Fragment key={key}>{decodeHtmlEntities(part)}</Fragment>;
  });
}

function renderTelegramHtml(text: string): ReactNode {
  const blockRegex = /(<blockquote>[\s\S]*?<\/blockquote>)/g;
  const blocks = text.split(blockRegex);
  return blocks.map((block, idx) => {
    if (block.startsWith('<blockquote>') && block.endsWith('</blockquote>')) {
      const inner = block.slice(12, -13);
      return (
        <div
          key={`bq-${idx}`}
          className="my-2 px-3 py-2 rounded-lg bg-sky-50/80 border border-sky-200 text-slate-800 text-[13px] leading-relaxed"
        >
          {renderInlineFormatting(inner, `bq-${idx}`)}
        </div>
      );
    }
    return (
      <Fragment key={`txt-${idx}`}>
        {renderInlineFormatting(block, `txt-${idx}`)}
      </Fragment>
    );
  });
}

function buttonStyleClasses(style?: TelegramButtonStyle): string {
  switch (style) {
    case 'success':
      return 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700';
    case 'danger':
      return 'bg-red-600 border-red-700 text-white hover:bg-red-700';
    case 'primary':
      return 'bg-sky-600 border-sky-700 text-white hover:bg-sky-700';
    default:
      return 'bg-white border-slate-200 text-slate-800 hover:border-sky-400 hover:bg-sky-50';
  }
}

export function TelegramSimulator({
  onProjectCreated,
  onOpenPreview,
}: TelegramSimulatorProps) {
  const [sessionId] = useState(getOrCreateStableSessionId);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  const appendReplies = (replies: BotReplyMessage[]) => {
    const newMsgs: ChatMessage[] = replies.map((reply, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'bot',
      text: reply.text,
      parseMode: reply.parseMode,
      timestamp: formatTime(),
      inlineKeyboard: reply.inlineKeyboard,
      document: reply.document,
      attachments: reply.attachments,
    }));

    setMessages((prev) => [...prev, ...newMsgs]);

    for (const reply of replies) {
      if (reply.document) {
        onProjectCreated(reply.document.projectId);
      }
    }
  };

  const sendToBot = async (payload: {
    text?: string;
    callbackData?: string;
    label?: string;
  }) => {
    if (isSending) return;
    setErrorText(null);
    setProgress(null);

    if (payload.text || payload.label) {
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        sender: 'user',
        text: payload.text || payload.label || '',
        timestamp: formatTime(),
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    setIsSending(true);
    try {
      const data = await postSseStream<{
        replies?: BotReplyMessage[];
        user?: UserProfile;
      }>({
        url: '/api/simulator/message-stream',
        body: {
          sessionId,
          text: payload.text,
          callbackData: payload.callbackData,
        },
        onProgress: (update) => {
          setProgress(update);
        },
      });
      if (data.user) {
        setUserProfile(data.user);
      }
      if (data.replies) {
        appendReplies(data.replies);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка соединения с сервером';
      setErrorText(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          text: `Ошибка: ${msg}`,
          timestamp: formatTime(),
        },
      ]);
    } finally {
      setIsSending(false);
      setProgress(null);
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/simulator/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, text: '/start' }),
        });
        const data = (await res.json()) as {
          replies?: BotReplyMessage[];
          user?: UserProfile;
        };
        if (res.ok) {
          if (data.user) setUserProfile(data.user);
          if (data.replies) appendReplies(data.replies);
        }
      } catch {
        // Ignore initial bootstrap error
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isSending, progress]);

  const handleReset = async () => {
    if (isSending) return;
    setMessages([]);
    setErrorText(null);
    setProgress(null);
    await fetch('/api/simulator/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
    await sendToBot({ text: '/start' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isSending) return;
    setInputText('');
    void sendToBot({ text: trimmed });
  };

  const renderAttachmentIcon = (kind: BotAttachment['kind']) => {
    if (kind === 'pptx') return <Presentation className="w-4 h-4 text-amber-700" />;
    if (kind === 'speech') return <Mic className="w-4 h-4 text-emerald-700" />;
    return <FileText className="w-4 h-4 text-blue-700" />;
  };

  return (
    <section
      aria-label="Симулятор Telegram-бота"
      className="flex flex-col h-[700px] bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 truncate">
              ПроектБот ГОСТ
            </h2>
            <p className="text-xs text-slate-500 truncate tabular-nums">
              {userProfile
                ? `ID: ${userProfile.userId} · Генераций: ${userProfile.credits}`
                : 'Симулятор Telegram-бота'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={isSending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Сбросить</span>
        </button>
      </div>

      {/* Chat Messages Viewport */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-5 space-y-4 bg-slate-50"
      >
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`flex items-end gap-2 max-w-[92%] ${
                  isUser ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    isUser ? 'bg-slate-800 text-white' : 'bg-sky-600 text-white'
                  }`}
                >
                  {isUser ? (
                    <User className="w-3.5 h-3.5" />
                  ) : (
                    <Bot className="w-3.5 h-3.5" />
                  )}
                </div>

                <div
                  className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-blue-700 text-white'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.kind}
                          className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0">
                              {renderAttachmentIcon(att.kind)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {att.label}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 truncate">
                                {att.filename}
                              </div>
                            </div>
                          </div>
                          <a
                            href={att.downloadUrl}
                            download={att.filename}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Скачать</span>
                          </a>
                        </div>
                      ))}

                      {msg.document && (
                        <button
                          type="button"
                          onClick={() => onOpenPreview(msg.document!.projectId)}
                          className="w-full py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          Открыть предпросмотр проекта, слайдов и речи
                        </button>
                      )}
                    </div>
                  )}

                  <div>
                    {!isUser && msg.parseMode === 'HTML'
                      ? renderTelegramHtml(msg.text)
                      : msg.text}
                  </div>

                  <div
                    className={`text-[11px] mt-1.5 text-right tabular-nums ${
                      isUser ? 'text-blue-200' : 'text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </div>
                </div>
              </div>

              {/* Telegram Colored Inline Keyboard (Callback + URL buttons) */}
              {!isUser && msg.inlineKeyboard && msg.inlineKeyboard.length > 0 && (
                <div className="ml-9 mt-2 space-y-1.5 max-w-[88%] w-full sm:w-auto">
                  {msg.inlineKeyboard.map((row, rowIdx) => (
                    <div key={rowIdx} className="flex flex-wrap gap-1.5">
                      {row.map((btn, btnIdx) =>
                        btn.url ? (
                          <a
                            key={`${rowIdx}-${btnIdx}-${btn.url}`}
                            href={btn.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors text-left ${buttonStyleClasses(
                              btn.style
                            )}`}
                          >
                            <span>{btn.text}</span>
                            <ExternalLink className="w-3 h-3 opacity-85 shrink-0" />
                          </a>
                        ) : (
                          <button
                            key={`${rowIdx}-${btnIdx}-${btn.callbackData ?? btn.text}`}
                            type="button"
                            disabled={isSending}
                            onClick={() =>
                              void sendToBot({
                                callbackData: btn.callbackData,
                                label: btn.text,
                              })
                            }
                            className={`px-3 py-2 text-xs font-medium border rounded-lg transition-colors text-left disabled:opacity-50 ${buttonStyleClasses(
                              btn.style
                            )}`}
                          >
                            {btn.text}
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {isSending && (
          <div className="ml-9 max-w-[85%] bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 shadow-xs">
            {progress ? (
              <>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-900">
                    Генерация комплекта по ГОСТ
                  </span>
                  <span className="font-mono font-semibold text-sky-700 tabular-nums">
                    {progress.percent}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, Math.min(100, progress.percent))}%` }}
                  />
                </div>
                <p className="text-xs text-slate-600">{progress.stage}</p>
              </>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="inline-block w-3.5 h-3.5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                <span>Обрабатываю запрос...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Commands + Text Input */}
      <div className="border-t border-slate-200 bg-white p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {['/profile', '/buy', '/new', '/support', '/gost', '/cancel'].map((cmd) => (
            <button
              key={cmd}
              type="button"
              disabled={isSending}
              onClick={() => void sendToBot({ text: cmd })}
              className="px-2.5 py-1 text-xs font-mono text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {cmd}
            </button>
          ))}
          {errorText && (
            <span className="text-xs text-red-600 truncate ml-auto">{errorText}</span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Введите команду, тему проекта или число страниц (8–20)..."
            disabled={isSending}
            className="flex-1 min-w-0 px-3.5 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || !inputText.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>Отправить</span>
          </button>
        </form>
      </div>
    </section>
  );
}
