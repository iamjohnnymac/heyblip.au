import type { Metadata } from "next";
import { SOCIAL_IMAGE } from "@/lib/seo";
import TechClient from "./TechClient";

const TITLE = "Technical Specs — Blip Mesh Protocol";
const DESCRIPTION =
  "How Blip works under the hood: Bluetooth Low Energy 5.0 mesh, Noise XX + Ed25519 encryption, adaptive gossip routing, 3-tier Bloom dedup, and 7-hop TTL designed for 100,000+ concurrent festival users.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tech" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/tech",
    type: "article",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
};

export default function Page() {
  return <TechClient />;
}
