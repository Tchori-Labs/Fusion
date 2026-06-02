import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPersistedLastQuickChatSessionId,
  removePersistedLastQuickChatSessionId,
  setPersistedLastQuickChatSessionId,
} from "../quickChatLastSessionStorage";

describe("quickChatLastSessionStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores and retrieves the last quick chat session id per project", () => {
    setPersistedLastQuickChatSessionId("proj-123", "session-123");

    expect(getPersistedLastQuickChatSessionId("proj-123")).toBe("session-123");
    expect(localStorage.getItem("fusion:quick-chat-last-session:proj-123")).toBe("session-123");
  });

  it("uses a default storage bucket when project id is missing", () => {
    setPersistedLastQuickChatSessionId(undefined, "session-default");

    expect(getPersistedLastQuickChatSessionId()).toBe("session-default");
    expect(localStorage.getItem("fusion:quick-chat-last-session:default")).toBe("session-default");
  });

  it("removes persisted session ids per project", () => {
    setPersistedLastQuickChatSessionId("proj-123", "session-123");

    removePersistedLastQuickChatSessionId("proj-123");

    expect(getPersistedLastQuickChatSessionId("proj-123")).toBeNull();
  });

  it("returns null when nothing is saved", () => {
    expect(getPersistedLastQuickChatSessionId("proj-123")).toBeNull();
  });

  it("swallows localStorage failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => setPersistedLastQuickChatSessionId("proj-123", "session-123")).not.toThrow();
    expect(getPersistedLastQuickChatSessionId("proj-123")).toBeNull();
    expect(() => removePersistedLastQuickChatSessionId("proj-123")).not.toThrow();
  });
});
