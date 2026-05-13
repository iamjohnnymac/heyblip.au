import type { Metadata } from "next";
import { SOCIAL_IMAGE } from "@/lib/seo";
import PrivacyClient from "./PrivacyClient";

const TITLE = "Privacy Policy — Blip";
const DESCRIPTION =
  "How Blip handles your data. End-to-end encrypted messages, no tracking, no ads, no data selling. We store only email, username, cryptographic public keys, and push tokens — nothing else.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/privacy",
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
  return <PrivacyClient />;
}
