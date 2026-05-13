"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/animations";

export default function CTA() {
  return (
    <section className="relative pt-16 md:pt-24 pb-16 md:pb-24 px-4 sm:px-6">
      <div className="section-divider mb-20 md:mb-28" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-120px" }}
        transition={{ duration: 0.7, ease }}
        className="relative z-10 max-w-3xl mx-auto text-center"
      >
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-gradient mb-6 md:mb-8">
          Set up before the crowd arrives.
        </h2>
        <p className="text-base sm:text-lg md:text-xl text-[var(--muted)] max-w-xl mx-auto mb-10 md:mb-14 leading-relaxed md:leading-[1.7]">
          Download Blip before the event, create your profile, and make sure your crew has it too.
          It is most useful when everyone is already on the mesh.
        </p>
        <a
          href="/download"
          className="inline-block px-8 py-3 md:px-10 md:py-3.5 rounded-full bg-[var(--accent)] text-white font-semibold text-base md:text-lg hover:bg-[var(--accent-light)] transition-all duration-200 glow-accent-sm hover:glow-accent hover:scale-[1.03]"
        >
          Download for iOS
        </a>
        <p className="text-xs md:text-sm text-[var(--muted)] mt-6 md:mt-8">
          Free core messaging. Requires iPhone with iOS 17+.
        </p>
      </motion.div>
    </section>
  );
}
