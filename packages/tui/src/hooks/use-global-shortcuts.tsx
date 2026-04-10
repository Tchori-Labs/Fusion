/**
 * useGlobalShortcuts - Centralized keyboard shortcut handler for the TUI app.
 *
 * Handles global shortcuts in one place with proper focus-guard logic:
 * - Ctrl+C always exits cleanly
 * - q exits when no text input is focused
 * - ?/h toggles the help overlay
 * - 1-5 switch screens via callback
 *
 * This hook should be used at the top app/screen-router level so all screens
 * share consistent behavior without scattering duplicate handlers.
 *
 * Focus Guard: Use the shared FocusGuardRef to track text input focus state.
 * Import FocusGuardRef from this module and set FocusGuardRef.isFocused = true/false
 * in text input onFocus/onBlur handlers.
 */

import React, { useState, useCallback, useEffect } from "react";
import { useInput, useApp } from "ink";
import { SCREENS, type ScreenId } from "../components/screen-router.js";

/**
 * Shared ref for tracking text input focus state globally.
 * Set FocusGuardRef.isFocused = true when a text input gains focus,
 * and FocusGuardRef.isFocused = false when it loses focus.
 *
 * This is a simple module-level ref that any component can import and modify.
 *
 * @example
 * ```tsx
 * import { FocusGuardRef } from "./use-global-shortcuts";
 *
 * function MyTextInput() {
 *   return (
 *     <Input
 *       onFocus={() => { FocusGuardRef.isFocused = true; }}
 *       onBlur={() => { FocusGuardRef.isFocused = false; }}
 *     />
 *   );
 * }
 * ```
 */
export const FocusGuardRef = {
  isFocused: false,
};

/**
 * Props for the useGlobalShortcuts hook.
 */
export interface UseGlobalShortcutsOptions {
  /**
   * Callback invoked when the user presses a number key (1-5) to switch screens.
   * Receives the screen ID to switch to.
   */
  onScreenChange?: (screenId: ScreenId) => void;
}

/**
 * Return value from the useGlobalShortcuts hook.
 */
export interface UseGlobalShortcutsResult {
  /** Whether the help overlay is currently visible */
  helpVisible: boolean;
  /** Manually toggle the help overlay visibility */
  toggleHelp: () => void;
  /** Hide the help overlay */
  hideHelp: () => void;
}

/**
 * Hook that handles global keyboard shortcuts for the TUI.
 *
 * This hook should be placed at the app root level (above the ScreenRouter) to ensure
 * all screens receive consistent shortcut handling. It centralizes all global shortcuts
 * to prevent conflicts and duplication.
 *
 * Focus guard behavior:
 * - Ctrl+C always exits (emergency exit)
 * - q exits only when no text input is focused (via FocusGuardRef)
 * - ?/h toggles help only when no text input is focused
 * - Number keys (1-5) for screen switching are handled by the ScreenRouter internally
 *
 * @param options - Configuration options
 * @param options.onScreenChange - Optional callback for screen changes triggered by number keys
 *
 * @example
 * ```tsx
 * function App() {
 *   const { helpVisible, toggleHelp } = useGlobalShortcuts();
 *
 *   return (
 *     <>
 *       {helpVisible && <HelpOverlay onClose={toggleHelp} />}
 *       <ScreenRouter>
 *         {({ activeScreen }) => (
 *           // Screen content...
 *         )}
 *       </ScreenRouter>
 *     </>
 *   );
 * }
 * ```
 */
export function useGlobalShortcuts(options: UseGlobalShortcutsOptions = {}): UseGlobalShortcutsResult {
  const { onScreenChange } = options;
  const { exit } = useApp();
  const [helpVisible, setHelpVisible] = useState(false);

  // Toggle help overlay
  const toggleHelp = useCallback(() => {
    setHelpVisible((prev) => !prev);
  }, []);

  // Hide help overlay
  const hideHelp = useCallback(() => {
    setHelpVisible(false);
  }, []);

  // Handle keyboard input
  useInput(
    (input, key) => {
      // Ctrl+C always exits cleanly (emergency exit)
      if (key.ctrl && input.toLowerCase() === "c") {
        exit();
        return;
      }

      // q - exit only when no text input is focused
      if (input.toLowerCase() === "q" && !FocusGuardRef.isFocused) {
        exit();
        return;
      }

      // ? or h - toggle help overlay (only when not focused)
      if (!FocusGuardRef.isFocused) {
        if (input === "?" || input.toLowerCase() === "h") {
          toggleHelp();
          return;
        }

        // 1-5 - screen switching via callback
        const num = parseInt(input, 10);
        if (num >= 1 && num <= SCREENS.length) {
          const screenId = SCREENS[num - 1].id;
          onScreenChange?.(screenId);
          return;
        }
      }
    },
    { isActive: true } // Always active to catch global shortcuts
  );

  // Cleanup: hide help on unmount
  useEffect(() => {
    return () => {
      setHelpVisible(false);
    };
  }, []);

  return {
    helpVisible,
    toggleHelp,
    hideHelp,
  };
}

/**
 * Props for the HelpOverlay component.
 */
export interface HelpOverlayProps {
  /** Callback to close the help overlay */
  onClose: () => void;
}

/**
 * HelpOverlay component that displays keyboard shortcuts.
 *
 * @param props.onClose - Callback to close the overlay
 *
 * @example
 * ```tsx
 * <HelpOverlay onClose={() => setHelpVisible(false)} />
 * ```
 */
export function HelpOverlay({ onClose }: HelpOverlayProps): React.ReactNode {
  // Handle Escape and q to close
  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === "q") {
      onClose();
    }
  });

  const shortcuts = [
    { key: "Ctrl+C", description: "Quit (emergency exit)" },
    { key: "q", description: "Quit (when no text input is focused)" },
    { key: "?", description: "Toggle this help overlay" },
    { key: "h", description: "Toggle this help overlay (alternate)" },
    { key: "1-5", description: "Switch screens" },
    { key: "Tab", description: "Cycle forward through tabs" },
    { key: "Shift+Tab", description: "Cycle backward through tabs" },
  ];

  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle="round"
      borderColor="cyan"
      backgroundColor="black"
    >
      <Text bold color="cyan">
        Keyboard Shortcuts
      </Text>
      <Text dimColor>────────────────</Text>
      {shortcuts.map((shortcut) => (
        <Text key={shortcut.key}>
          <Text bold color="white">{shortcut.key.padEnd(12)}</Text>
          <Text dimColor>{shortcut.description}</Text>
        </Text>
      ))}
      <Text dimColor>────────────────</Text>
      <Text dimColor italic>Press Esc or q to close</Text>
    </Box>
  );
}

// Re-export Box and Text from ink for use in HelpOverlay
import { Box, Text } from "ink";
