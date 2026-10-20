# btk compress and btk decompress

Compress files with gzip, zstd, brotli or deflate, pack folders into archives, and reverse both. Bun provides every codec, so this works the same on machines that have no `zstd` or `brotli` installed.

## Commands

| Command | What it does |
| --- | --- |
| `btk compress [files...]` | Compress files, or pack each folder into one archive. Short for `btk compress run` |
| `btk compress formats` | List the formats with their extensions and level ranges |
| `btk decompress [files...]` | Decompress files and extract archives. Short for `btk decompress run` |
| `btk compress --ui` | Open the dashboard. `btk decompress --ui` opens its decompress screen directly |

### compress

`btk compress [files...]` writes a compressed copy next to each input and keeps the original. It uses gzip unless you pass a format.

```bash
btk compress bundle.js                          # bundle.js.gz
btk compress styles.css --brotli --level 9      # styles.css.br at level 9
btk compress ./site --zstd                      # site.tar.zst, one archive for the folder
btk compress ./dist --each --gzip --brotli      # a .gz and a .br next to every file in dist/
btk compress dump.sql --zstd --out-dir backups  # backups/dump.sql.zst
btk compress ./dist --each --dry-run            # sizes only, nothing written
cat dump.sql | btk compress --zstd > dump.sql.zst
```

### formats

`btk compress formats` prints the table in [Formats and levels](#formats-and-levels).

```bash
btk compress formats
```

### decompress

`btk decompress [files...]` restores each file next to the compressed one. Archives such as `.tar.zst` extract into a folder.

```bash
btk decompress bundle.js.gz                     # bundle.js
btk decompress site.tar.zst                     # site/
btk decompress site.tar.zst -o ./restore        # into restore/
btk decompress app.log.gz --stdout | grep ERROR # print instead of writing a file
btk decompress data.bin --format brotli         # brotli has no signature, so name the format
cat dump.sql.zst | btk decompress > dump.sql
```

## When to use it

**Precompress a website's static files.** Web servers like nginx and Caddy, and CDNs, can serve `app.js.br` or `app.js.gz` directly instead of compressing on every request. Create both for every file in your build output:

```bash
btk compress ./dist --each --gzip --brotli
```

btk skips files that wouldn't get smaller, such as images and fonts, instead of writing a useless `.gz`.

**Send or back up a folder as one file.** Pack a folder into a single archive, then unpack it on the other side:

```bash
btk compress ./project --zstd
btk decompress project.tar.zst
```

zstd gives the smallest files quickly. Use `--gzip` when the other side may only have standard tools, because every system can open `.tar.gz`.

**Shrink a large file before uploading it.** Database dumps, logs and CSV exports often shrink by 80% or more:

```bash
btk compress dump.sql --zstd
```

**Read a compressed log without unpacking it.** Print the decompressed data and pipe it into another command:

```bash
btk decompress app.log.gz --stdout | grep ERROR
```

**Open a file you downloaded.** A `.zst`, `.br` or `.tar.gz` file decompresses the same way, including on machines without the matching command installed:

```bash
btk decompress data.json.zst
```

**Compress in a pipeline.** Standard input goes to standard output, so btk fits between other commands:

```bash
pg_dump mydb | btk compress --zstd > mydb.sql.zst
btk decompress < mydb.sql.zst | psql mydb
```

## What gets written where

| Input | compress | decompress |
| --- | --- | --- |
| A file | `name.ext.gz` next to it, keeping the original | the original name next to it (`app.js.gz` becomes `app.js`) |
| A folder | one `folder.tar.gz` next to it, including hidden files | |
| A folder with `--each` | a compressed copy of every file inside, recursively | |
| An archive (`.tar.gz`, `.tgz`, `.tar.zst`, `.tzst`, `.tar.br`) | | extracted like `tar -x`: an archive of `site/` gives `site/` next to it, and loose files go into a folder named after the archive |
| Standard input | standard output, or `-o <file>` | standard output, or `-o <file>` |

Both commands keep the input, never replace an existing file or folder without `--overwrite`, and write through a temp file. `--out-dir` puts results in another folder, `-o` names a single output, and `--dry-run` reports sizes without writing. Folders and globs with `-r` include subfolders. `btk compress` leaves out files that are already compressed, so rerunning it on a folder doesn't compress its own outputs. Batches show a progress bar on stderr. Ctrl+C lets the files in flight finish, skips the rest and exits 130.

btk refuses to print compressed data to a terminal or into `--json` output, and suggests a redirect or `-o` instead.

Extraction refuses archive entries that lead outside the folder (`../x`) and never writes through a symlink already in the destination. Symlinks inside an archive are skipped.

## Formats and levels

| Format | Extension | Levels | Default |
| --- | --- | --- | --- |
| gzip | `.gz` | 1 to 12 | 9 |
| zstd | `.zst` | 1 to 22 | 19 |
| brotli | `.br` | 0 to 11 | 11 |
| deflate | `.deflate` | 1 to 12 | 9 |

The defaults favor small files over speed, because you usually compress something once and download or store it many times. Lower the level for speed on large files, such as `--zstd --level 3`.

gzip and deflate use libdeflate, which compresses better than zlib at the same level, and levels above 9 go further than zlib can. The shortcut flags `--gzip`, `--zstd`, `--brotli` and `--deflate` can be combined to write one file per format. Without them, btk uses `--format` or the configured format.

`btk decompress` picks the format from the file extension. It also recognizes gzip and zstd by their first bytes when the extension is missing or wrong, and then names the output `name.out`. brotli and raw deflate have no such signature, so those need `--format`.

## Limits

- btk reads each file, and each folder's contents, into memory before compressing it. That's fine for files up to a few gigabytes.
- Archives don't keep file permissions. Extracted files are readable and writable by you, and executable bits are lost. Use `tar` when that matters.
- Extraction refuses entries that would land outside the target folder, such as `../evil`.

## Options

compress:

| Flag | Config key | Default |
| --- | --- | --- |
| `-f, --format <gzip\|zstd\|brotli\|deflate>` | `format` | `gzip` |
| `--gzip`, `--zstd`, `--brotli`, `--deflate` | | off; combine for several formats |
| `-l, --level <n>` | `level` | the format's default |
| `-o, --output <file>` | | next to the input |
| `--out-dir <dir>` | `outDir` | next to the input |
| `--each` | | off |
| `-r, --recursive` | `recursive` | `false` |
| `--overwrite` | `overwrite` | `false` |
| `-n, --dry-run` | | `false` |

decompress:

| Flag | Default |
| --- | --- |
| `-f, --format <gzip\|zstd\|brotli\|deflate>` | from the extension or first bytes |
| `-o, --output <path>` | next to the input |
| `--out-dir <dir>` | next to the input |
| `-c, --stdout` | off |
| `-r, --recursive` | off |
| `--overwrite` | off |
| `-n, --dry-run` | off |

Config keys for `btk compress` can also be set with `BTK_COMPRESS_<KEY>`, such as `BTK_COMPRESS_FORMAT=zstd`. `btk decompress` has no config.

## Exit codes

| Code | When |
| --- | --- |
| 0 | Everything was written, or skipped on purpose |
| 1 | A file failed, a path matched nothing, or the data wasn't valid for its format |
| 2 | Bad flags, a level outside the format's range, `-o` with several outputs, or binary data aimed at a terminal or JSON |
| 78 | Invalid `tools.compress` config |
| 130 | Cancelled with Ctrl+C |

## Dashboard (`btk compress --ui`)

1. Choose to compress or decompress.
2. Compress. Pick files, then set the format, level and output folder in a form prefilled from your config. The results show each file's size before and after.
3. Decompress. The browser lists only compressed files. Pick them and btk restores them next to the originals.

`btk decompress --ui` opens the decompress browser directly.
