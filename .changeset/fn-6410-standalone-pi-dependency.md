---
"@runfusion/fusion": patch
---

Fix standalone installs of the published CLI crashing with `ERR_MODULE_NOT_FOUND` for `@earendil-works/pi-coding-agent`. `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` are now plain required dependencies instead of also being optional peers, so clean npm and pnpm installs resolve the pi runtime packages.
