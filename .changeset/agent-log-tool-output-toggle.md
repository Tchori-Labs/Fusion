---
"@fusion/dashboard": minor
---

Add a "Tools: On/Off" toggle next to the existing "Markdown/Plain" toggle in the agent log viewer (used by both agent logs and task agent logs). When tool output is off, entries of type `tool` / `tool_result` / `tool_error` are hidden — only agent text and thinking are shown. Both toggles now persist globally across sessions via `localStorage` (`fn-agent-log-markdown`, `fn-agent-log-tool-output`).
