import { DocsBody, DocsPage } from "fumadocs-ui/layouts/docs/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { githubUrlOf } from "@/lib/pages";
import { source } from "@/lib/source";

type Props = PageProps<"/docs/[[...slug]]">;

async function pageFor(props: Props) {
  const { slug } = await props.params;
  return source.getPage(slug) ?? notFound();
}

export default async function Page(props: Props) {
  const page = await pageFor(props);
  const Body = page.data.body;
  return (
    <DocsPage toc={page.data.toc}>
      <DocsBody>
        <Body components={defaultMdxComponents} />
      </DocsBody>
      <a href={githubUrlOf(page.path)} className="text-sm text-fd-muted-foreground hover:text-fd-primary">
        View this page on GitHub
      </a>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const page = await pageFor(props);
  return { title: page.data.title, description: page.data.description };
}
