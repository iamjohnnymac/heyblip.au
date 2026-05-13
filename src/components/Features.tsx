"use client";

import { AlertTriangle, Lock, MessageCircle, Radio, Route, Users } from "lucide-react";
import { motion } from "framer-motion";
import { ease, stagger, childFadeUp } from "@/lib/animations";

const eventUseCases = [
  {
    icon: Users,
    title: "Crew finding",
    description: "Nearby discovery and friend location help groups reconnect after sets, queues, and venue moves.",
  },
  {
    icon: MessageCircle,
    title: "Messages that keep moving",
    description: "Texts, voice notes, and photos can relay through nearby phones when towers are overloaded.",
  },
  {
    icon: AlertTriangle,
    title: "SOS priority path",
    description: "Emergency alerts are treated as high-priority broadcasts across the local mesh.",
  },
];

const trustPoints = [
  { icon: Radio, label: "Bluetooth relay", detail: "No Wi-Fi or mobile data required nearby." },
  { icon: Lock, label: "Encrypted content", detail: "Relay devices cannot read messages." },
  { icon: Route, label: "Event-scale routing", detail: "Adaptive gossip and hop limits reduce congestion." },
];

export default function Features() {
  return (
    <section id="features" className="relative py-16 md:py-24 px-4 sm:px-6">
      <div className="section-divider mb-12 md:mb-16" />

      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7, ease }}
          className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-10 md:gap-16 items-end mb-14 md:mb-20"
        >
          <div>
            <p className="eyebrow mb-4">Built for event conditions</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gradient">
              The useful parts of messaging, rebuilt for crowded places.
            </h2>
          </div>
          <p className="text-base sm:text-lg md:text-xl text-[var(--muted-strong)] max-w-2xl leading-relaxed">
            Blip is not another event feed. It is a fallback communication layer for
            the moments when everyone is in the same place and the network is not.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 md:gap-8"
        >
          <motion.div variants={childFadeUp} transition={{ duration: 0.6, ease }} className="event-surface event-frame rounded-2xl p-6 sm:p-8 md:p-10">
            <div className="signal-rule mb-8" />
            <div className="space-y-8">
              {eventUseCases.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="grid grid-cols-[44px_1fr] gap-5">
                    <div className="h-11 w-11 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-[var(--accent-light)]">
                      <Icon size={20} strokeWidth={1.6} />
                    </div>
                    <div>
                      <h3 className="text-lg md:text-xl font-semibold mb-2">{item.title}</h3>
                      <p className="text-sm md:text-[15px] text-[var(--muted)] leading-relaxed md:leading-[1.7]">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          <motion.div variants={childFadeUp} transition={{ duration: 0.6, ease }} className="event-frame rounded-2xl border border-[var(--border)] p-6 sm:p-8 md:p-10">
            <p className="eyebrow mb-5">Trust signals</p>
            <div className="space-y-5">
              {trustPoints.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex gap-4 border-b border-[var(--border)] pb-5 last:border-b-0 last:pb-0">
                    <Icon className="mt-1 text-[var(--accent-light)]" size={20} strokeWidth={1.6} />
                    <div>
                      <p className="font-semibold text-[var(--foreground)]">{item.label}</p>
                      <p className="mt-1 text-sm md:text-[15px] text-[var(--muted)] leading-relaxed">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <a
              href="/tech"
              className="inline-flex mt-8 text-sm font-semibold text-[var(--accent-light)] hover:text-[var(--foreground)] transition-colors"
            >
              Read the technical specs
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
