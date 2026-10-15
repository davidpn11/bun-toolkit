import { loader } from "fumadocs-core/source";
import { pageSchema } from "fumadocs-core/source/schema";
import { applyMdxPreset } from "fumadocs-mdx/config";
import { defineDocs } from "fumadocs-mdx/macro";
import { docFileOf } from "./docs-dir";
import { docsRoute, findPage, slugsOf } from "./pages";
import { remarkMdLinks } from "./remark-md-links";

function schemaFor(path: string) {
  const file = docFileOf(path);
  const page = findPage(file);
  if (!page) throw new Error(`docs/${file} is included but has no entry in website/lib/pages.ts`);
  return pageSchema.extend({
    title: pageSchema.shape.title.default(page.title),
    description: pageSchema.shape.description.default(page.description),
  });
}

const docs = defineDocs({
  dir: "../docs",
  docs: {
    files: ["getting-started.md", "config.md", "visual-language.md", "plugins.md", "tools/*.md"],
    schema: (ctx) => schemaFor(ctx.path),
    mdxOptions: applyMdxPreset({ remarkPlugins: (plugins) => [remarkMdLinks, ...plugins] }),
  },
});

export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  slugs: (file) => slugsOf(file.path),
});
