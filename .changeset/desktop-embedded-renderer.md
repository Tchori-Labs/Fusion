---
"@gsxdsm/fusion": patch
---

Desktop now uses embedded renderer assets in production instead of URL-based loading. The desktop shell loads `dist/client/index.html` directly via `loadFile()` instead of connecting to a dashboard URL. Development mode (`fn desktop --dev`) continues to use `FUSION_DASHBOARD_URL` for live reload. The embedded API server port is now passed via `app:getServerPort` IPC channel.
