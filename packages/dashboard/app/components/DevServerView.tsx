import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  RotateCw,
  Search,
  Server,
  Square,
  Terminal,
} from "lucide-react";
import type { DevServerCandidate } from "../api";
import { useDevServer } from "../hooks/useDevServer";
import type { ToastType } from "../hooks/useToast";

interface DevServerViewProps {
  projectId?: string;
  addToast: (message: string, type?: ToastType) => void;
}

type MobilePanel = "logs" | "preview";

interface CandidateSelection {
  scriptName: string;
  command: string;
  cwd?: string;
  packagePath?: string;
}

const STATUS_LABEL: Record<"starting" | "running" | "stopped" | "failed", string> = {
  starting: "Starting",
  running: "Running",
  stopped: "Stopped",
  failed: "Failed",
};

function getCandidateKey(candidate: DevServerCandidate): string {
  return `${candidate.packagePath}::${candidate.scriptName}::${candidate.command}`;
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function candidateFromSelection(candidates: DevServerCandidate[], selection: CandidateSelection | null): DevServerCandidate | null {
  if (!selection) {
    return null;
  }

  return candidates.find((candidate) => (
    candidate.scriptName === selection.scriptName
    && candidate.command === selection.command
    && (candidate.packagePath === selection.packagePath || candidate.cwd === selection.cwd)
  )) ?? null;
}

export function DevServerView({ projectId, addToast }: DevServerViewProps) {
  const {
    status,
    logs,
    detectedUrl,
    manualUrl,
    selectedCommand,
    candidates,
    isLoading,
    error,
    start,
    stop,
    restart,
    setManualUrl,
    detect,
  } = useDevServer(projectId);

  const [selectedCandidate, setSelectedCandidate] = useState<CandidateSelection | null>(null);
  const [manualUrlInput, setManualUrlInput] = useState("");
  const [isSettingUrl, setIsSettingUrl] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("logs");
  const [isAutoscrollPaused, setIsAutoscrollPaused] = useState(false);
  const [previewBlocked, setPreviewBlocked] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const logsRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const logsPanelId = "devserver-panel-logs";
  const previewPanelId = "devserver-panel-preview";

  useEffect(() => {
    void detect().catch((detectError) => {
      addToast(normalizeError(detectError), "error");
    });
  }, [addToast, detect]);

  useEffect(() => {
    setManualUrlInput(manualUrl ?? "");
  }, [manualUrl]);

  useEffect(() => {
    if (selectedCandidate) {
      return;
    }

    if (selectedCommand) {
      const matchingCandidate = candidates.find((candidate) => candidate.command === selectedCommand);
      if (matchingCandidate) {
        setSelectedCandidate({
          scriptName: matchingCandidate.scriptName,
          command: matchingCandidate.command,
          cwd: matchingCandidate.cwd,
          packagePath: matchingCandidate.packagePath,
        });
        return;
      }
    }

    if (candidates.length > 0) {
      const firstCandidate = candidates[0];
      if (firstCandidate) {
        setSelectedCandidate({
          scriptName: firstCandidate.scriptName,
          command: firstCandidate.command,
          cwd: firstCandidate.cwd,
          packagePath: firstCandidate.packagePath,
        });
      }
    }
  }, [candidates, selectedCandidate, selectedCommand]);

  useEffect(() => {
    if (isAutoscrollPaused) {
      return;
    }

    const node = logsRef.current;
    if (!node) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [isAutoscrollPaused, logs]);

  const effectiveUrl = useMemo(() => {
    const manual = manualUrl?.trim();
    if (manual) {
      return manual;
    }
    return detectedUrl?.trim() || "";
  }, [detectedUrl, manualUrl]);

  const selectedCandidateDetails = useMemo(
    () => candidateFromSelection(candidates, selectedCandidate),
    [candidates, selectedCandidate],
  );

  const handleDetect = useCallback(() => {
    void detect()
      .then(() => {
        addToast("Dev server command detection complete.", "success");
      })
      .catch((detectError) => {
        addToast(normalizeError(detectError), "error");
      });
  }, [addToast, detect]);

  const handleStart = useCallback(() => {
    const command = selectedCandidate?.command ?? selectedCommand ?? "";
    if (!command.trim()) {
      addToast("Select or enter a command before starting.", "warning");
      return;
    }

    void start(
      command,
      selectedCandidate?.cwd,
      selectedCandidate?.scriptName,
      selectedCandidate?.packagePath,
    )
      .then(() => {
        addToast("Dev server start requested.", "success");
      })
      .catch((startError) => {
        addToast(normalizeError(startError), "error");
      });
  }, [addToast, selectedCandidate, selectedCommand, start]);

  const handleStop = useCallback(() => {
    void stop()
      .then(() => {
        addToast("Dev server stopped.", "success");
      })
      .catch((stopError) => {
        addToast(normalizeError(stopError), "error");
      });
  }, [addToast, stop]);

  const handleRestart = useCallback(() => {
    void restart()
      .then(() => {
        addToast("Dev server restart requested.", "success");
      })
      .catch((restartError) => {
        addToast(normalizeError(restartError), "error");
      });
  }, [addToast, restart]);

  const handleSetManualUrl = useCallback(() => {
    setIsSettingUrl(true);
    const nextUrl = manualUrlInput.trim().length > 0 ? manualUrlInput.trim() : null;

    void setManualUrl(nextUrl)
      .then(() => {
        addToast(nextUrl ? "Manual preview URL saved." : "Manual preview URL cleared.", "success");
      })
      .catch((setUrlError) => {
        addToast(normalizeError(setUrlError), "error");
      })
      .finally(() => {
        setIsSettingUrl(false);
      });
  }, [addToast, manualUrlInput, setManualUrl]);

  const handleCopyUrl = useCallback(() => {
    if (!effectiveUrl) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      addToast("Copy not supported in this browser.", "warning");
      return;
    }

    void navigator.clipboard.writeText(effectiveUrl)
      .then(() => {
        addToast("Preview URL copied.", "success");
      })
      .catch(() => {
        addToast("Could not copy preview URL.", "error");
      });
  }, [addToast, effectiveUrl]);

  const openInNewTab = useCallback(() => {
    if (!effectiveUrl) {
      return;
    }
    window.open(effectiveUrl, "_blank", "noopener,noreferrer");
  }, [effectiveUrl]);

  const handleToggleAutoscroll = useCallback(() => {
    setIsAutoscrollPaused((current) => {
      const next = !current;
      if (!next) {
        const node = logsRef.current;
        if (node) {
          node.scrollTop = node.scrollHeight;
        }
      }
      return next;
    });
  }, []);

  const handleLogsScroll = useCallback(() => {
    const node = logsRef.current;
    if (!node) {
      return;
    }

    const nearBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 12;
    if (nearBottom) {
      setIsAutoscrollPaused(false);
    } else {
      setIsAutoscrollPaused(true);
    }
  }, []);

  const handleIframeLoad = useCallback(() => {
    setPreviewLoading(false);

    const frame = iframeRef.current;
    if (!frame || !effectiveUrl) {
      setPreviewBlocked(false);
      return;
    }

    try {
      const sameOrigin = effectiveUrl.startsWith(window.location.origin);
      if (sameOrigin) {
        void frame.contentWindow?.location?.href;
      }
      setPreviewBlocked(false);
    } catch {
      setPreviewBlocked(true);
    }
  }, [effectiveUrl]);

  const handleIframeError = useCallback(() => {
    setPreviewLoading(false);
    setPreviewBlocked(true);
  }, []);

  useEffect(() => {
    if (!effectiveUrl) {
      setPreviewBlocked(false);
      setPreviewLoading(false);
      return;
    }

    setPreviewBlocked(false);
    setPreviewLoading(true);
  }, [effectiveUrl]);

  const startDisabled = status === "running" || status === "starting";
  const stopDisabled = status === "stopped";
  const restartDisabled = status !== "running";

  return (
    <div className={`devserver-layout${isSidebarCollapsed ? " devserver-sidebar--collapsed" : ""}`} data-testid="devserver-layout">
      <div className="devserver-main" data-testid="devserver-main">
        <section className="devserver-detect-panel" aria-label="Command detection panel">
          <div className="devserver-panel-header">
            <div className="devserver-panel-title">
              <Search size={14} />
              <h2>Command Detection</h2>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleDetect}
              data-testid="devserver-detect-button"
            >
              <Search size={14} />
              <span>Detect</span>
            </button>
          </div>

          {isLoading && (
            <div className="devserver-loading" data-testid="devserver-loading">
              <Loader2 size={14} className="devserver-spin" />
              <span>Loading dev server state…</span>
            </div>
          )}

          {error && (
            <div className="devserver-error" role="alert" data-testid="devserver-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          {candidates.length === 0 ? (
            <p className="devserver-empty" data-testid="devserver-empty-candidates">No command candidates detected.</p>
          ) : (
            <div className="devserver-candidate-list" data-testid="devserver-candidates">
              {candidates.map((candidate, index) => {
                const isSelected = getCandidateKey(candidate) === (selectedCandidateDetails ? getCandidateKey(selectedCandidateDetails) : "");

                return (
                  <button
                    key={getCandidateKey(candidate)}
                    type="button"
                    className={`devserver-candidate${isSelected ? " devserver-candidate--selected" : ""}`}
                    onClick={() => {
                      setSelectedCandidate({
                        scriptName: candidate.scriptName,
                        command: candidate.command,
                        cwd: candidate.cwd,
                        packagePath: candidate.packagePath,
                      });
                    }}
                    data-testid={`devserver-candidate-${index}`}
                  >
                    <span className="devserver-candidate-script">{candidate.scriptName}</span>
                    <span className="devserver-candidate-command">{candidate.command}</span>
                    <span className="devserver-candidate-path">{candidate.packagePath}</span>
                  </button>
                );
              })}
            </div>
          )}

          {selectedCandidateDetails && (
            <div className="devserver-selected-command" data-testid="devserver-selected-command">
              <Terminal size={14} />
              <div>
                <strong>{selectedCandidateDetails.scriptName}</strong>
                <p>{selectedCandidateDetails.packagePath}</p>
              </div>
            </div>
          )}
        </section>

        <section className="devserver-controls" aria-label="Process controls">
          <div className="devserver-status" data-testid="devserver-status">
            <span
              className={`devserver-status-dot devserver-status-dot--${status}`}
              aria-hidden="true"
              data-testid="devserver-status-dot"
            />
            <span className="devserver-status-label">{STATUS_LABEL[status]}</span>
          </div>

          <div className="devserver-controls-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={startDisabled}
              onClick={handleStart}
              data-testid="devserver-start-button"
            >
              <Play size={14} />
              <span>Start</span>
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={stopDisabled}
              onClick={handleStop}
              data-testid="devserver-stop-button"
            >
              <Square size={14} />
              <span>Stop</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={restartDisabled}
              onClick={handleRestart}
              data-testid="devserver-restart-button"
            >
              <RotateCw size={14} />
              <span>Restart</span>
            </button>
          </div>
        </section>

        <div className="devserver-mobile-tabs" role="tablist" aria-label="Dev server panels" data-testid="devserver-mobile-tabs">
          <button
            type="button"
            className={`btn btn-sm${mobilePanel === "logs" ? " btn-primary" : ""}`}
            role="tab"
            aria-selected={mobilePanel === "logs"}
            aria-controls={logsPanelId}
            tabIndex={mobilePanel === "logs" ? 0 : -1}
            onClick={() => setMobilePanel("logs")}
            data-testid="devserver-mobile-tab-logs"
          >
            <Terminal size={14} />
            <span>Logs</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm${mobilePanel === "preview" ? " btn-primary" : ""}`}
            role="tab"
            aria-selected={mobilePanel === "preview"}
            aria-controls={previewPanelId}
            tabIndex={mobilePanel === "preview" ? 0 : -1}
            onClick={() => setMobilePanel("preview")}
            data-testid="devserver-mobile-tab-preview"
          >
            <Server size={14} />
            <span>Preview</span>
          </button>
        </div>

        <section
          id={logsPanelId}
          className={`devserver-logs${mobilePanel !== "logs" ? " devserver-panel--mobile-hidden" : ""}`}
          role="tabpanel"
          aria-label="Dev server logs"
          data-testid="devserver-logs"
        >
          <div className="devserver-panel-header">
            <div className="devserver-panel-title">
              <Terminal size={14} />
              <h2>Logs</h2>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleToggleAutoscroll}
              data-testid="devserver-autoscroll-toggle"
            >
              {isAutoscrollPaused ? <ChevronDownIcon /> : <ChevronUpIcon />}
              <span>{isAutoscrollPaused ? "Resume Auto-Scroll" : "Pause Auto-Scroll"}</span>
            </button>
          </div>
          <div
            className="devserver-log-viewer"
            ref={logsRef}
            onScroll={handleLogsScroll}
            data-testid="devserver-log-viewer"
          >
            {logs.length === 0 ? (
              <p className="devserver-empty">No output yet.</p>
            ) : (
              logs.map((line, index) => {
                const isStderr = line.startsWith("[stderr]");
                return (
                  <pre
                    key={`${index}-${line.slice(0, 24)}`}
                    className={`devserver-log-line${isStderr ? " devserver-log-line--stderr" : ""}`}
                  >
                    {line}
                  </pre>
                );
              })
            )}
          </div>
        </section>
      </div>

      <aside
        id={previewPanelId}
        className={`devserver-sidebar${mobilePanel !== "preview" ? " devserver-panel--mobile-hidden" : ""}`}
        role="tabpanel"
        aria-label="Dev server preview"
        data-testid="devserver-sidebar"
      >
        <section className="devserver-preview">
          <div className="devserver-panel-header">
            <div className="devserver-panel-title">
              <Server size={14} />
              <h2>Preview</h2>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setIsSidebarCollapsed((current) => !current)}
              data-testid="devserver-toggle-sidebar"
            >
              {isSidebarCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              <span>{isSidebarCollapsed ? "Expand" : "Collapse"}</span>
            </button>
          </div>

          <div className="devserver-url-display">
            <span className="devserver-url-label">Detected URL</span>
            <code data-testid="devserver-effective-url">{effectiveUrl || "Not available"}</code>
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleCopyUrl}
              disabled={!effectiveUrl}
              data-testid="devserver-copy-url"
            >
              <Copy size={14} />
              <span>Copy</span>
            </button>
          </div>

          <div className="devserver-url-bar">
            <input
              className="input"
              value={manualUrlInput}
              onChange={(event) => setManualUrlInput(event.target.value)}
              placeholder="http://localhost:5173"
              data-testid="devserver-manual-url-input"
            />
            <button
              type="button"
              className="btn btn-sm"
              onClick={handleSetManualUrl}
              disabled={isSettingUrl}
              data-testid="devserver-set-url-button"
            >
              {isSettingUrl ? <Loader2 size={14} className="devserver-spin" /> : <Server size={14} />}
              <span>Set</span>
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={openInNewTab}
              disabled={!effectiveUrl}
              data-testid="devserver-open-tab-button"
            >
              <ExternalLink size={14} />
              <span>Open in New Tab</span>
            </button>
          </div>

          {effectiveUrl && !previewBlocked && (
            <iframe
              ref={iframeRef}
              src={effectiveUrl}
              title="Dev server preview"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              onErrorCapture={handleIframeError}
              data-testid="devserver-preview-iframe"
            />
          )}

          {previewLoading && !previewBlocked && (
            <div className="devserver-preview-fallback" data-testid="devserver-preview-loading">
              <Loader2 size={16} className="devserver-spin" />
              <span>Loading preview…</span>
            </div>
          )}

          {(previewBlocked || !effectiveUrl) && (
            <div className="devserver-preview-fallback" data-testid="devserver-preview-fallback">
              <AlertCircle size={16} />
              <p>
                {effectiveUrl
                  ? "Preview cannot be embedded due to security restrictions. Click 'Open in New Tab' to view."
                  : "Start the dev server to load a preview URL."}
              </p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function ChevronDownIcon() {
  return <ChevronRight size={14} className="devserver-chevron devserver-chevron--down" />;
}

function ChevronUpIcon() {
  return <ChevronRight size={14} className="devserver-chevron" />;
}
