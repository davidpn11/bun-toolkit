import type { Node, Root } from "fumadocs-core/page-tree";
import pkg from "../../package.json" with { type: "json" };

export type DocPage = { file: string; title: string; description: string };
export type Section = { title: string; pages: DocPage[] };

export const docsRoute = "/docs";
export const repoUrl = "https://github.com/davidpn11/bun-toolkit";
export const bunVersion = pkg.packageManager.replace(/^bun@/, "");
export const version = pkg.version;

const indexFile = "getting-started.md";

const guidePages: DocPage[] = [
  { file: indexFile, title: "Getting started", description: "Install btk and run your first commands." },
  {
    file: "config.md",
    title: "Configuration",
    description: "Global and project config, env vars and precedence.",
  },
  {
    file: "visual-language.md",
    title: "Output modes",
    description: "Human, CI and JSON output, colors and exit codes.",
  },
  { file: "plugins.md", title: "Plugins and themes", description: "Hooks, themes and how plugins load." },
];

export const toolPages: DocPage[] = [
  {
    file: "tools/image.md",
    title: "image",
    description: "Convert, resize and inspect images with Bun.Image.",
  },
  { file: "tools/hash.md", title: "hash", description: "Hash and verify files, SRI and HMAC." },
  {
    file: "tools/convert.md",
    title: "convert",
    description: "Convert between JSON, YAML, TOML, XML and more.",
  },
  {
    file: "tools/password.md",
    title: "password",
    description: "Hash, verify and inspect argon2 and bcrypt hashes.",
  },
  {
    file: "tools/compress.md",
    title: "compress",
    description: "gzip, zstd, brotli, deflate and folder archives.",
  },
  { file: "tools/md.md", title: "md", description: "Preview and render markdown with Bun.markdown." },
  { file: "tools/serve.md", title: "serve", description: "Serve a folder over HTTP with live reload." },
];

export const sections: Section[] = [
  { title: "Guide", pages: guidePages },
  { title: "Tools", pages: toolPages },
  {
    title: "Project",
    pages: [
      {
        file: "roadmap-summary.md",
        title: "Roadmap",
        description: "Where btk is today and what comes next.",
      },
    ],
  },
];

const pages = sections.flatMap((section) => section.pages);

export function findPage(file: string): DocPage | undefined {
  return pages.find((page) => page.file === file);
}

export function slugsOf(file: string): string[] {
  return file === indexFile ? [] : file.replace(/\.md$/, "").split("/");
}

export function urlOf(file: string): string {
  return [docsRoute, ...slugsOf(file)].join("/");
}

export function githubUrlOf(file: string): string {
  return `${repoUrl}/blob/master/docs/${file}`;
}

function sectionNodes(section: Section): Node[] {
  const items: Node[] = section.pages.map((page) => ({
    type: "page",
    name: page.title,
    url: urlOf(page.file),
  }));
  return [{ type: "separator", name: section.title }, ...items];
}

export function pageTree(): Root {
  return { name: "btk", children: sections.flatMap(sectionNodes) };
}
