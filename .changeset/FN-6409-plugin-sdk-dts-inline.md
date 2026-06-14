---
"@runfusion/fusion": patch
---

Inline the private `@fusion/core` types into the published `@runfusion/fusion/plugin-sdk` declaration entry so standalone external plugins created with `fn plugin new` can typecheck and `pnpm build` cleanly against released Fusion. Human spot-check: `npx @runfusion/fusion@0.42.0 plugin new proof-point-plugin && cd proof-point-plugin && pnpm install && pnpm build`.
