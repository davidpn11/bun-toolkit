# Getting started

`btk` puts the APIs built into Bun, such as `Bun.Image`, `Bun.CryptoHasher`, `Bun.YAML`, `Bun.password`, `Bun.markdown` and `Bun.serve`, behind one command. It ships as a single binary built on **Bun 1.4.3**, so it needs neither Bun nor Node on the machine that runs it.

## Install

### Homebrew

The GitHub repository is the tap. Add it once, then install:

```bash
brew tap davidpn11/bun-toolkit https://github.com/davidpn11/bun-toolkit
brew install davidpn11/bun-toolkit/bun-toolkit
```

Homebrew 5.1 and later refuse to load a formula from a tap you haven't trusted. If yours does, run the `brew trust` command it prints, then install again. Pre-releases install as `bun-toolkit-beta`.

### Download a binary

Every [release](https://github.com/davidpn11/bun-toolkit/releases) has binaries for macOS, Linux and Windows, plus a `SHA256SUMS` file:

```bash
curl -fsSLO https://github.com/davidpn11/bun-toolkit/releases/latest/download/btk-darwin-arm64 &&
curl -fsSLO https://github.com/davidpn11/bun-toolkit/releases/latest/download/SHA256SUMS &&
grep btk-darwin-arm64 SHA256SUMS | if command -v sha256sum >/dev/null; then sha256sum -c -; else shasum -a 256 -c; fi &&
chmod +x btk-darwin-arm64 && sudo mv btk-darwin-arm64 /usr/local/bin/btk
```

Replace `darwin-arm64` with `darwin-x64`, `linux-x64` or `linux-arm64`.

On Windows, paste this into PowerShell, then open a new terminal so `btk` is on your PATH:

```powershell
& {
  $ErrorActionPreference = "Stop"; $ProgressPreference = "SilentlyContinue"
  $dir = "$env:LOCALAPPDATA\Programs\btk"; New-Item -ItemType Directory -Force $dir | Out-Null
  Invoke-WebRequest https://github.com/davidpn11/bun-toolkit/releases/latest/download/btk-windows-x64.exe -OutFile btk-windows-x64.exe
  Invoke-WebRequest https://github.com/davidpn11/bun-toolkit/releases/latest/download/SHA256SUMS -OutFile SHA256SUMS
  $want = (Select-String -SimpleMatch btk-windows-x64.exe SHA256SUMS).Line.Split(" ")[0]
  if ((Get-FileHash btk-windows-x64.exe).Hash -ne $want) { throw "Checksum mismatch" }
  Move-Item -Force btk-windows-x64.exe "$dir\btk.exe"
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Environment")
  $entries = @($key.GetValue("Path", "", "DoNotExpandEnvironmentNames").Split(";") | Where-Object { $_ })
  if ($entries -notcontains $dir) {
    $key.SetValue("Path", ($entries + $dir) -join ";", "ExpandString")
    # Removing an unset variable makes Windows tell open apps that PATH changed
    [Environment]::SetEnvironmentVariable("BTK_INSTALL", $null, "User")
  }
}
```


### From source

Requires [Bun](https://bun.sh) 1.4.3, the version btk is built on.

```bash
git clone https://github.com/davidpn11/bun-toolkit && cd bun-toolkit
bun install
bun link
```

### Shell completion

Homebrew installs completion for zsh, bash and fish. Otherwise, add the line for your shell to its startup file:

```bash
source <(btk completion zsh)         # ~/.zshrc, after compinit
eval "$(btk completion bash)"        # ~/.bashrc
btk completion fish | source         # ~/.config/fish/config.fish
```

Tab completes tools, actions, flags, choices such as `--to` formats, and `btk md` theme names, including ones from your plugins.

## Bun version

btk is built on Bun and moves with it. Every release is built and tested on one exact Bun version, currently **Bun 1.4.3**. It is pinned once, as `packageManager` in `package.json`: CI installs that version, the website and `btk info` show it, and every changelog entry names it.

When Bun ships a new version, btk follows. We move to it, update these docs, adjust the commands whose behavior changed, and add commands for the APIs it brings. The binary carries its own Bun runtime, so upgrading btk is all you need to get there.

## Check the install

```bash
btk info
```

`btk info` prints the versions, the platform, the output mode and whether a config was found.

## Add a project config

```bash
btk init
```

This creates `btk.config.ts` in the current folder, where you set per-tool defaults for the project. `btk init --global` creates your personal defaults in `~/.bun-toolkit/` instead. See [Configuration](config.md).

## A first command per tool

```bash
btk image hero.png          # hero.webp next to it
btk hash package.json       # sha256, in sha256sum format
btk convert config.yaml     # JSON on stdout
btk password hash           # type it twice at a hidden prompt
btk compress ./dist --zstd  # dist.tar.zst
btk md README.md            # a live preview in the browser
btk serve dist              # serve a folder with live reload
btk ui                      # the dashboard
```

Every command takes `--help`, `--json`, `--verbose`, `--no-color` and `--config <path>`. Each tool has its own page: [image](tools/image.md), [hash](tools/hash.md), [convert](tools/convert.md), [password](tools/password.md), [compress](tools/compress.md), [md](tools/md.md) and [serve](tools/serve.md).

## Output modes

btk prints colors and progress in a terminal, plain text in CI or when piped, and a single JSON document with `--json` or `AGENT=true`. Data goes to stdout and logs to stderr, so pipes stay clean. See [Output modes](visual-language.md).
