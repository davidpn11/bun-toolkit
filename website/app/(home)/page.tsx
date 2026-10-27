import banner from "@docs/assets/btk-banner.png";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { bunVersion, type DocPage, docsRoute, repoUrl, toolPages, urlOf, version } from "@/lib/pages";

type Highlight = { title: string; body: ReactNode };

const highlights: Highlight[] = [
  {
    title: "Your defaults, everywhere",
    body: (
      <>
        Set your preferences once in <code>~/.bun-toolkit</code> and they follow you into every project. Each
        repo can fine-tune them in <code>btk.config.ts</code>, and a flag always has the final say.
      </>
    ),
  },
  {
    title: "Ready in seconds",
    body: (
      <>
        One binary, with no runtime to install next to it. <code>btk init</code> writes a typed config for
        you, and every command explains itself with <code>--help</code>.
      </>
    ),
  },
  {
    title: "At home anywhere",
    body: "Rich output in your terminal, clean text in CI, and structured JSON for scripts and agents, all from the same command.",
  },
];

const brewInstall = [
  "brew tap davidpn11/bun-toolkit https://github.com/davidpn11/bun-toolkit",
  "brew install davidpn11/bun-toolkit/bun-toolkit",
];

const binaryInstall = [
  `curl -fsSLO ${repoUrl}/releases/latest/download/btk-darwin-arm64 &&`,
  `curl -fsSLO ${repoUrl}/releases/latest/download/SHA256SUMS &&`,
  "grep btk-darwin-arm64 SHA256SUMS | if command -v sha256sum >/dev/null; then sha256sum -c -; else shasum -a 256 -c; fi &&",
  "chmod +x btk-darwin-arm64 && sudo mv btk-darwin-arm64 /usr/local/bin/btk",
];

const windowsInstall = [
  "& {",
  '  $ErrorActionPreference = "Stop"; $ProgressPreference = "SilentlyContinue"',
  '  $dir = "$env:LOCALAPPDATA\\Programs\\btk"; New-Item -ItemType Directory -Force $dir | Out-Null',
  `  Invoke-WebRequest ${repoUrl}/releases/latest/download/btk-windows-x64.exe -OutFile btk-windows-x64.exe`,
  `  Invoke-WebRequest ${repoUrl}/releases/latest/download/SHA256SUMS -OutFile SHA256SUMS`,
  '  $want = (Select-String -SimpleMatch btk-windows-x64.exe SHA256SUMS).Line.Split(" ")[0]',
  '  if ((Get-FileHash btk-windows-x64.exe).Hash -ne $want) { throw "Checksum mismatch" }',
  '  Move-Item -Force btk-windows-x64.exe "$dir\\btk.exe"',
  '  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Environment")',
  '  $entries = @($key.GetValue("Path", "", "DoNotExpandEnvironmentNames").Split(";") | Where-Object { $_ })',
  "  if ($entries -notcontains $dir) {",
  '    $key.SetValue("Path", ($entries + $dir) -join ";", "ExpandString")',
  "    # Removing an unset variable makes Windows tell open apps that PATH changed",
  '    [Environment]::SetEnvironmentVariable("BTK_INSTALL", $null, "User")',
  "  }",
  "}",
];

const chip = "rounded-full border px-3 py-1 text-sm text-fd-muted-foreground hover:border-fd-primary";

function Hero() {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <Image src={banner} alt="The btk mascot, a bun in a hardhat, next to the btk dashboard" priority />
      <div className="flex flex-wrap justify-center gap-2">
        <a href={`${repoUrl}/releases/tag/v${version}`} className={chip}>
          Latest <span className="font-medium text-fd-primary">v{version}</span>
        </a>
        <Link href={`${docsRoute}#bun-version`} className={chip}>
          Built on <span className="font-medium text-fd-primary">Bun {bunVersion}</span>
        </Link>
      </div>
      <h1 className="text-4xl font-bold">
        Bun native APIs, straight in your <span className="text-fd-primary">terminal</span>.
      </h1>
      <p className="max-w-2xl text-fd-muted-foreground">
        A modern toolkit for images, hashes, data formats, passwords, compression, markdown and local servers.
        Set your defaults once, fine-tune them per project, and take it anywhere as a single binary.
      </p>
      <div className="flex gap-3">
        <Link href={docsRoute} className="rounded-full bg-fd-primary px-5 py-2 font-medium text-white">
          Get started
        </Link>
        <a
          href="https://github.com/davidpn11/bun-toolkit"
          className="rounded-full border px-5 py-2 font-medium"
        >
          GitHub
        </a>
      </div>
    </section>
  );
}

function Commands({ lines, prompt = "$ " }: { lines: string[]; prompt?: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border bg-fd-card p-4 text-sm">
      {lines.map((line, i) => (
        <div key={line}>
          <span className="text-fd-primary select-none">{lines[i - 1]?.endsWith("&&") ? "  " : prompt}</span>
          {line}
        </div>
      ))}
    </pre>
  );
}

function Install() {
  return (
    <Tabs items={["Homebrew", "Standalone binary", "Windows"]} className="w-full max-w-2xl">
      <Tab value="Homebrew">
        <Commands lines={brewInstall} />
      </Tab>
      <Tab value="Standalone binary">
        <Commands lines={binaryInstall} />
        <p className="mt-3 text-sm text-fd-muted-foreground">
          On another platform? Swap in <code>darwin-x64</code>, <code>linux-x64</code> or{" "}
          <code>linux-arm64</code>.{" "}
          <Link href={`${docsRoute}#download-a-binary`} className="text-fd-primary hover:underline">
            Full instructions
          </Link>
        </p>
      </Tab>
      <Tab value="Windows">
        <Commands lines={windowsInstall} prompt="" />
        <p className="mt-3 text-sm text-fd-muted-foreground">
          Paste it into PowerShell, then open a new terminal so <code>btk</code> is on your PATH.
        </p>
      </Tab>
    </Tabs>
  );
}

function Highlights() {
  return (
    <section className="grid w-full gap-6 sm:grid-cols-3">
      {highlights.map((highlight) => (
        <div key={highlight.title}>
          <h2 className="font-semibold">{highlight.title}</h2>
          <p className="mt-2 text-sm text-fd-muted-foreground">{highlight.body}</p>
        </div>
      ))}
    </section>
  );
}

function ToolCard({ tool }: { tool: DocPage }) {
  return (
    <Link
      href={urlOf(tool.file)}
      className="rounded-xl border bg-fd-card p-4 transition-colors hover:border-fd-primary"
    >
      <code className="font-semibold text-fd-primary">btk {tool.title}</code>
      <p className="mt-1 text-sm text-fd-muted-foreground">{tool.description}</p>
    </Link>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 px-4 py-16">
      <Hero />
      <Install />
      <Highlights />
      <section className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {toolPages.map((tool) => (
          <ToolCard key={tool.file} tool={tool} />
        ))}
      </section>
    </main>
  );
}
