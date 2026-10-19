import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { repoUrl } from "./pages";

export const baseOptions: BaseLayoutProps = {
  nav: { title: <span className="font-semibold text-fd-primary">btk</span> },
  githubUrl: repoUrl,
};
