import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

// Synthetic ACP session/update sequence the mocked prompt() will replay.
let scriptedUpdates: Array<Record<string, unknown>> = [];
let scriptedUsage: Record<string, number> | undefined;

// Driver validates the bridge path with existsSync — make the fake path "exist".
// writeFileSync/unlinkSync back the R17 auth-failure signal (spied).
const fsSpies = vi.hoisted(() => ({ writeFileSync: vi.fn(), unlinkSync: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: () => true, writeFileSync: fsSpies.writeFileSync, unlinkSync: fsSpies.unlinkSync }));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    const proc = new EventEmitter() as EventEmitter & Record<string, unknown>;
    proc.stdin = new PassThrough();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.kill = vi.fn();
    proc.pid = 4242;
    return proc;
  }),
}));

// Mock the ACP SDK: ClientSideConnection.prompt() replays scriptedUpdates onto
// the client handler, then resolves — so we exercise the real translation logic.
vi.mock("@agentclientprotocol/sdk", () => ({
  PROTOCOL_VERSION: 1,
  ndJsonStream: vi.fn(() => ({})),
  ClientSideConnection: vi.fn(function (this: Record<string, unknown>, factory: () => { sessionUpdate: (p: unknown) => Promise<void> }) {
    const handler = factory();
    this.initialize = vi.fn(async () => ({ protocolVersion: 1 }));
    this.newSession = vi.fn(async () => ({ sessionId: "s1" }));
    this.prompt = vi.fn(async () => {
      for (const u of scriptedUpdates) await handler.sessionUpdate({ update: u });
      return { stopReason: "end_turn", usage: scriptedUsage };
    });
  }),
}));

const { MockStream } = vi.hoisted(() => {
  const MockStream: unknown = vi.fn(function (this: Record<string, unknown>) {
    const events: Array<Record<string, unknown>> = [];
    this.push = vi.fn((e: Record<string, unknown>) => events.push(e));
    this.end = vi.fn();
    this._events = events;
  });
  return { MockStream };
});

vi.mock("@earendil-works/pi-ai", () => ({
  AssistantMessageEventStream: MockStream,
  calculateCost: vi.fn(),
}));

import { streamViaAcp, buildBridgeEnv } from "../acp-driver.js";

const MODEL = { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" } as never;
const CTX = { messages: [{ role: "user", content: "hi" }] } as never;
const OPTS = { bridgePath: "/fake/claude-code-cli-acp", cwd: "/tmp", mcpServers: [], bridgeEnv: { HOME: "/h", PATH: "/b" } };

function eventsOf(stream: { _events: Array<Record<string, unknown>> }) {
  return stream._events;
}
const flush = () => new Promise((r) => setTimeout(r, 30));

describe("streamViaAcp — ACP→pi translation (U11)", () => {
  beforeEach(() => { scriptedUpdates = []; scriptedUsage = undefined; });

  it("feeds ACP token usage into the done message (item 2)", async () => {
    scriptedUsage = { inputTokens: 11, outputTokens: 22 };
    scriptedUpdates = [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } }];
    const stream = streamViaAcp(MODEL, CTX, OPTS) as unknown as { _events: Array<Record<string, unknown>> };
    await flush();
    const done = stream._events.find((e) => e.type === "done") as { message?: { usage?: { input?: number; output?: number } } };
    expect(done?.message?.usage?.input).toBe(11);
    expect(done?.message?.usage?.output).toBe(22);
  });

  it("translates agent_message_chunk text into pi text events + done(stop)", async () => {
    scriptedUpdates = [
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello " } },
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "world" } },
    ];
    const stream = streamViaAcp(MODEL, CTX, OPTS) as unknown as { _events: Array<Record<string, unknown>> };
    await flush();
    const types = eventsOf(stream).map((e) => e.type);
    expect(types).toContain("start");
    expect(types).toContain("text_start");
    expect(types.filter((t) => t === "text_delta").length).toBe(2);
    const done = eventsOf(stream).find((e) => e.type === "done");
    expect(done).toBeDefined();
    expect(done!.reason).toBe("stop");
  });

  it("breaks early on a tool_call: emits toolcall_start + done(toolUse), no execution", async () => {
    scriptedUpdates = [
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "let me check" } },
      { sessionUpdate: "tool_call", toolCallId: "t1", _meta: { claudeCode: { toolName: "mcp__custom-tools__fn_task_list" } }, rawInput: {} },
      // anything after the tool call must be ignored (break-early)
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "SHOULD NOT APPEAR" } },
    ];
    const stream = streamViaAcp(MODEL, CTX, OPTS) as unknown as { _events: Array<Record<string, unknown>> };
    await flush();
    const types = eventsOf(stream).map((e) => e.type);
    expect(types).toContain("toolcall_start");
    const done = eventsOf(stream).find((e) => e.type === "done");
    expect(done!.reason).toBe("toolUse");
    // break-early: the post-tool text delta must not have been translated
    const deltas = eventsOf(stream).filter((e) => e.type === "text_delta").map((e) => e.delta);
    expect(deltas.join("")).not.toContain("SHOULD NOT APPEAR");
  });

  it("does NOT break early on an internal ToolSearch; breaks on the real fn_* tool (U9 sequence)", async () => {
    // Claude emits ToolSearch (not pi-known) to load the deferred MCP tool FIRST,
    // then the real mcp__custom-tools__fn_task_list. The old code aborted on
    // ToolSearch; the gated code must wait for the real tool (P0 fix).
    scriptedUpdates = [
      { sessionUpdate: "tool_call", toolCallId: "ts1", _meta: { claudeCode: { toolName: "ToolSearch" } }, rawInput: { query: "x" } },
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "found it, calling" } },
      { sessionUpdate: "tool_call", toolCallId: "real", _meta: { claudeCode: { toolName: "mcp__custom-tools__fn_task_list" } }, rawInput: {} },
    ];
    const stream = streamViaAcp(MODEL, CTX, OPTS) as unknown as { _events: Array<Record<string, unknown>> };
    await flush();
    // The text AFTER ToolSearch must have been processed (we didn't abort on ToolSearch)
    const deltas = eventsOf(stream).filter((e) => e.type === "text_delta").map((e) => e.delta);
    expect(deltas.join("")).toContain("found it");
    // And we broke on the real tool
    expect(eventsOf(stream).some((e) => e.type === "toolcall_start")).toBe(true);
    const done = eventsOf(stream).find((e) => e.type === "done");
    expect(done!.reason).toBe("toolUse");
  });

  it("R17 auth-signal: sets on a 'Not logged in' turn, clears on a real response, ignores long answers", async () => {
    const run = async (text: string) => {
      scriptedUpdates = [{ sessionUpdate: "agent_message_chunk", content: { type: "text", text } }];
      streamViaAcp(MODEL, CTX, OPTS);
      await flush();
    };
    const wroteAuthFailed = () =>
      fsSpies.writeFileSync.mock.calls.some((c) => String(c[1]).includes('"authFailed":true'));

    // Baseline: a real response leaves the signal cleared (lastAuthFailed=false).
    await run("Here is a normal answer.");
    fsSpies.writeFileSync.mockClear();
    fsSpies.unlinkSync.mockClear();

    // 1. A turn that is ONLY the bridge's "Not logged in" message → signal written.
    await run("Not logged in · Please run /login");
    expect(wroteAuthFailed()).toBe(true);

    // 2. A real response → signal cleared (unlink).
    fsSpies.unlinkSync.mockClear();
    await run("Sure — here's the result you asked for.");
    expect(fsSpies.unlinkSync).toHaveBeenCalled();

    // 3. A LONG legit answer that merely mentions the phrase → NOT flagged.
    fsSpies.writeFileSync.mockClear();
    await run(`If you are not logged in, the CLI prompts you to authenticate. ${"detail ".repeat(20)}`);
    expect(wroteAuthFailed()).toBe(false);
  });

  it("ends with done even when the turn produces no content", async () => {
    scriptedUpdates = [];
    const stream = streamViaAcp(MODEL, CTX, OPTS) as unknown as { _events: Array<Record<string, unknown>> };
    await flush();
    expect(eventsOf(stream).some((e) => e.type === "done")).toBe(true);
  });
});

describe("buildBridgeEnv — R17 auth opt-in (item 3)", () => {
  const saved = { flag: process.env.FUSION_CLAUDE_ACP_FORWARD_AUTH, oauth: process.env.CLAUDE_CODE_OAUTH_TOKEN, key: process.env.ANTHROPIC_API_KEY };
  afterEach(() => {
    for (const [k, v] of [["FUSION_CLAUDE_ACP_FORWARD_AUTH", saved.flag], ["CLAUDE_CODE_OAUTH_TOKEN", saved.oauth], ["ANTHROPIC_API_KEY", saved.key]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it("does NOT forward auth vars by default (secure default)", () => {
    delete process.env.FUSION_CLAUDE_ACP_FORWARD_AUTH;
    process.env.ANTHROPIC_API_KEY = "sk-secret";
    const env = buildBridgeEnv({ HOME: "/h", PATH: "/b" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.HOME).toBe("/h");
  });

  it("forwards a single auth token when opted in", () => {
    process.env.FUSION_CLAUDE_ACP_FORWARD_AUTH = "1";
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = "sk-secret";
    const env = buildBridgeEnv({ HOME: "/h", PATH: "/b" });
    expect(env.ANTHROPIC_API_KEY).toBe("sk-secret");
  });

  it("prefers CLAUDE_CODE_OAUTH_TOKEN and forwards only one token", () => {
    process.env.FUSION_CLAUDE_ACP_FORWARD_AUTH = "1";
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-tok";
    process.env.ANTHROPIC_API_KEY = "sk-secret";
    const env = buildBridgeEnv({ HOME: "/h", PATH: "/b" });
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-tok");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
