/**
 * `packages/core/src/__tests__/secrets-env.test.ts`
 *
 * Covers the core-side contract for `SecretsEnvSettings`:
 * - type shape and all fields
 * - deprecated `SecretsEnvConfig` alias
 * - `secretsEnv: undefined` schema default
 * - project-settings round-trip via the public store API
 *
 * Materialization implementation (write/cleanup/fingerprint/overwrite-policy)
 * lives in `@fusion/engine` and is tested there:
 *   - `packages/engine/src/__tests__/secrets-env-writer.test.ts`
 *   - `packages/engine/src/__tests__/worktree-acquisition-secrets-env.test.ts`
 *   - `packages/engine/src/__tests__/worktree-pool-secrets-env-cleanup.test.ts`
 *   - `packages/engine/src/__tests__/reliability-interactions/secrets-env-materialization.test.ts`
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { DEFAULT_PROJECT_SETTINGS } from "../settings-schema.js";
import { createSharedTaskStoreTestHarness } from "./store-test-helpers.js";

describe("SecretsEnvSettings contract", () => {
  describe("type shape", () => {
    it("exports SecretsEnvSettings interface with all expected fields", () => {
      // Type-level assertion: assign all valid shapes to prove the interface contract.
      const settings: import("../types.js").SecretsEnvSettings = {
        enabled: true,
        filename: ".fusion.env",
        overwritePolicy: "merge",
        keyPrefix: "FUSION_",
        requireGitignored: true,
      };

      expect(settings.enabled).toBe(true);
      expect(settings.filename).toBe(".fusion.env");
      expect(settings.overwritePolicy).toBe("merge");
      expect(settings.keyPrefix).toBe("FUSION_");
      expect(settings.requireGitignored).toBe(true);
    });

    it("each optional field is omitted-safe", () => {
      // Empty object is valid — all fields are optional.
      const settings: import("../types.js").SecretsEnvSettings = {};
      expect(settings).toBeDefined();
    });

    it("rejects invalid overwritePolicy value at type level", () => {
      // @ts-expect-error — "invalid" is not a valid overwritePolicy
      const _settings: import("../types.js").SecretsEnvSettings = {
        overwritePolicy: "invalid",
      };
      expect(_settings).toBeDefined();
    });

    it("filename accepts a simple local name", () => {
      // Core stores whatever the caller writes; engine validates filename constraints
      // (no path separators, "..", or null bytes) at materialization time.
      const settings: import("../types.js").SecretsEnvSettings = {
        filename: ".env.local",
      };
      expect(settings.filename).toBe(".env.local");
    });

    it("keyPrefix is an arbitrary string filter", () => {
      const settings: import("../types.js").SecretsEnvSettings = {
        keyPrefix: "MY_PREFIX_",
      };
      expect(settings.keyPrefix).toBe("MY_PREFIX_");
      // Empty string is valid (no filtering applied)
      const noFilter: import("../types.js").SecretsEnvSettings = { keyPrefix: "" };
      expect(noFilter.keyPrefix).toBe("");
    });
  });

  describe("deprecated alias", () => {
    it("SecretsEnvConfig is assignable to SecretsEnvSettings", () => {
      // Type-level: the alias is assignable to the interface.
      const config: import("../types.js").SecretsEnvConfig = {
        enabled: false,
        filename: ".env",
        overwritePolicy: "skip",
      };
      const settings: import("../types.js").SecretsEnvSettings = config;
      expect(settings.enabled).toBe(false);
      expect(settings.overwritePolicy).toBe("skip");
    });
  });
});

describe("secretsEnv schema default", () => {
  it("defaults to undefined when not specified", () => {
    expect(DEFAULT_PROJECT_SETTINGS.secretsEnv).toBeUndefined();
  });

  it("DEFAULT_PROJECT_SETTINGS is a plain object with no runtime crashes", () => {
    expect(DEFAULT_PROJECT_SETTINGS).toBeDefined();
    expect(typeof DEFAULT_PROJECT_SETTINGS).toBe("object");
  });
});

describe("project-settings round-trip via store API", () => {
  const harness = createSharedTaskStoreTestHarness();

  beforeAll(harness.beforeAll);
  beforeEach(harness.beforeEach);
  afterEach(harness.afterEach);

  it("round-trips secretsEnv with all fields via updateSettings/getSettings", async () => {
    await harness.store().updateSettings({
      secretsEnv: {
        enabled: true,
        filename: ".fusion.env",
        overwritePolicy: "merge",
        keyPrefix: "FUSION_",
        requireGitignored: true,
      },
    });

    const settings = await harness.store().getSettings();
    expect(settings.secretsEnv).toEqual({
      enabled: true,
      filename: ".fusion.env",
      overwritePolicy: "merge",
      keyPrefix: "FUSION_",
      requireGitignored: true,
    });
  });

  it("round-trips partial secretsEnv (only enabled)", async () => {
    await harness.store().updateSettings({ secretsEnv: { enabled: false } });

    const settings = await harness.store().getSettings();
    expect(settings.secretsEnv).toEqual({ enabled: false });
    // Omitted fields remain undefined
    expect(settings.secretsEnv?.filename).toBeUndefined();
    expect(settings.secretsEnv?.overwritePolicy).toBeUndefined();
  });

  it("round-trips overwritePolicy=replace", async () => {
    await harness.store().updateSettings({
      secretsEnv: { enabled: true, overwritePolicy: "replace" },
    });
    const settings = await harness.store().getSettings();
    expect(settings.secretsEnv?.overwritePolicy).toBe("replace");
  });

  it("round-trips overwritePolicy=skip", async () => {
    await harness.store().updateSettings({
      secretsEnv: { enabled: true, overwritePolicy: "skip" },
    });
    const settings = await harness.store().getSettings();
    expect(settings.secretsEnv?.overwritePolicy).toBe("skip");
  });

  it("clears secretsEnv when set to undefined", async () => {
    await harness.store().updateSettings({ secretsEnv: { enabled: true } });
    await harness.store().updateSettings({ secretsEnv: undefined });
    const settings = await harness.store().getSettings();
    expect(settings.secretsEnv).toBeUndefined();
  });

  it("stores requireGitignored=false alongside other fields", async () => {
    await harness.store().updateSettings({
      secretsEnv: { enabled: true, requireGitignored: false },
    });
    const settings = await harness.store().getSettings();
    expect(settings.secretsEnv?.requireGitignored).toBe(false);
  });

  it("stores keyPrefix alongside other fields", async () => {
    await harness.store().updateSettings({
      secretsEnv: { enabled: true, keyPrefix: "STRIPE_" },
    });
    const settings = await harness.store().getSettings();
    expect(settings.secretsEnv?.keyPrefix).toBe("STRIPE_");
  });

  it("stores secretsSyncPassphrase alongside secretsEnv", async () => {
    await harness.store().updateSettings({
      secretsEnv: { enabled: true },
      secretsSyncPassphrase: "encrypted:xyz789",
    });
    const settings = await harness.store().getSettings();
    expect(settings.secretsEnv?.enabled).toBe(true);
    expect(settings.secretsSyncPassphrase).toBe("encrypted:xyz789");
  });
});

describe("SecretsEnvSettings in ProjectSettings", () => {
  it("ProjectSettings.secretsEnv field accepts SecretsEnvSettings", () => {
    const projectSettings: import("../types.js").ProjectSettings = {
      maxConcurrent: 4,
      maxWorktrees: 3,
      pollIntervalMs: 30_000,
      autoMerge: true,
      groupOverlappingFiles: true,
      secretsEnv: {
        enabled: false,
        filename: ".secrets",
        overwritePolicy: "skip",
        keyPrefix: "APP_",
        requireGitignored: false,
      },
    };
    expect(projectSettings.secretsEnv?.enabled).toBe(false);
    expect(projectSettings.secretsEnv?.filename).toBe(".secrets");
    expect(projectSettings.secretsEnv?.overwritePolicy).toBe("skip");
    expect(projectSettings.secretsEnv?.keyPrefix).toBe("APP_");
    expect(projectSettings.secretsEnv?.requireGitignored).toBe(false);
  });

  it("ProjectSettings.secretsEnv is optional", () => {
    const projectSettings: import("../types.js").ProjectSettings = {
      maxConcurrent: 4,
      maxWorktrees: 3,
      pollIntervalMs: 30_000,
      autoMerge: true,
      groupOverlappingFiles: true,
    };
    expect(projectSettings.secretsEnv).toBeUndefined();
  });
});