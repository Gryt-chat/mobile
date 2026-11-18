import type { Socket } from "socket.io-client";

export interface StorageFile {
  file_id: string;
  original_name: string | null;
  mime: string | null;
  size: number;
  created_at: string;
  uploader_nickname: string | null;
  uploader_avatar_file_id: string | null;
  conversation_id: string;
  message_id: string;
  thread_title: string | null;
  channel_name: string | null;
}

export interface StorageOverview {
  used: number;
  byKind: Record<string, number>;
  limit: number | null;
  channels: Array<{ conversation_id: string; channel_name: string | null; files: number; bytes: number }>;
  files: StorageFile[];
}

export interface FilesPage {
  items: StorageFile[];
  total: number;
  totalBytes: number;
}

export const TIMEOUT = "The server didn't answer. Try again.";

/** One request and its answer, the same contract as the desktop's storage tab. */
export function ask<T>(socket: Socket, event: string, payload: object, reply = event, timeoutMs = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      clearTimeout(timer);
      socket.off(reply, onReply);
      socket.off("storage:error", onError);
      fn();
    };
    const onReply = (data: T) => done(() => resolve(data));
    const onError = (err: { message?: string }) => done(() => reject(new Error(err?.message || "The server refused that.")));
    const timer = setTimeout(() => done(() => reject(new Error(TIMEOUT))), timeoutMs);
    socket.on(reply, onReply);
    socket.on("storage:error", onError);
    socket.emit(event, payload);
  });
}

