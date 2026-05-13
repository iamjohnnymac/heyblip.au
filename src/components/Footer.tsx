"use client";

import Image from "next/image";
import Link from "next/link";
import { useTheme } from "./ThemeProvider";

export default function Footer() {
  const { resolved } = useTheme();

  return (
    <footer className="border-t border-[var(--border)] py-14 sm:py-16 md:py-20 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-[1.25fr_0.85fr_0.85fr_1.05fr] gap-8 md:gap-12 lg:gap-14 mb-14 md:mb-20">
          <div>
            <Link href="/" aria-label="Blip home" className="inline-block mb-6">
              <Image
                src={resolved === "light" ? "/Blipblacklogo.png" : "/Blipwhitelogo.png"}
                alt="Blip"
                width={400}
                height={160}
                className="h-20 md:h-24 w-auto"
              />
            </Link>
            <p className="text-sm md:text-[15px] text-[var(--muted)] leading-relaxed md:leading-[1.7]">
              Bluetooth mesh chat for crowded events. Made in Australia.
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)] font-semibold mb-4 md:mb-5">
              Product
            </p>
            <ul className="space-y-2.5 md:space-y-3">
              <li><Link href="/#features" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">Features</Link></li>
              <li><Link href="/download" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">Download</Link></li>
              <li><Link href="/#how-it-works" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">How it works</Link></li>
              <li><Link href="/organisers" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">Organisers</Link></li>
              <li><Link href="/tech" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">Tech Specs</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)] font-semibold mb-4 md:mb-5">
              Legal
            </p>
            <ul className="space-y-2.5 md:space-y-3">
              <li><Link href="/privacy" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">Terms of Service</Link></li>
              <li><Link href="/acceptable-use" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">Acceptable Use</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)] font-semibold mb-4 md:mb-5">
              Contact
            </p>
            <ul className="space-y-3 md:space-y-3.5">
              <li>
                <span className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">General</span>
                <a href="mailto:hello@heyblip.au" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">hello@heyblip.au</a>
              </li>
              <li>
                <span className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Support</span>
                <a href="mailto:support@heyblip.au" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">support@heyblip.au</a>
              </li>
              <li>
                <span className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Billing</span>
                <a href="mailto:billing@heyblip.au" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">billing@heyblip.au</a>
              </li>
              <li>
                <span className="block text-xs uppercase tracking-[0.12em] text-[var(--muted)]">Legal, privacy, abuse</span>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <a href="mailto:legal@heyblip.au" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">legal</a>
                  <a href="mailto:privacy@heyblip.au" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">privacy</a>
                  <a href="mailto:abuse@heyblip.au" className="text-sm md:text-[15px] text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200">abuse</a>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div className="section-divider mb-8 md:mb-10" />

        <div className="text-center">
          <p className="text-xs md:text-sm text-[var(--muted)]">
            &copy; {new Date().getFullYear()} HeyBlip. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
