---
"bun-toolkit": minor
---

Add `btk completion zsh|bash|fish`, installed by Homebrew, and `btk md build`, which writes a folder of markdown out as a static site. `btk serve` and `btk md serve` now refuse json mode that only comes from `AGENT=true` or config instead of waiting forever, answer `405` to writes, and keep the query string on folder redirects.
