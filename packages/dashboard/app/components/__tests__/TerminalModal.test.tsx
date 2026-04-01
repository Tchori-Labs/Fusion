import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { TerminalModal } from "../TerminalModal";
import * as useTerminalModule from "../../hooks/useTerminal";
import * as apiModule from "../../api";

// Mock hooks and API
vi.mock("../../hooks/useTerminal", () => ({
  useTerminal: vi.fn(),
}));

vi.mock("../../api", () => ({
  createTerminalSession: vi.fn(),
  killPtyTerminalSession: vi.fn(),
}));

// Mock xterm modules to prevent DOM errors in jsdom
const mockTerminalInstance = {
  loadAddon: vi.fn(),
  open: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  dispose: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  focus: vi.fn(),
  options: { fontSize: 14 },
  cols: 80,
  rows: 24,
};

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn(() => mockTerminalInstance),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn(() => ({
    dispose: vi.fn(),
  })),
}));

vi.mock("@xterm/addon-webgl", () => {
  throw new Error("WebGL not available");
});

// Suppress xterm CSS import
vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

const mockUseTerminal = vi.mocked(useTerminalModule.useTerminal);
const mockCreateTerminalSession = vi.mocked(apiModule.createTerminalSession);
const mockKillPtyTerminalSession = vi.mocked(apiModule.killPtyTerminalSession);

describe("TerminalModal", () => {
  const mockOnClose = vi.fn();
  const mockSendInput = vi.fn();
  const mockResize = vi.fn();
  const mockReconnect = vi.fn();

  const createMockTerminalState = (overrides = {}) => ({
    connectionStatus: "disconnected" as const,
    sendInput: mockSendInput,
    resize: mockResize,
    onData: vi.fn(() => vi.fn()),
    onExit: vi.fn(() => vi.fn()),
    onConnect: vi.fn(() => vi.fn()),
    onScrollback: vi.fn(() => vi.fn()),
    reconnect: mockReconnect,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTerminalSession.mockResolvedValue({
      sessionId: "test-session-123",
      shell: "/bin/bash",
      cwd: "/project",
    });
    mockKillPtyTerminalSession.mockResolvedValue({ killed: true });
    mockUseTerminal.mockReturnValue(createMockTerminalState());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing when open", async () => {
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("terminal-modal")).toBeTruthy();
    });
  });

  it("does not render when closed", () => {
    const { container } = render(<TerminalModal isOpen={false} onClose={mockOnClose} />);
    expect(container.firstChild).toBeNull();
  });

  it("creates terminal session on open", async () => {
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(mockCreateTerminalSession).toHaveBeenCalled();
    });
  });

  it("shows loading state while creating session", async () => {
    mockCreateTerminalSession.mockImplementation(() => new Promise(() => {}));
    
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("terminal-loading")).toBeTruthy();
    });
  });

  it("shows error when session creation fails", async () => {
    mockCreateTerminalSession.mockRejectedValue(new Error("Failed to create session"));

    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("terminal-error")).toBeTruthy();
    });
  });

  it("closes modal on close button click", async () => {
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      const closeBtn = screen.getByTestId("terminal-close-btn");
      fireEvent.click(closeBtn);
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("closes modal on escape key", async () => {
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("closes modal on overlay click", async () => {
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      const overlay = screen.getByTestId("terminal-modal-overlay");
      fireEvent.click(overlay);
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("kills session on modal close", async () => {
    const { rerender } = render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(mockCreateTerminalSession).toHaveBeenCalled();
    });

    await act(async () => {
      rerender(<TerminalModal isOpen={false} onClose={mockOnClose} />);
    });

    await waitFor(() => {
      expect(mockKillPtyTerminalSession).toHaveBeenCalledWith("test-session-123");
    });
  });

  it("shows reconnect button when disconnected", async () => {
    mockUseTerminal.mockReturnValue(
      createMockTerminalState({ 
        connectionStatus: "disconnected",
      })
    );

    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByTestId("terminal-reconnect-btn")).toBeTruthy();
    });
  });

  it("reconnects when reconnect button clicked", async () => {
    mockUseTerminal.mockReturnValue(
      createMockTerminalState({ 
        connectionStatus: "disconnected",
      })
    );

    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      const reconnectBtn = screen.getByTestId("terminal-reconnect-btn");
      fireEvent.click(reconnectBtn);
    });

    expect(mockReconnect).toHaveBeenCalled();
  });

  it("WebSocket connects on mount with sessionId", async () => {
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(mockUseTerminal).toHaveBeenCalledWith("test-session-123");
    });
  });

  it("initializes xterm after session is created", async () => {
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    // Wait for session creation to complete and xterm to initialize
    await waitFor(() => {
      expect(mockTerminalInstance.open).toHaveBeenCalled();
    });

    // Verify xterm was opened with the terminal container div
    const terminalDiv = screen.getByTestId("terminal-xterm");
    expect(mockTerminalInstance.open).toHaveBeenCalledWith(terminalDiv);
  });

  it("xterm container is always in the DOM", async () => {
    mockCreateTerminalSession.mockImplementation(() => new Promise(() => {}));
    
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    // Even while loading, the xterm container should exist (hidden)
    const xtermDiv = screen.getByTestId("terminal-xterm");
    expect(xtermDiv).toBeTruthy();
    expect(xtermDiv.style.display).toBe("none");
  });

  it("xterm container becomes visible after session creation", async () => {
    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      const xtermDiv = screen.getByTestId("terminal-xterm");
      expect(xtermDiv.style.display).not.toBe("none");
    });
  });

  it("subscribes to terminal data after xterm is ready", async () => {
    const mockOnData = vi.fn(() => vi.fn());
    const mockOnConnect = vi.fn(() => vi.fn());
    const mockOnExit = vi.fn(() => vi.fn());
    const mockOnScrollback = vi.fn(() => vi.fn());

    mockUseTerminal.mockReturnValue(
      createMockTerminalState({
        onData: mockOnData,
        onConnect: mockOnConnect,
        onExit: mockOnExit,
        onScrollback: mockOnScrollback,
      })
    );

    render(<TerminalModal isOpen={true} onClose={mockOnClose} />);

    // Wait for xterm initialization to complete
    await waitFor(() => {
      expect(mockTerminalInstance.open).toHaveBeenCalled();
    });

    // After xterm is ready, data subscriptions should be established
    await waitFor(() => {
      expect(mockOnData).toHaveBeenCalled();
      expect(mockOnConnect).toHaveBeenCalled();
      expect(mockOnExit).toHaveBeenCalled();
      expect(mockOnScrollback).toHaveBeenCalled();
    });
  });
});
