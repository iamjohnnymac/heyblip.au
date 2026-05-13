import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const LINK_HEADER = [
  '</sitemap.xml>; rel="sitemap"',
  '</download>; rel="alternate"',
  '</tech>; rel="service-doc"; type="text/html"',
  '</privacy>; rel="privacy-policy"',
  '</terms>; rel="terms-of-service"',
  '</terms>; rel="license"',
  '<mailto:support@heyblip.au>; rel="help"',
  '</>; rel="canonical"',
].join(", ");

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value: LINK_HEADER,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
