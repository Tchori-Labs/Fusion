/* Interim storage — replaced by FN-3766's canonical schema. Do not extend without updating that ticket. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ServiceDraft } from "../wizard/types.js";

export function createDraftStore({ rootDir }: { rootDir: string }) {
  const draftsDir = join(rootDir, ".fusion", "plugins", "cli-printing-press", "drafts");

  async function ensureDir() { await mkdir(draftsDir, { recursive: true }); }

  return {
    async create(input: ServiceDraft) {
      await ensureDir();
      const now = new Date().toISOString();
      const draft: ServiceDraft = { ...input, id: input.id || randomUUID(), createdAt: input.createdAt || now, updatedAt: now };
      await writeFile(join(draftsDir, `${draft.id}.json`), JSON.stringify(draft, null, 2), "utf8");
      return draft;
    },
    async list() {
      await ensureDir();
      const files = await readdir(draftsDir);
      const entries = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => JSON.parse(await readFile(join(draftsDir, file), "utf8")) as ServiceDraft));
      return entries.map(({ id, name, slug, updatedAt }) => ({ id, name, slug, updatedAt }));
    },
    async get(id: string) {
      try { return JSON.parse(await readFile(join(draftsDir, `${id}.json`), "utf8")) as ServiceDraft; } catch { return null; }
    },
    async delete(id: string) {
      await rm(join(draftsDir, `${id}.json`), { force: true });
    },
  };
}
