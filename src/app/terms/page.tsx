import type { Metadata } from "next";
import { SOCIAL_IMAGE } from "@/lib/seo";
import TermsClient from "./TermsClient";

const TITLE = "Terms of Service — Blip";
const DESCRIPTION =
  "The terms that govern your use of Blip, the Bluetooth mesh chat app for festivals and events. Covers account rules, acceptable use, liability, and the limitations of a peer-to-peer mesh network.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/terms",
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
  return <TermsClient />;
}
