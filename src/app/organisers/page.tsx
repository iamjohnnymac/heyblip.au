import type { Metadata } from "next";
import { SOCIAL_IMAGE } from "@/lib/seo";
import OrganisersClient from "./OrganisersClient";

const TITLE = "For Organisers — Mesh Comms for Festivals & Events";
const DESCRIPTION =
  "Running a festival, concert, ultra marathon, or sporting event? Apply to partner with Blip and give your attendees reliable comms when mobile reception collapses. End-to-end encrypted Bluetooth mesh, built for crowds of 100,000+.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/organisers" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/organisers",
    type: "website",
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
  return <OrganisersClient />;
}
