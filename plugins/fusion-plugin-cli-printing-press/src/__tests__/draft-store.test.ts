import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDraftStore } from "../storage/draft-store";
import type { ServiceDraft } from "../wizard/types";

function makeDraft(): ServiceDraft {
  const now = new Date().toISOString();
  return { id: "", name: "Demo", slug: "demo", description: "", baseUrl: "https://example.com", transport: "http", endpoints: [{ id: "e1", name: "Ping", method: "GET", path: "/ping" }], credential: { kind: "none" }, createdAt: now, updatedAt: now };
}

describe("draft store", () => {
  it("creates, lists, gets, and deletes drafts", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "cli-printing-press-"));
    const store = createDraftStore({ rootDir });
    const created = await store.create(makeDraft());
    expect(created.id).toBeTruthy();
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(await store.get(created.id)).toMatchObject({ id: created.id, slug: "demo" });
    await store.delete(created.id);
    expect(await store.get(created.id)).toBeNull();
  });
});
