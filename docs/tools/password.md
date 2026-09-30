# btk password

Hash and check passwords with `Bun.password`, using argon2id, argon2i, argon2d or bcrypt. Every hash gets its own random salt, and the salt and settings are stored inside the hash itself.

```bash
btk password hash                                  # type it twice at a hidden prompt
echo "$PASSWORD" | btk password hash               # from a pipe
btk password hash --algorithm bcrypt --cost 12
cat passwords.txt | btk password hash > hashes.txt # one hash per line
btk password verify "$HASH"                        # type the password, exits 1 if it doesn't match
btk password inspect "$HASH"                       # algorithm, cost, and whether it needs a rehash
btk password --ui                                  # dashboard
```

`btk password <passwords>` is `btk password hash <passwords>`. `btk pw` works too.

## When to use it

A password hash lets you store a password without storing the password. You keep the hash, and later check whether a typed password produces a match. Unlike `btk hash`, these algorithms are deliberately slow and salted, so a leaked database can't be reversed quickly.

**Seed a database with test users.** Generate hashes for known test passwords, then paste them into a seed file or SQL insert:

```bash
printf 'admin123\nuser123\n' | btk password hash
```

Each line of input becomes one hash on stdout, in the same order.

**Check a login you're debugging.** You have a hash from the database and a password a user says doesn't work. Check whether they match without writing any code:

```bash
btk password verify '$argon2id$v=19$m=65536,t=2,p=1$…'
```

btk asks for the password at a hidden prompt and exits 0 on a match, 1 on a mismatch.

**Reset an account by hand.** Hash a new password and update the row directly. Typing at the prompt keeps the password out of your shell history:

```bash
btk password hash
```

**See which hashes need an upgrade.** Old accounts may have hashes made with weaker settings, such as less memory or bcrypt from years ago. `inspect` shows the algorithm and cost, and compares them with your current settings:

```bash
btk password inspect '$2b$10$…'
```

When it says the hash is weaker, rehash that password the next time the user logs in successfully.

**Match another system's settings.** When migrating to or from another framework, hash with the same algorithm and cost it uses, such as `--algorithm bcrypt --cost 12` for a Rails or Laravel app, so both systems accept the hashes.

## Where the password comes from

btk takes the password from the first of these that applies:

1. Arguments, as in `btk password hash hunter2`. This works, but the password stays in your shell history, so btk prints a warning in a terminal.
2. Standard input, one password per line. Empty lines are skipped, and each remaining line is hashed. `verify` takes a single line.
3. A hidden prompt, when you're at a terminal and nothing is piped in. `hash` asks twice and fails if the two don't match. The prompt draws on stderr, so `btk password hash > hash.txt` still prompts normally and writes only the hash.

Only the hashes go to stdout. The header and warnings go to stderr, and the JSON output never contains the password.

## Settings

| Flag | Config key | Default |
| --- | --- | --- |
| `-a, --algorithm <argon2id\|argon2i\|argon2d\|bcrypt>` | `algorithm` | `argon2id` |
| `--memory-cost <KiB>` | `memoryCost` | `65536` (64 MiB, Bun's default) |
| `--time-cost <n>` | `timeCost` | `2` |
| `--cost <4-31>` | `cost` | `10` (bcrypt only) |

argon2id is the right choice unless another system dictates otherwise. It is the current OWASP recommendation. The memory and time costs apply to the argon2 variants, and `cost` applies to bcrypt, where each step doubles the time. Raise them until one hash takes about as long as you're willing to make a login wait. `btk password hash` prints the settings it used on stderr.

bcrypt only looks at the first 72 bytes of a password in most implementations. Bun hashes longer passwords first, so every byte counts. Other bcrypt libraries may not do this, which matters when another system has to verify the hash.

Config keys can also be set with `BTK_PASSWORD_<KEY>`, such as `BTK_PASSWORD_ALGORITHM=bcrypt`.

## verify and inspect

`btk password verify <hash> [password]` checks one password. It exits 0 on a match and 1 on a mismatch. When the password matches but the hash is weaker than your current settings, it says so and suggests a rehash. It accepts argon2 hashes (`$argon2id$…`, `$argon2i$…`, `$argon2d$…`) and bcrypt hashes (`$2a$`, `$2b$`, `$2y$`). Anything else exits 2.

`btk password inspect <hash>` shows the algorithm and its parameters, and lists every way the hash is weaker than your current settings.

## Exit codes

| Code | When |
| --- | --- |
| 0 | Hashed, or the password matched |
| 1 | The password didn't match |
| 2 | No password, an empty password, two prompts that differed, or a hash btk can't read |
| 78 | Invalid `tools.password` config |

## Dashboard (`btk password --ui`)

1. Hash a password. Type it into a masked field and press `enter` to see the hash.
2. Check a password. Paste the stored hash, then type the password. You can try several passwords against the same hash.
3. Inspect a hash. Paste a hash to see its algorithm, cost, and whether it's weaker than your settings.

While a field has focus, every key goes into it, including `q` and `?`. `esc` still goes back.
