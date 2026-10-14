---
"bun-toolkit": minor
---

New `btk serve` tool: `btk serve dist` serves any folder over HTTP and reloads the browser when a file changes, and `btk serve page.html` serves the page's folder and opens it. Folders open their `index.html` or a listing, `--spa` sends unknown routes to `index.html`, `--cors` allows other origins, and `--host 0.0.0.0` makes it reachable from other devices on your network.
