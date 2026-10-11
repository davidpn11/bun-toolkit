# btk hash

Hash and verify files with `Bun.CryptoHasher` and `Bun.hash`. One command replaces shasum, md5sum, cksum and b2sum, and it adds HMAC, base64 output and SRI checks.

## Commands

| Command | What it does |
| --- | --- |
| `btk hash [files...]` | Hash files, folders or standard input. Short for `btk hash compute` |
| `btk hash verify <file> <expected>` | Check one file against a known hash |
| `btk hash check <sums-file>` | Check every file listed in a checksums file |
| `btk hash algorithms` | List the supported algorithms |
| `btk hash --ui` | Open the dashboard |

### compute

`btk hash [files...]` prints one `<hash>  <file>` line per input on stdout. It uses sha256 unless you pass `--algorithm` or put an algorithm name first.

```bash
btk hash package.json                      # sha256
btk hash sha512 dist/*.js                  # the first argument can name the algorithm
btk hash -a md5 -e base64 logo.png         # md5, printed as base64
btk hash ./dist -r > SHA256SUMS            # every file under dist/, as a checksums file
echo hello | btk hash crc32                # standard input; prints 363a3020  -
btk hash sha256 --hmac-key "$KEY" data.bin # an HMAC instead of a plain hash
```

With no files, btk reads standard input when something is piped in. At a terminal with nothing piped in, it exits 2 with a hint.

### verify

`btk hash verify <file> <expected>` hashes one file and compares the result with the hash you expected. It exits 0 on a match and 1 on a mismatch or an unreadable file. `-` reads standard input.

```bash
btk hash verify hello.txt 5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03
btk hash verify hello.txt sha384-HQ8oTv4+3qS5yjvVFPoTSxfq42HMx6Hu/v+AG5vWYE4B8h9r8knvAwWZ8MIY8rqM
printf hello | btk hash verify - 3610a686
```

The first two lines match a `hello.txt` created with `echo hello > hello.txt`. The third reads standard input and guesses crc32 from the 4-byte hash.

The expected value can be hex, base64, or an SRI string such as `sha384-…`, the format used in `<script integrity>`. btk picks the algorithm in this order:

1. `--algorithm`
2. the SRI prefix
3. your configured algorithm, if its digest has the right length
4. the most common algorithm of that length: sha256 for 32 bytes, sha512 for 64, sha1 for 20, md5 for 16, sha384 for 48, sha224 for 28, crc32 for 4, xxhash64 for 8

The output says when btk guessed. A 32-byte hash made with sha3-256 then needs `--algorithm sha3-256`.

### check

`btk hash check <sums-file>` verifies every line of a checksums file and marks each file ✔ or ✖. It exits 1 when any file doesn't match or can't be read.

```bash
btk hash ./dist -r > SHA256SUMS
btk hash check SHA256SUMS
btk hash check checksums.txt --algorithm sha512
grep bun-darwin-aarch64.zip SHASUMS256.txt | btk hash check -
```

It reads the `sha256sum` format (`<hash>  <file>`, or `<hash> *<file>` for binary mode) and the BSD format (`SHA256 (file) = <hash>`). It ignores blank lines and lines starting with `#`. It resolves paths against the checksums file's folder, so `btk hash check dist/SHA256SUMS` works from anywhere. The algorithm comes from `--algorithm`, the BSD tag, or the hash length, as with `verify`.

### algorithms

`btk hash algorithms` lists every algorithm with its kind and digest size, and marks your configured default.

```bash
btk hash algorithms
btk hash algorithms --json | jq -r '.data[].name'
```

## When to use it

A hash is a short fingerprint of a file's exact bytes. Change one byte and the fingerprint changes completely. Matching fingerprints prove that a file is exactly the one you expect.

**Check a download.** Bun and Node publish a SHA-256 for every release file. Download the file and the checksums, then check the one you need:

```bash
curl -fsSLO https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-darwin-aarch64.zip
curl -fsSLO https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/SHASUMS256.txt
grep bun-darwin-aarch64.zip SHASUMS256.txt | btk hash check -
```

Or paste the published hash directly:

```bash
btk hash verify bun-darwin-aarch64.zip c669e97f6164e1c96e0701748db98dfa77492908cbd8394c7557134a735de381
```

btk prints `✔ bun-darwin-aarch64.zip matches` and exits 0. On a mismatch it shows the expected and actual hashes and exits 1, so a script or CI job stops on a bad file. btk works out the algorithm from the length of the hash.

**Publish checksums for your own release.** Record a fingerprint for every file you ship, then check them later on any machine:

```bash
btk hash ./dist -r > SHA256SUMS
btk hash check SHA256SUMS
```

`SHA256SUMS` uses the standard format, so people without btk can run `sha256sum -c SHA256SUMS` instead.

**See whether two files are the same.** Hash both and compare the lines. Identical fingerprints mean identical contents, whatever the file names or dates say:

```bash
btk hash old/logo.png new/logo.png
```

**Fill in a `<script integrity>` value.** Subresource integrity needs a base64 SHA-384 with a `sha384-` prefix. Print the hash, then check a file against the full value:

```bash
btk hash sha384 -e base64 app.js
btk hash verify app.js "sha384-$(btk hash sha384 -e base64 app.js | cut -d' ' -f1)"
```

**Sign or check a webhook payload.** GitHub and Stripe sign each request with an HMAC of the body. Compute the same value and compare it with the signature header:

```bash
btk hash sha256 --hmac-key "$WEBHOOK_SECRET" payload.json
```

**Build cache keys or find duplicates.** When tampering isn't a concern, a fast hash like `xxhash3` or `crc32` is enough and much quicker on large folders:

```bash
btk hash xxhash3 ./assets -r
```

## Output

Digests go to stdout in the same `<hash>  <file>` format as `sha256sum`, one line per input. You can redirect them into a checksums file that `sha256sum -c`, `shasum -c` and `btk hash check` all accept. Paths are relative to the working directory and use `/` on every OS, so a checksums file made on Windows verifies on macOS and Linux. Standard input shows as `-`.

Everything else goes to stderr: the header, the progress bar, unreadable files, and a summary line when there is more than one input. When stdout is redirected into a file inside the folder you are hashing, btk skips that file, so `btk hash . -r > SHA256SUMS` never lists a half-written `SHA256SUMS`.

```
$ btk hash . -r
ℹ sha256 · 2 inputs
2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824  a.txt
486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7  dist/b.js
✔ 2 inputs · 10 B · 1ms
```

## Inputs

- Files, folders and quoted globs. A folder hashes its top-level files, and `-r` adds subfolders, skipping hidden folders and `node_modules`.
- `-` reads standard input. With no inputs at all, btk reads standard input when something is piped in.
- If the first input is an algorithm name, such as `btk hash md5 a.txt`, it sets the algorithm. A file with that exact name wins, so `btk hash md5` hashes a file called `md5` when one exists.

## Algorithms

| Kind | Algorithms |
| --- | --- |
| Cryptographic | sha256, sha512, sha384, sha224, sha1, md5, sha512-256, sha512-224, sha3-256, sha3-512, sha3-384, sha3-224, blake2b256, blake2b512, blake2s256, shake128, shake256, ripemd160, md4 |
| Fast | crc32, adler32, xxhash3, xxhash64, xxhash32, wyhash, rapidhash, cityhash64, cityhash32, murmur64v2, murmur32v3, murmur32v2 |

Cryptographic hashes and crc32 stream the file in chunks, so file size doesn't matter. The other fast hashes read the whole file into memory first, because Bun computes them in one call. Fast hashes suit caching and deduplication. Use a cryptographic hash to check downloads, because anyone can craft a file with a chosen fast hash.

Fast hashes print as big-endian hex, the same as `printf "%08x"` and `%016x`. `printf hello | btk hash crc32` prints `3610a686`. `echo hello` adds a newline, so it prints `363a3020`.

## Options

| Flag | Config key | Default |
| --- | --- | --- |
| `-a, --algorithm <name>` | `algorithm` | `sha256` |
| `-e, --encoding <hex\|base64\|base64url>` | `encoding` | `hex` |
| `--hmac-key <key>` | | none; cryptographic algorithms only |
| `-r, --recursive` | `recursive` | `false` |

`verify` and `check` take `--algorithm`, and `verify` also takes `--hmac-key`.

You can also set the config keys with `BTK_HASH_ALGORITHM`, `BTK_HASH_ENCODING` and `BTK_HASH_RECURSIVE`. btk has no config key for the HMAC key, so a secret never ends up in a committed config file. Pass it with `--hmac-key "$KEY"` from an environment variable instead.

## Exit codes

| Code | When |
| --- | --- |
| 0 | Every input was hashed, or every check matched |
| 1 | A file couldn't be read, a path matched nothing, or a check didn't match |
| 2 | Bad flags, HMAC with a fast hash, two different algorithms, or nothing to hash |
| 78 | Invalid `tools.hash` config |

## Dashboard (`btk hash --ui`)

1. Browse. Pick files with `space`, or highlight one, then press `enter`.
2. Algorithm. A list grouped into cryptographic and fast hashes, starting on your configured default.
3. Results. Each file with its digest, plus the total size and time.
