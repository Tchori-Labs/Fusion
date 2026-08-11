import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RootErrorBoundary } from "./components/ErrorBoundary";
import { DesktopLaunchGate } from "./components/DesktopLaunchGate";
import { App } from "./App";
import { installAuthFetch } from "./auth";
import { installFusionApiClient } from "./fusion-api-client";
import { installVersionCheck } from "./versionCheck";
import { installSwUpdate } from "./swUpdate";
import { bootstrapShellHostContext } from "./shell-host";
import { registerBundledPluginViews } from "./plugins/registerBundledPluginViews";
import { i18nReady } from "./i18n";
import "./styles.css";

// Install the bearer-token fetch wrapper before React mounts so every API
// call (including ones fired synchronously during the first render) picks up
// the token that was either captured from `?token=` in the launch URL or
// stored from a previous session.
installAuthFetch();
// FNXC:FrontendPluginApi 2026-08-11-11:32: Publish the integrator client after token capture and before React mounts.
installFusionApiClient();
installVersionCheck();
bootstrapShellHostContext();
registerBundledPluginViews();

// Gate first paint on the active locale's catalogs so the UI never flashes raw
// translation keys. The catalog is a small local chunk, so this is a brief
// wait; `.finally` ensures we still render if i18n init fails (strings then
// fall back to keys/en rather than blocking the app).
void i18nReady.finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RootErrorBoundary>
        <DesktopLaunchGate>
          <App />
        </DesktopLaunchGate>
      </RootErrorBoundary>
    </StrictMode>,
  );

  installSwUpdate();
});
