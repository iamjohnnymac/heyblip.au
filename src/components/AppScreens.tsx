"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Bluetooth, CalendarDays, ShieldCheck } from "lucide-react";
import { childFadeUp, ease, stagger } from "@/lib/animations";

const productShots = [
  {
    src: "/app-screens/splash.jpeg",
    alt: "Blip splash screen",
    label: "01",
    title: "Launch",
  },
  {
    src: "/app-screens/profile.jpeg",
    alt: "Blip profile creation screen",
    label: "02",
    title: "Profile",
  },
  {
    src: "/app-screens/intro-chat.jpeg",
    alt: "Blip onboarding screen explaining event chat without signal",
    label: "03",
    title: "Offline chat",
  },
  {
    src: "/app-screens/permissions.jpeg",
    alt: "Blip permissions screen for Bluetooth, notifications, and voice notes",
    label: "04",
    title: "Permissions",
  },
];

const proof = [
  {
    icon: CalendarDays,
    label: "Event-first",
    text: "Join the event before arrival, then keep your crew reachable on site.",
  },
  {
    icon: Bluetooth,
    label: "Built for dead zones",
    text: "Bluetooth setup is explained before it is needed in the crowd.",
  },
  {
    icon: ShieldCheck,
    label: "Trust by design",
    text: "Permissions are explained before they are requested.",
  },
];

function DeviceShot({
  src,
  alt,
  className = "",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div className={`device-shell ${className}`}>
      <div className="pointer-events-none absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-black/70" />
      <div className="relative aspect-[736/1600] overflow-hidden rounded-[1.75rem] bg-black">
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 310px, (min-width: 640px) 240px, 68vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}

export default function AppScreens() {
  return (
    <section className="relative -mt-24 overflow-hidden px-4 pb-16 pt-32 sm:px-6 md:-mt-32 md:pb-24 md:pt-40" id="app">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-[var(--background)] via-[var(--background)]/92 to-transparent" />
      <div className="section-divider relative mb-12 md:mb-16" />

      <div className="relative mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7, ease }}
          className="grid items-end gap-8 lg:grid-cols-[0.82fr_1.18fr]"
        >
          <div>
            <p className="eyebrow mb-4">Actual app screens</p>
            <h2 className="max-w-3xl text-4xl font-black leading-[0.92] tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl md:text-6xl">
              Built around the event, not another social feed.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-relaxed text-[var(--muted-strong)] sm:text-lg md:text-xl">
            Join an event, set up your profile, and keep your crew reachable when reception starts to fail.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(280px,0.9fr)_1.1fr] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 28, rotate: -2 }}
            whileInView={{ opacity: 1, y: 0, rotate: -1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, ease }}
            className="relative mx-auto w-full max-w-[360px] lg:max-w-[390px]"
          >
            <div className="absolute -inset-8 rounded-full bg-[var(--accent)]/10 blur-3xl" />
            <DeviceShot
              src="/app-screens/events.jpeg"
              alt="Blip Events screen with nearby joinable events"
              className="relative mx-auto w-[78%] max-w-[310px]"
            />
            <div className="absolute -right-2 bottom-16 hidden max-w-[190px] rounded-2xl border border-[var(--border)] bg-[var(--background)]/92 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] sm:block">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-light)]">Event list</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted-strong)]">Browse, filter, and join before the network gets crowded.</p>
            </div>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-80px" }}
            className="space-y-7"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
              {productShots.map((shot, index) => (
                <motion.div
                  key={shot.src}
                  variants={childFadeUp}
                  transition={{ duration: 0.65, ease }}
                  className={index % 2 === 0 ? "pt-0 sm:pt-8" : "pt-8 sm:pt-0"}
                >
                  <DeviceShot src={shot.src} alt={shot.alt} className="w-full" />
                  <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
                    <span className="text-[11px] font-bold text-[var(--accent-light)]">{shot.label}</span>
                    <span className="text-xs font-semibold text-[var(--muted-strong)]">{shot.title}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {proof.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="border-t border-[var(--border)] pt-4">
                    <Icon className="mb-3 text-[var(--accent-light)]" size={20} strokeWidth={1.7} />
                    <p className="font-semibold text-[var(--foreground)]">{item.label}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
