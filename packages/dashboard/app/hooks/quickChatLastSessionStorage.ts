const QUICK_CHAT_LAST_SESSION_STORAGE_PREFIX = "fusion:quick-chat-last-session:";

function getQuickChatLastSessionStorageKey(projectId?: string | null): string {
  return `${QUICK_CHAT_LAST_SESSION_STORAGE_PREFIX}${projectId || "default"}`;
}

export function getPersistedLastQuickChatSessionId(projectId?: string | null): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(getQuickChatLastSessionStorageKey(projectId));
  } catch {
    return null;
  }
}

export function setPersistedLastQuickChatSessionId(projectId: string | null | undefined, sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(getQuickChatLastSessionStorageKey(projectId), sessionId);
  } catch {
    // Ignore localStorage failures so quick-chat session selection still works in-memory.
  }
}

export function removePersistedLastQuickChatSessionId(projectId?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(getQuickChatLastSessionStorageKey(projectId));
  } catch {
    // Ignore localStorage failures so cleanup paths do not throw.
  }
}
