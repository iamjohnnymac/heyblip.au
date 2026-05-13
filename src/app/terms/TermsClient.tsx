"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/animations";
import Nav from "@/components/Nav";
import Breadcrumb from "@/components/Breadcrumb";
import Footer from "@/components/Footer";

export default function TermsClient() {
  return (
    <main className="mesh-gradient relative overflow-hidden">
      <Nav />
      <Breadcrumb items={[{ label: "Terms of Service" }]} />
      <section className="pt-8 md:pt-10 pb-20 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="max-w-3xl mx-auto"
        >
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gradient mb-6">Terms of Service</h1>
          <p className="text-sm text-[var(--muted)] mb-14">Last updated: April 2026</p>

          <div className="space-y-10 text-[var(--muted-strong)] text-[15px] leading-[1.8]">
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">1. Acceptance of Terms</h2>
              <p>By downloading, installing, or using the Blip app (&quot;Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the Service.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">2. Description of Service</h2>
              <p>Blip is a Bluetooth mesh chat application for iOS that enables peer-to-peer communication at events — festivals, concerts, sporting events, ultra marathons, and other high-density gatherings — where traditional cellular and Wi-Fi connectivity may be unavailable. The Service includes text messaging, voice notes, friend discovery, group chats, and emergency SOS alerts transmitted via Bluetooth Low Energy mesh networking and a WebSocket relay for off-mesh delivery.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">3. Eligibility</h2>
              <p>You must be at least 13 years of age to use Blip. By using the Service, you represent and warrant that you meet this age requirement. If you are under the age of 18, you confirm that you have reviewed these Terms with a parent or guardian.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">4. Your Account</h2>
              <p>To use Blip, you register with an email address and create a username. Your account is secured via Ed25519 challenge-response authentication and JWT session tokens. You are responsible for maintaining the security of your device and your account credentials. Your cryptographic keys are generated and stored locally on your device. If you lose access to your device without having backed up your keys, your encrypted message history may be unrecoverable.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">5. Acceptable Use</h2>
              <p>You agree to use Blip lawfully and respectfully. You must not:</p>
              <ul className="list-disc pl-5 space-y-2 mt-3">
                <li>Transmit illegal, threatening, abusive, defamatory, or harassing content.</li>
                <li>Impersonate another person or misrepresent your identity.</li>
                <li>Send false or fraudulent SOS alerts.</li>
                <li>Attempt to intercept, decrypt, or tamper with other users&apos; encrypted messages.</li>
                <li>Reverse-engineer, decompile, or disassemble any part of the app or mesh protocol for malicious purposes.</li>
                <li>Deliberately disrupt the Bluetooth mesh network or degrade the experience for other users.</li>
                <li>Use the Service for spam, automated messaging, or commercial solicitation.</li>
                <li>Violate any applicable local, state, national, or international law.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">6. Mesh Relay Participation</h2>
              <p>By using Blip, your device may automatically relay encrypted messages for other users through the Bluetooth mesh network. This is a core feature of the Service and is essential for mesh connectivity. Relayed messages are end-to-end encrypted — your device cannot decrypt or read them. Relay participation uses minimal battery and bandwidth.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">7. SOS Alerts</h2>
              <p>The SOS feature is designed for genuine emergencies at events. Misuse of SOS alerts — including sending false alerts — is a serious violation of these Terms and may result in immediate account suspension. Blip is not a substitute for emergency services. In a life-threatening emergency, always call 000 (Australia) or your local emergency number.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">8. Intellectual Property</h2>
              <p>The Blip app, its design, code, mesh protocol, and branding are owned by Blip and protected by intellectual property laws. You are granted a limited, non-exclusive, non-transferable licence to use the app for personal, non-commercial purposes. You retain ownership of any content you create and send through the Service.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">9. Account Termination</h2>
              <p>We may suspend or terminate your access to the Service at any time if you violate these Terms or engage in conduct that we reasonably believe is harmful to other users or the integrity of the mesh network. You may delete your account at any time through the app settings, which will remove your server-side data. Upon termination, your right to use the Service ceases immediately.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">10. Disclaimer of Warranties</h2>
              <p>The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind, whether express, implied, or statutory. We do not warrant that the Service will be uninterrupted, error-free, or secure. We do not guarantee message delivery, mesh connectivity, Bluetooth range, or relay availability. The performance of the mesh network depends on factors outside our control, including the number and proximity of nearby devices.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">11. Limitation of Liability</h2>
              <p>To the maximum extent permitted by Australian law, Blip and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Service. This includes, without limitation, damages for loss of data, loss of profits, or interruption of communications. Our total aggregate liability for any claim arising from or related to the Service shall not exceed AUD $50.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">12. Indemnification</h2>
              <p>You agree to indemnify and hold harmless Blip and its operators from any claims, damages, or expenses arising from your use of the Service, your violation of these Terms, or your violation of any rights of another user or third party.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">13. Changes to These Terms</h2>
              <p>We may update these Terms from time to time. Material changes will be communicated via the app or by email. Your continued use of the Service after changes take effect constitutes acceptance of the revised Terms. If you do not agree to the updated Terms, you should stop using the Service.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">14. Governing Law</h2>
              <p>These Terms are governed by and construed in accordance with the laws of the Commonwealth of Australia. Any dispute arising under or in connection with these Terms shall be subject to the exclusive jurisdiction of the courts of Australia. Nothing in these Terms excludes, restricts, or modifies any consumer guarantee, right, or remedy conferred by the Australian Consumer Law that cannot be excluded, restricted, or modified by agreement.</p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">15. Contact</h2>
              <p>For questions about these Terms, contact us at <a href="mailto:legal@heyblip.au" className="text-[var(--accent-light)] hover:text-[var(--foreground)] transition-colors">legal@heyblip.au</a>.</p>
            </div>
          </div>
        </motion.div>
      </section>
      <Footer />
    </main>
  );
}
