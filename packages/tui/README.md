# @fusion/tui

Terminal UI components for fn, built with [Ink](https://github.com/vadimdemedes/ink) (React for the command line).

## Status

This package is under active development and not yet published.

## Installation

This package is part of the fn workspace and is not installed separately. It is available as a private workspace package.

## API Reference

### FusionProvider

The `FusionProvider` component initializes a `TaskStore` and provides it via React context.

```tsx
import { FusionProvider } from "@fusion/tui";

function App() {
  return (
    <FusionProvider>
      <MyComponent />
    </FusionProvider>
  );
}
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `projectDir` | `string` (optional) | Explicit project directory override. When provided, skips auto-detection. |
| `children` | `React.ReactNode` | Child components that will have access to the Fusion context. |

#### Behavior

- On mount, auto-detects the Fusion project by walking up from `process.cwd()` looking for `.fusion/fusion.db`
- If no project is found, renders a red error message
- On unmount, calls `store.close()` to cleanly shut down the SQLite connection

### useFusion

Hook to access the Fusion context. Must be used within a `FusionProvider`.

```tsx
import { useFusion } from "@fusion/tui";

function TaskList() {
  const { store, projectPath } = useFusion();

  useEffect(() => {
    store.listTasks().then((tasks) => {
      // Render tasks...
    });
  }, [store]);

  return <Text>Project: {projectPath}</Text>;
}
```

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `store` | `TaskStore` | The initialized TaskStore instance |
| `projectPath` | `string` | Absolute path to the project directory |

#### Throws

`Error` if used outside of a `FusionProvider`.

### detectProjectDir

Detect the Fusion project root directory by walking up from a starting path.

```typescript
import { detectProjectDir } from "@fusion/tui";

// Find project from current directory
const projectPath = detectProjectDir();

// Find project from a specific directory
const projectPath = detectProjectDir("/Users/me/code/my-project/src");
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startPath` | `string` (optional) | Starting directory for the search (defaults to `process.cwd()`) |

#### Returns

The absolute path to the project root, or `null` if no project directory is detected.

### ScreenRouter

The `ScreenRouter` component provides a keyboard-navigable tab bar for switching between application screens.

```tsx
import { ScreenRouter } from "@fusion/tui";

function App() {
  return (
    <ScreenRouter>
      {({ activeScreen }) => (
        <>
          {activeScreen === "board" && <BoardScreen />}
          {activeScreen === "detail" && <DetailScreen />}
          {activeScreen === "activity" && <ActivityScreen />}
          {activeScreen === "agents" && <AgentsScreen />}
          {activeScreen === "settings" && <SettingsScreen />}
        </>
      )}
    </ScreenRouter>
  );
}
```

#### Available Screens

The router manages five screens in this order:

| Index | Screen ID | Label | Shortcut |
|-------|-----------|-------|----------|
| 1 | `board` | Board | `1` |
| 2 | `detail` | Detail | `2` |
| 3 | `activity` | Activity | `3` |
| 4 | `agents` | Agents | `4` |
| 5 | `settings` | Settings | `5` |

#### Keyboard Navigation

| Key | Action |
|-----|--------|
| `1` - `5` | Jump directly to the corresponding tab |
| `Tab` | Cycle forward through tabs (wraps from end to start) |
| `Shift+Tab` | Cycle backward through tabs (wraps from start to end) |

#### Tab Bar Rendering

The tab bar displays all five tabs horizontally with:
- Active tab highlighted with bold text, cyan background, and black text
- Inactive tabs shown in white text
- A border line below the tab bar

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `initialScreen` | `ScreenId` (optional) | Initial screen to display on mount (default: `"board"`) |
| `onScreenChange` | `(screenId: ScreenId) => void` (optional) | Callback when user navigates to a different screen |
| `activeScreen` | `ScreenId` (optional) | Externally controlled active screen |
| `children` | `(props: ScreenComponentProps) => React.ReactNode` | Render function that receives `activeScreen` and returns the screen content |

#### ScreenComponentProps

| Property | Type | Description |
|----------|------|-------------|
| `activeScreen` | `ScreenId` | The currently active screen ID (`"board"` \| `"detail"` \| `"activity"` \| `"agents"` \| `"settings"`) |

#### Exports

The following are exported from `@fusion/tui`:
- `ScreenRouter` — The main router component
- `SCREENS` — Array of screen definitions with `id`, `label`, and `shortcut`
- `getScreenById(id)` — Get screen definition by ID
- `getScreenIndex(id)` — Get screen index by ID
- `type ScreenId` — Type for screen identifiers

### Global Keyboard Shortcuts

The TUI provides centralized global keyboard shortcuts via the `useGlobalShortcuts` hook. Place this hook at the app root level to enable consistent shortcut handling across all screens.

```tsx
import { useGlobalShortcuts, HelpOverlay } from "@fusion/tui";

function App() {
  const { helpVisible, toggleHelp } = useGlobalShortcuts({
    onScreenChange: setActiveScreen,
  });

  return (
    <>
      {helpVisible && <HelpOverlay onClose={toggleHelp} />}
      <ScreenRouter ... />
    </>
  );
}
```

#### Available Shortcuts

| Key | Action | Focus Guard |
|-----|--------|-------------|
| `Ctrl+C` | Quit (emergency exit) | Always works |
| `q` | Quit | Only when no text input focused |
| `?` | Toggle help overlay | Only when no text input focused |
| `h` | Toggle help overlay (alternate) | Only when no text input focused |
| `1` - `5` | Switch screens | Only when no text input focused |

#### Focus Guard

Global shortcuts (except `Ctrl+C`) are suppressed when text input is focused. This prevents accidental navigation while typing.

To enable focus guarding for text inputs, import `FocusGuardRef` and set `isFocused` on focus/blur events:

```tsx
import { FocusGuardRef } from "@fusion/tui";

function TextInput() {
  return (
    <Input
      onFocus={() => { FocusGuardRef.isFocused = true; }}
      onBlur={() => { FocusGuardRef.isFocused = false; }}
    />
  );
}
```

#### useGlobalShortcuts Hook

```tsx
const result = useGlobalShortcuts({
  onScreenChange: (screenId) => {
    // Handle screen switch triggered by number keys
  },
});
```

##### Options

| Property | Type | Description |
|----------|------|-------------|
| `onScreenChange` | `(screenId: ScreenId) => void` (optional) | Callback when user presses 1-5 to switch screens |

##### Returns

| Property | Type | Description |
|----------|------|-------------|
| `helpVisible` | `boolean` | Whether the help overlay is currently visible |
| `toggleHelp` | `() => void` | Toggle the help overlay visibility |
| `hideHelp` | `() => void` | Hide the help overlay |

#### HelpOverlay Component

The `HelpOverlay` component displays available keyboard shortcuts. It handles `Escape` and `q` to close.

```tsx
<HelpOverlay onClose={toggleHelp} />
```

##### Props

| Property | Type | Description |
|----------|------|-------------|
| `onClose` | `() => void` | Callback to close the overlay |

#### Exports

The following are exported from `@fusion/tui`:
- `useGlobalShortcuts` — Hook for handling global keyboard shortcuts
- `HelpOverlay` — Component for displaying keyboard shortcuts
- `FocusGuardRef` — Shared ref for tracking text input focus state

## Example

```tsx
import React, { useState } from "react";
import { render, Box, Text } from "ink";
import { FusionProvider, useFusion, ScreenRouter, useGlobalShortcuts, HelpOverlay } from "@fusion/tui";

function ProjectInfo() {
  const { store, projectPath } = useFusion();
  const [tasks, setTasks] = React.useState<Task[]>([]);

  React.useEffect(() => {
    store.listTasks().then(setTasks);
  }, [store]);

  return (
    <Box flexDirection="column">
      <Text>Project: {projectPath}</Text>
      <Text>Tasks: {tasks.length}</Text>
    </Box>
  );
}

function App() {
  const [activeScreen, setActiveScreen] = useState("board");

  // Global keyboard shortcuts
  const { helpVisible, toggleHelp } = useGlobalShortcuts({
    onScreenChange: setActiveScreen,
  });

  return (
    <Box flexDirection="column">
      {/* Help overlay */}
      {helpVisible && (
        <Box marginBottom={1}>
          <HelpOverlay onClose={toggleHelp} />
        </Box>
      )}

      {/* Header */}
      <Text bold>Fusion TUI</Text>
      <Text dimColor>(Press ? for help)</Text>

      {/* Screen router */}
      <ScreenRouter
        activeScreen={activeScreen}
        onScreenChange={setActiveScreen}
      >
        {({ activeScreen }) => (
          <Box flexDirection="column">
            {activeScreen === "board" && (
              <Box>
                <Text>Board Screen</Text>
              </Box>
            )}
            {activeScreen === "detail" && (
              <Box>
                <Text>Detail Screen</Text>
              </Box>
            )}
          </Box>
        )}
      </ScreenRouter>
    </Box>
  );
}

render(
  <FusionProvider>
    <App />
  </FusionProvider>
);
```
