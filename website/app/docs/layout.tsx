import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout";
import { pageTree } from "@/lib/pages";

export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <DocsLayout tree={pageTree()} {...baseOptions}>
      {children}
    </DocsLayout>
  );
}
