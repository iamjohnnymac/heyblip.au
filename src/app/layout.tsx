import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import ThemeProvider from "@/components/ThemeProvider";
import { SOCIAL_IMAGE } from "@/lib/seo";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const SITE_URL = "https://heyblip.au";
const SITE_NAME = "Blip";
const TITLE = "Blip — Mesh Chat for Festivals | Offline Messaging, No Signal Needed";
const DESCRIPTION =
  "Stay connected with your crew at festivals, concerts, and crowded events — no Wi-Fi or mobile signal required. Blip uses end-to-end encrypted Bluetooth mesh to relay messages, voice notes, photos, and SOS alerts through the crowd. iPhone only.";

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: "%s | Blip",
  },
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  keywords: [
    "mesh chat app",
    "bluetooth mesh messenger",
    "offline chat app",
    "festival chat app",
    "festival messenger",
    "chat without internet",
    "messaging no signal",
    "offline messaging",
    "emergency SOS app",
    "end-to-end encrypted messenger",
    "iPhone mesh chat",
    "BLE mesh messaging",
  ],
  authors: [{ name: "Blip" }],
  creator: "Blip",
  publisher: "Blip",
  category: "Communication",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_AU",
    type: "website",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
  },
};

const jsonLdOrganization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Blip",
  url: SITE_URL,
  logo: `${SITE_URL}/Blipwhitelogo.png`,
  sameAs: [] as string[],
  contactPoint: [
    {
      "@type": "ContactPoint",
      email: "hello@heyblip.au",
      contactType: "general enquiries",
      availableLanguage: ["en"],
    },
    {
      "@type": "ContactPoint",
      email: "support@heyblip.au",
      contactType: "customer support",
      availableLanguage: ["en"],
    },
    {
      "@type": "ContactPoint",
      email: "billing@heyblip.au",
      contactType: "billing support",
      availableLanguage: ["en"],
    },
    {
      "@type": "ContactPoint",
      email: "abuse@heyblip.au",
      contactType: "abuse reporting",
      availableLanguage: ["en"],
    },
    {
      "@type": "ContactPoint",
      email: "legal@heyblip.au",
      contactType: "legal",
      availableLanguage: ["en"],
    },
    {
      "@type": "ContactPoint",
      email: "privacy@heyblip.au",
      contactType: "privacy",
      availableLanguage: ["en"],
    },
  ],
};

const jsonLdWebsite = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: DESCRIPTION,
  inLanguage: "en-AU",
  publisher: {
    "@type": "Organization",
    name: "Blip",
    url: SITE_URL,
  },
};

const jsonLdSoftwareApplication = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "Blip",
  operatingSystem: "iOS",
  applicationCategory: "CommunicationApplication",
  description:
    "Bluetooth mesh chat app for festivals and events. Send messages, voice notes, photos, and SOS alerts without Wi-Fi or mobile signal. End-to-end encrypted peer-to-peer messaging via BLE mesh.",
  url: SITE_URL,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "AUD",
  },
  featureList: [
    "Works without Wi-Fi or mobile signal",
    "End-to-end encrypted messages (Noise XX + Ed25519)",
    "Voice notes, photos, and text messages",
    "Emergency SOS broadcast",
    "Email-based account setup, no phone numbers or ad tracking",
    "Automatic peer discovery",
    "Multi-hop mesh routing",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrganization) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebsite) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSoftwareApplication) }}
        />
      </head>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-jakarta)]">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
