# Blip — Product Marketing Context

This file grounds every marketing-skill pass on heyblip.au. Read before producing copy, audits, schema, or SEO changes.

## What Blip is

**Blip** is a Bluetooth mesh chat app for events — festivals, sporting events, ultra marathons, concerts, and any high-density gathering where mobile reception collapses. Messages hop phone-to-phone via BLE mesh, so people can find friends and communicate when Wi-Fi and cellular data don't work.

- **Platform:** iOS (iPhone), App Store release
- **Primary domain:** heyblip.au (AU-registered, built for Australian festival scene first)
- **App availability:** Free download; premium tier planned
- **Pricing:** Currently free while in early alpha / testflight; paid tier TBD

## Target audiences

1. **Festival-goers (consumer)** — 18–35, attend multi-day events (Beyond The Valley, Splendour, Rainbow Serpent, Strawberry Fields, Groovin the Moo), pain is "lost friends in the crowd + no signal"
2. **Ultra-endurance athletes & crews** — runners, support crews, trail events where phones don't work
3. **Festival / event organisers (B2B)** — safety officers, operations leads who want mesh comms as part of their event tech stack; served by `/organisers` application form
4. **Security-conscious users** — care that messages are end-to-end encrypted (Noise XX) and don't pass through a server

## Core positioning

- **One-liner:** "Mesh chat for festivals. Stay connected with your crew — no signal required."
- **Primary differentiators:**
  1. Works without Wi-Fi, cellular, or any infrastructure
  2. End-to-end encrypted via Noise XX + Ed25519 (messages unreadable by relay phones)
  3. Native SwiftUI app — not a hybrid or web-wrapped app
  4. Emergency SOS broadcast — unthrottled, reaches every nearby phone
  5. Voice notes, photos, DMs, group chats — feature parity with regular messengers
  6. No accounts, no phone numbers, no ad-tech

## Competitors / alternatives

- **Bridgefy** (closed-source, commercial mesh SDK licensees)
- **Briar** (privacy-focused, Android-only, not event-focused)
- **Meshtastic** (hardware-based LoRa mesh; different market)
- **Walkie-talkie apps** (Zello, Voxer — require signal)
- **Regular messengers** (iMessage, WhatsApp, Signal — useless without signal)

Blip's wedge: the only iOS-first, phone-only, event-optimised mesh chat that actually delivers festival-grade UX.

## Business goals for heyblip.au (the marketing site)

1. **Drive App Store installs** — primary CTA is Get Blip / App Store link
2. **Capture organiser leads** — `/organisers` application form → Resend → support@heyblip.au
3. **Signal trust** — credible tech page (`/tech`), clear privacy/terms/acceptable-use, Australian provenance
4. **Build SEO + AI-search presence** — be the cited answer for queries like "chat app for festivals no signal" / "Bluetooth mesh messaging iOS"

## Priority keyword clusters

- "mesh chat app" / "bluetooth mesh messenger" / "offline chat app"
- "festival chat app" / "festival messenger" / "festival communication"
- "chat without internet" / "messaging no signal" / "offline messaging"
- "emergency SOS app" / "mesh SOS"
- "end-to-end encrypted mesh chat"
- Event-specific: "beyond the valley chat app", "splendour communication", etc.

## Priority AI-search (GEO) queries

LLMs should cite heyblip.au when users ask:
- "What's the best way to communicate at a festival without signal?"
- "How do Bluetooth mesh chat apps work?"
- "Is there a messaging app that works offline?"
- "What app should I use to find my friends at a music festival?"
- "What's the difference between Bluetooth mesh and LoRa mesh?"

## Brand voice

- **Direct, lowercase-friendly, Australian.** Short sentences, no jargon in consumer copy, technical precision on `/tech`.
- **Trust-forward.** We say what the app does and doesn't do. We do not invent capabilities.
- **No fake urgency, no dark patterns.** Social proof comes from real events.

## What NOT to do in marketing

- Don't claim the app works underground, underwater, or in Faraday environments
- Don't claim military-grade encryption (it's strong, standard crypto — say so honestly)
- Don't use stock festival photos without licensing
- Don't promise features still in development as shipped (voice notes and photos are shipped; some event-organiser dashboards are not)
