# btk hash

Hash and verify files with `Bun.CryptoHasher` and `Bun.hash`. One command replaces shasum, md5sum, cksum and b2sum, and it adds HMAC, base64 output and SRI checks.

```bash
btk hash package.tar.gz                          # sha256
btk hash sha512 dist/*.js                        # pick the algorithm first
echo hello | btk hash crc32                      # standard input
btk hash blake2b512 --hmac-key "$KEY" data.bin   # HMAC
btk hash ./dist -r > SHA256SUMS                  # a checksums file
btk hash check SHA256SUMS                        # verify it later
btk hash verify release.tar.gz 9f86d081…         # check one file
btk hash algorithms                              # everything supported
btk hash --ui                                    # dashboard
```

`btk hash <inputs>` is `btk hash compute <inputs>`.

## When to use it

A hash is a short fingerprint of a file's exact bytes. Change one byte and the fingerprint changes completely. You use it to prove that a file is exactly the one you expect.

**Check a download.** A project publishes a file with its SHA-256 next to it. After downloading, confirm the file is intact and nobody swapped it:

```bash
btk hash verify node-v22.tar.gz a3f1…9c
```

It prints `✔ node-v22.tar.gz matches` and exits 0, or shows the expected and actual hashes and exits 1, so a script or CI job stops on a bad file. You don't need to know which algorithm the project used, because btk works it out from the length of the hash.

**Publish checksums for your own release.** Record a fingerprint for every file you ship, then check them later on any machine:

```bash
btk hash ./dist -r > SHA256SUMS
btk hash check SHA256SUMS
```

`check` marks each file ✔ or ✖ and exits 1 if one changed or went missing. `SHA256SUMS` uses the standard format, so people without btk can run `sha256sum -c SHA256SUMS` instead.

**See whether two files are the same.** Hash both and compare the lines. Identical fingerprints mean identical contents, whatever the file names or dates say:

```bash
btk hash old/logo.png new/logo.png
```

**Fill in a `<script integrity>` value.** Subresource integrity needs a base64 SHA-384. Print it, or check an existing one:

```bash
btk hash sha384 -e base64 app.js
btk hash verify app.js sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC
```

**Sign or check a webhook payload.** Services like GitHub and Stripe sign each request with an HMAC of the body. Compute the same value to compare it with the signature header:

```bash
btk hash sha256 --hmac-key "$WEBHOOK_SECRET" payload.json
```

**Build cache keys or find duplicates quickly.** When tampering isn't a concern, a fast hash like `xxhash3` or `crc32` is enough and much quicker on large folders:

```bash
btk hash xxhash3 ./assets -r
```


## Output

Digests go to stdout in the same `<hash>  <file>` format as `sha256sum`, one line per input, so you can redirect them into a checksums file that `sha256sum -c`, `shasum -c` and `btk hash check` all accept. Paths are relative to the working directory, and standard input shows as `-`.

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
- `-` reads standard input. With no inputs at all, btk reads standard input when something is piped in, and exits 2 with a hint when you are at a terminal.
- If the first input is an algorithm name, such as `btk hash md5 a.txt`, it sets the algorithm. A file with that exact name wins, so `btk hash md5` hashes a file called `md5` when one exists.

## Algorithms

| Kind | Algorithms |
| --- | --- |
| Cryptographic | sha256, sha512, sha384, sha224, sha1, md5, sha512-256, sha512-224, sha3-256, sha3-512, sha3-384, sha3-224, blake2b256, blake2b512, blake2s256, shake128, shake256, ripemd160, md4 |
| Fast | crc32, adler32, xxhash3, xxhash64, xxhash32, wyhash, rapidhash, cityhash64, cityhash32, murmur64v2, murmur32v3, murmur32v2 |

Cryptographic hashes and crc32 stream the file in chunks, so file size doesn't matter. The other fast hashes read the whole file into memory first because Bun computes them in one call. Fast hashes suit caching and deduplication. Use a cryptographic hash to check downloads, because anyone can craft a file with a chosen fast hash.

Fast hashes print as big-endian hex, the same as `printf "%08x"` and `%016x`, so `crc32` of `hello` is `3610a686`.

## Options

| Flag | Config key | Default |
| --- | --- | --- |
| `-a, --algorithm <name>` | `algorithm` | `sha256` |
| `-e, --encoding <hex\|base64\|base64url>` | `encoding` | `hex` |
| `--hmac-key <key>` | | none; cryptographic algorithms only |
| `-r, --recursive` | `recursive` | `false` |

You can also set the config keys with `BTK_HASH_ALGORITHM`, `BTK_HASH_ENCODING` and `BTK_HASH_RECURSIVE`. btk has no config key for the HMAC key, so a secret never ends up in a committed config file. Pass it with `--hmac-key "$KEY"` from an environment variable instead.

## verify

`btk hash verify <file> <expected>` hashes one file (or `-` for standard input) and compares it with the expected value. It exits 0 on a match and 1 on a mismatch or an unreadable file.

The expected value can be hex, base64, or an SRI string such as `sha384-oqVu…`, the format used in `<script integrity>`. btk picks the algorithm in this order:

1. `--algorithm`
2. the SRI prefix
3. your configured algorithm, if its digest has the right length
4. the most common algorithm of that length: sha256 for 32 bytes, sha512 for 64, sha1 for 20, md5 for 16, sha384 for 48, sha224 for 28, crc32 for 4, xxhash64 for 8

The output says when it guessed. A 32-byte hash made with sha3-256 then needs `--algorithm sha3-256`.

## check

`btk hash check <sums-file>` verifies every line of a checksums file. It reads the `sha256sum` format (`<hash>  <file>`, or `<hash> *<file>` for binary mode) and the BSD format (`SHA256 (file) = <hash>`), and ignores blank lines and lines starting with `#`. It resolves paths against the checksums file's folder, so `btk hash check dist/SHA256SUMS` works from anywhere. The algorithm comes from `--algorithm`, the BSD tag, or the hash length, as with `verify`. It exits 1 when any file doesn't match or can't be read.

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
