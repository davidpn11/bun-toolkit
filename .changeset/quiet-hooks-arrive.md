---
"bun-toolkit": minor
---

Plugins in `btk.config.ts` now run. A plugin can add themes for `btk md` with the `md:theme` hook or replace its HTML page with `md:html:template`, using `definePlugin` and `defineTheme` from `bun-toolkit`. See docs/plugins.md.
