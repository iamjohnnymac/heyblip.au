"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/animations";
import Nav from "@/components/Nav";
import Breadcrumb from "@/components/Breadcrumb";
import Footer from "@/components/Footer";

export default function PrivacyClient() {
  return (
    <main className="mesh-gradient relative overflow-hidden">
      <Nav />
      <Breadcrumb items={[{ label: "Privacy Policy" }]} />
      <section className="pt-8 md:pt-10 pb-20 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="max-w-3xl mx-auto"
        >
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gradient mb-6">Privacy Policy</h1>
          <p className="text-sm text-[var(--muted)] mb-14">Last updated: April 2026</p>

          <div className="space-y-10 text-[var(--muted-strong)] text-[15px] leading-[1.8]">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Overview</h2>
              <p>Blip is a Bluetooth mesh chat app built for events — festivals, concerts, ultra marathons, and any high-density gathering where mobile reception is unreliable. Privacy is a core design principle. Your messages are end-to-end encrypted before they ever leave your device, and we collect only the minimum data needed to operate the service.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">What We Collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Email address</strong> — stored in plaintext. Used for account verification (via email code) and account recovery.</li>
                <li><strong>Username and display name</strong> — chosen by you during setup. Used to identify you to other users.</li>
                <li><strong>Avatar image</strong> — if you upload a profile photo, it is stored on our servers.</li>
                <li><strong>Cryptographic public keys</strong> — your Ed25519 signing key and Noise XX public key are uploaded to our server so other users can establish encrypted conversations with you.</li>
                <li><strong>APNs device token</strong> — provided by Apple when you enable push notifications. Stored server-side to deliver push notifications to your device.</li>
                <li><strong>JWT session tokens</strong> — issued by our authentication server to maintain your logged-in session. These are short-lived and refreshed automatically.</li>
                <li><strong>Approximate location</strong> — only when you actively opt in to Friend Finder. Location data is session-only and is not stored persistently on our servers.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">What We Don&apos;t Collect</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Message content</strong> — all direct messages are end-to-end encrypted using the Noise protocol (Noise_XX_25519_ChaChaPoly_SHA256). Group messages use AES-256-GCM sender key encryption. Our servers relay encrypted packets and cannot decrypt or read your messages.</li>
                <li><strong>Contacts or address book</strong> — we do not collect or access your contacts.</li>
                <li><strong>Precise location</strong> — we do not collect precise GPS data except during an active SOS alert, which is an emergency-only feature you must explicitly trigger.</li>
                <li><strong>Browsing history or usage analytics</strong> — we do not collect any browsing data and do not use any third-party analytics services, ad networks, or tracking pixels.</li>
                <li><strong>Device identifiers or advertising IDs</strong> — we do not collect IDFA, IDFV, or any device fingerprinting data.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">How We Use Your Data</h2>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Authentication</strong> — your email address is used to verify your identity during registration via a one-time verification code.</li>
                <li><strong>Encryption</strong> — your public keys are shared with other users so they can initiate end-to-end encrypted conversations with you.</li>
                <li><strong>Push notifications</strong> — your APNs device token is used solely to deliver notifications when you receive messages while the app is in the background.</li>
                <li><strong>Friend Finder</strong> — if you opt in, your approximate location is shared with your friends for the duration of your session only.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Bluetooth Mesh Relay</h2>
              <p>When your device relays messages for other users through the Bluetooth mesh network, those messages are encrypted before transmission. Your device cannot decrypt or read relayed messages. Relay participation is automatic and is a core part of how the mesh network functions — it does not expose any personal data.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Data Storage &amp; Security</h2>
              <p>Your messages and conversation history are stored locally on your device. Our backend infrastructure stores your account information (email, username, public keys, APNs token) in a Neon Postgres database. Backend services run on Cloudflare Workers at edge locations. All communication between your device and our servers is encrypted via TLS with certificate pinning. The WebSocket relay uses store-and-forward delivery for encrypted packets only — stored packets have a 1-hour TTL and are automatically cleaned up.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Third-Party Services</h2>
              <p>We use a limited number of third-party services to operate Blip. We do not sell or share your data with any third party for advertising or marketing purposes.</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li><strong>Cloudflare</strong> — hosts our backend workers (authentication, relay, and CDN). Data is processed on Cloudflare&apos;s edge network.</li>
                <li><strong>Neon</strong> — managed Postgres database that stores user account records and public keys.</li>
                <li><strong>Resend</strong> — sends transactional emails (verification codes). Receives your email address for delivery only.</li>
                <li><strong>Apple Push Notification service (APNs)</strong> — delivers push notifications to your device.</li>
                <li><strong>Sentry</strong> — crash reporting and performance monitoring. Collects anonymised diagnostic data only — no message content or personal identifiers.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Your Rights</h2>
              <p>You can delete your account and all associated server-side data at any time from the app settings. You may request a copy of the data we hold about you. Under Australian privacy law and, where applicable, the GDPR, you have the right to access, correct, or delete your personal data. For any privacy-related enquiries, contact us at <a href="mailto:privacy@heyblip.au" className="text-[var(--accent-light)] hover:text-[var(--foreground)] transition-colors">privacy@heyblip.au</a>.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Children&apos;s Privacy</h2>
              <p>Blip is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If we become aware that a user is under 13, we will promptly delete their account and associated data.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Changes to This Policy</h2>
              <p>We may update this policy from time to time. Material changes will be communicated via the app. Continued use of Blip after changes constitutes acceptance of the updated policy.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Contact</h2>
              <p>For privacy questions or data requests, email us at <a href="mailto:privacy@heyblip.au" className="text-[var(--accent-light)] hover:text-[var(--foreground)] transition-colors">privacy@heyblip.au</a>.</p>
            </div>
          </div>
        </motion.div>
      </section>
      <Footer />
    </main>
  );
}
