"use client";

import { motion } from "framer-motion";
import { ease, stagger, childFadeUp } from "@/lib/animations";

const steps = [
  {
    number: "01",
    title: "Install before arrival",
    points: [
      "Check current iOS access",
      "Create a quick profile",
      "Ready to go in less than a minute",
    ],
  },
  {
    number: "02",
    title: "Find your crew",
    points: [
      "People with Blip show up automatically",
      "Tap to add them as a friend",
      "Works just like any social app",
    ],
  },
  {
    number: "03",
    title: "Send a message",
    points: [
      "Type and send like normal",
      "Your message hops from phone to phone",
      "Reaches your friend through the crowd",
    ],
  },
  {
    number: "04",
    title: "Use SOS if needed",
    points: [
      "Share your location with friends",
      "Send voice notes and photos",
      "Hit SOS if you need help — no signal needed",
    ],
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-16 md:py-24 px-4 sm:px-6">
      <div className="section-divider mb-12 md:mb-16" />

      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7, ease }}
          className="text-center mb-14 md:mb-20"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-gradient mb-6 md:mb-8">
            From arrival to last set.
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-[var(--muted)] max-w-xl mx-auto leading-relaxed">
            Blip stays familiar on purpose: open it, find people nearby, and send a message.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-10"
        >
          {steps.map((step) => (
            <motion.div
              key={step.number}
              variants={childFadeUp}
              transition={{ duration: 0.6, ease }}
              className="group text-center lg:text-left"
            >
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center text-xl md:text-2xl font-bold text-[var(--accent)] mx-auto lg:mx-0 mb-5 md:mb-6 transition-all duration-200 group-hover:bg-[var(--accent)]/15">
                {step.number}
              </div>
              <h3 className="text-lg md:text-xl font-semibold mb-3 md:mb-4">{step.title}</h3>
              <ul className="space-y-2.5">
                {step.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm md:text-[15px] text-[var(--muted)] leading-relaxed lg:justify-start justify-center">
                    <span className="relative flex-shrink-0 mt-[7px]">
                      <span className="block w-[6px] h-[6px] rounded-full bg-[var(--accent)]" />
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
