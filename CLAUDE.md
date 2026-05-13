@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # next dev (Turbopack, root pinned in next.config.ts)
npm run build    # next build — run before claiming a change is shippable
npm run lint     # eslint (next/core-web-vitals + next/typescript)
npx tsc --noEmit # type-check only; tsconfig has noEmit:true so this is the type gate
```

There is no test suite. Verification = `npm run build` + manual browser check of the affected route.

`dev-server.log` and `dev-server.err.log` at the repo root are gitignored runtime logs from a background dev server — read them to diagnose dev-time errors, don't commit them.

## Stack snapshot

Next.js **16** App Router · React **19.2** · TypeScript strict · Tailwind **v4** (PostCSS plugin, no `tailwind.config`) · Framer Motion · Three.js · Resend (transactional email). Path alias `@/*` → `src/*`.

Plus Jakarta Sans is loaded via `next/font/google` in `src/app/layout.tsx` and exposed as the `--font-jakarta` CSS variable — reference it through `font-[family-name:var(--font-jakarta)]`, don't re-import the font elsewhere.

## Architecture

**Routing.** App Router under `src/app/`. Each route page that needs `"use client"` interactivity follows the split pattern: `page.tsx` is a server component owning `metadata` + JSON-LD, and renders a sibling `*Client.tsx` (e.g. `tech/TechClient.tsx`, `download/DownloadClient.tsx`, `organisers/OrganisersClient.tsx`). Preserve this split when adding interactive routes — don't collapse metadata into a client component.

**SEO is load-bearing.** `src/app/layout.tsx` injects three JSON-LD blobs (Organization, WebSite, MobileApplication) and a rich `metadata` export. Per-route pages extend this with their own `metadata` + canonical. `src/app/sitemap.ts` is the canonical route list. `src/lib/seo.ts` holds the shared `SOCIAL_IMAGE` constant — reuse it for new OG images.

**Markdown-for-Agents / Link header.** `next.config.ts` sets a `Link:` response header on `/` advertising sitemap, alternates, service-doc, policies, and contact endpoints. This is intentional (see commit `eb696b3`) — when adding/renaming top-level routes that fit those `rel=` types, update `LINK_HEADER` too.

**Server actions.** `src/app/organisers/actions.ts` is the only server action: an organiser-application form that sends mail via Resend. It expects `RESEND_API_KEY` (required), and optional `ORGANISERS_EMAIL_FROM` / `ORGANISERS_EMAIL_TO`. It includes a honeypot (`companyName` field) and HTML-escapes all rendered values — preserve both when editing.

**Theming.** `ThemeProvider.tsx` provides dark/light/system, persisted to `localStorage`. The root `<html>` uses `suppressHydrationWarning` because the theme class is applied client-side. Design tokens (Blip purple `#6600FF`, glass surfaces, easing curves) live in `src/app/globals.css`, not in JS.

**3D background.** `MeshBackground.tsx` is a Three.js WebGL mesh used by the hero. It's heavy — keep it lazy/client-only and don't import it from server components.

## Design direction (read before visual changes)

`.impeccable.md` is the project's design context. Summary: black + white + Blip purple, **move away from generic AI-SaaS tropes** (heavy glassmorphism, gradient text, glowing pills, repeated icon-card grids). Lead with trust and operational proof; purple is a signal color, not decoration. The README "Glass effects" line predates this direction — when in conflict, `.impeccable.md` wins.

`.agents/product-marketing-context.md` holds product/audience/positioning context that the marketing skills (`ai-seo`, `seo-audit`, `schema-markup`, `site-architecture`, `product-marketing-context`) read from.

## Conventions

- Public assets: brand logos are `Blipwhitelogo.png` (for dark backgrounds) and `Blipblacklogo.png` (light). Pick by current theme, don't add new logo files.
- Email addresses in copy/JSON-LD: `hello@`, `support@`, `billing@`, `abuse@`, `legal@`, `privacy@` — all `@heyblip.au`. Don't introduce new addresses without updating `layout.tsx` JSON-LD too.
- iOS-only product. Don't add Android/Play Store CTAs.
- The `blipmesh/blip-mesh.jsx` file is a standalone reference visualization, not wired into the app.
