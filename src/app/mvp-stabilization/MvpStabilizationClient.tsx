"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Bluetooth,
  Bot,
  Bug,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  GitPullRequest,
  ListChecks,
  LockKeyhole,
  MessageCircle,
  MonitorSmartphone,
  RadioTower,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { ease } from "@/lib/animations";

type Feature = {
  id: string;
  label: string;
  track: string;
  icon: typeof Bell;
  accent: string;
  problem: string;
  jiraHint: string;
  simulator: string;
  phone: string;
  firstStep: string;
  doneWhen: string;
};

const loopSteps = [
  {
    label: "Pick",
    icon: ListChecks,
    owner: "John or Tay",
    proof: "One BDEV ticket selected, linked to the right epic.",
  },
  {
    label: "Reproduce",
    icon: Bug,
    owner: "Human + logs",
    proof: "Exact steps, build, accounts, and screenshots on the ticket.",
  },
  {
    label: "Lock Acceptance",
    icon: LockKeyhole,
    owner: "PM / verifier",
    proof: "Smallest pass/fail target written before code starts.",
  },
  {
    label: "Code",
    icon: Code2,
    owner: "Agent",
    proof: "Minimal branch, failing test where possible, no drive-by cleanup.",
  },
  {
    label: "Review",
    icon: GitPullRequest,
    owner: "Reviewer",
    proof: "Diff matches acceptance; PR references the BDEV ticket.",
  },
  {
    label: "Build",
    icon: Zap,
    owner: "CI / TestFlight",
    proof: "Green checks and a known build or commit ready to verify.",
  },
  {
    label: "Human Verify",
    icon: Smartphone,
    owner: "John / Tay",
    proof: "Simulator or phone evidence posted back to Jira.",
  },
  {
    label: "Close / Reopen",
    icon: RotateCcw,
    owner: "PM / verifier",
    proof: "Done only on pass. Failed evidence reopens the same loop.",
  },
];

const jiraFields = [
  {
    name: "MVP Track",
    value: "Push, Chat List, Text DM, Nearby/BLE, Relay/Noise...",
  },
  {
    name: "MVP Loop Stage",
    value: "Selected, Reproducing, Agent Coding, Human Verifying...",
  },
  {
    name: "Verification Surface",
    value: "Automated, Simulator, Two Phones, TestFlight/APNs, BLE...",
  },
  {
    name: "Human Final Review",
    value: "Not Ready, Ready, Passed, Failed",
  },
  {
    name: "Verified Build/Commit",
    value: "Build number, PR merge SHA, or exact commit hash",
  },
];

const features: Feature[] = [
  {
    id: "push",
    label: "Push and deeplinks",
    track: "Push/Badge",
    icon: Bell,
    accent: "#7C3AED",
    problem: "Friend requests and DMs can notify, but taps and routing are inconsistent.",
    jiraHint: "Start from BDEV-407 and link child tickets for payload or router fixes.",
    simulator: "Use .apns fixtures for tap routing, cold launch, and badge clearing.",
    phone: "Use TestFlight/APNs on two phones for lock-screen delivery and background wake.",
    firstStep: "Reproduce one notification type only: friend request or DM, not both.",
    doneWhen: "A tap opens the right screen and the Jira comment includes build, devices, and outcome.",
  },
  {
    id: "friendship",
    label: "Friend accept",
    track: "Friendship",
    icon: Users,
    accent: "#14B8A6",
    problem: "Accept works in one direction, but the rest of the app must see the same friendship.",
    jiraHint: "Use the friendship ticket as the parent/root cause before touching chat or Nearby.",
    simulator: "Unit-test accepted friend persistence and symmetric lookup rules.",
    phone: "Two phones confirm request, accept, relaunch, and both accounts still agree.",
    firstStep: "Lock the data contract for an accepted friend before fixing UI symptoms.",
    doneWhen: "Both devices persist the friend and no orphan DM identity remains.",
  },
  {
    id: "chat-list",
    label: "Chat list symmetry",
    track: "Chat List",
    icon: MessageCircle,
    accent: "#38BDF8",
    problem: "One phone sees the friend in Chats while the other does not.",
    jiraHint: "File or update the Chat Experience ticket and relate it to friendship identity.",
    simulator: "Test list derivation from the same friend/message fixtures on both accounts.",
    phone: "Two phones verify both chat tabs show the same peer after accept and relaunch.",
    firstStep: "Reproduce after a clean accept; do not start from an old cached chat.",
    doneWhen: "A and B show the same DM peer without sending a workaround message.",
  },
  {
    id: "text-dm",
    label: "Text DM delivery",
    track: "Text DM",
    icon: RadioTower,
    accent: "#F59E0B",
    problem: "Messages notify after offline delivery, but sometimes the actual message never arrives.",
    jiraHint: "Tie this to Relay/Noise and Chat Experience; block downstream badge tickets if needed.",
    simulator: "Exercise retry queue, handshake timeout, and message persistence without BLE.",
    phone: "Two phones verify foreground, background, offline, relaunch, and relay wake.",
    firstStep: "Pick one direction and one transport scenario, then prove the failure in logs.",
    doneWhen: "The message appears on the receiver or stays visibly queued for retry; no silent loss.",
  },
  {
    id: "badge",
    label: "Unread badge",
    track: "Push/Badge",
    icon: BadgeCheck,
    accent: "#EF4444",
    problem: "The app can receive a message notification without showing the expected red badge.",
    jiraHint: "Keep this behind message delivery; a badge fix cannot hide a missing message.",
    simulator: "Validate local badge increment/clear and thread-open state transitions.",
    phone: "Use real push only after simulator proves the badge state machine.",
    firstStep: "Lock when the badge should increment and exactly when it clears.",
    doneWhen: "Unread count appears on receipt and clears only when the thread is opened.",
  },
  {
    id: "nearby",
    label: "Nearby/BLE count",
    track: "Nearby/BLE",
    icon: Bluetooth,
    accent: "#22C55E",
    problem: "Nearby shows zero friends even when accepted friends and mesh peers exist.",
    jiraHint: "Link Chat/Friendship identity tickets before treating this as a pure BLE bug.",
    simulator: "Test friend-to-peer matching with fake peer keys and usernames.",
    phone: "Two phones verify BLE discovery, friend filtering, relaunch, and ghost-peer cleanup.",
    firstStep: "Confirm the accepted friend has the key used by the connected BLE peer.",
    doneWhen: "Accepted friends count as nearby; non-friends and stale peers do not.",
  },
];

const verificationRows = [
  {
    title: "Automated",
    icon: ClipboardCheck,
    items: ["unit tests", "view-model tests", "retry queue", "payload parsing"],
  },
  {
    title: "Simulator",
    icon: MonitorSmartphone,
    items: ["deeplinks", ".apns fixtures", "badge state", "cold launch routing"],
  },
  {
    title: "Real phones",
    icon: Smartphone,
    items: ["BLE", "APNs/TestFlight", "background wake", "offline relay recovery"],
  },
];

export default function MvpStabilizationClient() {
  const [selectedId, setSelectedId] = useState(features[0].id);
  const selected = useMemo(
    () => features.find((feature) => feature.id === selectedId) ?? features[0],
    [selectedId],
  );
  const SelectedIcon = selected.icon;

  return (
    <main className="mesh-gradient min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <section className="relative px-4 pb-16 pt-6 sm:px-6 sm:pb-20 lg:px-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-70" />

        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3" aria-label="Blip home">
            <Image
              src="/Blipwhitelogo.png"
              alt="Blip"
              width={180}
              height={72}
              className="h-12 w-auto sm:h-20"
              priority
            />
          </Link>
          <span className="glass hidden shrink-0 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-strong)] sm:inline-flex sm:px-4">
            <span className="hidden sm:inline">Internal </span>MVP recovery
          </span>
        </div>

        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-10 pt-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pt-20">
          <div className="min-w-0 max-w-4xl">
            <div className="mb-6 flex w-full max-w-full items-start gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--muted-strong)] sm:inline-flex sm:w-auto sm:rounded-full sm:items-center">
              <Sparkles size={16} strokeWidth={1.7} className="mt-0.5 shrink-0 text-[var(--accent-light)] sm:mt-0" />
              <span className="min-w-0 leading-6">Stop breaking working features while fixing broken ones.</span>
            </div>
            <h1 className="max-w-5xl text-5xl font-bold leading-[0.96] tracking-normal sm:text-6xl lg:text-7xl">
              One ticket.
              <br />
              One fix.
              <br />
              <span className="bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent)] bg-clip-text text-transparent">
                One verified
              </span>
              <br className="sm:hidden" />
              <span className="bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent)] bg-clip-text text-transparent">
                <span className="hidden sm:inline"> pass.</span>
                <span className="sm:hidden">pass.</span>
              </span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted-strong)] sm:text-xl">
              HeyBlip stabilizes by moving one BDEV ticket through one loop: reproduce it, lock the
              acceptance, let an agent make the smallest fix, then prove it with the right test
              surface before anything becomes Done.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#loop"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-light)]"
              >
                See the loop
                <ArrowRight size={17} strokeWidth={1.8} />
              </a>
              <a
                href="#choose"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--card-bg)] px-5 py-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--card-bg-hover)]"
              >
                Pick a broken feature
                <Search size={17} strokeWidth={1.8} />
              </a>
            </div>
          </div>

          <div className="glass-strong relative min-w-0 overflow-hidden rounded-lg p-5 sm:p-6">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#14B8A6] via-[var(--accent)] to-[#F59E0B]" />
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Current pattern
                </p>
                <h2 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">
                  Too many moving parts at once
                </h2>
              </div>
              <Workflow size={32} strokeWidth={1.5} className="text-[var(--accent-light)]" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {[
                "Fixes land in stacks, so root cause and regression cause blur together.",
                "Tickets close on merge, even when the field behavior has not been verified.",
                "BLE, relay, push, identity, and chat UI get tested in one exhausting pass.",
              ].map((item) => (
                <div
                  key={item}
                  className="flex gap-3 rounded-lg border border-[var(--border)] bg-black/20 p-4"
                >
                  <ShieldCheck size={20} strokeWidth={1.7} className="mt-0.5 shrink-0 text-[#14B8A6]" />
                  <p className="min-w-0 text-sm leading-6 text-[var(--muted-strong)]">{item}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-lg border border-[var(--border-strong)] bg-[var(--card-bg)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                New rule
              </p>
              <p className="mt-2 text-lg font-semibold leading-7">
                Nothing is Done until the exact user behavior passes on the right surface.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="loop" className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-light)]">
                The working loop
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-normal sm:text-5xl">
                <span className="block">Small enough to finish.</span>
                <span className="block">Strict enough to trust.</span>
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-[var(--muted-strong)]">
              The loop is deliberately boring. That is the point. It makes every fix observable,
              reviewable, and reversible.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {loopSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.label}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.35, delay: index * 0.035, ease }}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-5"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--muted)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="rounded-lg bg-[var(--accent-glow)] p-2 text-[var(--accent-light)]">
                      <Icon size={20} strokeWidth={1.7} />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold">{step.label}</h3>
                  <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">{step.owner}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-strong)]">{step.proof}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-6 sm:p-8">
            <div className="mb-5 inline-flex rounded-lg bg-[#14B8A6]/15 p-3 text-[#14B8A6]">
              <Bot size={26} strokeWidth={1.7} />
            </div>
            <h2 className="text-3xl font-bold">Agents can run the middle. Humans own reality.</h2>
            <p className="mt-4 text-base leading-7 text-[var(--muted-strong)]">
              Agents should take a locked ticket, write the smallest patch, add targeted tests,
              open a PR, and prepare QA notes. John and Tay keep the final call: did the app work
              on the actual surface we care about?
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                title: "Agent-owned",
                icon: Code2,
                items: ["root-cause read", "small code change", "targeted tests", "PR notes"],
              },
              {
                title: "Human-owned",
                icon: CheckCircle2,
                items: ["field repro", "device setup", "final pass/fail", "ship confidence"],
              },
            ].map((role) => {
              const Icon = role.icon;
              return (
                <div key={role.title} className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <Icon size={22} strokeWidth={1.7} className="text-[var(--accent-light)]" />
                    <h3 className="text-xl font-bold">{role.title}</h3>
                  </div>
                  <ul className="space-y-3">
                    {role.items.map((item) => (
                      <li key={item} className="flex items-center gap-3 text-sm text-[var(--muted-strong)]">
                        <CheckCircle2 size={16} strokeWidth={1.8} className="text-[#14B8A6]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-light)]">
              Test where it is cheapest
            </p>
            <h2 className="mt-3 text-3xl font-bold sm:text-5xl">Simulator first. Phones when physics matter.</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {verificationRows.map((row) => {
              const Icon = row.icon;
              return (
                <article key={row.title} className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-6">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="rounded-lg bg-[var(--accent-glow)] p-2 text-[var(--accent-light)]">
                      <Icon size={22} strokeWidth={1.7} />
                    </div>
                    <h3 className="text-2xl font-bold">{row.title}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.items.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-[var(--border)] bg-black/20 px-3 py-2 text-sm text-[var(--muted-strong)]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-light)]">
              Jira stays the backend
            </p>
            <h2 className="mt-3 text-3xl font-bold sm:text-5xl">One board. Five fields. No side tracker.</h2>
            <p className="mt-5 text-base leading-7 text-[var(--muted-strong)]">
              The page sells the operating model. Jira carries the truth: status, evidence, links,
              epics, PRs, and final verification.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3">
              {jiraFields.map((field) => (
                <div
                  key={field.name}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border)] bg-black/20 p-4 sm:grid-cols-[190px_1fr] sm:items-center"
                >
                  <code className="text-sm font-semibold text-[var(--accent-light)]">{field.name}</code>
                  <p className="text-sm leading-6 text-[var(--muted-strong)]">{field.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="choose" className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-light)]">
                Choose one issue
              </p>
              <h2 className="mt-3 text-3xl font-bold sm:text-5xl">Text-core first. One broken feature at a time.</h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-[var(--muted-strong)]">
              Pick the feature that is hurting the MVP most, then run the same loop until it is
              either passed or cleanly reopened with evidence.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
            <div className="grid grid-cols-1 gap-2">
              {features.map((feature) => {
                const Icon = feature.icon;
                const selectedFeature = feature.id === selected.id;
                return (
                  <button
                    key={feature.id}
                    type="button"
                    aria-pressed={selectedFeature}
                    onClick={() => setSelectedId(feature.id)}
                    className="flex min-h-16 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors"
                    style={{
                      borderColor: selectedFeature ? feature.accent : "var(--border)",
                      background: selectedFeature ? `${feature.accent}1F` : "var(--card-bg)",
                    }}
                  >
                    <span
                      className="rounded-lg p-2"
                      style={{ background: `${feature.accent}24`, color: feature.accent }}
                    >
                      <Icon size={20} strokeWidth={1.8} />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-[var(--foreground)]">{feature.label}</span>
                      <span className="block text-xs text-[var(--muted)]">{feature.track}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease }}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--card-bg)] p-5 sm:p-7"
            >
              <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    {selected.track}
                  </p>
                  <h3 className="mt-2 text-3xl font-bold">{selected.label}</h3>
                </div>
                <div
                  className="rounded-lg p-3"
                  style={{ background: `${selected.accent}24`, color: selected.accent }}
                >
                  <SelectedIcon size={30} strokeWidth={1.7} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {[
                  ["Problem", selected.problem],
                  ["Jira move", selected.jiraHint],
                  ["Simulator", selected.simulator],
                  ["Real phones", selected.phone],
                  ["First step", selected.firstStep],
                  ["Done when", selected.doneWhen],
                ].map(([label, copy]) => (
                  <div key={label} className="rounded-lg border border-[var(--border)] bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                      {label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{copy}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-lg border border-[var(--border-strong)] bg-[var(--card-bg)] p-7 text-center sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-light)]">
            The sell
          </p>
          <h2 className="mt-4 text-3xl font-bold sm:text-5xl">Pick one BDEV ticket and run the loop.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[var(--muted-strong)]">
            If it passes, we ship with confidence. If it fails, we learn exactly where it failed
            and keep the fix attached to the original evidence.
          </p>
          <a
            href="#choose"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-light)]"
          >
            Start with the first broken feature
            <ArrowRight size={17} strokeWidth={1.8} />
          </a>
        </div>
      </section>
    </main>
  );
}
