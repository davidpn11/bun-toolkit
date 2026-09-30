# btk convert

Convert between JSON, YAML, TOML, XML, JSON5, JSONC and JSONL with the parsers built into Bun. You don't need jq, yq or a Python script.

```bash
btk convert config.yaml                            # → JSON on stdout
btk convert data.xml --to yaml
cat logs.jsonl | btk convert --from jsonl --to json
btk convert tsconfig.json --to yaml -o tsconfig.yaml
btk convert ./config -r --to toml --out-dir build  # a whole folder
btk convert formats                                # what it reads and writes
btk convert --ui                                   # dashboard
```

`btk convert <inputs>` is `btk convert run <inputs>`.

## When to use it

**Read a YAML or TOML file with a JSON tool.** Convert it on the fly and pipe it into jq, or into any script that expects JSON:

```bash
btk convert docker-compose.yml | jq '.services | keys'
btk convert Cargo.toml | jq -r '.package.version'
```

**Move a config to the format a tool now wants.** Many tools accept both YAML and JSON, and some are dropping one. Convert once and save the result:

```bash
btk convert .eslintrc.yaml -o .eslintrc.json
```

**Use an XML API from a script.** Turn the response into JSON, then pick out what you need:

```bash
curl -s https://example.com/feed.xml | btk convert --to json | jq '.rss.channel.title'
```

**Turn log lines into one document.** Structured logs are often JSONL, one JSON object per line. Convert them into a single JSON array for a spreadsheet, a chart or another tool:

```bash
cat app.jsonl | btk convert --from jsonl > app.json
```

**Check that a config file is valid.** Converting fails with the format's error message and exit code 1 when the file doesn't parse, which makes it a quick check in CI or a git hook:

```bash
btk convert config.toml > /dev/null
```

**Convert a whole folder.** Fixtures, translations or configs in one format can all move to another at once, written next to the originals or into another folder:

```bash
btk convert ./fixtures -r --to json --out-dir ./fixtures-json
```

**Look before you save.** `btk convert --ui` lets you pick a file and a target format, shows the converted text, and writes it when you press `w`.


## Where the result goes

| Input | Result |
| --- | --- |
| One file or standard input | Printed to stdout, and nothing else goes there, so you can pipe it |
| One input with `-o <file>` | Written to that file |
| One file with `--write` | Written next to the original with the new extension |
| Several files, a folder, or `--out-dir` | Written next to each original, or under `--out-dir` with subfolders mirrored, with a result table |

When btk writes files it follows the same rules as `btk image`. It never replaces an existing file without `--overwrite`, and it never rewrites a file in place (`app.json` converted to JSON) without `--overwrite`. It leaves earlier outputs alone, so on a second run `app.json` next to `app.yaml` isn't treated as a new source. When two inputs would write the same file, such as `app.json` and `app.yaml` both becoming `app.toml`, the first in sort order wins and the other is skipped with a reason. Writes are atomic, and `--dry-run` shows what would be written.

## Formats

| Format | Read | Write | Extensions |
| --- | --- | --- | --- |
| JSON | ✔ | ✔ | `.json` |
| YAML | ✔ | ✔ | `.yaml`, `.yml` |
| TOML | ✔ | ✔ | `.toml` |
| XML | ✔ | ✔ | `.xml` |
| JSON5 | ✔ | ✔ | `.json5` |
| JSONC | ✔ | | `.jsonc` |
| JSONL | ✔ | ✔ | `.jsonl`, `.ndjson` |

btk takes the input format from the file extension. For standard input, it recognizes JSON, JSONL and XML by trying to parse them. Anything else needs `--from`, because almost any text is valid YAML. `--from` also lets you name a file with another extension, such as `btk convert notes.txt --from yaml`. Folder scans still only pick up the extensions above.

Bun has no JSONC writer, and JSONC output would just be JSON, so write JSON instead.

## How values map between formats

- TOML dates stay dates when converting TOML to TOML. Every other format gets the ISO 8601 string, such as `1979-05-27T07:32:00Z`.
- TOML needs an object at the top level. Converting a list to TOML fails with a hint to convert to JSON or YAML instead.
- XML needs exactly one root element. An object with one key becomes that element. Anything else is wrapped in `<root>` (`--xml-root` renames it), and a list becomes `<root><item>…</item></root>`.
- XML attributes appear as `@name` keys and text next to attributes as `#text`, which is Bun's compact XML shape.
- JSONL writes one JSON value per line. A list becomes one line per item, and anything else becomes a single line.
- JSONL input is strict. A bad line fails with its line number instead of stopping quietly at the last good value.
- A multi-document YAML file becomes a list of documents.

## Options

| Flag | Config key | Default |
| --- | --- | --- |
| `-t, --to <json\|yaml\|toml\|xml\|json5\|jsonl>` | `to` | `json` |
| `-f, --from <format>` | | extension or detection |
| `--indent <0-8>` | `indent` | `2` |
| `--pretty` / `--no-pretty` | `pretty` | `true` |
| `--xml-root <name>` | `xmlRoot` | `root` |
| `-o, --output <file>` | | stdout |
| `--out-dir <dir>` | `outDir` | next to the original |
| `-w, --write` | | `false`; on for several files |
| `--overwrite` | `overwrite` | `false` |
| `-r, --recursive` | `recursive` | `false` |
| `-n, --dry-run` | | `false` |

Every config key can also be set with `BTK_CONVERT_<KEY>`, such as `BTK_CONVERT_TO=yaml`.

## Errors

A parse error names the format, such as `Invalid YAML: Unexpected token`, and suggests `--from` in case the format guess was wrong. When converting several files, a failure doesn't stop the batch. Every file gets a row, and the command exits 1 at the end.

| Code | When |
| --- | --- |
| 0 | Converted, or every file was deliberately skipped |
| 1 | Invalid input, a format that can't hold the data, an existing `-o` file, or a failed file in a batch |
| 2 | Bad flags, nothing to convert, `-o` with several files, or `--write` with standard input |
| 78 | Invalid `tools.convert` config |

## JSON mode

With `--json`, a single conversion returns `{ "mode": "stdout", "from", "to", "output" }`, where `output` holds the converted text. A batch returns `{ "mode": "batch", "files", "totals" }` with one entry per file.

## Dashboard (`btk convert --ui`)

1. Browse. Only data files are listed. Highlight one and press `enter`.
2. Format. Pick the target format, starting on your configured default.
3. Preview. The converted text with line numbers, scrollable with the arrow keys. `w` writes it next to the original, following the same overwrite rules as the CLI. A file that fails to parse shows the error instead.
