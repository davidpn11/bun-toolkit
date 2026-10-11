# btk password

Hash and check passwords with `Bun.password`, using argon2id, argon2i, argon2d or bcrypt. Every hash gets its own random salt, and the hash itself stores the salt and the settings.

## Commands

| Command | What it does |
| --- | --- |
| `btk password [password...]` | Hash passwords. Short for `btk password hash`. `btk pw` works too |
| `btk password verify <hash> [password]` | Check a password against a stored hash |
| `btk password inspect <hash>` | Show a hash's algorithm and cost, and whether it is weaker than your settings |
| `btk password --ui` | Open the dashboard |

The examples below use the password `hunter2` and these two hashes of it:

```bash
ARGON='$argon2id$v=19$m=65536,t=2,p=1$4yoS0cIxY+xqALTxd2IjrsgdVXSXFlbhHl5WIrxfnZU$RUEWincwBxq/gWjDBaVcF1HGSh0EShyk5jWi58N5LnI'
BCRYPT='$2b$10$sQZvDNu65lGgRJbJp0EkYOy3zzVpBXHKj7RlLzoRoQ3aRJoeuSkFu'
```

Keep the single quotes. Inside double quotes the shell would expand `$argon2id` and `$2b` as variables.

### hash

`btk password hash` prints one hash per password on stdout. Hashing the same password twice gives two different hashes, because each one gets a new salt.

```bash
btk password hash                                  # type it twice at a hidden prompt
echo hunter2 | btk password hash                   # from a pipe
printf 'admin123\nuser123\n' | btk password hash   # one hash per line, in order
echo hunter2 | btk password hash -a bcrypt --cost 12
btk password hash > hash.txt                       # the prompt still works; only the hash is written
```

### verify

`btk password verify <hash> [password]` checks one password. It exits 0 on a match and 1 on a mismatch, so you can use it in scripts. Without a password argument it reads one line from standard input, or asks at a hidden prompt.

```bash
echo hunter2 | btk password verify "$ARGON"        # ✔ The password matches (argon2id)
echo wrong | btk password verify "$ARGON"          # ✖ The password does not match, exit 1
btk password verify "$BCRYPT"                      # type the password at a hidden prompt
```

When the password matches but the hash is weaker than your current settings, btk says so and suggests a rehash. It accepts argon2 hashes (`$argon2id$`, `$argon2i$`, `$argon2d$`) and bcrypt hashes (`$2a$`, `$2b$`, `$2y$`). Anything else exits 2.

### inspect

`btk password inspect <hash>` shows the algorithm and its parameters, and lists every way the hash is weaker than your current settings. It never needs the password.

```bash
btk password inspect "$ARGON"
btk password inspect "$BCRYPT"
```

With the default settings the first prints `✔ As strong as your settings or stronger`. The second warns `uses bcrypt, your settings use argon2id`.

## When to use it

A password hash lets you store a password without storing the password. You keep the hash, and later check whether a typed password produces a match. Unlike `btk hash`, these algorithms are slow on purpose and salted, so nobody can reverse a leaked database quickly.

**Seed a database with test users.** Generate hashes for known test passwords, then paste them into a seed file or SQL insert:

```bash
printf 'admin123\nuser123\n' | btk password hash
```

**Check a login you're debugging.** You have a hash from the database and a password a user says doesn't work. Check whether they match without writing any code:

```bash
btk password verify "$HASH"
```

btk asks for the password at a hidden prompt and exits 0 on a match, 1 on a mismatch.

**Reset an account by hand.** Hash a new password and update the row directly. Typing at the prompt keeps the password out of your shell history:

```bash
btk password hash
```

**See which hashes need an upgrade.** Old accounts may have hashes made with weaker settings, such as less memory, or bcrypt from years ago. `inspect` shows the algorithm and cost and compares them with your current settings:

```bash
btk password inspect "$HASH"
```

When it says the hash is weaker, rehash that password the next time the user logs in successfully.

**Match another system's settings.** When migrating to or from another framework, hash with the algorithm and cost it uses, so both systems accept the hashes. For a Rails or Laravel app that uses bcrypt with cost 12:

```bash
btk password hash --algorithm bcrypt --cost 12
```

## Where the password comes from

btk takes the password from the first of these that applies:

1. Arguments, as in `btk password hash hunter2`. This works, but the password stays in your shell history, so btk prints a warning in a terminal.
2. Standard input, one password per line. btk skips empty lines and hashes each remaining line. `verify` takes a single line.
3. A hidden prompt, when you're at a terminal and nothing is piped in. `hash` asks twice and fails if the two don't match. The prompt draws on stderr, so `btk password hash > hash.txt` still prompts normally and writes only the hash.

Only the hashes go to stdout. The header and warnings go to stderr, and the JSON output never contains the password.

## Settings

| Flag | Config key | Default |
| --- | --- | --- |
| `-a, --algorithm <argon2id\|argon2i\|argon2d\|bcrypt>` | `algorithm` | `argon2id` |
| `--memory-cost <KiB>` | `memoryCost` | `65536` (64 MiB, Bun's default) |
| `--time-cost <1-100>` | `timeCost` | `2` |
| `--cost <4-31>` | `cost` | `10` (bcrypt only) |

Use argon2id unless another system dictates otherwise. It is the current OWASP recommendation. The memory and time costs apply to the argon2 variants, and `cost` applies to bcrypt, where each step doubles the time. Raise them until one hash takes about as long as you're willing to make a login wait. `btk password hash` prints the settings it used on stderr.

Most bcrypt implementations only look at the first 72 bytes of a password. Bun hashes longer passwords first, so every byte counts. Other bcrypt libraries may not do this, which matters when another system has to verify the hash.

`verify` and `inspect` compare a hash against these same settings.

Config keys can also be set with `BTK_PASSWORD_<KEY>`, such as `BTK_PASSWORD_ALGORITHM=bcrypt`.

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
