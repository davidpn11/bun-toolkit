import banner from "@docs/assets/btk-banner.png";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { type DocPage, docsRoute, toolPages, urlOf } from "@/lib/pages";

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

const install = [
  "brew tap davidpn11/bun-toolkit https://github.com/davidpn11/bun-toolkit",
  "brew install davidpn11/bun-toolkit/bun-toolkit",
];

function Hero() {
  return (
    <section className="flex flex-col items-center gap-6 text-center">
      <Image src={banner} alt="The btk mascot, a bun in a hardhat, next to the btk dashboard" priority />
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

function Install() {
  return (
    <pre className="w-full max-w-2xl overflow-x-auto rounded-xl border bg-fd-card p-4 text-sm">
      {install.map((line) => (
        <div key={line}>
          <span className="text-fd-primary select-none">$ </span>
          {line}
        </div>
      ))}
    </pre>
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
