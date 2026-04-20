import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DevServerView } from "../DevServerView";

const mockUseDevServer = vi.fn();

vi.mock("../../hooks/useDevServer", () => ({
  useDevServer: (...args: unknown[]) => mockUseDevServer(...args),
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="icon-alert-circle" />,
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  Copy: () => <span data-testid="icon-copy" />,
  ExternalLink: () => <span data-testid="icon-external-link" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Play: () => <span data-testid="icon-play" />,
  RotateCw: () => <span data-testid="icon-rotate" />,
  Search: () => <span data-testid="icon-search" />,
  Server: () => <span data-testid="icon-server" />,
  Square: () => <span data-testid="icon-square" />,
  Terminal: () => <span data-testid="icon-terminal" />,
}));

function createHookState(overrides: Record<string, unknown> = {}) {
  return {
    status: "stopped",
    logs: ["ready", "[stderr] warning"],
    detectedUrl: "http://localhost:5173",
    manualUrl: null,
    selectedCommand: "pnpm dev",
    candidates: [
      {
        scriptName: "dev",
        command: "pnpm dev",
        packagePath: ".",
        confidence: 1,
        name: "dev",
        cwd: ".",
        source: "root",
        label: "project · dev (root)",
      },
      {
        scriptName: "start",
        command: "pnpm --filter web start",
        packagePath: "apps/web",
        confidence: 0.9,
        name: "start",
        cwd: "apps/web",
        source: "apps/web",
        label: "web · start (apps/web)",
      },
    ],
    isLoading: false,
    error: null,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    setManualUrl: vi.fn().mockResolvedValue(undefined),
    detect: vi.fn().mockResolvedValue(undefined),
    refreshStatus: vi.fn().mockResolvedValue(undefined),
    serverState: null,
    loading: false,
    setPreviewUrl: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("DevServerView", () => {
  const addToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDevServer.mockReturnValue(createHookState());
  });

  it("renders command detection panel with candidates", () => {
    render(<DevServerView projectId="project-a" addToast={addToast} />);

    expect(screen.getByTestId("devserver-candidates")).toBeInTheDocument();
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
    expect(screen.getByText("pnpm --filter web start")).toBeInTheDocument();
  });

  it("renders process controls with start/stop/restart buttons", () => {
    render(<DevServerView projectId="project-a" addToast={addToast} />);

    expect(screen.getByTestId("devserver-start-button")).toBeInTheDocument();
    expect(screen.getByTestId("devserver-stop-button")).toBeInTheDocument();
    expect(screen.getByTestId("devserver-restart-button")).toBeInTheDocument();
  });

  it("disables start button when status is running", () => {
    mockUseDevServer.mockReturnValue(createHookState({ status: "running" }));

    render(<DevServerView projectId="project-a" addToast={addToast} />);

    expect(screen.getByTestId("devserver-start-button")).toBeDisabled();
  });

  it("disables stop button when status is stopped", () => {
    mockUseDevServer.mockReturnValue(createHookState({ status: "stopped" }));

    render(<DevServerView projectId="project-a" addToast={addToast} />);

    expect(screen.getByTestId("devserver-stop-button")).toBeDisabled();
  });

  it("clicking start calls hook start()", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    mockUseDevServer.mockReturnValue(createHookState({ start }));

    render(<DevServerView projectId="project-a" addToast={addToast} />);

    fireEvent.click(screen.getByTestId("devserver-start-button"));

    await waitFor(() => {
      expect(start).toHaveBeenCalled();
    });

    expect(start.mock.calls[0]?.[0]).toBe("pnpm dev");
  });

  it("clicking stop calls hook stop()", async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    mockUseDevServer.mockReturnValue(createHookState({ status: "running", stop }));

    render(<DevServerView projectId="project-a" addToast={addToast} />);

    fireEvent.click(screen.getByTestId("devserver-stop-button"));

    await waitFor(() => {
      expect(stop).toHaveBeenCalled();
    });
  });

  it("renders log viewer with log lines", () => {
    render(<DevServerView projectId="project-a" addToast={addToast} />);

    expect(screen.getByTestId("devserver-log-viewer")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("[stderr] warning")).toBeInTheDocument();
  });

  it("renders preview panel with detected URL", () => {
    render(<DevServerView projectId="project-a" addToast={addToast} />);

    expect(screen.getByTestId("devserver-effective-url")).toHaveTextContent("http://localhost:5173");
  });

  it("open in new tab button opens preview URL", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<DevServerView projectId="project-a" addToast={addToast} />);

    fireEvent.click(screen.getByTestId("devserver-open-tab-button"));

    expect(openSpy).toHaveBeenCalledWith("http://localhost:5173", "_blank", "noopener,noreferrer");
  });

  it("shows iframe fallback message when iframe errors", async () => {
    render(<DevServerView projectId="project-a" addToast={addToast} />);

    const iframe = screen.getByTestId("devserver-preview-iframe");
    fireEvent(iframe, new Event("error"));

    await waitFor(() => {
      expect(screen.getByText(/Preview cannot be embedded due to security restrictions/i)).toBeInTheDocument();
    });
  });

  it("manual url input calls setManualUrl()", async () => {
    const setManualUrl = vi.fn().mockResolvedValue(undefined);
    mockUseDevServer.mockReturnValue(createHookState({ setManualUrl }));

    render(<DevServerView projectId="project-a" addToast={addToast} />);

    fireEvent.change(screen.getByTestId("devserver-manual-url-input"), {
      target: { value: "http://localhost:3000" },
    });

    fireEvent.click(screen.getByTestId("devserver-set-url-button"));

    await waitFor(() => {
      expect(setManualUrl).toHaveBeenCalledWith("http://localhost:3000");
    });
  });

  it("status indicator uses class based on status", () => {
    mockUseDevServer.mockReturnValue(createHookState({ status: "failed" }));

    render(<DevServerView projectId="project-a" addToast={addToast} />);

    expect(screen.getByTestId("devserver-status-dot")).toHaveClass("devserver-status-dot--failed");
  });
});
