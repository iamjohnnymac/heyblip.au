import type { Metadata } from "next";
import MvpStabilizationClient from "./MvpStabilizationClient";

const TITLE = "MVP Stabilization Playbook";
const DESCRIPTION =
  "A one-ticket recovery loop for stabilizing HeyBlip's text-core MVP with Jira as the source of truth, simulator checks where possible, and real-phone verification where required.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/mvp-stabilization" },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/mvp-stabilization",
    type: "article",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Page() {
  return <MvpStabilizationClient />;
}
