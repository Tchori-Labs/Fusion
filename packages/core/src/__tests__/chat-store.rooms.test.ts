import { describe, it } from "vitest";

describe("ChatStore — rooms (FN-3805..FN-3811 contract)", () => {
  describe("Room lifecycle and membership", () => {
    it.todo("room creation persists a new room record with creator context and retrievable metadata");
    it.todo("member add/remove updates room membership deterministically");
  });

  describe("Room message persistence and retrieval", () => {
    it.todo("room-scoped append + list preserves message order and payload fields");
    it.todo("cross-room isolation keeps each room history independent");
    it.todo("room-vs-direct isolation keeps room history separate from direct sessions");
  });

  describe("Persistence round-trip and metadata fidelity", () => {
    it.todo("close/reopen round-trip preserves room, membership, and room history state");
    it.todo("mention metadata round-trip persists and rehydrates mention routing context");
    it.todo("responder metadata round-trip persists and rehydrates responder attribution");
  });
});
