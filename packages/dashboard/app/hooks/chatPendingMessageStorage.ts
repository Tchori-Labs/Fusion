const CHAT_PENDING_MESSAGE_STORAGE_PREFIX = "fusion:chat-pending:";

export function getChatPendingMessageKey(sessionId: string | null | undefined): string | null {
  if (!sessionId) {
    return null;
  }

  return `${CHAT_PENDING_MESSAGE_STORAGE_PREFIX}${sessionId}`;
}

export function getPersistedPendingChatMessage(sessionId: string | null | undefined): string {
  const key = getChatPendingMessageKey(sessionId);
  if (!key || typeof window === "undefined") {
    return "";
  }

  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function setPersistedPendingChatMessage(sessionId: string | null | undefined, content: string): void {
  const key = getChatPendingMessageKey(sessionId);
  if (!key || typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(key, content);
  } catch {
    // Ignore localStorage failures so chat queuing still works in-memory.
  }
}

export function removePersistedPendingChatMessage(sessionId: string | null | undefined): void {
  const key = getChatPendingMessageKey(sessionId);
  if (!key || typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore localStorage failures so cleanup paths do not throw.
  }
}
