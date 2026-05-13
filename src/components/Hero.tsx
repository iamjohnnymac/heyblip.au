"use client";

import Image from "next/image";
import { AlertTriangle, Lock, MapPin, MessageCircle } from "lucide-react";
import { motion } from "framer-motion";
import EventRadar from "./EventRadar";
import { ease, stagger, childFadeUp } from "@/lib/animations";

const trustSignals = [
  { label: "Transport", value: "Bluetooth mesh" },
  { label: "Privacy", value: "E2E encrypted" },
  { label: "Priority", value: "SOS relay" },
];

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[250px] sm:w-[282px]">
      <div className="absolute -left-16 top-16 hidden h-[420px] w-[194px] -rotate-[10deg] overflow-hidden rounded-[1.9rem] border border-[var(--border)] bg-[var(--background)]/80 p-2 opacity-80 shadow-[0_22px_70px_rgba(0,0,0,0.28)] xl:block">
        <div className="relative h-full overflow-hidden rounded-[1.45rem]">
          <Image
            src="/app-screens/events.jpeg"
            alt="Blip Events screen showing joinable festivals, sports, marathons, and concerts"
            fill
            sizes="194px"
            className="object-cover"
          />
        </div>
      </div>
      <div className="relative overflow-hidden rounded-[2.35rem] border border-[var(--border-strong)] bg-[var(--background)] p-2.5 shadow-[0_32px_100px_rgba(102,0,255,0.24)]">
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-black/72" />
        <div className="relative aspect-[736/1600] overflow-hidden rounded-[1.85rem] border border-white/8 bg-black">
          <Image
            src="/app-screens/intro-chat.jpeg"
            alt="Blip onboarding screen explaining chat at events without signal"
            fill
            priority
            sizes="(min-width: 1024px) 282px, 250px"
            className="object-cover"
          />
        </div>
      </div>
    </div>
  );
}

function MobilePhoneStack() {
  return (
    <div className="mx-auto flex w-fit items-start justify-center">
      <div className="device-shell mt-8 w-[140px] shrink-0 rotate-[-7deg] opacity-90">
        <div className="pointer-events-none absolute left-1/2 top-1.5 z-10 h-3.5 w-16 -translate-x-1/2 rounded-b-xl bg-black/72" />
        <div className="relative aspect-[736/1600] overflow-hidden rounded-[1.2rem] bg-black">
          <Image
            src="/app-screens/events.jpeg"
            alt="Blip Events screen showing joinable events"
            fill
            sizes="140px"
            className="object-cover"
          />
        </div>
      </div>

      <div className="device-shell -ml-6 w-[155px] shrink-0 rotate-[5deg]">
        <div className="pointer-events-none absolute left-1/2 top-1.5 z-10 h-3.5 w-16 -translate-x-1/2 rounded-b-xl bg-black/72" />
        <div className="relative aspect-[736/1600] overflow-hidden rounded-[1.25rem] bg-black">
          <Image
            src="/app-screens/intro-chat.jpeg"
            alt="Blip onboarding screen explaining chat at events without signal"
            fill
            sizes="155px"
            className="object-cover"
          />
        </div>
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-28 sm:px-6 md:pb-28 md:pt-32 lg:min-h-screen lg:pb-36">
      <div className="absolute inset-x-0 bottom-0 top-[25rem] opacity-55 sm:top-[23rem] md:opacity-70 lg:inset-0 lg:opacity-100">
        <EventRadar />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--background)_0%,var(--background)_38%,rgba(0,0,0,0.78)_58%,var(--background)_100%)] lg:bg-[radial-gradient(circle_at_50%_42%,transparent_0%,transparent_34%,var(--background)_78%)] lg:opacity-80" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-72 bg-gradient-to-b from-transparent via-[var(--background)]/88 to-[var(--background)]" />

      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-start gap-8 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[1fr_360px] lg:items-center xl:grid-cols-[1fr_400px]">
        <motion.div
          variants={stagger}
          initial="initial"
          animate="animate"
          className="max-w-5xl"
        >
          <motion.div variants={childFadeUp} transition={{ duration: 0.7, ease }} className="mb-6 inline-flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_18px_rgba(102,0,255,0.75)]" />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent-light)]">Event comms when networks fail</span>
          </motion.div>

          <motion.h1
            variants={childFadeUp}
            transition={{ duration: 0.7, ease }}
            className="max-w-5xl text-[clamp(3rem,17vw,4.4rem)] font-black leading-[0.86] tracking-[-0.05em] text-[var(--foreground)] sm:text-[clamp(4.4rem,14vw,6rem)] lg:text-[clamp(3.35rem,9vw,8.9rem)] lg:leading-[0.82] lg:tracking-[-0.055em]"
          >
            Never lose your friends again.
          </motion.h1>

          <motion.div
            variants={childFadeUp}
            transition={{ duration: 0.7, ease }}
            className="mt-6 grid max-w-4xl grid-cols-1 gap-6 md:mt-8 md:grid-cols-[1fr_0.9fr]"
          >
            <p className="max-w-xl text-base leading-relaxed text-[var(--muted-strong)] sm:text-lg md:text-xl">
              Blip keeps people reachable at crowded events by relaying messages
              phone-to-phone over Bluetooth. No reception required nearby.
            </p>
            <div className="hidden grid-cols-1 gap-2.5 sm:grid-cols-3 md:grid md:grid-cols-1">
              {trustSignals.map((signal) => (
                <div key={signal.label} className="flex items-center justify-between border-b border-[var(--border)] py-2.5 last:border-b-0">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--muted)]">{signal.label}</span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">{signal.value}</span>
                </div>
              ))}
            </div>
            <p className="border-l border-[var(--accent)]/50 pl-4 text-sm font-semibold text-[var(--muted-strong)] md:hidden">
              Bluetooth mesh. Encrypted relay. SOS priority.
            </p>
          </motion.div>

          <motion.div
            variants={childFadeUp}
            transition={{ duration: 0.7, ease }}
            className="mt-8 hidden w-full flex-col gap-3 sm:w-auto sm:flex-row md:flex"
          >
            <a
              href="/download"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-8 py-3.5 text-base font-bold text-white shadow-[0_18px_50px_rgba(102,0,255,0.28)] transition-all duration-200 hover:bg-[var(--accent-light)] hover:scale-[1.02]"
            >
              <MessageCircle size={18} strokeWidth={1.8} />
              Download for iOS
            </a>
            <a
              href="/organisers"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-8 py-3.5 text-base font-semibold text-[var(--foreground)] transition-all duration-200 hover:border-[var(--accent)]/50 hover:scale-[1.02]"
            >
              <MapPin size={18} strokeWidth={1.8} />
              For event teams
            </a>
          </motion.div>

          <motion.div
            variants={childFadeUp}
            transition={{ duration: 0.7, ease }}
            className="relative mt-10 lg:hidden"
          >
            <MobilePhoneStack />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20, rotate: 2 }}
          animate={{ opacity: 1, y: 0, rotate: -1 }}
          transition={{ duration: 0.9, ease, delay: 0.25 }}
          className="relative hidden lg:block"
        >
          <div className="absolute -left-12 top-12 z-10 rounded-2xl border border-[var(--border)] bg-[var(--background)]/86 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-400/10 text-red-400">
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-400">SOS priority</p>
                <p className="text-sm text-[var(--muted-strong)]">Relays first</p>
              </div>
            </div>
          </div>
          <div className="absolute -right-6 bottom-20 z-10 rounded-2xl border border-[var(--border)] bg-[var(--background)]/86 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.16)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent-light)]">
                <Lock size={18} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-light)]">Private</p>
                <p className="text-sm text-[var(--muted-strong)]">Encrypted relay</p>
              </div>
            </div>
          </div>
          <PhoneMockup />
        </motion.div>
      </div>
    </section>
  );
}
