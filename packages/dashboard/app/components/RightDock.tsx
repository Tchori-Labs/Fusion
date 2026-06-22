import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Maximize2, X } from "lucide-react";
import {
  findOverflowViewEntry,
  getVisibleOverflowViewEntries,
  isOverflowViewKeyVisible,
  type OverflowViewKey,
  type OverflowViewRenderProps,
  type OverflowViewVisibilityOptions,
} from "./overflowViewRegistry";
import "./RightDock.css";

export const RIGHT_DOCK_DEFAULT_WIDTH = 360;
export const RIGHT_DOCK_MIN_WIDTH = 280;
export const RIGHT_DOCK_MAX_WIDTH = 720;
export const RIGHT_DOCK_WIDTH_STORAGE_KEY = "fusion:right-dock-width";
export const RIGHT_DOCK_VIEW_STORAGE_KEY = "fusion:right-dock-view";
export const RIGHT_DOCK_OPEN_STORAGE_KEY = "fusion:right-dock-open";

function clampRightDockWidth(width: number): number {
  return Math.max(RIGHT_DOCK_MIN_WIDTH, Math.min(RIGHT_DOCK_MAX_WIDTH, width));
}

export function readStoredRightDockWidth(): number {
  if (typeof window === "undefined") return RIGHT_DOCK_DEFAULT_WIDTH;
  const stored = window.localStorage.getItem(RIGHT_DOCK_WIDTH_STORAGE_KEY);
  const parsed = stored ? Number(stored) : NaN;
  return Number.isFinite(parsed) ? clampRightDockWidth(parsed) : RIGHT_DOCK_DEFAULT_WIDTH;
}

export function readStoredRightDockOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(RIGHT_DOCK_OPEN_STORAGE_KEY) === "true";
}

export function persistRightDockOpen(open: boolean): void {
  try {
    window.localStorage.setItem(RIGHT_DOCK_OPEN_STORAGE_KEY, String(open));
  } catch {
    // Ignore storage errors.
  }
}

function isInlineOverflowViewKey(key: string, options: OverflowViewVisibilityOptions): key is OverflowViewKey {
  const entry = findOverflowViewEntry(key as OverflowViewKey, options);
  return Boolean(entry?.render);
}

function readStoredRightDockView(options: OverflowViewVisibilityOptions): OverflowViewKey {
  if (typeof window === "undefined") return "files";
  const stored = window.localStorage.getItem(RIGHT_DOCK_VIEW_STORAGE_KEY);
  return stored && isOverflowViewKeyVisible(stored, options) && isInlineOverflowViewKey(stored, options) ? stored : "files";
}

function persistRightDockWidth(width: number): void {
  try {
    window.localStorage.setItem(RIGHT_DOCK_WIDTH_STORAGE_KEY, String(width));
  } catch {
    // Ignore storage errors.
  }
}

function persistRightDockView(key: OverflowViewKey): void {
  try {
    window.localStorage.setItem(RIGHT_DOCK_VIEW_STORAGE_KEY, key);
  } catch {
    // Ignore storage errors.
  }
}

export interface RightDockProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderProps: OverflowViewRenderProps;
  visibilityOptions?: OverflowViewVisibilityOptions;
  onExpand?: (key: OverflowViewKey) => void;
  footerVisible?: boolean;
}

/*
FNXC:Navigation 2026-06-21-00:00:
The right dock is an auxiliary tablet/desktop surface: it remembers the last overflow destination, starts on Files when none is valid, and resizes from its left edge without changing the canonical Header/MobileNavBar active navigation state.

FNXC:Navigation 2026-06-21-20:14:
FN-6882 splits right-dock entries into launcher actions and inline views. Action tabs invoke their existing Header handlers without replacing the Files body; only inline entries persist selection or expand into the modal.
*/
export function RightDock({
  open,
  onOpenChange,
  renderProps,
  visibilityOptions = {},
  onExpand,
  footerVisible = false,
}: RightDockProps) {
  const entries = useMemo(() => getVisibleOverflowViewEntries(visibilityOptions), [visibilityOptions]);
  const [selectedKey, setSelectedKey] = useState<OverflowViewKey>(() => readStoredRightDockView(visibilityOptions));
  const [width, setWidth] = useState(readStoredRightDockWidth);

  useEffect(() => {
    if (!isOverflowViewKeyVisible(selectedKey, visibilityOptions) || !isInlineOverflowViewKey(selectedKey, visibilityOptions)) {
      setSelectedKey("files");
      persistRightDockView("files");
    }
  }, [selectedKey, visibilityOptions]);

  const selectedEntry = (findOverflowViewEntry(selectedKey, visibilityOptions)?.render
    ? findOverflowViewEntry(selectedKey, visibilityOptions)
    : findOverflowViewEntry("files", visibilityOptions)) ?? entries.find((entry) => entry.render);

  const selectEntry = useCallback((key: OverflowViewKey) => {
    const entry = findOverflowViewEntry(key, visibilityOptions);
    if (entry?.onActivate) {
      entry.onActivate(renderProps);
      return;
    }
    if (!entry?.render) return;
    setSelectedKey(key);
    persistRightDockView(key);
  }, [renderProps, visibilityOptions]);

  const closeDock = useCallback(() => {
    persistRightDockOpen(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const resizeHandle = event.currentTarget;
    if (typeof resizeHandle.setPointerCapture === "function") {
      resizeHandle.setPointerCapture(event.pointerId);
    }

    const startX = event.clientX;
    const startWidth = width;
    let latestWidth = startWidth;
    document.body.style.userSelect = "none";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampRightDockWidth(startWidth + startX - moveEvent.clientX);
      latestWidth = nextWidth;
      setWidth(nextWidth);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      if (typeof resizeHandle.releasePointerCapture === "function") {
        resizeHandle.releasePointerCapture(upEvent.pointerId);
      }
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      persistRightDockWidth(latestWidth);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }, [width]);

  const handleResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const delta = event.key === "ArrowLeft" ? step : -step;
    const nextWidth = clampRightDockWidth(width + delta);
    setWidth(nextWidth);
    persistRightDockWidth(nextWidth);
  }, [width]);

  if (!open || !selectedEntry) {
    return null;
  }

  const SelectedIcon = selectedEntry.icon;

  return (
    <aside
      className={`right-dock${footerVisible ? " right-dock--with-footer" : ""}`}
      style={{ width: `${width}px` }}
      aria-label="Right dock"
      data-testid="right-dock"
    >
      <div
        className="right-dock__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={RIGHT_DOCK_MIN_WIDTH}
        aria-valuemax={RIGHT_DOCK_MAX_WIDTH}
        aria-valuenow={width}
        aria-label="Resize right dock"
        tabIndex={0}
        data-testid="right-dock-resize-handle"
        onPointerDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
      />
      <div className="right-dock__toolbar">
        <div className="right-dock__tabs" role="tablist" aria-label="Right dock views">
          {entries.map((entry) => {
            const Icon = entry.icon;
            const selected = Boolean(entry.render && entry.key === selectedEntry.key);
            return (
              <button
                key={entry.key}
                type="button"
                className={`btn-icon right-dock__tab${selected ? " right-dock__tab--active" : ""}`}
                aria-label={entry.label}
                title={entry.label}
                aria-selected={selected}
                role="tab"
                data-testid={entry.testId}
                onClick={() => selectEntry(entry.key)}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
        <div className="right-dock__actions">
          {selectedEntry.render ? (
            <button
              type="button"
              className="btn-icon right-dock__expand"
              aria-label={`Expand ${selectedEntry.label}`}
              title={`Expand ${selectedEntry.label}`}
              data-testid="right-dock-expand"
              onClick={() => onExpand?.(selectedEntry.key)}
            >
              <Maximize2 size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className="btn-icon right-dock__close"
            aria-label="Close right dock"
            title="Close right dock"
            data-testid="right-dock-close"
            onClick={closeDock}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="right-dock__header">
        <SelectedIcon size={16} />
        <div className="right-dock__title" role="heading" aria-level={3}>{selectedEntry.label}</div>
      </div>
      <div className="right-dock__body" role="tabpanel" aria-label={selectedEntry.label} data-testid="right-dock-body">
        {selectedEntry.render?.(renderProps)}
      </div>
    </aside>
  );
}
