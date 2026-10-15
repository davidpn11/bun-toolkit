import banner from "@docs/assets/btk-banner.png";
import Image from "next/image";
import Link from "next/link";
import { type DocPage, docsRoute, toolPages, urlOf } from "@/lib/pages";

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
        One CLI, one config, one output style, live previews in your browser, and interactive dashboards.
        Ships as a single binary, so it needs neither Bun nor Node.
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
      <section className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {toolPages.map((tool) => (
          <ToolCard key={tool.file} tool={tool} />
        ))}
      </section>
    </main>
  );
}
