import { describe, expect, it, vi, beforeEach } from "vitest";

const resolveSecretAccessPolicyMock = vi.hoisted(() => vi.fn());
const revealSecretMock = vi.hoisted(() => vi.fn());
const listSecretsMock = vi.hoisted(() => vi.fn());
const approvalCreateMock = vi.hoisted(() => vi.fn());
const approvalFindLatestByDedupeKeyMock = vi.hoisted(() => vi.fn());
const recordRunAuditEventMock = vi.hoisted(() => vi.fn());

vi.mock("@fusion/dashboard", () => ({ registerGithubTrackingHook: vi.fn() }));
vi.mock("@fusion/engine", () => ({ createFnAgent: vi.fn(), fetchWebContent: vi.fn() }));

vi.mock("@fusion/core", async () => {
  const actual = await vi.importActual<typeof import("@fusion/core")>("@fusion/core");
  class MockTaskStore {
    async init() {}
    async getSecretsStore() {
      return { listSecrets: listSecretsMock, revealSecret: revealSecretMock };
    }
    getGlobalSettingsStore() {
      return { getSettings: async () => ({ secretsAccessPolicy: "prompt" }) };
    }
    recordRunAuditEvent = recordRunAuditEventMock;
    getDatabase() {
      return {} as any;
    }
  }
  class MockApprovalRequestStore {
    constructor(_db: unknown) {}
    findLatestByDedupeKey = approvalFindLatestByDedupeKeyMock;
    create = approvalCreateMock;
  }

  return {
    ...actual,
    TaskStore: MockTaskStore,
    ApprovalRequestStore: MockApprovalRequestStore,
    resolveSecretAccessPolicy: resolveSecretAccessPolicyMock,
  };
});

import kbExtension from "../extension.js";

describe("extension fn_secret_get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSecretsMock.mockImplementation((scope?: "project" | "global") => {
      if (scope === "project") return [{ id: "s1", key: "API_KEY", accessPolicy: "auto" }];
      return [];
    });
    revealSecretMock.mockResolvedValue({ key: "API_KEY", plaintextValue: "secret-value" });
    resolveSecretAccessPolicyMock.mockReturnValue({ policy: "auto", source: "secret" });
    approvalFindLatestByDedupeKeyMock.mockReturnValue(null);
    approvalCreateMock.mockReturnValue({ id: "apr-1", status: "pending" });
  });

  it("returns value for auto policy", async () => {
    const tools = new Map<string, any>();
    kbExtension({ registerTool: (d: any) => tools.set(d.name, d), registerCommand: vi.fn(), registerShortcut: vi.fn(), registerFlag: vi.fn(), on: vi.fn() } as any);
    const tool = tools.get("fn_secret_get");
    const result = await tool.execute("id", { key: "API_KEY" }, undefined, undefined, { cwd: process.cwd(), agentId: "agent-1", runId: "run-1" });
    expect(result.details.value).toBe("secret-value");
    expect(approvalCreateMock).not.toHaveBeenCalled();
    expect(recordRunAuditEventMock.mock.calls[0][0].mutationType).toBe("secret:read");
    expect(JSON.stringify(recordRunAuditEventMock.mock.calls[0][0])).not.toContain("secret-value");
  });

  it("returns pending_approval for prompt policy", async () => {
    resolveSecretAccessPolicyMock.mockReturnValue({ policy: "prompt", source: "secret" });
    const tools = new Map<string, any>();
    kbExtension({ registerTool: (d: any) => tools.set(d.name, d), registerCommand: vi.fn(), registerShortcut: vi.fn(), registerFlag: vi.fn(), on: vi.fn() } as any);
    const tool = tools.get("fn_secret_get");
    const result = await tool.execute("id", { key: "API_KEY" }, undefined, undefined, { cwd: process.cwd(), agentId: "agent-1" });
    expect(result.details.outcome).toBe("pending_approval");
    expect(approvalCreateMock).toHaveBeenCalled();
  });

  it("returns denied for deny policy and not found when missing", async () => {
    const tools = new Map<string, any>();
    kbExtension({ registerTool: (d: any) => tools.set(d.name, d), registerCommand: vi.fn(), registerShortcut: vi.fn(), registerFlag: vi.fn(), on: vi.fn() } as any);
    const tool = tools.get("fn_secret_get");

    resolveSecretAccessPolicyMock.mockReturnValue({ policy: "deny", source: "secret" });
    const denied = await tool.execute("id", { key: "API_KEY" }, undefined, undefined, { cwd: process.cwd(), agentId: "agent-1", runId: "run-1" });
    expect(denied.details.error).toBe("denied");
    expect(revealSecretMock).not.toHaveBeenCalled();

    listSecretsMock.mockReturnValue([]);
    const missing = await tool.execute("id", { key: "NOPE" }, undefined, undefined, { cwd: process.cwd(), agentId: "agent-1" });
    expect(missing.details.error).toBe("not-found");
  });
});
