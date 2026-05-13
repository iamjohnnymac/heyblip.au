import { NextResponse, type NextRequest } from "next/server";

const MARKDOWN: Record<string, string> = {
  "/": `# Blip — Mesh Chat for Festivals

Blip is a Bluetooth mesh chat app for festivals, concerts, ultra marathons, and any high-density event where mobile reception collapses. Messages hop phone-to-phone via Bluetooth Low Energy, so your text reaches your friend even when Wi-Fi and cellular data don't work.

**Platform:** iOS (iPhone 8 and newer, iOS 17+)
**Price:** Free
**Encryption:** End-to-end (Noise XX + Ed25519)
**iOS access:** https://heyblip.au/download

## What Blip does

- **Works without signal.** No Wi-Fi, no mobile data, no problem. Relays messages through other phones via Bluetooth.
- **Find your crew.** See who's nearby, add friends with a tap.
- **Chat, voice notes, photos.** Same features as any messenger.
- **Emergency SOS.** Unthrottled broadcast that reaches every nearby phone.
- **Private by default.** Messages are encrypted before they leave your phone. Relay phones cannot read them.
- **Built for festivals.** Stage channels, crowd density info, meeting points.

## How it works

1. Check current iOS access and create a quick profile.
2. People with Blip show up automatically nearby.
3. Type and send like normal — your message hops phone-to-phone through the crowd.
4. Share your location with friends, send voice notes, or hit SOS if you need help.

## Security

Every direct message is end-to-end encrypted with Noise_XX_25519_ChaChaPoly_SHA256 and packet-signed with Ed25519. Blip uses email-based account setup, no phone numbers, and no ad tracking. Only your email, username, public keys, and push token are stored server-side.

## Pricing

Free. No subscriptions gating core messaging.

## Links

- Download / iOS access: https://heyblip.au/download
- Technical specs: https://heyblip.au/tech
- For event organisers: https://heyblip.au/organisers
- Privacy policy: https://heyblip.au/privacy
- Terms of service: https://heyblip.au/terms
- Acceptable use: https://heyblip.au/acceptable-use
- General: hello@heyblip.au
- Support: support@heyblip.au
- Billing: billing@heyblip.au
- Abuse reports: abuse@heyblip.au
- Legal: legal@heyblip.au
- Privacy: privacy@heyblip.au
`,

  "/tech": `# Technical Specs — Blip Mesh Protocol

Canonical page: https://heyblip.au/tech

## Mesh Network

- Transport: Bluetooth Low Energy 5.0+
- Topology: Dual-role (central + peripheral simultaneously)
- Max connections: 6 per device (configurable for bridge nodes)
- Service UUID: FC000001-0000-1000-8000-00805F9B34FB
- MTU: 512 bytes (517 requested, 512 effective)
- Hop limit (TTL): 0-7 hops per packet
- Range per hop: ~40m (BLE 5.0, line-of-sight up to 100m)
- Effective range: ~200-300m through crowd-dependent routing

## Gossip Routing

- Algorithm: Probabilistic gossip with adaptive relay
- Deduplication: 3-tier Bloom filter (60s / 10min / 2hr windows)
- Relay probability: 100% (<10 peers) to 20% (60+ peers)
- SOS relay: Always 100%, TTL preserved for first 3 hops
- Jitter: 8-25ms random per relay
- Congestion backoff: Queue fill >80% reduces relay to 20%
- DM routing at scale: DirectedRouter with 5-min route expiry
- Store-and-forward: 10MB LRU cache, DMs cached 2hrs, SOS until resolved

## Encryption

- Key agreement: Noise XX handshake (Curve25519 + ChaChaPoly + SHA256)
- Packet signing: Ed25519 via libsodium (64-byte detached signatures)
- Signable data: Full packet excluding TTL byte and signature
- Key distribution: Noise + signing public keys exchanged in announce payload
- Session management: Noise session per peer pair, rekeying on reconnect

## Packet Format

- Header: 16 bytes fixed
- Sender ID: 8 bytes (SHA256 of noise public key, truncated)
- Recipient ID: 8 bytes (optional, for addressed DMs)
- Signature: 64 bytes (optional, Ed25519)
- Max payload (broadcast signed): 424 bytes
- Max payload (addressed signed): 416 bytes
- Fragmentation threshold: 416 bytes
- Byte order: Big-endian

## Scale Design

- Target: 100,000+ concurrent users
- Crowd modes: Gather (<500) / Festival (500-5K) / Mega (5K-25K) / Massive (25K+)
- RSSI polling: every 10 seconds for connected peers
- Peer evaluation: 30-second cycle for connection quality scoring
- Reconnect backoff: 30 seconds
- Stale peer cleanup: disconnected peers pruned after 5 minutes

## Platform

- iOS 17.0+ (SwiftUI, SwiftData, MVVM)
- Packages: BlipProtocol, BlipMesh, BlipCrypto (Swift Package Manager)
- Dependencies: CryptoKit (Apple), swift-sodium, swift-opus
- Backend: Cloudflare Workers (auth, relay, cdn) + Neon Postgres
- Build: XcodeGen + xcodebuild
`,

  "/organisers": `# For Organisers — Mesh Comms for Festivals & Events

Canonical page: https://heyblip.au/organisers

Running a festival, concert, ultra marathon, or sporting event? Apply to partner with Blip and give your attendees reliable comms when mobile reception collapses. End-to-end encrypted Bluetooth mesh, built for crowds of 100,000+.

## What we provide

- Custom event channels within the app
- Stage announcement broadcast capability
- Emergency SOS support that reaches every attendee with Blip installed
- Meeting points and venue map integration
- Crowd density information shared back to ops

## Apply

Submit an application at https://heyblip.au/organisers. We reply within a few business days from hello@heyblip.au.

Fields required: event name, event type, date, venue, city, country, expected attendance, your name, email, phone (optional), website/socials (optional), description.

Contact: hello@heyblip.au
`,

  "/download": `# Download Blip for iOS

Canonical page: https://heyblip.au/download

Blip is built for iPhone crews at crowded events. Current iOS access is handled directly while we prepare the public App Store listing.

## Before the event

- Use an iPhone with iOS 17 or newer.
- Enable Bluetooth before you arrive.
- Make sure your crew installs Blip before reception gets crowded.

Request iOS access: hello@heyblip.au
`,

  "/privacy": `# Privacy Policy — Blip

Canonical page: https://heyblip.au/privacy

## Summary

Blip is a Bluetooth mesh chat app. Privacy is a core design principle. Messages are end-to-end encrypted before they leave your device; only the minimum required data is collected server-side.

## What we collect

- Email address (plaintext, for verification and recovery)
- Username and display name
- Avatar image (if uploaded)
- Cryptographic public keys (Ed25519 + Noise XX) for encrypted conversations
- APNs device token for push notifications
- JWT session tokens (short-lived)
- Approximate location — session-only, only when Friend Finder is opted in

## What we don't collect

- Message content (E2E encrypted; we cannot decrypt)
- Contacts / address book
- Precise GPS (except during an active SOS you explicitly trigger)
- Browsing history or analytics
- Advertising identifiers (no IDFA, IDFV, fingerprinting)

## Third parties

Cloudflare (hosting), Neon (Postgres), Resend (email), Apple APNs (push), Sentry (crash reports, anonymised). We do not sell or share data for advertising.

## Your rights

Delete account + server data from app settings. Request a data copy via privacy@heyblip.au. Australian + GDPR access/correct/delete rights.

Contact: privacy@heyblip.au
`,

  "/terms": `# Terms of Service — Blip

Canonical page: https://heyblip.au/terms

The terms governing your use of Blip, the Bluetooth mesh chat app for festivals and events.

- You must be 13 or older to use Blip.
- You are responsible for the accuracy of your account information.
- You must follow the Acceptable Use Policy (https://heyblip.au/acceptable-use). False SOS alerts, harassment, or illegal content can result in permanent account removal.
- Because Blip is a peer-to-peer mesh network, message delivery is best-effort and not guaranteed. Do not rely on Blip as your only channel for life-safety-critical comms.
- No warranty is provided. Use at your own risk.
- We may update these Terms. Continued use after changes constitutes acceptance.

Contact: legal@heyblip.au
`,

  "/acceptable-use": `# Acceptable Use Policy — Blip

Canonical page: https://heyblip.au/acceptable-use

## Forbidden

- False SOS alerts
- Harassment, hate speech, threats
- Sharing illegal content (CSAM, stolen credentials, malware)
- Impersonation of another user, brand, or official
- Commercial spam or promotional broadcast abuse
- Attempting to disrupt, deanonymise, or reverse-engineer the mesh protocol in a way that harms other users

## Enforcement

Violations may result in temporary or permanent account suspension. Serious cases (false SOS, illegal activity) may be reported to authorities.

## Reporting

Block users directly in the app, or report to abuse@heyblip.au.
`,
};

export function proxy(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";

  if (!accept.includes("text/markdown")) {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  const md = MARKDOWN[path];

  if (!md) {
    return NextResponse.next();
  }

  return new NextResponse(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Vary": "Accept",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export const config = {
  matcher: ["/", "/download", "/tech", "/organisers", "/privacy", "/terms", "/acceptable-use"],
};
