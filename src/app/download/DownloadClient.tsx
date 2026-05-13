"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bluetooth, CheckCircle2, Mail } from "lucide-react";
import { motion } from "framer-motion";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { ease } from "@/lib/animations";

const checklist = [
  "iPhone with iOS 17 or newer",
  "Bluetooth enabled before you arrive",
  "Your crew installs Blip before the event",
];

export default function DownloadClient() {
  return (
    <main className="mesh-gradient relative overflow-hidden">
      <Nav />

      <section className="px-4 pb-20 pt-32 sm:px-6 md:pb-28 md:pt-40">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
          >
            <p className="eyebrow mb-5">iOS access</p>
            <h1 className="mb-6 text-5xl font-black leading-[0.9] tracking-[-0.045em] text-[var(--foreground)] sm:text-6xl lg:text-7xl">
              Get Blip ready before the gates open.
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-[var(--muted-strong)] sm:text-lg md:text-xl">
              Blip is built for iPhone crews at crowded events. Current access is handled directly
              while the public App Store listing is prepared.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="mailto:hello@heyblip.au?subject=Blip%20iOS%20access"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-7 text-base font-bold text-white shadow-[0_18px_50px_rgba(102,0,255,0.26)] transition-all duration-200 hover:bg-[var(--accent-light)]"
              >
                <Mail size={18} strokeWidth={1.8} />
                Request iOS access
              </a>
              <Link
                href="/organisers"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-7 text-base font-semibold text-[var(--foreground)] transition-all duration-200 hover:border-[var(--accent)]/50"
              >
                For event teams
                <ArrowRight size={18} strokeWidth={1.8} />
              </Link>
            </div>

            <div className="mt-10 grid gap-3">
              {checklist.map((item) => (
                <div key={item} className="flex items-center gap-3 border-t border-[var(--border)] pt-3">
                  <CheckCircle2 className="text-[var(--accent-light)]" size={18} strokeWidth={1.8} />
                  <span className="text-sm text-[var(--muted-strong)]">{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24, rotate: 1 }}
            animate={{ opacity: 1, y: 0, rotate: -1 }}
            transition={{ duration: 0.75, ease, delay: 0.1 }}
            className="relative mx-auto w-full max-w-[360px]"
          >
            <div className="absolute -inset-10 rounded-full bg-[var(--accent)]/12 blur-3xl" />
            <div className="device-shell relative mx-auto w-[82%] max-w-[300px]">
              <div className="pointer-events-none absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-black/70" />
              <div className="relative aspect-[736/1600] overflow-hidden rounded-[1.75rem] bg-black">
                <Image
                  src="/app-screens/intro-chat.jpeg"
                  alt="Blip onboarding screen explaining chat at events without signal"
                  fill
                  priority
                  sizes="300px"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="absolute -right-1 bottom-20 max-w-[190px] rounded-2xl border border-[var(--border)] bg-[var(--background)]/92 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)]/12 text-[var(--accent-light)]">
                <Bluetooth size={17} strokeWidth={1.8} />
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-light)]">Before arrival</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted-strong)]">Set up while reception is still reliable.</p>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
