import type { Metadata } from "next";
import { SOCIAL_IMAGE } from "@/lib/seo";
import AcceptableUseClient from "./AcceptableUseClient";

const TITLE = "Acceptable Use Policy — Blip";
const DESCRIPTION =
  "What you can and can't do on Blip's mesh network. Zero tolerance for false SOS alerts, harassment, or illegal content. Clear rules designed to keep festival comms safe and trustworthy.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/acceptable-use" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/acceptable-use",
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
  return <AcceptableUseClient />;
}
