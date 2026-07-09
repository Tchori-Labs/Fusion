export interface GrokBinaryStatus {
  available: boolean;
  /**
   * FNXC:GrokCli 2026-07-09-00:00:
   * FN-7716: means "Grok CLI runtime ready" (the `grok` binary is available
   * on PATH or at a configured path) — NOT "a Fusion-visible API key was
   * found". The `grok` CLI owns its own authentication (env var, project
   * `.env`, `grok -k`, etc.); Fusion no longer requires visibility into a
   * key to treat the provider as authenticated. See `apiKeyDetected` for the
   * non-blocking informational key-presence signal.
   */
  authenticated?: boolean;
  /**
   * FNXC:GrokCli 2026-07-09-00:00:
   * FN-7716: non-blocking informational hint only — true when Fusion itself
   * detected a Grok API key (GROK_API_KEY env var or
   * ~/.grok/user-settings.json `apiKey`). Never gates `authenticated` or
   * enable/disable; the direct xAI OpenAI-compatible streaming path
   * (FN-7711/FN-7714) uses $GROK_API_KEY when present regardless of this CLI
   * probe.
   */
  apiKeyDetected?: boolean;
  binaryPath?: string;
  binaryName?: string;
  configuredBinaryPath?: string;
  usingConfiguredBinaryPath?: boolean;
  diagnostics?: string[];
  version?: string;
  reason?: string;
  probeDurationMs: number;
}
