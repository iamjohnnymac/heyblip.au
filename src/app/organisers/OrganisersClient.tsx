"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { motion } from "framer-motion";
import { ease } from "@/lib/animations";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { submitOrganiserApplication, type OrganiserFormState } from "./actions";

const EVENT_TYPES = [
  "Festival",
  "Concert",
  "Sporting event",
  "Ultra marathon",
  "Conference",
  "Other",
];

const initialState: OrganiserFormState = { ok: false };

const organiserSignals = [
  "Stage and attendee announcements",
  "Emergency SOS escalation paths",
  "Venue maps, meeting points, and crowd context",
];

const operatingModel = [
  {
    label: "Before gates",
    detail: "Confirm event listing, attendee setup copy, and Bluetooth requirements.",
  },
  {
    label: "During event",
    detail: "Attendees use local mesh messaging; venue safety channels stay primary for emergencies.",
  },
  {
    label: "Support path",
    detail: "Event teams get a named contact and clear limits before any pilot goes live.",
  },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full sm:w-auto px-10 py-3.5 md:px-12 md:py-4 rounded-full bg-[var(--accent)] text-white font-semibold text-base hover:bg-[var(--accent-light)] transition-all duration-200 glow-accent-sm hover:scale-[1.02] disabled:opacity-60 disabled:pointer-events-none"
    >
      {pending ? "Sending..." : "Send event details"}
    </button>
  );
}

const INPUT =
  "w-full rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-3 text-[15px] text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--accent)]/70 focus:ring-2 focus:ring-[var(--accent)]/20 transition-all duration-150";

const LABEL =
  "block text-sm font-semibold text-[var(--foreground)] mb-2";

const ERROR_TEXT = "mt-1.5 text-xs text-red-400";

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="pt-2">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h2 className="text-xl md:text-2xl font-bold text-[var(--foreground)]">{title}</h2>
    </div>
  );
}

export default function OrganisersClient() {
  const [state, formAction] = useActionState(submitOrganiserApplication, initialState);

  useEffect(() => {
    if (state.ok) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [state.ok]);

  return (
    <main className="mesh-gradient relative overflow-hidden">
      <Nav />

      <section className="pt-28 md:pt-36 pb-20 md:pb-28 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="max-w-6xl mx-auto"
        >
          <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-10 lg:gap-16 items-start">
            <aside className="lg:sticky lg:top-32">
              <p className="eyebrow mb-5">For event teams</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.04] text-gradient mb-6">
                Host Blip at your event.
              </h1>
              <p className="text-base sm:text-lg text-[var(--muted-strong)] leading-relaxed mb-8">
                Share the basics and we will come back with the right setup path for your venue,
                expected crowd, and safety needs.
              </p>

              <div className="event-surface event-frame rounded-2xl p-5 md:p-6">
                <div className="signal-rule mb-5" />
                <p className="text-sm font-semibold text-[var(--foreground)] mb-4">Useful when you need:</p>
                <ul className="space-y-3">
                  {organiserSignals.map((signal) => (
                    <li key={signal} className="flex gap-3 text-sm text-[var(--muted-strong)] leading-relaxed">
                      <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />
                      <span>{signal}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-xs text-[var(--muted)]">
                  Usually takes 2 minutes. We reply from hello@heyblip.au.
                </p>
              </div>

              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6">
                <p className="text-sm font-semibold text-[var(--foreground)] mb-4">Operating model</p>
                <div className="space-y-4">
                  {operatingModel.map((item) => (
                    <div key={item.label} className="border-t border-[var(--border)] pt-4 first:border-t-0 first:pt-0">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-light)]">{item.label}</p>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--muted-strong)]">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            {state.ok ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease }}
                className="event-surface rounded-2xl p-8 md:p-12 text-center border border-[var(--accent)]/30"
                role="status"
              >
                <div className="signal-rule mb-6" />
                <h2 className="text-2xl md:text-3xl font-bold text-[var(--foreground)] mb-3">
                  Thanks, we have the event details.
                </h2>
                <p className="text-[var(--muted)] text-base leading-relaxed max-w-md mx-auto">
                  We will reply within a few business days from <span className="text-[var(--foreground)]">hello@heyblip.au</span>.
                  Keep an eye on your spam folder just in case.
                </p>
              </motion.div>
            ) : (
              <form action={formAction} className="event-surface event-frame rounded-2xl p-6 sm:p-8 md:p-10 space-y-8 md:space-y-9">
                <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                  <label>
                    Company name
                    <input type="text" name="companyName" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                {state.error && (
                  <div role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                    {state.error}
                  </div>
                )}

                <SectionHeader eyebrow="Step 1" title="Event basics" />

                <div>
                  <label htmlFor="eventName" className={LABEL}>Event name</label>
                  <input id="eventName" name="eventName" type="text" className={INPUT} placeholder="Example Festival 2026" required aria-invalid={!!state.fieldErrors?.eventName} aria-describedby={state.fieldErrors?.eventName ? "eventName-error" : undefined} />
                  {state.fieldErrors?.eventName && <p id="eventName-error" className={ERROR_TEXT}>{state.fieldErrors.eventName}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
                  <div>
                    <label htmlFor="eventType" className={LABEL}>Event type</label>
                    <select id="eventType" name="eventType" defaultValue="" className={INPUT} required aria-invalid={!!state.fieldErrors?.eventType} aria-describedby={state.fieldErrors?.eventType ? "eventType-error" : undefined}>
                      <option value="" disabled>Choose event type</option>
                      {EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    {state.fieldErrors?.eventType && <p id="eventType-error" className={ERROR_TEXT}>{state.fieldErrors.eventType}</p>}
                  </div>

                  <div>
                    <label htmlFor="eventDate" className={LABEL}>Date or date range</label>
                    <input id="eventDate" name="eventDate" type="text" className={INPUT} placeholder="12-14 March 2027" required aria-invalid={!!state.fieldErrors?.eventDate} aria-describedby={state.fieldErrors?.eventDate ? "eventDate-error" : undefined} />
                    {state.fieldErrors?.eventDate && <p id="eventDate-error" className={ERROR_TEXT}>{state.fieldErrors.eventDate}</p>}
                  </div>
                </div>

                <div>
                  <label htmlFor="venue" className={LABEL}>
                    Venue <span className="text-[var(--muted)] font-normal">(optional)</span>
                  </label>
                  <input id="venue" name="venue" type="text" className={INPUT} placeholder="Venue or site name" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 md:gap-6">
                  <div>
                    <label htmlFor="city" className={LABEL}>City</label>
                    <input id="city" name="city" type="text" className={INPUT} placeholder="Melbourne" required aria-invalid={!!state.fieldErrors?.city} aria-describedby={state.fieldErrors?.city ? "city-error" : undefined} />
                    {state.fieldErrors?.city && <p id="city-error" className={ERROR_TEXT}>{state.fieldErrors.city}</p>}
                  </div>
                  <div>
                    <label htmlFor="country" className={LABEL}>Country</label>
                    <input id="country" name="country" type="text" className={INPUT} placeholder="Australia" required aria-invalid={!!state.fieldErrors?.country} aria-describedby={state.fieldErrors?.country ? "country-error" : undefined} />
                    {state.fieldErrors?.country && <p id="country-error" className={ERROR_TEXT}>{state.fieldErrors.country}</p>}
                  </div>
                  <div>
                    <label htmlFor="expectedAttendance" className={LABEL}>Attendance</label>
                    <input id="expectedAttendance" name="expectedAttendance" type="text" className={INPUT} placeholder="25,000" required aria-invalid={!!state.fieldErrors?.expectedAttendance} aria-describedby={state.fieldErrors?.expectedAttendance ? "expectedAttendance-error" : undefined} />
                    {state.fieldErrors?.expectedAttendance && <p id="expectedAttendance-error" className={ERROR_TEXT}>{state.fieldErrors.expectedAttendance}</p>}
                  </div>
                </div>

                <div className="section-divider" />
                <SectionHeader eyebrow="Step 2" title="Who should we contact?" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
                  <div>
                    <label htmlFor="organiserName" className={LABEL}>Your name</label>
                    <input id="organiserName" name="organiserName" type="text" className={INPUT} placeholder="Jane Doe" autoComplete="name" required aria-invalid={!!state.fieldErrors?.organiserName} aria-describedby={state.fieldErrors?.organiserName ? "organiserName-error" : undefined} />
                    {state.fieldErrors?.organiserName && <p id="organiserName-error" className={ERROR_TEXT}>{state.fieldErrors.organiserName}</p>}
                  </div>
                  <div>
                    <label htmlFor="email" className={LABEL}>Email</label>
                    <input id="email" name="email" type="email" className={INPUT} placeholder="jane@example.com" autoComplete="email" required aria-invalid={!!state.fieldErrors?.email} aria-describedby={state.fieldErrors?.email ? "email-error" : undefined} />
                    {state.fieldErrors?.email && <p id="email-error" className={ERROR_TEXT}>{state.fieldErrors.email}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
                  <div>
                    <label htmlFor="phone" className={LABEL}>
                      Phone <span className="text-[var(--muted)] font-normal">(optional)</span>
                    </label>
                    <input id="phone" name="phone" type="tel" className={INPUT} placeholder="+61 400 000 000" autoComplete="tel" />
                  </div>
                  <div>
                    <label htmlFor="website" className={LABEL}>
                      Website or socials <span className="text-[var(--muted)] font-normal">(optional)</span>
                    </label>
                    <input id="website" name="website" type="text" className={INPUT} placeholder="yourevent.com / @handle" />
                  </div>
                </div>

                <div className="section-divider" />
                <SectionHeader eyebrow="Step 3" title="What should Blip support?" />

                <div>
                  <label htmlFor="description" className={LABEL}>Event context</label>
                  <textarea
                    id="description"
                    name="description"
                    rows={5}
                    className={INPUT}
                    placeholder="Tell us what the event is, where comms usually fail, and what you want Blip to help with."
                    required
                    aria-invalid={!!state.fieldErrors?.description}
                    aria-describedby={state.fieldErrors?.description ? "description-error" : undefined}
                  />
                  {state.fieldErrors?.description && <p id="description-error" className={ERROR_TEXT}>{state.fieldErrors.description}</p>}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                  <p className="text-xs text-[var(--muted)] text-center sm:text-left">
                    We only use this to reply about hosting Blip at your event.
                  </p>
                  <SubmitButton />
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </section>

      <Footer />
    </main>
  );
}
