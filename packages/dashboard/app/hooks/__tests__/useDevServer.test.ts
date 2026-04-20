import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectDevServer,
  fetchDevServerStatus,
  getDevServerLogsStreamUrl,
  restartDevServer,
  setDevServerPreviewUrl,
  startDevServer,
  stopDevServer,
  type DevServerCandidate,
  type DevServerState,
} from "../../api";
import { subscribeSse, type SseSubscription } from "../../sse-bus";
import { __resetUseDevServerForTests, useDevServer } from "../useDevServer";

vi.mock("../../api", () => ({
  detectDevServer: vi.fn(),
  fetchDevServerStatus: vi.fn(),
  getDevServerLogsStreamUrl: vi.fn(),
  startDevServer: vi.fn(),
  stopDevServer: vi.fn(),
  restartDevServer: vi.fn(),
  setDevServerPreviewUrl: vi.fn(),
}));

vi.mock("../../sse-bus", () => ({
  subscribeSse: vi.fn(),
}));

const mockDetectDevServer = vi.mocked(detectDevServer);
const mockFetchDevServerStatus = vi.mocked(fetchDevServerStatus);
const mockGetDevServerLogsStreamUrl = vi.mocked(getDevServerLogsStreamUrl);
const mockStartDevServer = vi.mocked(startDevServer);
const mockStopDevServer = vi.mocked(stopDevServer);
const mockRestartDevServer = vi.mocked(restartDevServer);
const mockSetDevServerPreviewUrl = vi.mocked(setDevServerPreviewUrl);
const mockSubscribeSse = vi.mocked(subscribeSse);

let activeSubscription: SseSubscription | null = null;
let unsubscribeSpy = vi.fn();

function createCandidate(overrides: Partial<DevServerCandidate> = {}): DevServerCandidate {
  return {
    scriptName: "dev",
    command: "pnpm dev",
    packagePath: ".",
    confidence: 1,
    name: "dev",
    cwd: ".",
    source: "root",
    label: "project · dev (root)",
    ...overrides,
  };
}

function createState(overrides: Partial<DevServerState> = {}): DevServerState {
  return {
    id: "default",
    name: "default",
    status: "stopped",
    command: "pnpm dev",
    scriptName: "dev",
    cwd: ".",
    detectedUrl: "http://localhost:5173",
    manualUrl: undefined,
    logs: [],
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useDevServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    __resetUseDevServerForTests();

    activeSubscription = null;
    unsubscribeSpy = vi.fn();

    mockGetDevServerLogsStreamUrl.mockReturnValue("/api/dev-server/logs/stream");
    mockFetchDevServerStatus.mockResolvedValue(createState());
    mockDetectDevServer.mockResolvedValue([createCandidate()]);
    mockStartDevServer.mockResolvedValue(createState({ status: "running", pid: 1111 }));
    mockStopDevServer.mockResolvedValue(createState({ status: "stopped", pid: undefined }));
    mockRestartDevServer.mockResolvedValue(createState({ status: "running", pid: 2222 }));
    mockSetDevServerPreviewUrl.mockResolvedValue(createState({ manualUrl: "http://localhost:3000" }));

    mockSubscribeSse.mockImplementation((_url, sub) => {
      activeSubscription = sub;
      return unsubscribeSpy;
    });
  });

  it("fetches status on mount", async () => {
    const { result } = renderHook(() => useDevServer("project-a"));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetchDevServerStatus).toHaveBeenCalledWith("project-a");
    expect(result.current.status).toBe("stopped");
    expect(result.current.detectedUrl).toBe("http://localhost:5173");
  });

  it("starts polling while running", async () => {
    vi.useFakeTimers();

    mockFetchDevServerStatus
      .mockResolvedValueOnce(createState({ status: "running" }))
      .mockResolvedValue(createState({ status: "running" }));

    renderHook(() => useDevServer("project-a"));

    await flushMicrotasks();
    expect(mockFetchDevServerStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockFetchDevServerStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockFetchDevServerStatus).toHaveBeenCalledTimes(3);
  });

  it("does not poll while stopped", async () => {
    vi.useFakeTimers();

    mockFetchDevServerStatus.mockResolvedValue(createState({ status: "stopped" }));

    renderHook(() => useDevServer("project-a"));

    await flushMicrotasks();
    expect(mockFetchDevServerStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(15000);
      await Promise.resolve();
    });

    expect(mockFetchDevServerStatus).toHaveBeenCalledTimes(1);
  });

  it("subscribes to SSE while running and unsubscribes when stopped", async () => {
    mockFetchDevServerStatus.mockResolvedValueOnce(createState({ status: "running" }));

    const { result } = renderHook(() => useDevServer("project-a"));

    await waitFor(() => {
      expect(mockSubscribeSse).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it("appends logs from SSE events", async () => {
    mockFetchDevServerStatus.mockResolvedValueOnce(createState({ status: "running", logs: [] }));

    const { result } = renderHook(() => useDevServer("project-a"));

    await waitFor(() => {
      expect(mockSubscribeSse).toHaveBeenCalledTimes(1);
    });

    act(() => {
      activeSubscription?.events?.history?.({ data: JSON.stringify({ lines: ["from history"] }) } as MessageEvent<string>);
      activeSubscription?.events?.log?.({ data: JSON.stringify({ line: "from log" }) } as MessageEvent<string>);
      activeSubscription?.events?.["dev-server:output"]?.({
        data: JSON.stringify({ text: "stderr line", stream: "stderr" }),
      } as MessageEvent<string>);
    });

    await waitFor(() => {
      expect(result.current.logs).toEqual(["from history", "from log", "[stderr] stderr line"]);
    });
  });

  it("caps logs to 500 entries", async () => {
    mockFetchDevServerStatus.mockResolvedValueOnce(createState({ status: "running", logs: [] }));

    const { result } = renderHook(() => useDevServer("project-a"));

    await waitFor(() => {
      expect(mockSubscribeSse).toHaveBeenCalledTimes(1);
    });

    act(() => {
      for (let index = 1; index <= 510; index += 1) {
        activeSubscription?.events?.log?.({ data: JSON.stringify({ line: `line-${index}` }) } as MessageEvent<string>);
      }
    });

    await waitFor(() => {
      expect(result.current.logs).toHaveLength(500);
      expect(result.current.logs[0]).toBe("line-11");
      expect(result.current.logs[499]).toBe("line-510");
    });
  });

  it("start() calls API and sets status to starting", async () => {
    let resolveStart: ((state: DevServerState) => void) | null = null;
    const pendingStart = new Promise<DevServerState>((resolve) => {
      resolveStart = resolve;
    });

    mockFetchDevServerStatus
      .mockResolvedValueOnce(createState({ status: "stopped" }))
      .mockResolvedValueOnce(createState({ status: "running" }));
    mockStartDevServer.mockReturnValueOnce(pendingStart);

    const { result } = renderHook(() => useDevServer("project-a"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      void result.current.start("pnpm dev", "apps/web", "dev", "apps/web");
    });

    expect(result.current.status).toBe("starting");

    act(() => {
      resolveStart?.(createState({ status: "running" }));
    });

    await waitFor(() => {
      expect(mockStartDevServer).toHaveBeenCalledWith(
        {
          command: "pnpm dev",
          cwd: "apps/web",
          scriptName: "dev",
          packagePath: "apps/web",
        },
        "project-a",
      );
    });
  });

  it("stop() calls API and sets status stopped", async () => {
    mockFetchDevServerStatus.mockResolvedValueOnce(createState({ status: "running" }));

    const { result } = renderHook(() => useDevServer("project-a"));

    await waitFor(() => {
      expect(result.current.status).toBe("running");
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(mockStopDevServer).toHaveBeenCalledWith("project-a");
    expect(result.current.status).toBe("stopped");
  });

  it("restart() calls API and sets status starting", async () => {
    let resolveRestart: ((state: DevServerState) => void) | null = null;
    const pendingRestart = new Promise<DevServerState>((resolve) => {
      resolveRestart = resolve;
    });

    mockFetchDevServerStatus
      .mockResolvedValueOnce(createState({ status: "running" }))
      .mockResolvedValueOnce(createState({ status: "running" }));
    mockRestartDevServer.mockReturnValueOnce(pendingRestart);

    const { result } = renderHook(() => useDevServer("project-a"));

    await waitFor(() => {
      expect(result.current.status).toBe("running");
    });

    act(() => {
      void result.current.restart();
    });

    expect(result.current.status).toBe("starting");

    act(() => {
      resolveRestart?.(createState({ status: "running" }));
    });

    await waitFor(() => {
      expect(mockRestartDevServer).toHaveBeenCalledWith("project-a");
    });
  });

  it("setManualUrl() calls API and updates local manual url", async () => {
    const { result } = renderHook(() => useDevServer("project-a"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.setManualUrl("http://localhost:3000");
    });

    expect(mockSetDevServerPreviewUrl).toHaveBeenCalledWith({ url: "http://localhost:3000" }, "project-a");
    expect(result.current.manualUrl).toBe("http://localhost:3000");
  });

  it("detect() loads command candidates", async () => {
    mockDetectDevServer.mockResolvedValueOnce([
      createCandidate({ scriptName: "start", command: "pnpm start", packagePath: "apps/web" }),
    ]);

    const { result } = renderHook(() => useDevServer("project-a"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.detect();
    });

    expect(mockDetectDevServer).toHaveBeenCalledWith("project-a");
    expect(result.current.candidates).toEqual([
      expect.objectContaining({ scriptName: "start", command: "pnpm start" }),
    ]);
  });

  it("cleans up SSE and polling on unmount", async () => {
    vi.useFakeTimers();

    mockFetchDevServerStatus.mockResolvedValue(createState({ status: "running" }));

    const { unmount } = renderHook(() => useDevServer("project-a"));

    await flushMicrotasks();
    expect(mockSubscribeSse).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    expect(mockFetchDevServerStatus).toHaveBeenCalledTimes(1);
  });
});
