# btk image

Convert, compress and inspect images with `Bun.Image`. Bun decodes, resizes and encodes the images itself with libjpeg-turbo, libspng and libwebp, plus the OS codecs for AVIF and HEIC. You don't need sharp or ImageMagick.

```bash
btk image hero.png                                  # → hero.webp next to it
btk image ./assets -r --format avif -q 60           # a whole tree, as AVIF
btk image ./photos --preset web --out-dir dist/img  # 1920px wide, q75, into dist/img
btk image logo.png --format png --palette --overwrite
btk image ./assets -r --dry-run --json              # plan only, machine-readable
btk image info hero.png --placeholder               # dimensions, size, ThumbHash
btk image presets                                   # built-in and configured presets
btk image --ui                                      # dashboard
```

`btk image <paths>` is `btk image optimize <paths>`. `btk img` works too.

## When to use it

**Your site loads slowly because of large photos.** Convert them to WebP and cap the width at 1920px. The originals stay untouched, and the table shows how much each file shrank:

```bash
btk image ./public/images -r --preset web
```

Then point your `<img>` tags or imports at the new `.webp` files.

**Try it before changing anything.** A dry run encodes every image and reports the savings without writing a file:

```bash
btk image ./public/images -r --preset web --dry-run
```

**Shrink screenshots before you commit them.** Keep each file's format and replace it in place. btk skips any file that re-encoding would make larger:

```bash
btk image ./docs/assets --format original --overwrite
```

Screenshots and diagrams with few colors usually get much smaller with `--format png --palette`, which reduces them to 256 colors.

**Make thumbnails for a gallery.** Write small copies into a separate folder, mirroring subfolders:

```bash
btk image ./photos -r --preset thumbnail --out-dir ./photos/thumbs
```

**Check an image before uploading it, or get a blur placeholder.** `info` shows the format, dimensions and size, and `--placeholder` adds a tiny ThumbHash data URL you can show while the real image loads:

```bash
btk image info hero.jpg --placeholder
```

**Prefer to pick files by eye.** `btk image --ui` opens a file browser with a preview, lets you choose several images, adjust the options and watch the run.


## Defaults

With the defaults, running btk on a folder never deletes or replaces a file you didn't ask it to:

| Behavior | Default |
| --- | --- |
| Output format | WebP, quality 80 |
| Output location | Next to each original (`--out-dir` mirrors subfolders elsewhere) |
| Resizing | None. `--max-width` and `--max-height` shrink the image to fit inside the box, keep the aspect ratio and never enlarge |
| Existing files | Never replaced. `--overwrite` allows it, including optimizing in place |
| Same format and size, but bigger | Skipped, because the original was already smaller. Nothing is written |
| Earlier outputs (`hero.webp` next to `hero.png`) | Left alone instead of being processed again as sources |
| The `--out-dir` folder | Never scanned for inputs, so a second run doesn't write `dist/dist/...` |
| Two inputs, one output (`a.png` and `a.jpg` → `a.webp`) | The most faithful source wins (PNG > BMP > TIFF > GIF > HEIC > JPEG > WebP > AVIF); the other is skipped |
| JPEG | Progressive |
| PNG | Maximum zlib compression. `--palette` reduces it to 256 colors |
| Folders | Top level only. `-r` includes subfolders, except hidden folders and `node_modules` |
| Writes | Atomic: btk writes a temp file, then renames it |
| Concurrency | Up to 4 images at once |

A failed file never stops the batch. Every file gets a row that says it was converted, skipped with a reason, or failed with a reason and, when there is one, a fix.

## Formats

| Format | Read | Write | Notes |
| --- | --- | --- | --- |
| JPEG, PNG, WebP | ✔ | ✔ | Everywhere |
| AVIF | ✔ | ✔ | Writing needs macOS on Apple Silicon M3+, or Windows with the AV1 Video Extension |
| HEIC | ✔ | ✔ | macOS, or Windows with the HEIF Image Extension |
| GIF, BMP | ✔ | | GIF reads the first frame |
| TIFF | ✔ | | macOS and Windows |

`--format original` re-encodes each file in its own format. A file in a read-only format then fails with a hint to pick an output format.

## Options

| Flag | Config key | Default |
| --- | --- | --- |
| `-f, --format <webp\|avif\|jpeg\|png\|heic\|original>` | `format` | `webp` |
| `-q, --quality <1-100>` (jpeg, webp, avif, heic) | `quality` | `80` |
| `--lossless` (WebP) | `lossless` | `false` |
| `--palette` (PNG) | `palette` | `false` |
| `-w, --max-width <n>` | `maxWidth` | none |
| `--max-height <n>` | `maxHeight` | none |
| `-p, --preset <name>` | `presets` | none |
| `-o, --out-dir <dir>` | `outDir` | next to the original |
| `-r, --recursive` | `recursive` | `false` |
| `--overwrite` | `overwrite` | `false` |
| `-n, --dry-run` | | `false` |

You can also set every config key with an environment variable named `BTK_IMAGE_<KEY>`, such as `BTK_IMAGE_QUALITY=70` or `BTK_IMAGE_MAX_WIDTH=1600`.

## Presets

| Name | Settings |
| --- | --- |
| `web` | q75, fit 1920 wide |
| `thumbnail` | q60, fit 400×400 |
| `social` | q80, fit 1200×1200 |

An explicit flag beats the preset, the preset beats config (env, project and global), and config beats the built-in defaults. So `--preset web -q 90` keeps the 1920px limit and uses quality 90, while `quality: 90` in config doesn't override the preset.

Add or override presets in config:

```ts
export default defineConfig({
  tools: {
    image: {
      format: "avif",
      presets: {
        hero: { maxWidth: 2560, quality: 85 },
        web: { quality: 70, maxWidth: 1600 },
      },
    },
  },
});
```

## Output

```
ℹ 4 images → webp · q75 · fit 1920×∞
✔ Processed 4 images (156ms)
   file            output                     size  change  note
─  ──────────────  ──────────  ───────────────────  ──────  ─────────────────────────────────
✔  ./hero.png      hero.webp    1.35 MB → 453.2 KB  -67.2%  2400 × 1600 → 1920 × 1280
–  ./icon.webp                                              Output would replace the original
✔  ./photo.jpg     photo.webp  447.8 KB → 245.7 KB  -45.1%  1200 × 800

→ Pass --overwrite to optimize in place, or --out-dir to write elsewhere

✔ Done · 3 converted · 1 skipped · 1.96 MB → 824.5 KB · 1.16 MB (59.0%) saved · 156ms elapsed
```

Changes over 20% are green, 0 to 20% yellow, and growth red. `--json` returns the full report with the options, one entry per file and the totals. Each entry has a `status`, the `before` and `after` format, dimensions and bytes, and a `reason`, `code` and `hint` when relevant.

## Exit codes

| Code | When |
| --- | --- |
| 0 | Everything converted or was deliberately skipped |
| 1 | At least one file failed, a path matched nothing, or no images were found |
| 2 | Bad flags, e.g. an unknown preset |
| 78 | Invalid `tools.image` config |
| 130 | Cancelled with Ctrl+C (the partial report is still printed) |

## Dashboard (`btk image --ui`)

1. Browse. A file browser shows only images, with a preview panel for the highlighted one (format, dimensions, megapixels, size). `space` selects several files, `a` selects all, and `enter` continues.
2. Options. A form built from the same flags as the CLI, prefilled from your config.
3. Run. Progress for each file as it happens, then the results table and totals. `esc` cancels a run, and `enter` returns to the browser with the listing refreshed.

Each screen keeps its state, so `esc` from Options returns to the same folder with the same selection.
