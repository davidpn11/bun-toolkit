import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Provider } from "@/components/provider";
import "./global.css";

const inter = Inter({ subsets: ["latin"] });

const searchHighlight =
  "::highlight(fd-search) { color: var(--color-fd-primary); text-decoration-line: underline; }";

export const metadata: Metadata = {
  metadataBase: new URL("https://bun-toolkit.davidpn.com"),
  title: { default: "bun-toolkit", template: "%s · bun-toolkit" },
  description:
    "Bun native APIs straight in your terminal. A modern, configurable CLI that ships as a single binary.",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <style>{searchHighlight}</style>
      </head>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
