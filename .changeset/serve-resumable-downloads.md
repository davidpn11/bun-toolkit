---
"bun-toolkit": patch
---

`btk serve` and `btk md` send files with a `Last-Modified` header, so an interrupted download resumes where it stopped instead of starting over. If the file changed in the meantime, the client gets the new file in full.
