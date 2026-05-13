"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/animations";
import { useTheme } from "./ThemeProvider";

const links = [
  { label: "Download", href: "/download" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "For organisers", href: "/organisers" },
  { label: "Tech & privacy", href: "/tech" },
];

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolved } = useTheme();

  return (
    <motion.nav
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 md:py-4">
        <div className="event-surface rounded-xl px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center group" aria-label="Blip home">
            <Image
              src={resolved === "light" ? "/Blipblacklogo.png" : "/Blipwhitelogo.png"}
              alt="Blip"
              width={320}
              height={128}
              className="h-14 sm:h-16 md:h-20 w-auto"
              priority
            />
          </Link>

          <div className="hidden md:flex items-center gap-8 lg:gap-10">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors duration-200 relative after:absolute after:bottom-[-2px] after:left-0 after:w-0 after:h-px after:bg-[var(--foreground)] after:transition-all after:duration-200 hover:after:w-full"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/download"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-all duration-200 hover:bg-[var(--accent-light)]"
            >
              Get Blip
            </Link>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <Link
              href="/download"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-white transition-all duration-200"
            >
              Download
            </Link>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex min-h-10 min-w-10 items-center justify-center text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease }}
              className="event-surface mt-2 overflow-hidden rounded-2xl md:hidden"
            >
              <div className="p-5 flex flex-col gap-4">
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="text-base text-[var(--muted-strong)] hover:text-[var(--foreground)] transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}

                <div className="section-divider my-1" />

                <Link
                  href="/download"
                  onClick={() => setMobileOpen(false)}
                  className="mt-1 inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-center text-sm font-medium text-white transition-all duration-200"
                >
                  Get Blip
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
}
