import { useEffect, useState } from "react";

const IOS_FALLBACK_MIN_GAP_PX = 30;
const IOS_FALLBACK_MIN_FOCUSED_GAP_PX = 16;
const IOS_VIEWPORT_SHRINK_MIN_PX = 16;

/** Whether the current device is likely mobile (touch-primary, small viewport). */
function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const hasTouchScreen =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth <= 768;
  return hasTouchScreen && isNarrow;
}

/**
 * Baseline viewport height captured while keyboard is likely closed.
 * Kept as max-observed value to recover if first sample was keyboard-open.
 */
let _baselineViewportHeight: number | null = null;

function getBaselineViewportHeight(): number {
  if (_baselineViewportHeight === null) {
    _baselineViewportHeight = window.visualViewport?.height ?? window.innerHeight;
  }
  return _baselineViewportHeight;
}

function updateBaselineViewportHeight(nextHeight: number): void {
  const current = getBaselineViewportHeight();
  if (nextHeight > current) {
    _baselineViewportHeight = nextHeight;
  }
}

function isKeyboardFocusableElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const nonTextTypes = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "hidden"]);
    return !nonTextTypes.has(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

function getKeyboardMetrics(): { overlap: number; open: boolean; vvHeight: number | null } {
  if (typeof window === "undefined" || !window.visualViewport) {
    return { overlap: 0, open: false, vvHeight: null };
  }

  const vv = window.visualViewport;
  const focused = isKeyboardFocusableElement(document.activeElement);

  // Only refresh baseline while keyboard is likely closed.
  if (!focused) {
    updateBaselineViewportHeight(vv.height);
  }

  // Android/Chrome style overlap.
  const chromeOverlap = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
  if (chromeOverlap > 0) {
    return { overlap: chromeOverlap, open: true, vvHeight: vv.height };
  }

  // iOS fallback (window.innerHeight shrinks with keyboard).
  const baselineHeight = getBaselineViewportHeight();
  const gap = Math.max(0, baselineHeight - vv.offsetTop - vv.height);

  if (gap >= IOS_FALLBACK_MIN_GAP_PX) {
    return { overlap: gap, open: true, vvHeight: vv.height };
  }

  if (gap >= IOS_FALLBACK_MIN_FOCUSED_GAP_PX && focused) {
    return { overlap: gap, open: true, vvHeight: vv.height };
  }

  // Last-resort signal: focused input + meaningful viewport shrink.
  const viewportShrink = Math.max(0, baselineHeight - vv.height);
  if (focused && viewportShrink >= IOS_VIEWPORT_SHRINK_MIN_PX) {
    return { overlap: 0, open: true, vvHeight: vv.height };
  }

  return { overlap: 0, open: false, vvHeight: null };
}

/** Reset cached viewport baseline. Exported for tests only. */
export function _resetInitialViewportHeight(): void {
  _baselineViewportHeight = null;
}

interface UseMobileKeyboardOptions {
  enabled?: boolean;
}

export function useMobileKeyboard(
  { enabled = true }: UseMobileKeyboardOptions = {},
): { keyboardOverlap: number; viewportHeight: number | null; keyboardOpen: boolean } {
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (!enabled || !isMobileDevice()) {
      setKeyboardOverlap(0);
      setViewportHeight(null);
      setKeyboardOpen(false);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) {
      setKeyboardOverlap(0);
      setViewportHeight(null);
      setKeyboardOpen(false);
      return;
    }

    const update = () => {
      const metrics = getKeyboardMetrics();
      setKeyboardOverlap(metrics.overlap);
      setViewportHeight(metrics.vvHeight);
      setKeyboardOpen(metrics.open);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      setKeyboardOverlap(0);
      setViewportHeight(null);
      setKeyboardOpen(false);
    };
  }, [enabled]);

  return { keyboardOverlap, viewportHeight, keyboardOpen };
}
