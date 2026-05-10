import { describe, it } from "vitest";

describe("ChatView — rooms (FN-3805..FN-3811 contract)", () => {
  describe("Mode and navigation", () => {
    it.todo("Direct/Rooms toggle render exposes both scopes when room mode is enabled");
    it.todo("room switching loads selected room history without leakage (it.each A↔B matrix)");
  });

  describe("Mention UX in room mode", () => {
    it.todo("mention popup in room mode prioritizes room members before non-members when filtering");
    it.todo("non-member mention chip class marks out-of-room mentions in rendered messages");
  });

  describe("Persistence + regression", () => {
    it.todo("persisted history survives remount and reload in room mode");
    it.todo("direct-chat parity regression guard keeps direct mode behavior unchanged in the same view");
  });
});
