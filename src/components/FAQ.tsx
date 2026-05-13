"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { ease } from "@/lib/animations";

type FAQItem = {
  question: string;
  answer: string;
};

const faqs: FAQItem[] = [
  {
    question: "What is the best way to communicate at a festival when there is no signal?",
    answer:
      "Blip gives your crew a fallback channel when mobile reception is overloaded. Messages relay phone-to-phone over Bluetooth through nearby Blip users, so it works best when your group installs it before arrival and enough people nearby have Bluetooth enabled.",
  },
  {
    question: "How does a Bluetooth mesh chat app work?",
    answer:
      "A Bluetooth mesh chat app uses Bluetooth Low Energy to let nearby phones pass encrypted packets along. Your message can hop through other Blip devices until it reaches the recipient. Range depends on crowd density, phone placement, radio conditions, and how many people nearby are running Blip.",
  },
  {
    question: "Is there a messaging app that works offline without internet?",
    answer:
      "Yes. Blip is an iOS messaging app designed to work nearby without Wi-Fi or mobile data by using Bluetooth mesh networking. Some account and notification features still use online services when available, but nearby mesh messaging does not depend on reception at the venue.",
  },
  {
    question: "What app should I use to find my friends at a music festival?",
    answer:
      "Blip is built for crews at festivals, concerts, sports events, and long-course events where reception can fall apart. It helps you see nearby friends, message them through the local mesh, and share approximate location with people you choose.",
  },
  {
    question: "Is Blip free to use?",
    answer:
      "Core messaging, friend finding, and SOS are free. Verification is optional and exists as a profile trust marker, not a gate on the essentials.",
  },
  {
    question: "Is Blip end-to-end encrypted?",
    answer:
      "Yes. Direct messages are end-to-end encrypted using the Noise protocol framework with Ed25519 packet signing. Phones that relay your messages through the mesh cannot read them; only the intended recipient's device can decrypt the content.",
  },
  {
    question: "What phones does Blip work on?",
    answer:
      "Blip is iOS-only and requires an iPhone running iOS 17 or later with Bluetooth Low Energy 5.0 support. An Android version is not available yet.",
  },
  {
    question: "What is the difference between Bluetooth mesh and LoRa mesh?",
    answer:
      "Bluetooth mesh uses the Bluetooth radio already built into phones, so it works without extra hardware but has a shorter per-hop range. LoRa mesh, used by projects like Meshtastic, needs dedicated long-range radio hardware and can reach much farther per hop.",
  },
  {
    question: "Does Blip collect my location or personal data?",
    answer:
      "Blip does not collect contacts, browsing history, advertising identifiers, or precise GPS except during an active SOS you explicitly trigger. Account services store the minimum required data, such as email, username, public keys, and push notification token.",
  },
  {
    question: "Can Blip send an emergency SOS without signal?",
    answer:
      "Yes. Blip includes an emergency SOS broadcast designed to move through the nearby Bluetooth mesh. It is still best-effort technology, not a replacement for emergency services or venue safety channels.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.answer,
    },
  })),
};

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative px-4 py-16 sm:px-6 md:py-24">
      <div className="section-divider mb-12 md:mb-16" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="mx-auto max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 0.7, ease }}
          className="mb-14 text-center md:mb-20"
        >
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-gradient sm:text-3xl md:mb-8 md:text-4xl lg:text-5xl">
            Frequently asked questions
          </h2>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-[var(--muted)] sm:text-lg md:text-xl">
            Straight answers about using Blip at crowded events without relying on reception.
          </p>
        </motion.div>

        <div className="space-y-3 md:space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            const buttonId = `faq-button-${index}`;
            const panelId = `faq-panel-${index}`;

            return (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, ease, delay: index * 0.04 }}
                className="event-surface overflow-hidden rounded-2xl"
              >
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-200 hover:bg-[var(--card-bg-hover)] md:px-7 md:py-6"
                  >
                    <span className="text-base font-semibold text-[var(--foreground)] md:text-lg">
                      {faq.question}
                    </span>
                    <ChevronDown
                      size={20}
                      className={`flex-shrink-0 text-[var(--muted)] transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--muted-strong)] md:px-7 md:pb-6 md:text-[15px] md:leading-[1.7]">
                        {faq.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
