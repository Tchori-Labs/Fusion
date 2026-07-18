---
"@runfusion/fusion": patch
---

summary: Ship the plugin registry manifest and llama.cpp extension in the published npm package.
category: fix
dev: "Tarball-completeness audit follow-ups to the migrations fix: (1) dist/pi-llama-cpp was staged by tsup but matched no files glob, so useLlamaCpp silently reported not-installed in every published build — added dist/pi-llama-cpp/** to files. (2) dashboard plugin-routes resolves ./registry-manifest.json beside the bundled bin.js but it was never staged into the CLI dist, so published installs served an empty plugin registry — tsup now stages it from packages/dashboard/src and files includes dist/registry-manifest.json."
