import type { ProgressUpdate } from '../types/client';

export async function postSseStream<T>(params: {
  url: string;
  body: unknown;
  onProgress: (update: ProgressUpdate) => void;
}): Promise<T> {
  const response = await fetch(params.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.body),
  });

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || `Ошибка сервера (${response.status})`);
  }

  if (!response.body) {
    throw new Error('Сервер не вернул поток данных.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalResult: T | null = null;
  let streamError: string | null = null;

  const processBlock = (block: string) => {
    const lines = block.split('\n');
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) return;
    const rawJson = dataLines.join('\n');
    try {
      const parsed = JSON.parse(rawJson);
      if (eventName === 'progress') {
        params.onProgress(parsed as ProgressUpdate);
      } else if (eventName === 'done') {
        finalResult = parsed as T;
      } else if (eventName === 'error') {
        streamError = (parsed as { error?: string }).error || 'Ошибка генерации';
      }
    } catch {
      // Ignore malformed partial chunk
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx: number;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      if (chunk.trim()) {
        processBlock(chunk);
      }
    }
  }

  if (buffer.trim()) {
    processBlock(buffer);
  }

  if (streamError) {
    throw new Error(streamError);
  }
  if (finalResult === null) {
    throw new Error('Поток генерации завершился без результата.');
  }
  return finalResult;
}
