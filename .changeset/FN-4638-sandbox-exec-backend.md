---
"@runfusion/fusion": patch
---

Add opt-in macOS `sandbox-exec` backend for the engine `SandboxBackend` abstraction. Default backend remains `native`; enable via `sandbox.backend = "sandbox-exec"`. Honors `failureMode: "fail-hard" | "fallback-native"`. Port 4040 and `.fusion/` are denied unconditionally.
