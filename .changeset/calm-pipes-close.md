---
"bun-toolkit": patch
---

Piping btk into a command that stops reading early, such as `btk md CHANGELOG.md --terminal | head`, now ends quietly with exit code 0 instead of printing an EPIPE stack trace.
