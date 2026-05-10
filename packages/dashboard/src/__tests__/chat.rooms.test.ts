import { describe, it } from "vitest";

describe("Chat orchestration — rooms (FN-3805..FN-3811 contract)", () => {
  describe("Mention routing in rooms", () => {
    it.todo("direct mention in room routes targeted response from addressed room member");
    it.todo("non-member mention behavior does not dispatch to out-of-room agents and surfaces explicit feedback");
  });

  describe("Hybrid dispatch behavior", () => {
    it.todo("hybrid ambient response includes non-mentioned room members when room dispatch mode allows ambient participation");
    it.todo("mention suppresses ambient on the addressed agent to avoid duplicate responses");
  });

  describe("Regression guard", () => {
    it.todo("direct-chat regression guard keeps legacy direct send path unchanged");
  });
});
