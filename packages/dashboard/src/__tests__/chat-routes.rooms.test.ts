import { describe, it } from "vitest";

describe("Chat HTTP + SSE routes — rooms (FN-3805..FN-3811 contract)", () => {
  describe("Room API endpoints", () => {
    it.todo("room create + list endpoints return created room and include it in subsequent listings");
    it.todo("per-room history read returns only the selected room timeline");
    it.todo("send room message with mention records mention data and triggers routed responder behavior");
  });

  describe("Streaming scope and permissions", () => {
    it.todo("SSE room channel scoping delivers events only to matching room subscribers (it.each over A↔B subscribers)");
    it.todo("v1 permissions allow same-project room operations without cross-user 403 checks");
  });
});
