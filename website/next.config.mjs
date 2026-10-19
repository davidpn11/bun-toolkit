import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  // The content lives in ../docs, outside this folder.
  turbopack: { root: fileURLToPath(new URL("..", import.meta.url)) },
};

export default withMDX(config);
