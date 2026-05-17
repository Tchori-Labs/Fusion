---
"@fusion/dashboard": patch
---

Fix dashboard occasionally serving a blank/broken page until the server is restarted. The server cached `index.html` and the Vite view-chunk manifest forever with no invalidation, so any on-disk change (release upgrade, rebuild) left the server handing out stale HTML referencing chunk hashes that no longer existed. Both caches now invalidate automatically when the underlying file's mtime changes. The `serveIndexHtml` catch path also now logs the failure and clears the templated cache so a subsequent request can recover, instead of silently returning 404 forever.
