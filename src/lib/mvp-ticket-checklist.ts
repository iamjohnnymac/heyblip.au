export const JIRA_DASHBOARD_URL = "https://heyblip.atlassian.net/jira/dashboards/10001";

export const MVP_CUSTOM_FIELDS = {
  mvpTrack: "customfield_10043",
  loopStage: "customfield_10044",
  verificationSurface: "customfield_10045",
  humanFinalReview: "customfield_10046",
  verifiedBuildOrCommit: "customfield_10047",
} as const;

const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;
const DEFAULT_ISSUE_KEY = "BDEV-493";

const SURFACE_CONFIGS = [
  {
    id: "automated",
    label: "Automated",
    aliases: [/automated/i, /unit/i, /test command/i],
    checklistLabel: "Have we named the exact automated proof?",
    missingDetail: "Jira requires automated proof, but the ticket does not name the exact command or test fixture yet.",
    tickWhen:
      "Tick this after Jira names the exact command or test to run, for example a Swift test filter, worker test, or fixture-based check.",
    template: ["Automated:", "- Command: [exact command]", "- Expected result: [what proves pass/fail]"],
  },
  {
    id: "simulator",
    label: "Simulator",
    aliases: [/simulator/i, /sim\b/i],
    checklistLabel: "Have we named the simulator scenario?",
    missingDetail: "Jira requires simulator proof, but the ticket does not name the screen, route, fixture, or simulator scenario yet.",
    tickWhen:
      "Tick this after Jira names the simulator device/scenario and what the tester should see or inspect.",
    template: ["Simulator:", "- Scenario: [screen/route/state to reproduce]", "- Device/runtime: [simulator model and iOS version]", "- Expected result: [visible pass/fail]"],
  },
  {
    id: "one-phone",
    label: "One Phone",
    aliases: [/one phone/i, /single phone/i],
    checklistLabel: "Have we named the one-phone device check?",
    missingDetail: "Jira requires one-phone proof, but the ticket does not name the device, build, account, and expected result yet.",
    tickWhen:
      "Tick this after Jira names the build, account, device, and exact manual check to run on one phone.",
    template: ["One Phone:", "- Build/device/account: [build, device, account]", "- Steps: [manual steps]", "- Expected result: [visible pass/fail]"],
  },
  {
    id: "two-phones",
    label: "Two Phones",
    aliases: [/two phones/i, /2 phones/i],
    checklistLabel: "Have we named the two-phone proof setup?",
    missingDetail: "Jira requires two-phone proof, but the ticket does not name both accounts/devices and the direction of the check yet.",
    tickWhen:
      "Tick this after Jira names both devices/accounts, sender/receiver direction, and what pass/fail looks like on each phone.",
    template: ["Two Phones:", "- Phone A/account: [device + account]", "- Phone B/account: [device + account]", "- Direction: [A to B / B to A / both]", "- Expected result: [visible pass/fail on both]"],
  },
  {
    id: "testflight-apns",
    label: "TestFlight/APNs",
    aliases: [/testflight/i, /apns/i, /push/i],
    checklistLabel: "Have we named the TestFlight/APNs proof?",
    missingDetail: "Jira requires TestFlight/APNs proof, but the ticket does not name the build, push type, payload, or tap/open behavior yet.",
    tickWhen:
      "Tick this after Jira names the TestFlight build, notification type or payload, and expected receipt/tap behavior.",
    template: ["TestFlight/APNs:", "- Build: [TestFlight build]", "- Push/payload: [friend_request / dm / fixture]", "- Expected result: [delivery, badge, tap route]"],
  },
  {
    id: "ble",
    label: "BLE",
    aliases: [/\bble\b/i, /bluetooth/i, /nearby/i],
    checklistLabel: "Have we named the BLE/Nearby proof?",
    missingDetail: "Jira requires BLE proof, but the ticket does not name peer/device setup, friend identity matching, and relaunch behavior yet.",
    tickWhen:
      "Tick this after Jira names the two-device BLE setup, expected peer/friend count, and any relaunch/background requirement.",
    template: ["BLE:", "- Devices/accounts: [nearby devices and accounts]", "- Expected peer/friend state: [count or identity match]", "- Relaunch/background step: [if required]"],
  },
  {
    id: "worker-smoke",
    label: "Worker Smoke",
    aliases: [/worker smoke/i, /worker/i, /api smoke/i],
    checklistLabel: "Have we named the worker smoke proof?",
    missingDetail: "Jira requires worker smoke proof, but the ticket does not name the endpoint, request, or expected response/log yet.",
    tickWhen:
      "Tick this after Jira names the worker/API smoke request and the expected response or log evidence.",
    template: ["Worker Smoke:", "- Endpoint/request: [exact endpoint or command]", "- Expected result: [status/log/body that proves pass/fail]"],
  },
  {
    id: "sentry-watch",
    label: "Sentry Watch",
    aliases: [/sentry watch/i, /sentry/i],
    checklistLabel: "Have we named the Sentry watch window?",
    missingDetail: "Jira requires a Sentry watch, but the ticket does not name release/build, issue shape, and time window yet.",
    tickWhen:
      "Tick this after Jira names the release/build, Sentry issue shape to watch, and the time window for no-new-events or expected recovery.",
    template: ["Sentry Watch:", "- Release/build: [release or build]", "- Issue shape: [Sentry issue/group/query]", "- Watch window: [duration]", "- Pass condition: [no new events / expected recovered events only]"],
  },
] as const;

type SurfaceConfig = (typeof SURFACE_CONFIGS)[number];

const WORK_KIND_CONFIGS = [
  {
    id: "auth",
    label: "Auth",
    match: /auth|jwt|token|login|register|account-not-found|session/i,
    risk: "Auth fixes can look good locally while leaving retry storms, stale identity, or offline recovery broken.",
    acceptanceQuestions: [
      "Which auth failure is being fixed: timeout, 404, account-not-found, stale token, or offline fallback?",
      "What exact user-visible behavior proves recovery worked?",
      "What must not happen: repeated alerts, infinite retry, logout, duplicate registration, or silent message loss?",
    ],
    reproduceSteps: [
      "Name the account/build state before starting.",
      "Trigger the exact auth failure or fallback path from the ticket.",
      "Record expected retry/backoff, alert, and recovery behavior.",
    ],
    guardrails: [
      "Do not broaden auth state cleanup beyond the locked failure path.",
      "Do not hide auth errors without proving recovery or user-visible fallback.",
      "Add a deterministic check for retry/backoff, token refresh, or account recovery where possible.",
    ],
    closeoutEvidence: [
      "Attach the command or simulator proof for the auth path.",
      "Record whether alerts/retries stopped after the expected recovery window.",
      "If device state matters, include build, account, and app foreground/background state.",
    ],
    outOfScope: ["UI polish", "unrelated login redesign", "message transport behavior unless auth directly blocks it"],
  },
  {
    id: "friendship",
    label: "Friendship",
    // Word-boundary anchored so we don't smear onto stray prose like
    // "acceptance language" / "contact form" / "request body". Friendship
    // tickets explicitly say "friend request", "accept friend", or use
    // "friendship" as a topic word.
    match: /\bfriend(?:ship)?s?\b|\bfriend[-\s]?request\b|\baccept(?:ed|ing)?\s+friend|\bfriend\s+accept|\bcontact[-\s]?sync/i,
    risk: "Friendship bugs often create asymmetric state, so both accounts need a clear before/after identity check.",
    acceptanceQuestions: [
      "Which direction is being tested: requester to recipient, recipient back to requester, or both?",
      "What exact UI/database state proves both users see the friendship?",
      "Which downstream surfaces are intentionally out of scope: chat list, Nearby, notifications, or BLE?",
    ],
    reproduceSteps: [
      "Name both accounts and their starting friend state.",
      "Run the request/accept path in the failing direction.",
      "Check both users after relaunch if symmetry is part of the bug.",
    ],
    guardrails: [
      "Do not patch chat or Nearby until friendship identity is proven or explicitly scoped.",
      "Keep account identity and friend ID mapping visible in logs/evidence.",
      "Prefer one failing symmetry test or fixture over broad state rewrites.",
    ],
    closeoutEvidence: [
      "Show requester and recipient final state.",
      "Record whether relaunch preserves the accepted friendship.",
      "Link any downstream chat/Nearby blocker instead of expanding this ticket.",
    ],
    outOfScope: ["chat delivery", "Nearby discovery", "push badge behavior unless acceptance explicitly names them"],
  },
  {
    id: "chat-list",
    label: "Chat List",
    match: /chat list|conversation list|inbox|thread list/i,
    risk: "Chat list fixes can hide deeper friendship or message-delivery asymmetry, so list visibility must be tied to the source state.",
    acceptanceQuestions: [
      "Which user is missing the chat row, and after what event?",
      "Should the row appear from friendship alone, from first message, or from unread/offline delivery?",
      "What state should be identical across both phones or simulators?",
    ],
    reproduceSteps: [
      "Name the two accounts and current friendship state.",
      "Open the chat list from a fresh launch on both sides if symmetry matters.",
      "Record whether the row appears before and after a message send.",
    ],
    guardrails: [
      "Do not manufacture chat rows that bypass friendship or message state rules.",
      "Keep changes scoped to list derivation, refresh, or identity mapping named by acceptance.",
      "Add a fixture test for row visibility when possible.",
    ],
    closeoutEvidence: [
      "Show chat list state for the affected account(s).",
      "Record the data source that created the row: friend, message, unread, or cached thread.",
      "Attach simulator proof unless real phones are required by the surface field.",
    ],
    outOfScope: ["message transport retries", "BLE delivery", "notification badges unless the ticket names them"],
  },
  {
    id: "text-dm",
    label: "Text DM",
    match: /text dm|direct message|message delivery|offline message|dm delivery|chat message/i,
    risk: "Text DM work crosses storage, relay, notification, and transport fallback, so each delivery state needs a named proof surface.",
    acceptanceQuestions: [
      "Which state is being proved: foreground, background, offline, relaunch, or queued retry?",
      "Which direction and account pair are in scope?",
      "What visible result proves delivery: bubble appears, unread state, notification, retry cleared, or failure surfaced?",
    ],
    reproduceSteps: [
      "Name sender, receiver, app state, and transport expectation.",
      "Send the smallest message fixture that exposes the failure.",
      "Record what each phone/app shows before relaunch and after relaunch.",
    ],
    guardrails: [
      "Do not change every transport at once; start from the failing delivery path.",
      "Keep message persistence, notification, and transport fallback evidence separate.",
      "Add a focused message-state test where the failure can run off-device.",
    ],
    closeoutEvidence: [
      "Record sender/receiver accounts and message ID or timestamp.",
      "Show whether the receiver bubble/list/unread state arrived.",
      "If offline/background is in scope, include the exact wake or relaunch behavior.",
    ],
    outOfScope: ["media", "PTT", "group chat", "Nearby identity unless it blocks delivery acceptance"],
  },
  {
    id: "push-badge",
    label: "Push/Badge",
    match: /push|badge|notification|apns|deeplink|deep link|tap route/i,
    risk: "Push and badge fixes can pass in foreground but fail across APNs, cold launch, or tap routing.",
    acceptanceQuestions: [
      "Which notification type is being proved: friend request, DM, badge update, or tap route?",
      "Which app state is required: foreground, background, killed/cold launch, or TestFlight?",
      "What exact badge count or route should be visible after open?",
    ],
    reproduceSteps: [
      "Name app state and notification payload/source.",
      "Trigger the notification path once, then record receipt, badge, and tap destination.",
      "Repeat on TestFlight/APNs if the surface requires real push.",
    ],
    guardrails: [
      "Do not treat simulator/local notification success as APNs success.",
      "Keep badge increment and badge clearing rules explicit.",
      "Avoid changing unrelated notification categories or routes.",
    ],
    closeoutEvidence: [
      "Record payload type, build, app state, and tap destination.",
      "Attach badge before/after value.",
      "Use real-phone/TestFlight evidence for APNs or background delivery.",
    ],
    outOfScope: ["message delivery correctness", "friendship acceptance logic", "BLE transport"],
  },
  {
    id: "nearby-ble",
    label: "Nearby/BLE",
    // Word-boundary anchors so "ble" doesn't smear onto stray words
    // like "reachable", "available", or "table" in random prose.
    match: /\bnearby\b|\bBLE\b|\bbluetooth\b|\bmesh\s+peer\b|\bpeer\s+count\b|\badvertis(?:e|ing|ement)\b/i,
    risk: "Nearby/BLE fixes need real-device proof because simulator can validate UI wiring but not radio behavior.",
    acceptanceQuestions: [
      "Is this raw mesh peer count, accepted-friend nearby count, identity matching, or stale-peer cleanup?",
      "Which devices/accounts must be near each other?",
      "What should happen after relaunch/background or after a peer disappears?",
    ],
    reproduceSteps: [
      "Name both devices, accounts, and friend relationship before testing.",
      "Record raw mesh peer count and accepted-friend nearby count separately.",
      "Relaunch both apps if stale peer cleanup or identity persistence is in scope.",
    ],
    guardrails: [
      "Do not close a BLE/Nearby ticket from simulator evidence alone.",
      "Keep mesh peer count and friend-nearby identity as separate facts.",
      "Do not patch chat/friendship state unless the ticket proves identity mapping is the blocker.",
    ],
    closeoutEvidence: [
      "Include two-phone device/account setup.",
      "Record raw mesh peer count versus friends-nearby count.",
      "Attach relaunch/background result when required.",
    ],
    outOfScope: ["message relay", "push notification routing", "UI polish unless it blocks the nearby proof"],
  },
  {
    id: "relay-noise",
    label: "Relay/Noise",
    match: /\brelay\b|\bnoise\b|\bhandshake\b|\bsession\s+manager\b|\bencrypted\s+packet\b|\bmesh\b/i,
    risk: "Relay/Noise fixes can pass in isolation but leave the handshake state machine stranded in production — every fix needs proof of session recovery, not just a happy-path send.",
    acceptanceQuestions: [
      "Which handshake/session state is being fixed: msg1/msg2/msg3 failure, responder stuck, simultaneous-init, or post-timeout recovery?",
      "What user-visible symptom proves it: locked outgoing bubbles, empty DM screen, dropped encrypted packets, or stalled chat after relaunch?",
      "Which sibling tickets (BDEV-413/479/487/489-family) are explicitly out of scope?",
    ],
    reproduceSteps: [
      "Name both phones, accounts, and starting friend/session state.",
      "Trigger the exact handshake failure path from the ticket (e.g. accept friend + immediate DM, or wifi toggle mid-handshake).",
      "Record paired Noise logs from both sides showing the failing transition.",
    ],
    guardrails: [
      "Do not broaden session-manager rewrites beyond the named handshake state.",
      "Keep canonical NoisePeerID/session-routing behavior intact (BDEV-479 family).",
      "Add focused regression coverage for the failing state transition where possible.",
    ],
    closeoutEvidence: [
      "Two-phone TestFlight proof of the named flow on the verified build.",
      "Paired Noise logs showing recovery (no stranded `Handshake timeout` / `responder waiting for msg3`).",
      "Sentry watch on related groups (handshake/no-session/decryption) stays quiet on the verified build.",
    ],
    outOfScope: ["media (image/PTT) channel routing", "push delivery", "BLE peer discovery"],
  },
  {
    id: "web-marketing",
    label: "Marketing Site",
    match: /\bheyblip\.au\b|\bmarketing\s+site\b|\bmarketing\s+copy\b|\bSEO\b|\bsitemap\b|\bweb(?:site)?\s+(?:copy|polish|content)\b|\bThree\.js\b|\blanding\s+page\b/i,
    risk: "Marketing-site changes ship to a separate repo and audience — confusing them with iOS app work hides real bugs and risks shipping wrong copy.",
    acceptanceQuestions: [
      "Which specific page, copy block, or asset is being changed?",
      "Does the change match the canonical source (App Store Connect IAP setup, security ground-truth in code, real pricing)?",
      "Is this app-repo or site-repo work, and is the right reviewer routing in place?",
    ],
    reproduceSteps: [
      "Open the affected page on the live site (or local preview) and capture the current copy/asset.",
      "Compare against the canonical source named in acceptance.",
      "Record before/after diff for the copy or asset that lands.",
    ],
    guardrails: [
      "Keep the change scoped to the named page/section.",
      "Do not touch iOS app code from a marketing-site PR.",
      "Verify pricing/security claims map to real code paths or App Store setup.",
    ],
    closeoutEvidence: [
      "Screenshot or deploy preview of the new copy/section.",
      "Link the source of truth (App Store IAP, security code path, etc.).",
      "Confirm SEO/meta or sitemap updates land where required.",
    ],
    outOfScope: ["iOS app code", "Auth/Relay/Push behavior", "Sentry/observability"],
  },
  {
    id: "observability",
    label: "Observability",
    match: /sentry|logging|alert|severity|observability|instrument/i,
    risk: "Observability fixes should improve signal without hiding real production failures.",
    acceptanceQuestions: [
      "Which alert, log, severity, or Sentry group is being changed?",
      "What should still be captured after the cleanup?",
      "What would prove the noise has stopped without masking a real failure?",
    ],
    reproduceSteps: [
      "Name the current alert/log/Sentry issue shape.",
      "Trigger the noisy path or inspect the release where it appears.",
      "Record the expected new severity, grouping, or suppression rule.",
    ],
    guardrails: [
      "Do not blanket-suppress errors unless acceptance names the safe condition.",
      "Keep the original failure observable at a lower severity or with better grouping where needed.",
      "Use a Sentry watch or log assertion if the surface requires it.",
    ],
    closeoutEvidence: [
      "Record release/build and Sentry query or issue group.",
      "Show before/after severity or grouping behavior.",
      "Include a watch window if production noise is the acceptance target.",
    ],
    outOfScope: ["fixing the underlying product bug unless the ticket names it", "broad logging rewrites"],
  },
] as const;

const TRACK_PROOF_HINTS = [
  {
    id: "track-auth",
    match: /auth/i,
    label: "Have we named the auth recovery scenario?",
    missingDetail:
      "MVP Track is Auth, so the ticket should name the auth failure/recovery path, such as token 404, account-not-found, retry storm, or re-registration.",
    tickWhen:
      "Tick this after Jira states the exact auth failure, the allowed recovery path, and what must not happen, such as infinite retry.",
    template: ["Track-specific Auth:", "- Failure path: [/v1/auth/token 404 / account-not-found / timeout / other]", "- Recovery path: [re-auth / re-register / clear state / surface unrecovered loss]", "- Must not happen: [retry storm / silent loss / stuck login]"],
  },
  {
    id: "track-text-dm",
    match: /text dm|chat list|chat/i,
    label: "Have we named the message/chat behavior being proved?",
    missingDetail:
      "This chat/message ticket should name the direction, account pair, message state, and visible pass/fail behavior.",
    tickWhen:
      "Tick this after Jira names the sender/receiver or chat-list state and what must appear, queue, retry, or clear.",
    template: ["Track-specific Chat/Text DM:", "- Accounts/direction: [sender -> receiver]", "- Message/chat state: [foreground / background / offline / relaunch]", "- Expected result: [visible message/list/badge state]"],
  },
  {
    id: "track-push",
    match: /push|badge/i,
    label: "Have we named the push/badge behavior being proved?",
    missingDetail:
      "This push/badge ticket should name notification type, badge rule, tap route, and foreground/background state.",
    tickWhen:
      "Tick this after Jira names the notification payload/type, badge increment/clear rule, and expected tap destination.",
    template: ["Track-specific Push/Badge:", "- Notification type: [friend_request / dm / local fixture]", "- App state: [foreground / background / cold launch]", "- Expected result: [badge/tap route/clear rule]"],
  },
  {
    id: "track-nearby-ble",
    match: /nearby|ble/i,
    label: "Have we named the Nearby/BLE identity proof?",
    missingDetail:
      "This Nearby/BLE ticket should name the devices, accounts, accepted friend identity, mesh peer count, and stale-peer cleanup expectation.",
    tickWhen:
      "Tick this after Jira names device/account setup and expected friend-nearby versus raw mesh peer behavior.",
    template: ["Track-specific Nearby/BLE:", "- Devices/accounts: [device + account list]", "- Expected identity match: [friend key/user must match peer]", "- Stale/ghost behavior: [cleanup/relaunch expectation]"],
  },
] as const;

export type JiraChecklistResult =
  | {
      status: "missing-config";
      issueKey: string;
      dashboardUrl: string;
      missingEnv: string[];
      message: string;
    }
  | {
      status: "invalid-issue";
      issueKey: string;
      dashboardUrl: string;
      message: string;
    }
  | {
      status: "fetch-error";
      issueKey: string;
      dashboardUrl: string;
      issueUrl?: string;
      message: string;
    }
  | {
      status: "ready";
      issueKey: string;
      dashboardUrl: string;
      issueUrl: string;
      data: ChecklistViewModel;
    };

export type JiraComment = {
  id: string;
  author: string;
  created: string;
  text: string;
};

export type JiraIssueLink = {
  key: string;
  relationship: string;
  summary: string;
  status: string;
};

export type ChecklistInput = {
  issueKey: string;
  summary: string;
  status: string;
  descriptionText: string;
  customFields: {
    mvpTrack: string;
    loopStage: string;
    verificationSurface: string;
    humanFinalReview: string;
    verifiedBuildOrCommit: string;
  };
  comments: JiraComment[];
  links: JiraIssueLink[];
  parent?: JiraIssueLink;
  issueUrl: string;
  issueType?: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  created?: string;
  updated?: string;
};

export type RecommendedAction = {
  title: string;
  body: string;
  steps: string[];
};

export type WorkRecipeViewModel = {
  kind: string;
  source: string;
  risk: string;
  testingPosture: string;
  proofAuthority: ProofAuthorityViewModel;
  aiOperatingModel: AiOperatingModelViewModel;
  issueSignals: string[];
  acceptanceQuestions: string[];
  reproduceSteps: string[];
  guardrails: string[];
  closeoutEvidence: string[];
  outOfScope: string[];
  surfaceCards: WorkSurfaceCard[];
};

export type HumanTestPlanViewModel = {
  title: string;
  summary: string;
  canAgentFinishAlone: boolean;
  agentStatusLabel: string;
  humanStatusLabel: string;
  agentUpdate: AgentTestUpdateViewModel;
  dashboardUpdateRule: string;
  steps: HumanTestStep[];
};

export type HumanTestStep = {
  title: string;
  owner: "Agent" | "John/Tay";
  surface: string;
  doThis: string;
  passMeans: string;
  failMeans: string;
};

export type HumanTestRequestedItem = {
  number: number;
  title: string;
  body: string;
  // Pre-segmented for rendering: each segment is either plain text or
  // an inline code fragment (originally wrapped in backticks by the ADF
  // parser). Lets the UI render <code> without re-implementing markdown.
  segments: HumanTestRequestedSegment[];
};

export type HumanTestRequestedSegment = {
  kind: "text" | "code";
  value: string;
};

// A single Human Test Result comment, posted by Buddy after a human runs
// the test and gets an AI verdict. Mirrors the Agent Test Update parser
// convention so the active step card can render past results inline.
export type HumanTestResultViewModel = {
  commentId: string;
  author: string;
  created: string;
  buildOrCommit: string;
  outcome: "pass" | "fail" | "inconclusive" | "unknown";
  verifier: string;
  findings: string;
  evidence: string;
  aiRecommendation: string;
  aiReasoning: string;
  aiNextStep: string;
};

export type AgentTestUpdateViewModel = {
  found: boolean;
  status: "passed" | "failed" | "inconclusive" | "not-run" | "unknown";
  label: string;
  buildOrCommit: string;
  humanVerificationNeeded: boolean | null;
  // Legacy single-line summary kept for backwards compatibility with the
  // AI handoff prompt builder and the existing coach payload.
  humanTestRequested: string;
  // Structured form for the inline panel: ordered-list items split out
  // with optional preamble. Empty when the parser can't find or split
  // the block — UI should fall back to `humanTestRequested`.
  humanTestRequestedItems: HumanTestRequestedItem[];
  // The preamble paragraph(s) before the first numbered item, if any.
  // For BDEV-493 this is the "Verification Surface = ..." sentence.
  humanTestRequestedPreamble: string;
  // Sentry issue IDs (APPLE-IOS-N etc.) detected anywhere in the block.
  // Lets the panel render a "watch in Sentry" callout without a separate
  // pass through the comment.
  sentryWatchIds: string[];
  evidence: string[];
  surfaceResults: {
    automated: string;
    simulator: string;
    workerSmoke: string;
  };
  // Concrete observable expectations pulled from the AI's prose so the
  // step card can show "you'll know it worked when X / something's off
  // if Y" without the tester having to scan the comment themselves.
  // Empty strings when the AI didn't write the canonical "Pass if … / Fail
  // if …" phrasing.
  passIf: string;
  failIf: string;
  source?: {
    author: string;
    created: string;
  };
};

export type AiOperatingModelViewModel = {
  mode: "human-alignment" | "agent-afk" | "human-verification";
  label: string;
  summary: string;
  smartZoneRule: string;
  handoffRule: string;
  promptRules: string[];
  checklist: AiOperatingCheck[];
};

export type AiOperatingCheck = {
  label: string;
  checked: boolean;
  detail: string;
  tickWhen: string;
  source: string;
};

export type ProofAuthorityViewModel = {
  level: "agent-can-confirm" | "human-real-phone-required" | "human-external-watch-required" | "needs-surface";
  label: string;
  summary: string;
  agentMayClaimDone: boolean;
  agentDoneLanguage: string;
  humanVerificationLanguage: string;
  proofRequired: string[];
};

export type WorkSurfaceCard = {
  label: string;
  active: boolean;
  detail: string;
  requiredBecause: string;
  needsHumanDevice: boolean;
  agentVerifiable: boolean;
};

export type ChecklistViewModel = ChecklistInput & {
  fields: {
    mvpTrack: FieldDisplay;
    loopStage: FieldDisplay;
    verificationSurface: FieldDisplay;
    humanFinalReview: FieldDisplay;
    verifiedBuildOrCommit: FieldDisplay;
  };
  workRecipe: WorkRecipeViewModel;
  proofRecipe: ProofRecipeViewModel;
  humanTestPlan: HumanTestPlanViewModel;
  // Past "Human Test Result" comments Buddy has posted on this ticket,
  // newest first. The active step card surfaces the latest result inline
  // so the human (and any future verifier) doesn't have to hop to Jira.
  humanTestResults: HumanTestResultViewModel[];
  recommendedAction: RecommendedAction;
  checklistSections: ChecklistSection[];
  commentTemplates: CommentTemplate[];
  codingAgentPrompt: string;
};

export type FieldDisplay = {
  label: string;
  fieldId: string;
  value: string;
  empty: boolean;
};

export type ChecklistSection = {
  title: string;
  items: ChecklistItem[];
};

export type ChecklistItem = {
  label: string;
  checked: boolean;
  detail: string;
  tickWhen: string;
  source?: string;
};

export type ProofRecipeRequirement = {
  id: string;
  label: string;
  surface: string;
  requiredBecause: string;
  hasConcreteProof: boolean;
  detail: string;
  tickWhen: string;
  templateLines: string[];
};

export type ProofRecipeViewModel = {
  foundStructuredRecipe: boolean;
  source: string;
  requiredSurfaces: string[];
  requirements: ProofRecipeRequirement[];
  missingCount: number;
  template: string;
};

export type CommentTemplate = {
  id: string;
  title: string;
  body: string;
  audience: "human" | "agent";
};

type JiraIssueResponse = {
  key?: string;
  fields?: Record<string, unknown>;
};

type JiraCommentsResponse = {
  comments?: unknown[];
};

export function normalizeIssueKey(value: string | string[] | undefined): string | null {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const issueKey = (rawValue || DEFAULT_ISSUE_KEY).trim().toUpperCase();
  return ISSUE_KEY_PATTERN.test(issueKey) ? issueKey : null;
}

export async function getJiraTicketChecklist(
  issueParam: string | string[] | undefined,
  overrides: { jiraApiToken?: string } = {},
): Promise<JiraChecklistResult> {
  const issueKey = normalizeIssueKey(issueParam);

  if (!issueKey) {
    return {
      status: "invalid-issue",
      issueKey: String(Array.isArray(issueParam) ? issueParam[0] : issueParam || ""),
      dashboardUrl: JIRA_DASHBOARD_URL,
      message: "Use a Jira issue key like BDEV-493.",
    };
  }

  const config = readJiraConfig(overrides);

  if ("missingEnv" in config) {
    return {
      status: "missing-config",
      issueKey,
      dashboardUrl: JIRA_DASHBOARD_URL,
      missingEnv: config.missingEnv,
      message: "Add the Jira environment variables on the server to load this checklist.",
    };
  }

  const issueUrl = `${config.baseUrl}/browse/${encodeURIComponent(issueKey)}`;

  try {
    const issueFields = [
      "summary",
      "status",
      "issuetype",
      "priority",
      "assignee",
      "reporter",
      "created",
      "updated",
      "description",
      "issuelinks",
      "parent",
      ...Object.values(MVP_CUSTOM_FIELDS),
    ].join(",");

    const [issueResponse, commentsResponse] = await Promise.all([
      jiraFetch<JiraIssueResponse>(
        config,
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(issueFields)}`,
      ),
      jiraFetch<JiraCommentsResponse>(
        config,
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?maxResults=50&orderBy=-created`,
      ),
    ]);

    const fields = issueResponse.fields || {};
    const comments = Array.isArray(commentsResponse.comments)
      ? commentsResponse.comments.map(toComment).filter((comment): comment is JiraComment => Boolean(comment))
      : [];

    const input: ChecklistInput = {
      issueKey: issueResponse.key || issueKey,
      summary: fieldToText(fields.summary),
      status: nestedText(fields.status, "name"),
      issueType: nestedText(fields.issuetype, "name"),
      priority: nestedText(fields.priority, "name"),
      assignee: nestedText(fields.assignee, "displayName"),
      reporter: nestedText(fields.reporter, "displayName"),
      created: fieldToText(fields.created),
      updated: fieldToText(fields.updated),
      descriptionText: adfToPlainText(fields.description),
      customFields: {
        mvpTrack: fieldToText(fields[MVP_CUSTOM_FIELDS.mvpTrack]),
        loopStage: fieldToText(fields[MVP_CUSTOM_FIELDS.loopStage]),
        verificationSurface: fieldToText(fields[MVP_CUSTOM_FIELDS.verificationSurface]),
        humanFinalReview: fieldToText(fields[MVP_CUSTOM_FIELDS.humanFinalReview]),
        verifiedBuildOrCommit: fieldToText(fields[MVP_CUSTOM_FIELDS.verifiedBuildOrCommit]),
      },
      comments,
      links: toIssueLinks(fields.issuelinks),
      parent: toParentLink(fields.parent),
      issueUrl,
    };

    return {
      status: "ready",
      issueKey,
      dashboardUrl: JIRA_DASHBOARD_URL,
      issueUrl,
      data: buildChecklistViewModel(input),
    };
  } catch (error) {
    return {
      status: "fetch-error",
      issueKey,
      dashboardUrl: JIRA_DASHBOARD_URL,
      issueUrl,
      message: error instanceof Error ? error.message : "Jira data could not be loaded.",
    };
  }
}

export function buildChecklistViewModel(input: ChecklistInput): ChecklistViewModel {
  const fields = {
    mvpTrack: fieldDisplay("MVP Track", MVP_CUSTOM_FIELDS.mvpTrack, input.customFields.mvpTrack),
    loopStage: fieldDisplay("MVP Loop Stage", MVP_CUSTOM_FIELDS.loopStage, input.customFields.loopStage),
    verificationSurface: fieldDisplay(
      "Verification Surface",
      MVP_CUSTOM_FIELDS.verificationSurface,
      input.customFields.verificationSurface,
    ),
    humanFinalReview: fieldDisplay(
      "Human Final Review",
      MVP_CUSTOM_FIELDS.humanFinalReview,
      input.customFields.humanFinalReview,
    ),
    verifiedBuildOrCommit: fieldDisplay(
      "Verified Build/Commit",
      MVP_CUSTOM_FIELDS.verifiedBuildOrCommit,
      input.customFields.verifiedBuildOrCommit,
    ),
  };

  const evidenceText = [input.descriptionText, ...input.comments.map((comment) => comment.text)].join("\n");
  const hasAcceptance = /acceptance|done when|pass\/fail|pass-fail/i.test(evidenceText);
  const hasRepro = /repro|steps to reproduce|actual result|expected result|device|simulator|build/i.test(evidenceText);
  const hasEvidence = /evidence|verified|build|commit|testflight|simulator|passed|failed/i.test(evidenceText);
  const hasOutOfScope = /out of scope|non-goal|not in scope|do not touch/i.test(evidenceText);
  const workRecipe = buildWorkRecipeViewModel(input, evidenceText);
  const proofRecipe = buildProofRecipeViewModel(input, evidenceText);
  const humanTestPlan = buildHumanTestPlanViewModel(input, workRecipe, proofRecipe);

  const checklistSections: ChecklistSection[] = [
    {
      title: "Acceptance Lock",
      items: [
        {
          label: "Am I looking at the right ticket?",
          checked: Boolean(input.issueKey && input.summary),
          detail: `${input.issueKey}: ${input.summary || "No summary returned"}`,
          tickWhen: "Tick this after you confirm the key and summary match the work you meant to run.",
        },
        {
          label: "Is this in the right bucket?",
          checked: !fields.mvpTrack.empty,
          detail: `MVP Track is ${fields.mvpTrack.value}.`,
          tickWhen: "Tick this after the track matches the real feature area, not just because Jira has any value.",
        },
        {
          label: "Do we know where it is in the loop?",
          checked: !fields.loopStage.empty,
          detail: `MVP Loop Stage is ${fields.loopStage.value}.`,
          tickWhen: "Tick this after the stage matches what is actually happening right now.",
        },
        {
          label: "Is the pass/fail target written down?",
          checked: hasAcceptance,
          detail: hasAcceptance
            ? `Acceptance language found for ${workRecipe.kind}.`
            : `Add locked ${workRecipe.kind} acceptance before coding.`,
          tickWhen: `Tick this only when a human could read Jira and know exactly what passes and fails for ${workRecipe.kind}.`,
          source: workRecipe.source,
        },
        ...workRecipe.acceptanceQuestions.map((question) => ({
          label: question,
          checked: hasQuestionEvidence(question, evidenceText),
          detail: `This question is required for ${workRecipe.kind}: ${workRecipe.risk}`,
          tickWhen: "Tick after the answer is written directly on the Jira ticket or in the proof recipe comment.",
          source: `${workRecipe.kind} recipe`,
        })),
        {
          label: "Did we explicitly say what is out of scope?",
          checked: hasOutOfScope,
          detail: hasOutOfScope
            ? "Out-of-scope language found in Jira."
            : `Suggested out of scope: ${workRecipe.outOfScope.join(", ")}.`,
          tickWhen: "Tick after Jira names what the agent must not touch during this ticket.",
          source: `${workRecipe.kind} scope guardrail`,
        },
      ],
    },
    {
      title: "Reproduce Current Failure",
      items: [
        {
          label: `Have we reproduced the ${workRecipe.kind} failure?`,
          checked: hasRepro,
          detail: hasRepro
            ? "Repro/device/build language found in Jira."
            : "Add a repro comment before coding or explicitly state why this is a preventive/test-only ticket.",
          tickWhen: "Tick after Jira has build, account/device/simulator, exact steps, expected result, and actual result.",
          source: workRecipe.source,
        },
        ...workRecipe.reproduceSteps.map((step) => ({
          label: step,
          checked: hasQuestionEvidence(step, evidenceText),
          detail: `Repro step generated for ${workRecipe.kind}.`,
          tickWhen: "Tick after this exact repro detail is written in Jira evidence.",
          source: `${workRecipe.kind} repro recipe`,
        })),
      ],
    },
    {
      title: "Agent Guardrails",
      items: [
        ...workRecipe.aiOperatingModel.checklist.map((item) => ({
          label: item.label,
          checked: item.checked,
          detail: item.detail,
          tickWhen: item.tickWhen,
          source: item.source,
        })),
        ...workRecipe.guardrails.map((guardrail) => ({
          label: guardrail,
          checked: hasAcceptance && hasOutOfScope,
          detail: `Guardrail generated for ${workRecipe.kind}. It keeps the patch inside the locked work/testing boundary.`,
          tickWhen: "Tick after the agent handoff or acceptance lock includes this constraint.",
          source: `${workRecipe.kind} coding guardrail`,
        })),
        {
          label: "Are blockers and related tickets linked?",
          checked: Boolean(input.parent || input.links.length > 0),
          detail: input.parent
            ? `Parent ${input.parent.key}: ${input.parent.summary || input.parent.status || "linked"}`
            : input.links.length
              ? `${input.links.length} linked issue${input.links.length === 1 ? "" : "s"}.`
              : "Link blockers, duplicates, parent epics, or related regressions before dispatch.",
          tickWhen: "Tick after links explain blockers, duplicates, regressions, or parent work clearly enough for the next agent.",
        },
      ],
    },
    {
      title: "Verification Plan",
      items: [
        {
          label: "Do we know how this will be verified?",
          checked: !fields.verificationSurface.empty,
          detail: `Verification Surface is ${fields.verificationSurface.value}.`,
          tickWhen: "Tick this after the surfaces match the ticket risk: automated/simulator where possible, real devices where required.",
          source: "Jira field",
        },
        ...proofRecipe.requirements.map((requirement) => ({
          label: requirement.label,
          checked: requirement.hasConcreteProof,
          detail: requirement.detail,
          tickWhen: requirement.tickWhen,
          source: requirement.requiredBecause,
        })),
      ],
    },
    {
      title: "Closeout Evidence",
      items: [
        ...workRecipe.closeoutEvidence.map((evidence) => ({
          label: evidence,
          checked: hasQuestionEvidence(evidence, evidenceText),
          detail: `Closeout evidence generated for ${workRecipe.kind}.`,
          tickWhen: "Tick after the Jira evidence comment includes this item with actual values, not placeholders.",
          source: `${workRecipe.kind} closeout recipe`,
        })),
        {
          label: "Is the human review state set?",
          checked: !fields.humanFinalReview.empty,
          detail: `Human Final Review is ${fields.humanFinalReview.value}.`,
          tickWhen: "Tick this after the value matches the real handoff state: Not Ready, Ready, Passed, or Failed.",
        },
        {
          label: "Is there a build or commit to verify?",
          checked: !fields.verifiedBuildOrCommit.empty,
          detail: `Verified Build/Commit is ${fields.verifiedBuildOrCommit.value}.`,
          tickWhen: "Tick this only when there is an exact build number, merge SHA, or commit that John/Tay can verify.",
        },
        {
          label: "Is there evidence on the ticket?",
          checked: hasEvidence,
          detail: hasEvidence ? "Evidence language found in Jira comments or description." : "Paste the verification evidence template after checks run.",
          tickWhen: "Tick this after the evidence says what ran, on what build/device/surface, and whether it passed or failed.",
        },
      ],
    },
  ];

  return {
    ...input,
    fields,
    workRecipe,
    proofRecipe,
    humanTestPlan,
    humanTestResults: extractHumanTestResults(input.comments),
    recommendedAction: getRecommendedAction({
      issueKey: input.issueKey,
      summary: input.summary,
      stage: input.customFields.loopStage,
      humanReview: input.customFields.humanFinalReview,
      verificationSurface: input.customFields.verificationSurface,
      verifiedBuildOrCommit: input.customFields.verifiedBuildOrCommit,
    }, workRecipe, proofRecipe, hasAcceptance),
    checklistSections,
    commentTemplates: buildCommentTemplates(input, workRecipe, proofRecipe, humanTestPlan),
    codingAgentPrompt: buildCodingAgentPrompt(input, workRecipe, proofRecipe, humanTestPlan),
  };
}

export function getRecommendedAction(input: {
  issueKey: string;
  summary: string;
  stage: string;
  humanReview: string;
  verificationSurface: string;
  verifiedBuildOrCommit: string;
}, workRecipe?: WorkRecipeViewModel, proofRecipe?: ProofRecipeViewModel, hasAcceptance = false): RecommendedAction {
  const stage = input.stage.toLowerCase();
  const review = input.humanReview.toLowerCase();
  const summaryLower = input.summary.toLowerCase();
  const domainHint = workRecipe?.kind || (summaryLower.includes("auth") || summaryLower.includes("token")
    ? "auth-token lifecycle"
    : "requested behavior");
  const proofMissing = proofRecipe?.missingCount || 0;
  const surfaceText = input.verificationSurface || "Automated, Simulator, or real-device evidence";

  if (!input.stage || stage.includes("selected") || stage.includes("repro")) {
    return {
      title: hasAcceptance ? "Finish the proof recipe" : `Lock acceptance for ${domainHint}`,
      body: `${input.issueKey} is still early in the MVP loop. The next move is to pin the smallest pass/fail target and required proof for ${domainHint}, then hand that locked recipe to the coding agent.`,
      steps: [
        `Answer the generated ${domainHint} acceptance questions in Jira.`,
        proofMissing
          ? `Fill ${proofMissing} missing proof detail${proofMissing === 1 ? "" : "s"} for ${surfaceText}.`
          : `Confirm the proof recipe for ${surfaceText} is still the smallest useful proof.`,
        "Only then start implementation on the scoped ticket.",
      ],
    };
  }

  if (stage.includes("accept") || stage.includes("ready")) {
    return {
      title: `Start the smallest ${domainHint} code pass`,
      body: `${input.issueKey} looks ready for implementation. Keep the patch centered on the locked ${domainHint} acceptance and the generated proof recipe.`,
      steps: [
        `Write or run the focused failing check for ${domainHint}.`,
        workRecipe?.guardrails[0] || "Patch only the behavior named by the ticket.",
        "Prepare the verification evidence comment before requesting human review.",
      ],
    };
  }

  if (stage.includes("coding") || stage.includes("agent")) {
    return {
      title: "Finish evidence and build handoff",
      body: `${input.issueKey} is in the coding lane. The next useful action is to prove the ${domainHint} fix against the generated work/testing recipe and record the build or commit that humans can verify.`,
      steps: [
        proofRecipe?.requirements.length
          ? `Run the named proof steps: ${proofRecipe.requirements.map((requirement) => requirement.surface).join(", ")}.`
          : "Run the narrow automated checks plus the strongest relevant build check.",
        `Record ${input.verifiedBuildOrCommit || "the commit SHA or build number"} in Verified Build/Commit.`,
        "Paste the verification evidence comment and move only to human review when the evidence is real.",
      ],
    };
  }

  if (stage.includes("review") || stage.includes("ci")) {
    return {
      title: "Review the PR against the lock",
      body: `${input.issueKey} is in the review/CI lane. The next move is to make sure the PR references Jira, stays inside the locked acceptance, and has real checks behind it.`,
      steps: [
        "Confirm the PR links back to the BDEV ticket.",
        "Compare the diff against the locked acceptance and reject unrelated cleanup.",
        "Move forward only after CI is green or failures are proven unrelated.",
      ],
    };
  }

  if (stage.includes("build")) {
    return {
      title: "Put the verified change in a known build",
      body: `${input.issueKey} needs a build/commit handoff before John or Tay can do final verification.`,
      steps: [
        `Record ${input.verifiedBuildOrCommit || "the TestFlight build, merge SHA, or exact commit"} on the ticket.`,
        "Attach the PR/build link in Jira.",
        "Do not close until the named verification surface has been checked.",
      ],
    };
  }

  if (stage.includes("failed") || review.includes("failed")) {
    return {
      title: "Reopen from the failed evidence",
      body: `${input.issueKey} has failed verification. The next pass should start from the exact failed evidence, not a fresh broad fix.`,
      steps: [
        "Copy the failed human/automated evidence into the acceptance thread.",
        "Link any blocker or child issue that explains the failure.",
        "Move back to the earliest loop stage that matches the failure.",
      ],
    };
  }

  if (stage.includes("human") || review.includes("ready")) {
    if (workRecipe?.proofAuthority.agentMayClaimDone) {
      return {
        title: "Review the agent proof package",
        body: `${input.issueKey} can be fully proven by the agent because the required surfaces are automated/simulator checks. John/Tay should verify the evidence package, not redo real-phone testing.`,
        steps: [
          `Confirm every named proof step passed: ${proofRecipe?.requirements.map((requirement) => requirement.surface).join(", ") || surfaceText}.`,
          "Check the agent included command output, simulator result, build/commit, and no unrelated scope changes.",
          "If the proof is complete, Human Final Review can pass from evidence review.",
        ],
      };
    }

    return {
      title: "Run human final review",
      body: `${input.issueKey} is waiting on final verification for ${domainHint}. Do not mark Done until the required surface evidence is on Jira.`,
      steps: [
        `Verify on ${surfaceText}.`,
        "Post pass/fail evidence with device, build, account, and timestamp details.",
        "Set Human Final Review to Passed only with evidence already present.",
      ],
    };
  }

  if (review.includes("passed")) {
    return {
      title: "Close with evidence attached",
      body: `${input.issueKey} has human review marked Passed. Confirm the Jira evidence references the verified build or commit before closure.`,
      steps: [
        "Check the evidence comment and linked PR/build match the final field values.",
        "Confirm no linked blocker remains open for this acceptance.",
        "Move the ticket forward only if Jira already contains the proof.",
      ],
    };
  }

  return {
    title: "Reconcile loop state",
    body: `${input.issueKey} has a stage/review combination that needs a quick PM pass before more coding.`,
    steps: [
      "Compare MVP Loop Stage with Human Final Review.",
      "Update the next owner and verification surface in Jira.",
      "Continue the loop from the first unchecked checklist item.",
    ],
  };
}

export function adfToPlainText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return compactText(value);

  const parts: string[] = [];
  // Track the current ordered-list counter so list items can render as
  // "1. ", "2. ", etc. — preserves structure when downstream code splits
  // the parsed text into items (e.g. the "Human test requested" panel).
  const orderedListCounters: number[] = [];

  function hasMark(record: Record<string, unknown>, type: string): boolean {
    if (!Array.isArray(record.marks)) return false;
    return record.marks.some(
      (mark) =>
        mark && typeof mark === "object" && (mark as Record<string, unknown>).type === type,
    );
  }

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;

    if (record.type === "orderedList") {
      const startAttr = (record.attrs as Record<string, unknown> | undefined)?.order;
      const start = typeof startAttr === "number" && Number.isFinite(startAttr) ? startAttr : 1;
      orderedListCounters.push(start);
    }

    if (typeof record.text === "string") {
      // Wrap text marked as `code` in backticks so the parser preserves
      // the visual cue (and downstream UI can render it as <code>).
      if (hasMark(record, "code")) {
        parts.push("`" + record.text + "`");
      } else {
        parts.push(record.text);
      }
    }

    if (record.type === "hardBreak") {
      parts.push("\n");
    }

    // Prefix ordered-list items with their number ("1. ", "2. "...) so
    // structure survives the round trip. Bullet-list items get a "- "
    // bullet for the same reason.
    if (record.type === "listItem") {
      if (orderedListCounters.length > 0) {
        const idx = orderedListCounters.length - 1;
        parts.push(`${orderedListCounters[idx]}. `);
        orderedListCounters[idx] += 1;
      } else {
        parts.push("- ");
      }
    }

    if (Array.isArray(record.content)) {
      for (const child of record.content) {
        visit(child);
      }
    }

    if (
      record.type === "paragraph" ||
      record.type === "heading" ||
      record.type === "listItem" ||
      record.type === "blockquote"
    ) {
      parts.push("\n");
    }

    if (record.type === "orderedList") {
      orderedListCounters.pop();
    }
  }

  visit(value);
  return compactText(parts.join(""));
}

function fieldDisplay(label: string, fieldId: string, value: string): FieldDisplay {
  const normalized = value || "Not set";
  return {
    label,
    fieldId,
    value: normalized,
    empty: !value,
  };
}

function buildWorkRecipeViewModel(input: ChecklistInput, evidenceText: string): WorkRecipeViewModel {
  const config = findWorkKindConfig(input, evidenceText);
  const surfaceConfigs = parseSurfaceRequirements(input.customFields.verificationSurface);
  const issueSignals = buildIssueSignals(input, evidenceText, surfaceConfigs);
  const surfaceCards = buildSurfaceCards(surfaceConfigs);
  const proofAuthority = buildProofAuthority(surfaceCards);
  const aiOperatingModel = buildAiOperatingModel(input, evidenceText, config.label, proofAuthority);
  const needsHumanDevice = surfaceCards.some((card) => card.needsHumanDevice);
  const testingPosture = needsHumanDevice
    ? "Simulator and automated checks can prepare this ticket, but final pass needs the named real-device surface."
    : proofAuthority.agentMayClaimDone
      ? "The agent can fully verify this ticket with automated/simulator proof, then present the proof package for John/Tay review."
      : surfaceConfigs.length
        ? proofAuthority.summary
      : "Set Verification Surface in Jira before dispatching code so the checklist can generate the right proof path.";

  return {
    kind: config.label,
    source: config.id === "general"
      ? "Generated from the issue summary because MVP Track did not match a specialized recipe."
      : `Generated from ${input.customFields.mvpTrack || "the issue summary"} and the ticket text.`,
    risk: config.risk,
    testingPosture,
    proofAuthority,
    aiOperatingModel,
    issueSignals,
    acceptanceQuestions: [...config.acceptanceQuestions],
    reproduceSteps: [...config.reproduceSteps],
    guardrails: [...config.guardrails],
    closeoutEvidence: [...config.closeoutEvidence],
    outOfScope: [...config.outOfScope],
    surfaceCards,
  };
}

function findWorkKindConfig(input: ChecklistInput, evidenceText: string) {
  const trackMatch = input.customFields.mvpTrack
    ? WORK_KIND_CONFIGS.find((config) => config.match.test(input.customFields.mvpTrack))
    : undefined;
  if (trackMatch) return trackMatch;

  // Summary-regex matching is a fallback for tickets that have NOT yet had
  // an MVP Track set. When MVP Track *is* set but didn't match a config
  // above, prefer the labelled general recipe over a loose summary match —
  // otherwise a Relay/Noise or Web-marketing ticket can latch onto
  // Friendship/Auth because the description mentions a friend graph or a
  // token. The MVP Track field is John's authoritative routing; trust it.
  const searchText = input.customFields.mvpTrack
    ? ""
    : [input.summary, input.descriptionText, evidenceText].join("\n");

  return (
    (searchText && WORK_KIND_CONFIGS.find((config) => config.match.test(searchText))) || {
      id: "general",
      label: input.customFields.mvpTrack || "General Stabilization",
      risk: "This ticket still needs a narrow acceptance lock so the agent does not drift into adjacent fixes.",
      acceptanceQuestions: [
        "What is the smallest user-visible behavior that must pass?",
        "What exact regression or missing behavior counts as fail?",
        "Which related systems are explicitly out of scope for this ticket?",
      ],
      reproduceSteps: [
        "Name the build, account, and starting state.",
        "Run the shortest repro path from the ticket.",
        "Record expected result, actual result, and the log/screenshot evidence needed.",
      ],
      guardrails: [
        "Keep the patch scoped to the locked acceptance.",
        "Prefer one focused failing check over broad cleanup.",
        "Link blockers instead of expanding the ticket mid-fix.",
      ],
      closeoutEvidence: [
        "Record build or commit.",
        "Record the exact verification surface used.",
        "Paste pass/fail evidence before Human Final Review moves to Passed.",
      ],
      outOfScope: ["unrelated cleanup", "polish", "adjacent feature fixes not named by acceptance"],
    }
  );
}

function buildIssueSignals(
  input: ChecklistInput,
  evidenceText: string,
  surfaceConfigs: SurfaceConfig[],
): string[] {
  const signals = [
    input.customFields.mvpTrack ? `Track: ${input.customFields.mvpTrack}` : "Track missing",
    input.customFields.loopStage ? `Loop stage: ${input.customFields.loopStage}` : "Loop stage missing",
    surfaceConfigs.length
      ? `Surfaces: ${surfaceConfigs.map((surface) => surface.label).join(", ")}`
      : "Verification Surface missing",
  ];

  if (/acceptance|done when|pass\/fail|pass-fail/i.test(evidenceText)) {
    signals.push("Acceptance language found");
  } else {
    signals.push("Acceptance still needs locking");
  }

  if (input.links.length || input.parent) {
    signals.push(`${input.links.length + (input.parent ? 1 : 0)} linked issue signal${input.links.length + (input.parent ? 1 : 0) === 1 ? "" : "s"}`);
  } else {
    signals.push("No parent/link signal returned");
  }

  return signals;
}

function buildSurfaceCards(surfaceConfigs: SurfaceConfig[]): WorkSurfaceCard[] {
  if (!surfaceConfigs.length) {
    return [
      {
        label: "Verification Surface missing",
        active: false,
        detail: "Set this Jira field first. Without it, the page cannot know whether simulator is enough or real phones are mandatory.",
        requiredBecause: "Jira field is empty",
        needsHumanDevice: false,
        agentVerifiable: false,
      },
    ];
  }

  return surfaceConfigs.map((surface) => ({
    label: surface.label,
    active: true,
    detail: surfaceDetail(surface.id),
    requiredBecause: `Verification Surface includes ${surface.label}`,
    needsHumanDevice: /one-phone|two-phones|testflight-apns|ble/.test(surface.id),
    agentVerifiable: /automated|simulator|worker-smoke/.test(surface.id),
  }));
}

function buildProofAuthority(surfaceCards: WorkSurfaceCard[]): ProofAuthorityViewModel {
  const activeCards = surfaceCards.filter((card) => card.active);
  const proofRequired = activeCards.map((card) => card.label);
  const needsRealPhone = activeCards.some((card) => card.needsHumanDevice);
  const needsExternalWatch = activeCards.some((card) => /Sentry Watch/i.test(card.label));
  const allAgentVerifiable = activeCards.length > 0 && activeCards.every((card) => card.agentVerifiable);

  if (!activeCards.length) {
    return {
      level: "needs-surface",
      label: "Set verification surface first",
      summary: "The ticket cannot say who can prove it done until Jira names Automated, Simulator, or real-phone surfaces.",
      agentMayClaimDone: false,
      agentDoneLanguage: "Agent may not claim done yet.",
      humanVerificationLanguage: "John/Tay should first set Verification Surface on the Jira ticket.",
      proofRequired: [],
    };
  }

  if (needsRealPhone) {
    return {
      level: "human-real-phone-required",
      label: "Real phone required",
      summary: "The agent can prepare code and automated/simulator evidence, but final done requires John/Tay on the named physical-device surface.",
      agentMayClaimDone: false,
      agentDoneLanguage: "Agent may claim code-ready with prep evidence, not 100% done.",
      humanVerificationLanguage: "John/Tay must run the real-phone/TestFlight/APNs/BLE check before final pass.",
      proofRequired,
    };
  }

  if (needsExternalWatch && !allAgentVerifiable) {
    return {
      level: "human-external-watch-required",
      label: "External watch required",
      summary: "The agent can prepare the fix and proof package, but the final result depends on a Sentry/release watch outside local tests.",
      agentMayClaimDone: false,
      agentDoneLanguage: "Agent may claim code-ready with local proof, not 100% done.",
      humanVerificationLanguage: "John/Tay must review the external watch result before final pass.",
      proofRequired,
    };
  }

  if (allAgentVerifiable) {
    return {
      level: "agent-can-confirm",
      label: "Agent can confirm done",
      summary: "The required surfaces are automated/simulator/worker checks. The agent can prove the fix is complete and present the evidence for John/Tay review.",
      agentMayClaimDone: true,
      agentDoneLanguage: "Agent may claim 100% done after all named proof steps pass and evidence is attached.",
      humanVerificationLanguage: "John/Tay verify the proof package rather than rerunning real-phone checks.",
      proofRequired,
    };
  }

  return {
    level: "human-external-watch-required",
    label: "Human verification required",
    summary: "At least one required surface is not agent-verifiable from automated/simulator checks.",
    agentMayClaimDone: false,
    agentDoneLanguage: "Agent may claim code-ready with evidence, not 100% done.",
    humanVerificationLanguage: "John/Tay must run or review the non-agent-verifiable proof.",
    proofRequired,
  };
}

function buildAiOperatingModel(
  input: ChecklistInput,
  evidenceText: string,
  workKind: string,
  proofAuthority: ProofAuthorityViewModel,
): AiOperatingModelViewModel {
  const stage = input.customFields.loopStage.toLowerCase();
  const hasAcceptance = /acceptance|done when|pass\/fail|pass-fail/i.test(evidenceText);
  const hasRepro = /repro|steps to reproduce|actual result|expected result|device|simulator|build/i.test(evidenceText);
  const hasVerticalSlice = /vertical slice|traceable bullet|thin slice|end-to-end|smallest.*slice|one ticket/i.test(evidenceText);
  const hasTdd = /tdd|red green|red-green|failing test|test first|confirmed red/i.test(evidenceText);
  const hasFreshReview = /fresh context|fresh-context|review agent|automated review|code review|separate reviewer/i.test(evidenceText);
  const hasModuleBoundary = /deep module|module boundary|service boundary|test boundary|public interface/i.test(evidenceText);
  const hasDocPolicy = /doc rot|stale doc|close issue|jira source of truth|do not keep stale/i.test(evidenceText);
  const readyForAfk = hasAcceptance && hasRepro && input.customFields.verificationSurface;
  const mode = !readyForAfk
    ? "human-alignment"
    : proofAuthority.agentMayClaimDone || stage.includes("coding") || stage.includes("review") || stage.includes("ci")
      ? "agent-afk"
      : "human-verification";

  const label = mode === "human-alignment"
    ? "Human-in-loop alignment"
    : mode === "agent-afk"
      ? "Agent AFK implementation"
      : "Human verification gate";

  const summary = mode === "human-alignment"
    ? "Keep John/Tay in the loop until acceptance, repro, and proof surface are locked. Do not send an agent into broad discovery yet."
    : mode === "agent-afk"
      ? "This ticket is shaped enough for a small agent pass. The agent should stay in the smart zone, implement one traceable slice, and return proof."
      : "The agent can prepare evidence, but the final pass depends on human/device/external verification.";

  const smartZoneRule = "Keep the agent task small enough for one clean context: one BDEV ticket, one locked acceptance, one proof recipe, no broad cleanup.";
  const handoffRule = mode === "agent-afk"
    ? "Dispatch only the current BDEV ticket plus the generated agent prompt. Avoid stuffing old transcripts or stale plans into context."
    : "Do not dispatch implementation yet; first turn the missing checklist items into Jira evidence or a proof recipe comment.";

  return {
    mode,
    label,
    summary,
    smartZoneRule,
    handoffRule,
    promptRules: [
      smartZoneRule,
      "Prefer a vertical slice/traceable bullet: the smallest end-to-end behavior that gives feedback.",
      "Use TDD where possible: write or identify the failing check first, confirm red, then make it green.",
      "After implementation, review in a fresh context or with a separate reviewer rather than asking the same saturated context to judge itself.",
      "Keep durable truth in Jira fields/comments; avoid stale local planning docs becoming hidden source of truth.",
      "Protect deep module boundaries: test through stable public/service interfaces instead of wrapping tiny internals with brittle mocks.",
    ],
    checklist: [
      {
        label: "Is this one smart-zone-sized ticket?",
        checked: Boolean(input.issueKey) && !/everything|all issues|entire app|whole system/i.test(input.summary),
        detail: `Scope should stay at ${input.issueKey}: ${input.summary || workKind}.`,
        tickWhen: "Tick when this is one bounded BDEV ticket, not an 'AI fix everything' bundle.",
        source: "Smart zone task sizing",
      },
      {
        label: "Has human alignment happened before AFK work?",
        checked: hasAcceptance && hasRepro,
        detail: hasAcceptance && hasRepro
          ? "Acceptance and repro evidence found."
          : "Missing acceptance and/or repro evidence. Keep this human-in-loop.",
        tickWhen: "Tick when Jira contains locked acceptance plus repro/build/account context.",
        source: "Human-in-loop before AFK",
      },
      {
        label: "Is this framed as a vertical slice/traceable bullet?",
        checked: hasVerticalSlice,
        detail: hasVerticalSlice
          ? "Vertical-slice language found."
          : "Name the smallest end-to-end behavior that proves progress, not a horizontal layer-only task.",
        tickWhen: "Tick when Jira says what visible/API/device behavior will work at the end of this ticket.",
        source: "Traceable bullets",
      },
      {
        label: "Is there a TDD or failing-check plan?",
        checked: hasTdd || proofAuthority.proofRequired.some((proof) => /Automated|Simulator|Worker/i.test(proof)),
        detail: "Agent should confirm a failing or targeted check before claiming implementation proof.",
        tickWhen: "Tick when the proof recipe names the failing test, simulator scenario, or smoke check to run first.",
        source: "Red-green feedback loop",
      },
      {
        label: "Will review happen outside the implementation context?",
        checked: hasFreshReview,
        detail: hasFreshReview
          ? "Fresh-review language found."
          : "Ask for fresh-context review or separate reviewer after the agent patch.",
        tickWhen: "Tick when Jira/agent handoff requires a separate review pass after implementation.",
        source: "Fresh context review",
      },
      {
        label: "Are module/test boundaries explicit?",
        checked: hasModuleBoundary,
        detail: hasModuleBoundary
          ? "Module/test-boundary language found."
          : "Name the service/module boundary or public interface the agent should test through.",
        tickWhen: "Tick when the handoff says which deep module/service/API boundary owns the behavior.",
        source: "Deep modules",
      },
      {
        label: "Will Jira remain the durable source of truth?",
        checked: hasDocPolicy || /jira/i.test(evidenceText),
        detail: "Keep proof and decisions in Jira fields/comments so old local docs do not rot into misleading context.",
        tickWhen: "Tick when the agent is told to put evidence back in Jira and avoid relying on stale local planning files.",
        source: "Doc rot prevention",
      },
    ],
  };
}

function surfaceDetail(id: string): string {
  switch (id) {
    case "automated":
      return "Use this for deterministic regression locks: unit tests, fixtures, Swift package tests, worker tests, or parser/state checks.";
    case "simulator":
      return "Use this for UI state, routing, local notifications, cold launch, and flows that do not require APNs or BLE radios.";
    case "one-phone":
      return "Use this when device state, build install, account state, or foreground/background behavior matters on one physical phone.";
    case "two-phones":
      return "Use this for sender/receiver, friend symmetry, offline delivery, and cross-account behavior that one device cannot prove.";
    case "testflight-apns":
      return "Use this for real push delivery, notification receipt, badge changes, and tap routing through TestFlight/APNs.";
    case "ble":
      return "Use this for raw mesh peers, accepted-friend nearby count, Bluetooth identity matching, and stale-peer cleanup.";
    case "worker-smoke":
      return "Use this for backend/API smoke proof: exact endpoint/request, response, and server-side log or status evidence.";
    case "sentry-watch":
      return "Use this for production-noise proof: release/build, issue group/query, watch window, and pass condition.";
    default:
      return "Use the proof recipe to name the exact command, scenario, or device evidence required.";
  }
}

function buildProofRecipeViewModel(input: ChecklistInput, evidenceText: string): ProofRecipeViewModel {
  const structuredRecipe = extractProofRecipeBlock(evidenceText);
  const searchText = structuredRecipe || evidenceText;
  const surfaceRequirements = parseSurfaceRequirements(input.customFields.verificationSurface);
  const requirements: ProofRecipeRequirement[] = surfaceRequirements.map((config) => {
    const detail = findRequirementDetail(config.label, config.aliases, searchText);
    const hasConcreteProof = Boolean(detail);

    return {
      id: config.id,
      label: config.checklistLabel,
      surface: config.label,
      requiredBecause: `Verification Surface includes ${config.label}`,
      hasConcreteProof,
      detail: hasConcreteProof ? `Recipe/detail found: ${detail}` : config.missingDetail,
      tickWhen: config.tickWhen,
      templateLines: [...config.template],
    };
  });

  for (const hint of TRACK_PROOF_HINTS) {
    const applies = hint.match.test(input.customFields.mvpTrack) || hint.match.test(input.summary);
    if (!applies) continue;

    const detail = findRequirementDetail(hint.label, [hint.match], searchText);
    requirements.push({
      id: hint.id,
      label: hint.label,
      surface: "Track-specific",
      requiredBecause: `MVP Track is ${input.customFields.mvpTrack || "inferred from summary"}`,
      hasConcreteProof: Boolean(detail),
      detail: detail ? `Track proof detail found: ${detail}` : hint.missingDetail,
      tickWhen: hint.tickWhen,
      templateLines: [...hint.template],
    });
  }

  const uniqueRequirements = dedupeRequirements(requirements);

  return {
    foundStructuredRecipe: Boolean(structuredRecipe),
    source: structuredRecipe
      ? "Structured MVP proof recipe found in Jira description/comments."
      : "Generated from MVP Track and Verification Surface. Add a proof recipe comment to make it precise.",
    requiredSurfaces: uniqueRequirements.map((requirement) => requirement.surface),
    requirements: uniqueRequirements,
    missingCount: uniqueRequirements.filter((requirement) => !requirement.hasConcreteProof).length,
    template: buildProofRecipeTemplate(input, uniqueRequirements),
  };
}

function parseSurfaceRequirements(value: string): SurfaceConfig[] {
  const normalized = compactText(value);
  if (!normalized) return [];

  const candidates = normalized.split(",").map((item) => item.trim()).filter(Boolean);
  const configs: SurfaceConfig[] = [];

  for (const candidate of candidates.length ? candidates : [normalized]) {
    const config = SURFACE_CONFIGS.find(
      (surface) => surface.label.toLowerCase() === candidate.toLowerCase() || surface.aliases.some((alias) => alias.test(candidate)),
    );

    if (config) configs.push(config);
  }

  for (const config of SURFACE_CONFIGS) {
    if (config.aliases.some((alias) => alias.test(normalized))) configs.push(config);
  }

  return dedupeSurfaceConfigs(configs);
}

function dedupeSurfaceConfigs(configs: SurfaceConfig[]): SurfaceConfig[] {
  const seen = new Set<string>();
  return configs.filter((config) => {
    if (seen.has(config.id)) return false;
    seen.add(config.id);
    return true;
  });
}

function dedupeRequirements(requirements: ProofRecipeRequirement[]): ProofRecipeRequirement[] {
  const seen = new Set<string>();
  return requirements.filter((requirement) => {
    if (seen.has(requirement.id)) return false;
    seen.add(requirement.id);
    return true;
  });
}

function extractProofRecipeBlock(value: string): string {
  const lines = value.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /mvp proof recipe|proof recipe|required proof steps/i.test(line));

  if (startIndex === -1) return "";

  const collected: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] || "";
    if (index > startIndex && /^#{1,6}\s+\S|^[A-Z][A-Za-z /-]{2,}:$/.test(line.trim()) && !isKnownProofHeading(line)) {
      break;
    }
    collected.push(line);
  }

  return compactText(collected.join("\n"));
}

function isKnownProofHeading(value: string): boolean {
  const line = value.trim();
  return SURFACE_CONFIGS.some((config) => config.aliases.some((alias) => alias.test(line))) || /acceptance|required proof|out of scope/i.test(line);
}

function findRequirementDetail(label: string, aliases: readonly RegExp[], value: string): string {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const matches = aliases.some((alias) => alias.test(line)) || line.toLowerCase().startsWith(label.toLowerCase());
    if (!matches) continue;

    const afterColon = line.includes(":") ? compactText(line.slice(line.indexOf(":") + 1)) : "";
    if (isConcreteProofDetail(afterColon)) return afterColon;

    const following = collectFollowingProofLines(lines, index + 1);
    if (isConcreteProofDetail(following)) return following;

    if (isConcreteProofDetail(line) && !isSurfaceOnlyLine(line)) return line;
  }

  return "";
}

function collectFollowingProofLines(lines: string[], startIndex: number): string {
  const collected: string[] = [];

  for (let index = startIndex; index < lines.length && collected.length < 5; index += 1) {
    const line = lines[index];
    if (isKnownProofHeading(line) && collected.length > 0) break;
    if (isSurfaceOnlyLine(line)) break;
    collected.push(line.replace(/^[-*]\s*/, ""));
  }

  return compactText(collected.join("\n"));
}

function isSurfaceOnlyLine(value: string): boolean {
  const normalized = value.replace(/^[-*]\s*/, "").replace(/:$/, "").trim().toLowerCase();
  return SURFACE_CONFIGS.some((config) => config.label.toLowerCase() === normalized);
}

function isConcreteProofDetail(value: string): boolean {
  const withoutPlaceholders = value.replace(/\[[^\]]+\]/g, "").trim();
  if (withoutPlaceholders.length < 10) return false;
  if (isSurfaceOnlyLine(withoutPlaceholders)) return false;

  return /command|xcode|swift|npm|test|fixture|scenario|device|account|build|endpoint|request|expected|result|sentry|release|window|\/v\d|APPLE|phone|simulator|apns|ble|retry|auth|message|badge|peer/i.test(
    withoutPlaceholders,
  );
}

function hasQuestionEvidence(question: string, evidenceText: string): boolean {
  const normalizedEvidence = evidenceText.toLowerCase();
  const keywords = question
    .toLowerCase()
    .replace(/[^a-z0-9/ -]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 4 && !["which", "being", "after", "should", "exact", "record", "ticket", "state"].includes(word));

  if (!keywords.length) return false;

  const matchCount = keywords.filter((word) => normalizedEvidence.includes(word)).length;
  return matchCount >= Math.min(2, keywords.length);
}

function buildProofRecipeTemplate(input: ChecklistInput, requirements: ProofRecipeRequirement[]): string {
  const requirementLines = requirements.length
    ? requirements.flatMap((requirement) => requirement.templateLines)
    : [
        "Automated / Simulator / Device:",
        "- Proof step: [exact command, scenario, or device check]",
        "- Expected result: [what proves pass/fail]",
      ];

  return [
    `${input.issueKey} MVP proof recipe`,
    "",
    `Ticket: ${input.issueUrl}`,
    `Track: ${input.customFields.mvpTrack || "[set MVP Track]"}`,
    `Verification Surface: ${input.customFields.verificationSurface || "[set Verification Surface]"}`,
    "",
    "Acceptance:",
    "- Pass: [smallest concrete pass condition]",
    "- Fail: [specific regression or missing behavior]",
    "",
    "Required proof steps:",
    ...requirementLines,
    "",
    "Out of scope:",
    "- [anything the agent must not touch]",
  ].join("\n");
}

function buildHumanTestPlanViewModel(
  input: ChecklistInput,
  workRecipe: WorkRecipeViewModel,
  proofRecipe: ProofRecipeViewModel,
): HumanTestPlanViewModel {
  const agentUpdate = extractAgentTestUpdate(input.comments);
  const canAgentFinishAlone = workRecipe.proofAuthority.agentMayClaimDone;
  const surfaceText = input.customFields.verificationSurface || "the surfaces named on this ticket";
  const buildOrCommit = agentUpdate.buildOrCommit || input.customFields.verifiedBuildOrCommit;
  const agentHasPassed = agentUpdate.status === "passed";
  const agentFailed = agentUpdate.status === "failed";
  const needsHumanDevice = workRecipe.surfaceCards.some((card) => card.needsHumanDevice);
  const proofGapText = proofRecipe.missingCount
    ? `${proofRecipe.missingCount} proof detail${proofRecipe.missingCount === 1 ? "" : "s"} still need to be made concrete.`
    : "The required proof details are present.";

  const agentStatusLabel = agentUpdate.found
    ? agentFailed
      ? "Agent says testing failed"
      : agentHasPassed
        ? "Agent says its checks passed"
        : "Agent update found, but not passed yet"
    : "No agent test update found yet";

  const humanStatusLabel = canAgentFinishAlone
    ? agentHasPassed
      ? "John/Tay review the proof package"
      : "Wait for agent proof before signing off"
    : needsHumanDevice
      ? "John/Tay still need to test a real build/device"
      : "John/Tay need to review the non-local proof";

  const steps: HumanTestStep[] = [
    {
      title: "Check what the agent already proved",
      owner: "John/Tay",
      surface: "Jira evidence",
      doThis: agentUpdate.found
        ? `Read the latest Agent Test Update from ${agentUpdate.source?.author || "the agent"}. Build/commit says: ${buildOrCommit || "not filled in yet"}.`
        : "Ask the coding agent to paste the Agent Test Update comment template into Jira before you do final review.",
      passMeans: agentHasPassed
        ? "The update says the agent checks passed and includes real commands, simulator notes, logs, or screenshots."
        : "The update clearly says which agent checks passed, failed, or were not required.",
      failMeans: "There is no agent update, the update has placeholders, or it says a required automated/simulator/worker check failed.",
    },
  ];

  if (canAgentFinishAlone) {
    steps.push({
      title: "Review the proof instead of re-testing phones",
      owner: "John/Tay",
      surface: surfaceText,
      doThis: "Open the PR/Jira evidence and confirm every required automated or simulator check is listed as passed with the exact command/scenario and build or commit.",
      passMeans: "The proof covers every required surface, the build/commit is exact, and no real-phone surface is required.",
      failMeans: "A required proof step is missing, failed, vague, or depends on real APNs/BLE/phone behavior.",
    });
  } else {
    steps.push({
      title: "Confirm the exact build or commit you are testing",
      owner: "John/Tay",
      surface: "Build handoff",
      doThis: buildOrCommit
        ? `Use ${buildOrCommit}. If your installed app is not that build/commit, stop and install the right build first.`
        : "Do not start final verification yet. Ask the agent/merger to fill Verified Build/Commit or include it in the Agent Test Update.",
      passMeans: "The app/build in your hand matches the Jira field or Agent Test Update exactly.",
      failMeans: "You cannot tell what build contains the fix, or your phone is on a different build.",
    });

    steps.push(buildHumanDeviceStep(input, workRecipe, surfaceText));
  }

  steps.push({
    title: "Write one clear PASS or FAIL back to Jira",
    owner: "John/Tay",
    surface: "Jira final evidence",
    doThis: canAgentFinishAlone
      ? "If the proof package is complete, comment that evidence review passed. If not, comment exactly what is missing and leave Human Final Review as Failed or Not Ready."
      : "After the real-device/external check, paste the result into Jira with device, account, build, time, and what you saw.",
    passMeans: canAgentFinishAlone
      ? "Human Final Review can be Passed from evidence review because the agent-verifiable proof is complete."
      : "Human Final Review can be Passed only after your real-device/external evidence is on the ticket.",
    failMeans: "Set Human Final Review to Failed, set MVP Loop Stage to Failed/Reopened, and say exactly which step failed.",
  });

  return {
    title: `${input.issueKey} human test plan`,
    summary: canAgentFinishAlone
      ? `This ticket can be signed off from agent proof because Jira only asks for ${surfaceText}. ${proofGapText}`
      : `The agent can prepare this ticket, but John/Tay still need final verification for ${surfaceText}. ${proofGapText}`,
    canAgentFinishAlone,
    agentStatusLabel,
    humanStatusLabel,
    agentUpdate,
    dashboardUpdateRule:
      "This dashboard is read from Jira. Agents update it by adding the Agent Test Update comment, setting MVP Loop Stage, setting Human Final Review, and filling Verified Build/Commit.",
    steps,
  };
}

function buildHumanDeviceStep(
  input: ChecklistInput,
  workRecipe: WorkRecipeViewModel,
  surfaceText: string,
): HumanTestStep {
  const kind = workRecipe.kind.toLowerCase();
  const base = {
    owner: "John/Tay" as const,
    surface: surfaceText,
  };

  if (kind.includes("auth")) {
    return {
      ...base,
      title: "Run the auth fallback check on the phone",
      doThis:
        "On the named build/account, reproduce the JWT timeout/offline fallback path from the ticket. Keep the app open long enough to see whether alerts or retries calm down.",
      passMeans:
        "The app stays usable, the fallback alert/severity is appropriate, retries/backoff do not spam, and the auth state recovers or fails clearly.",
      failMeans: "Repeated alerts, retry storms, stuck login/auth state, unexpected logout, silent failure, or no clear recovery.",
    };
  }

  if (kind.includes("friendship")) {
    return {
      ...base,
      title: "Run the friend request/accept check on the required accounts",
      doThis:
        "Use the requester and recipient accounts from Jira. Send or accept the request exactly once, then relaunch if Jira says relaunch matters.",
      passMeans: "Both accounts show the same friendship state and no duplicate or missing request remains.",
      failMeans: "Only one side sees the friend, the request reappears, duplicates show, or relaunch loses the accepted state.",
    };
  }

  if (kind.includes("chat list")) {
    return {
      ...base,
      title: "Check the chat list on the affected account",
      doThis:
        "Open the chat tab from a fresh launch for the account named in Jira. If symmetry is in scope, check both accounts after friendship/message state is present.",
      passMeans: "The expected chat row appears on the right account(s) and survives refresh/relaunch if required.",
      failMeans: "The row is missing, appears only on one side when both are required, or disappears after relaunch.",
    };
  }

  if (kind.includes("text dm")) {
    return {
      ...base,
      title: "Send the smallest text message through the failing path",
      doThis:
        "Use the sender/receiver accounts from Jira. Put the receiver in the required state, send one plain text message, then open/relaunch as the ticket requires.",
      passMeans: "The receiver gets the message, unread/chat state updates correctly, and no retry/failure banner remains.",
      failMeans: "The notification arrives but message does not, the bubble is missing, unread state is wrong, or retry/fallback never clears.",
    };
  }

  if (kind.includes("push") || kind.includes("badge")) {
    return {
      ...base,
      title: "Check the notification or badge behavior on the target build",
      doThis:
        "Put the app in the required state, trigger the named notification, then check receipt, badge count, and tap destination.",
      passMeans: "The notification arrives when required, badge count is correct, and tapping opens the exact target screen.",
      failMeans: "No notification, wrong badge, stale badge, wrong screen after tap, or success only in foreground when background/TestFlight is required.",
    };
  }

  if (kind.includes("nearby") || kind.includes("ble")) {
    return {
      ...base,
      title: "Check Nearby/BLE on real phones",
      doThis:
        "Put the named devices/accounts near each other. Record raw mesh peer count separately from accepted-friend nearby count, then relaunch if Jira says stale peers matter.",
      passMeans: "Accepted friends appear as nearby, raw peer count makes sense, identities match the right accounts, and relaunch does not create ghosts.",
      failMeans: "Friend count stays zero, raw peer counts disagree unexpectedly, identity is wrong, or ghosts remain after relaunch.",
    };
  }

  return {
    ...base,
    title: `Run the ${workRecipe.kind} human verification`,
    doThis:
      "Follow the ticket acceptance literally on the required surface. Use the exact build/account/device from Jira and record what you see.",
    passMeans: "The smallest pass/fail target on the ticket passes on the required surface.",
    failMeans: "The target behavior is missing, inconsistent, or only passes on a surface Jira did not approve.",
  };
}

function extractAgentTestUpdate(comments: JiraComment[]): AgentTestUpdateViewModel {
  // Two parallel picks so a slim "Reopened by human verification" override
  // (which only carries Agent testing: failed) doesn't blank out the
  // displayed test plan. We always want:
  //   - the most recent ATU that actually has plan content for what to
  //     render on Step 1 (Build/commit, Human test requested, surfaces)
  //   - the most recent ATU full stop for the Agent testing status
  // When the most recent comment is the same one that has plan content,
  // both pickers land on the same comment and the behaviour is identical
  // to the old single-comment path.
  const atuComments = comments.filter((item) => /agent test update/i.test(item.text));

  // Comments arrive oldest-first from Jira REST — reverse so newest-first
  // helpers below scan from the most recent backwards.
  const newestFirst = [...atuComments].reverse();

  function hasPlanContent(text: string): boolean {
    // The Step 1 panel needs the actual test plan to render anything
    // useful — that's the "Human test requested:" numbered list. The
    // slim "Reopened by human verification" override comments carry a
    // Build/commit line but no plan body, so requiring HTR (or HTR +
    // any surface) keeps the picker from latching onto them.
    //
    // No line-start anchor here on purpose. adfToPlainText doesn't
    // always emit a newline before every labelled segment (depends on
    // whether the AI wrote each label as its own paragraph or chained
    // them into one), so requiring `^` made the predicate miss the
    // 13:07-style "all-in-one-paragraph" comments and fall back to an
    // older preview ATU.
    if (/\bHuman test requested\s*:/i.test(text)) return true;
    const surfaceHits = [
      /\bAutomated\s*:/i.test(text),
      /\bSimulator\s*:/i.test(text),
      /\bWorker smoke\s*:/i.test(text),
    ].filter(Boolean).length;
    return surfaceHits >= 2 && /\bBuild\/commit\s*:/i.test(text);
  }

  const planComment = newestFirst.find((item) => hasPlanContent(item.text)) || newestFirst[0];
  const statusComment = newestFirst[0];
  const comment = planComment;

  if (!comment) {
    return {
      found: false,
      status: "unknown",
      label: "No agent update yet",
      buildOrCommit: "",
      humanVerificationNeeded: null,
      humanTestRequested: "",
      humanTestRequestedItems: [],
      humanTestRequestedPreamble: "",
      sentryWatchIds: [],
      evidence: [],
      surfaceResults: {
        automated: "Not reported",
        simulator: "Not reported",
        workerSmoke: "Not reported",
      },
      passIf: "",
      failIf: "",
    };
  }

  // Status comes from the MOST RECENT ATU — so a "failed" or
  // "inconclusive" override flips it off whatever the plan-content
  // comment originally said. Plan content (build, surfaces, human test
  // requested) still comes from `comment` above.
  const statusText = readLabeledValue(statusComment.text, "Agent testing");
  const status = parseAgentStatus(statusText);
  const humanNeededText = readLabeledValue(comment.text, "Human verification needed");
  let humanVerificationNeeded: boolean | null = humanNeededText
    ? /yes|required|true/i.test(humanNeededText)
      ? true
      : /no|false|not required/i.test(humanNeededText)
        ? false
        : null
    : null;

  // Known sibling headings that can follow "Human test requested" without a
  // colon — we stop at any of them so the panel doesn't absorb the Evidence
  // bullets or the Dashboard fields.
  const humanTestLines = readBlockLines(
    comment.text,
    "Human test requested",
    ["Evidence", "Dashboard fields to update", "Dashboard fields"],
    // Keep the "- " bullet prefix so parseHumanTestRequested can auto-
    // number bulletList-shape HTRs. Without this the bullets get
    // stripped before the parser ever sees them.
    { preserveBullets: true },
  );
  // When the agent rewrites drop the "Human verification needed:" label
  // but still include a Human test requested block, infer "yes" — every
  // ATU that asks for a human test is by definition asking for human
  // verification. Without this the panel renders "Human verification:
  // unknown" even though the AI literally wrote out the steps.
  if (humanVerificationNeeded === null && humanTestLines.length > 0) {
    humanVerificationNeeded = true;
  }
  const { items: humanTestRequestedItems, preamble: humanTestRequestedPreamble } =
    parseHumanTestRequested(humanTestLines);
  const humanTestRequested = humanTestLines.join(" ");
  const sentryWatchIds = extractSentryIds(humanTestLines.join("\n"));
  const { passIf, failIf } = extractTestExpectations(humanTestRequested);

  // Build/commit can land under several labels:
  //   - "Build/commit:" (canonical)
  //   - "Build/commit for human verification:" (some agents write it long-form)
  // and the plan comment may also omit it entirely while the override/status
  // comment carries it. Fall back through both so the Step 1 chip still
  // renders on tickets like BDEV-407 where the plan comment uses the
  // long-form label.
  const buildOrCommit =
    readLabeledValue(comment.text, "Build/commit") ||
    readLabeledValue(comment.text, "Build/commit for human verification") ||
    (statusComment !== comment ? readLabeledValue(statusComment.text, "Build/commit") : "");

  return {
    found: true,
    status,
    label:
      status === "passed"
        ? "Agent checks passed"
        : status === "failed"
          ? "Agent checks failed"
          : status === "inconclusive"
            ? "Agent inconclusive — needs more info"
            : status === "not-run"
              ? "Agent didn't run yet"
              : "Agent update found",
    buildOrCommit,
    humanVerificationNeeded,
    humanTestRequested,
    humanTestRequestedItems,
    humanTestRequestedPreamble,
    sentryWatchIds,
    evidence: readBulletsAfterHeading(comment.text, "Evidence"),
    surfaceResults: {
      automated: readLabeledValue(comment.text, "Automated") || "Not reported",
      simulator: readLabeledValue(comment.text, "Simulator") || "Not reported",
      workerSmoke: readLabeledValue(comment.text, "Worker smoke") || "Not reported",
    },
    passIf,
    failIf,
    source: {
      author: comment.author,
      created: comment.created,
    },
  };
}

// Parses every "Human Test Result" comment Buddy has posted to the
// ticket. Mirrors extractAgentTestUpdate so the active step card can
// render past results inline. Returned newest-first (latest is index 0).
export function extractHumanTestResults(comments: JiraComment[]): HumanTestResultViewModel[] {
  return comments
    .filter((comment) => /human test result/i.test(comment.text))
    .map((comment) => {
      const outcomeRaw = readLabeledValue(comment.text, "Outcome").toLowerCase();
      const outcome: HumanTestResultViewModel["outcome"] =
        /\bpass(ed)?\b/.test(outcomeRaw)
          ? "pass"
          : /\bfail(ed)?\b/.test(outcomeRaw)
            ? "fail"
            : /\binconclusive|unknown|needs? more info\b/.test(outcomeRaw)
              ? "inconclusive"
              : "unknown";

      // The build is written as "Tested on: build 65" or similar.
      const testedOn = readLabeledValue(comment.text, "Tested on");
      const buildOrCommit = testedOn || readLabeledValue(comment.text, "Build/commit");
      const verifier = readLabeledValue(comment.text, "Verifier") || comment.author;
      const findings = readBlockLines(comment.text, "Findings", [
        "Evidence",
        "AI verdict",
        "AI verdict (auto-generated)",
        "Recommendation",
      ])
        .join("\n")
        .trim();
      const evidence = readBlockLines(comment.text, "Evidence", [
        "AI verdict",
        "AI verdict (auto-generated)",
        "Recommendation",
      ])
        .join("\n")
        .trim();
      const aiRecommendation = readLabeledValue(comment.text, "Recommendation");
      const aiReasoning = readLabeledValue(comment.text, "Reasoning");
      const aiNextStep = readLabeledValue(comment.text, "Next step");

      return {
        commentId: comment.id,
        author: comment.author,
        created: comment.created,
        buildOrCommit,
        outcome,
        verifier,
        findings,
        evidence,
        aiRecommendation,
        aiReasoning,
        aiNextStep,
      };
    })
    .sort((a, b) => {
      // Newest first. Falls back to commentId order when timestamps tie.
      const aTime = Date.parse(a.created || "") || 0;
      const bTime = Date.parse(b.created || "") || 0;
      if (bTime !== aTime) return bTime - aTime;
      return (b.commentId || "").localeCompare(a.commentId || "");
    });
}

// Splits the "Human test requested" block into structured items so the
// inline panel can render them as a numbered list. Each item gets a
// short title (first emphasised phrase or the whole line up to em-dash)
// and a body, with backtick-wrapped fragments split into <code> segments.
function parseHumanTestRequested(lines: string[]): {
  items: HumanTestRequestedItem[];
  preamble: string;
} {
  if (!lines.length) return { items: [], preamble: "" };

  // Some ATU comments use a numbered list ("1. Install build…"), others
  // use an ADF bulletList that adfToPlainText emits as "- Install build…".
  // Treat both as ordered steps so the inline Step 1 panel always renders.
  // When the AI mixes the two we keep numbered items as the source of
  // truth and turn bullets into continuations; when there are no numbered
  // lines at all we auto-number the bullets in encountered order.
  const items: { number: number; raw: string }[] = [];
  const preambleLines: string[] = [];
  let nextAutoNumber = 1;
  let lastWasNumbered = false;

  function addItem(raw: string, explicitNumber: number | null) {
    const num = explicitNumber ?? nextAutoNumber;
    items.push({ number: num, raw: raw.trim() });
    nextAutoNumber = num + 1;
    lastWasNumbered = explicitNumber !== null;
  }

  for (const line of lines) {
    const numbered = line.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      addItem(numbered[2], Number(numbered[1]));
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (lastWasNumbered) {
        // Treat as a sub-bullet/continuation of the previous numbered
        // step rather than re-numbering mid-list.
        items[items.length - 1].raw = `${items[items.length - 1].raw} ${bullet[1]}`.trim();
      } else {
        addItem(bullet[1], null);
      }
      continue;
    }
    if (items.length === 0) {
      preambleLines.push(line);
    } else {
      // Continuation paragraph for the previous item.
      items[items.length - 1].raw = `${items[items.length - 1].raw} ${line}`.trim();
    }
  }

  const built = items.map(({ number, raw }) => buildHumanTestRequestedItem(number, raw));
  return { items: built, preamble: preambleLines.join(" ").trim() };
}

function buildHumanTestRequestedItem(num: number, raw: string): HumanTestRequestedItem {
  // Detect a leading "Title — body" or "Title: body" so the panel can
  // bold the title without us re-parsing it. Em-dash is the AI's
  // convention; colon is the secondary form. When neither separator is
  // present, leave title empty and let the chip render the body straight
  // — the older "first 6 words as title" fallback duplicated content
  // because the renderer always emits `title — body` when both are set.
  const dashMatch = raw.match(/^([^—:]{1,80}?)\s+—\s+(.+)$/);
  const colonMatch = !dashMatch ? raw.match(/^([^:]{1,80}?):\s+(.+)$/) : null;
  let title = "";
  let body = raw;
  if (dashMatch) {
    title = dashMatch[1].trim();
    body = dashMatch[2].trim();
  } else if (colonMatch) {
    title = colonMatch[1].trim();
    body = colonMatch[2].trim();
  }

  return {
    number: num,
    title,
    body,
    segments: splitBacktickSegments(body),
  };
}

// Splits a string on backtick-wrapped fragments so the UI can render
// inline <code> without re-running a markdown parser. Backticks are
// emitted by adfToPlainText for any text node carrying a `code` mark.
function splitBacktickSegments(value: string): HumanTestRequestedSegment[] {
  if (!value) return [];
  const parts = value.split(/`([^`]+)`/g);
  const segments: HumanTestRequestedSegment[] = [];
  parts.forEach((chunk, idx) => {
    if (!chunk) return;
    // Even indices are plain text, odd indices are the captured code.
    segments.push({ kind: idx % 2 === 0 ? "text" : "code", value: chunk });
  });
  return segments;
}

// Pulls the AI's "Pass if X. Fail if Y." sentences out of the test plan so
// the step card can show concrete observable expectations instead of meta
// "the AI's summary should have real commands" placeholder copy.
//
// Each capture stops at the *next* "Pass if" / "Fail if" or the end of the
// sentence (period before a capital letter or end of string), then strips
// the leading "Pass if " / "Fail if " so the rendered chip reads as a
// continuation of the "You'll know it worked when:" label.
//
// Returns "" for either field when the AI didn't use the canonical phrasing.
export function extractTestExpectations(text: string): {
  passIf: string;
  failIf: string;
} {
  if (!text) return { passIf: "", failIf: "" };

  const captureAfter = (marker: RegExp): string => {
    const match = text.match(marker);
    if (!match || match.index === undefined) return "";
    const rest = text.slice(match.index + match[0].length);
    // Stop at the next Pass/Fail marker so we don't bleed Pass into Fail.
    const stopMatch = rest.match(/\b(?:pass|fail)\s+if\b/i);
    let segment = stopMatch && stopMatch.index !== undefined ? rest.slice(0, stopMatch.index) : rest;
    // Trim trailing whitespace + the period before the next sentence-cased
    // word ("…clean. Repeat the delete/reinstall…") so we don't pull two
    // sentences in when only one was the expectation.
    const sentenceMatch = segment.match(/^([\s\S]*?[.!?])\s+[A-Z]/);
    if (sentenceMatch) segment = sentenceMatch[1];
    return segment.trim().replace(/[.!?,;\s]+$/, "");
  };

  return {
    passIf: captureAfter(/\bpass\s+if\s+/i),
    failIf: captureAfter(/\bfail\s+if\s+/i),
  };
}

function extractSentryIds(text: string): string[] {
  // APPLE-IOS-N is HeyBlip's iOS Sentry project. Conservatively match
  // PROJECT-N forms that look like Sentry short IDs. Filters BDEV-N out
  // so our own ticket keys don't show up as Sentry issues.
  const matches = text.match(/\b[A-Z][A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)?\b/g) || [];
  return Array.from(
    new Set(
      matches.filter(
        (id) => /IOS|ANDROID|JS|SENTRY/i.test(id) && !id.startsWith("BDEV-"),
      ),
    ),
  );
}

function parseAgentStatus(value: string): AgentTestUpdateViewModel["status"] {
  // Order matters: check "fail" before "pass" so phrases like
  // "Passed for foo, but Failed for bar" land on the more conservative
  // failed bucket. "Inconclusive" / "not ready" / "blocked" map to a
  // distinct state so the UI can show "needs more info" instead of an
  // ambiguous "Agent update found".
  if (/inconclusive|cannot verify|not ready|blocked\b|deferred|not\s+enough/i.test(value)) return "inconclusive";
  if (/fail/i.test(value)) return "failed";
  if (/pass/i.test(value)) return "passed";
  if (/not run|not-run|pending/i.test(value)) return "not-run";
  return "unknown";
}

function readLabeledValue(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Allow an optional bullet prefix ("- " or "* ") because adfToPlainText
  // now emits a "- " in front of bulletList items. Without this the
  // labeled lookups (`Build/commit:`, `Automated:`, …) miss every comment
  // whose author authored those values as bulletList items in the ADF.
  const match = text.match(new RegExp(`^\\s*[-*]?\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match ? compactText(match[1]) : "";
}

function readIndentedBlock(text: string, label: string): string {
  // Backwards-compat: collapses the block onto a single line. Use
  // readBlockLines() when newline structure matters (e.g. ordered lists).
  return readBlockLines(text, label).join(" ");
}

// Returns the lines of the block under `label`, preserving structure.
// Accepts both label-with-colon ("Label: value") and heading style
// ("Label" alone on a line — common in ADF where bold headings have no
// colon). Stops at the next labeled section *or* the next bare heading
// known to follow ours, so adjacent blocks don't bleed in.
function readBlockLines(
  text: string,
  label: string,
  stopAtHeadings: string[] = [],
  options: { preserveBullets?: boolean } = {},
): string[] {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = text.split(/\r?\n/);
  // Allow an optional bullet prefix on both the labeled and heading
  // forms because adfToPlainText prefixes bulletList items with "- ".
  const labeledRegex = new RegExp(`^\\s*[-*]?\\s*${escaped}\\s*:`, "i");
  const headingRegex = new RegExp(`^\\s*[-*]?\\s*${escaped}\\s*$`, "i");
  const stopHeadingRegexes = stopAtHeadings.map(
    (heading) =>
      new RegExp(
        `^\\s*[-*]?\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
        "i",
      ),
  );

  let start = lines.findIndex((line) => labeledRegex.test(line));
  const isLabeled = start !== -1;
  if (start === -1) {
    start = lines.findIndex((line) => headingRegex.test(line));
    if (start === -1) return [];
  }

  const stripBullet = (value: string) =>
    options.preserveBullets ? value : value.replace(/^\s*[-*]\s*/, "");

  const collected: string[] = [];
  if (isLabeled) {
    const sameLine = lines[start]?.split(":").slice(1).join(":").trim();
    if (sameLine) collected.push(stripBullet(sameLine));
  }

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] || "";
    // Stop when a new labeled section starts. Don't trip on a bulleted
    // line whose body happens to contain a colon ("- Phone A: locked"),
    // so require the colon to land within the first label-like token.
    if (
      /^\s*(?:[A-Za-z][A-Za-z /-]{2,})\s*:/.test(line) && collected.length
    ) break;
    // Stop when we hit a known sibling heading (e.g. "Evidence" follows
    // "Human test requested"). Bare headings have no colon so the
    // labeled-section stop above can't catch them on its own.
    if (collected.length && stopHeadingRegexes.some((re) => re.test(line))) break;
    const trimmed = line.trim();
    if (trimmed) {
      collected.push(stripBullet(trimmed));
    }
  }

  return collected.map(compactText).filter(Boolean);
}

function readBulletsAfterHeading(text: string, label: string): string[] {
  const block = readIndentedBlock(text, label);
  if (!block) return [];
  return block
    .split(/\s+-\s+|;\s+/)
    .map((item) => compactText(item.replace(/^[-*]\s*/, "")))
    .filter(Boolean);
}

function buildCommentTemplates(
  input: ChecklistInput,
  workRecipe: WorkRecipeViewModel,
  proofRecipe: ProofRecipeViewModel,
  humanTestPlan: HumanTestPlanViewModel,
): CommentTemplate[] {
  return [
    {
      id: "agent-test-update",
      title: `${workRecipe.kind} Agent Test Update`,
      audience: "agent",
      body: [
        `${input.issueKey} agent test update`,
        "",
        "Agent testing: [Passed / Failed / Not run]",
        "Automated: [Passed / Failed / Not required]",
        "Simulator: [Passed / Failed / Not required]",
        "Worker smoke: [Passed / Failed / Not required]",
        "Build/commit: [exact SHA, PR merge SHA, or build number]",
        `Human verification needed: ${humanTestPlan.canAgentFinishAlone ? "No" : "Yes"}`,
        "",
        "Human test requested:",
        `- ${humanTestPlan.steps.find((step) => step.owner === "John/Tay" && step.surface !== "Jira evidence")?.doThis || humanTestPlan.summary}`,
        "- Pass if [observable success on the phone, e.g. 'the app reaches the main UI with no registration error dialog']",
        "- Fail if [observable failure on the phone, e.g. 'Retry must be tapped more than once or onboarding stalls on the profile screen']",
        "",
        "Evidence:",
        "- [commands run, simulator scenario, logs, screenshots, PR/check links]",
        "",
        "Dashboard fields to update:",
        "- MVP Loop Stage: Human Verifying",
        "- Human Final Review: Ready",
        "- Verified Build/Commit: [same exact build/commit as above]",
      ].join("\n"),
    },
    {
      id: "proof-recipe",
      title: `${workRecipe.kind} MVP Proof Recipe`,
      audience: "agent",
      body: proofRecipe.template,
    },
    {
      id: "repro-recipe",
      title: `${workRecipe.kind} Repro Recipe`,
      audience: "agent",
      body: [
        `${input.issueKey} ${workRecipe.kind} repro recipe`,
        "",
        `Ticket: ${input.issueUrl}`,
        `Risk: ${workRecipe.risk}`,
        `Proof authority: ${workRecipe.proofAuthority.label}`,
        `Agent done rule: ${workRecipe.proofAuthority.agentDoneLanguage}`,
        "",
        "Repro setup:",
        ...workRecipe.reproduceSteps.map((step) => `- ${step}: [fill actual value/evidence]`),
        "",
        "Actual result:",
        "- [what happened]",
        "",
        "Expected result:",
        "- [what should happen]",
      ].join("\n"),
    },
    {
      id: "acceptance-lock",
      title: `${workRecipe.kind} Acceptance Lock`,
      audience: "agent",
      body: [
        `${input.issueKey} acceptance lock`,
        "",
        `Summary: ${input.summary}`,
        `Work recipe: ${workRecipe.kind}`,
        `Risk: ${workRecipe.risk}`,
        `Proof authority: ${workRecipe.proofAuthority.label}`,
        `Agent done rule: ${workRecipe.proofAuthority.agentDoneLanguage}`,
        `Human review rule: ${workRecipe.proofAuthority.humanVerificationLanguage}`,
        "",
        "Questions to answer before coding:",
        ...workRecipe.acceptanceQuestions.map((question) => `- ${question}: [answer]`),
        "",
        "Pass/fail target:",
        "- Pass: [exact user-visible behavior]",
        "- Fail: [specific regression or missing behavior]",
        "",
        `Verification surface: ${input.customFields.verificationSurface || "[Automated / Simulator / TestFlight / Two Phones]"}`,
        `Proof recipe status: ${proofRecipe.missingCount === 0 ? "Ready" : `${proofRecipe.missingCount} proof detail(s) still missing`}`,
        "Regression boundaries:",
        ...workRecipe.outOfScope.map((scope) => `- Out of scope: ${scope}`),
        ...workRecipe.guardrails.map((guardrail) => `- Guardrail: ${guardrail}`),
      ].join("\n"),
    },
    {
      id: "agent-handoff",
      title: `${workRecipe.kind} Coding Agent Handoff`,
      audience: "agent",
      body: [
        `Pick up ${input.issueKey}: ${input.summary}`,
        "",
        `Ticket: ${input.issueUrl}`,
        `Work recipe: ${workRecipe.kind}`,
        `AI operating mode: ${workRecipe.aiOperatingModel.label}`,
        `Smart-zone rule: ${workRecipe.aiOperatingModel.smartZoneRule}`,
        `Handoff rule: ${workRecipe.aiOperatingModel.handoffRule}`,
        `Proof authority: ${workRecipe.proofAuthority.label}`,
        `Agent done rule: ${workRecipe.proofAuthority.agentDoneLanguage}`,
        `MVP Loop Stage: ${input.customFields.loopStage || "[set before coding]"}`,
        `Verification Surface: ${input.customFields.verificationSurface || "[set before coding]"}`,
        "",
        "Agent workflow:",
        "1. Start from a fresh context and read the repo instructions first.",
        "2. Work only this BDEV ticket and only the locked acceptance.",
        "3. If acceptance/proof is missing, stop and comment what is missing instead of guessing.",
        ...workRecipe.aiOperatingModel.promptRules.map((rule, index) => `${index + 4}. ${rule}`),
        ...workRecipe.guardrails.map((guardrail, index) => `${index + workRecipe.aiOperatingModel.promptRules.length + 4}. ${guardrail}`),
        `${workRecipe.guardrails.length + workRecipe.aiOperatingModel.promptRules.length + 4}. Run or add the narrowest relevant verification from the proof recipe.`,
        `${workRecipe.guardrails.length + workRecipe.aiOperatingModel.promptRules.length + 5}. Open a PR linked to ${input.issueKey}, then stop. John/Tay merge after review.`,
        `${workRecipe.guardrails.length + workRecipe.aiOperatingModel.promptRules.length + 6}. Paste the Agent Test Update into Jira or include it in your final message if Jira write access is unavailable.`,
      ].join("\n"),
    },
    {
      id: "ai-operating-model",
      title: `${workRecipe.kind} AI Operating Model`,
      audience: "agent",
      body: [
        `${input.issueKey} AI operating model`,
        "",
        `Mode: ${workRecipe.aiOperatingModel.label}`,
        `Summary: ${workRecipe.aiOperatingModel.summary}`,
        `Smart-zone rule: ${workRecipe.aiOperatingModel.smartZoneRule}`,
        `Handoff rule: ${workRecipe.aiOperatingModel.handoffRule}`,
        "",
        "Execution rules:",
        ...workRecipe.aiOperatingModel.promptRules.map((rule) => `- ${rule}`),
        "",
        "Checklist:",
        ...workRecipe.aiOperatingModel.checklist.map((item) => `- ${item.label}: [${item.checked ? "signal present" : "needs Jira detail"}]`),
      ].join("\n"),
    },
    {
      id: "verification-evidence",
      title: `${workRecipe.kind} Verification Evidence`,
      audience: "human",
      body: [
        `${input.issueKey} verification evidence`,
        "",
        `Proof authority: ${workRecipe.proofAuthority.label}`,
        `Agent claim allowed: ${workRecipe.proofAuthority.agentMayClaimDone ? "Yes, if every named proof step passed." : "No, human/external verification is still required."}`,
        "Build/commit: [paste exact build number or commit SHA]",
        `Surface: ${input.customFields.verificationSurface || "[Automated / Simulator / TestFlight / Two Phones / BLE / APNs]"}`,
        "",
        "Required evidence:",
        ...workRecipe.closeoutEvidence.map((evidence) => `- ${evidence}: [fill actual value]`),
        "",
        "Result: [Passed / Failed]",
        "Evidence:",
        "- [command output, screenshot note, log excerpt, or repro outcome]",
        "",
        "Human Final Review: [Not Ready / Ready / Passed / Failed]",
      ].join("\n"),
    },
  ];
}

function slugifyBranchPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function branchPrefixForWorkKind(kind: string): string {
  if (/auth|text dm|push|badge|nearby|ble|relay|noise|friendship|chat list/i.test(kind)) {
    return "fix";
  }
  if (/test infra|observability/i.test(kind)) {
    return "chore";
  }
  return "fix";
}

function buildCodingAgentPrompt(
  input: ChecklistInput,
  workRecipe: WorkRecipeViewModel,
  proofRecipe: ProofRecipeViewModel,
  humanTestPlan: HumanTestPlanViewModel,
): string {
  const descriptionExcerpt = excerpt(input.descriptionText, 1200) || "No Jira description text returned.";
  const branchName = `${branchPrefixForWorkKind(workRecipe.kind)}/${input.issueKey}-${slugifyBranchPart(input.summary || workRecipe.kind)}`;

  // Detect Sentry signals: explicit issue IDs in the description (APPLE-IOS-N
  // is HeyBlip's iOS Sentry project, plus generic SHORT-PROJ-NNN style) or a
  // verification surface that mentions Sentry. When either is present, surface
  // an explicit Sentry-research instruction so the AI doesn't skip the step.
  const sentryIds = Array.from(
    new Set(
      [
        ...(input.descriptionText.match(/\bAPPLE-IOS-[A-Z0-9]+\b/g) || []),
        ...(input.descriptionText.match(/\b[A-Z]{2,}-[A-Z0-9]+\b/g) || []).filter((token) =>
          /IOS|SENTRY|ANDROID|JS|WEB/.test(token),
        ),
      ].filter((id) => !id.startsWith(input.issueKey.split("-")[0] + "-")),
    ),
  );
  const surfaceMentionsSentry = /sentry/i.test(input.customFields.verificationSurface || "");
  const descriptionMentionsSentry = /\bsentry\b/i.test(input.descriptionText || "");
  const hasSentryContext = sentryIds.length > 0 || surfaceMentionsSentry || descriptionMentionsSentry;
  const linkedIssues = [
    input.parent ? `${input.parent.key} (${input.parent.relationship}): ${input.parent.summary || input.parent.status}` : "",
    ...input.links.map((link) => `${link.key} (${link.relationship}, ${link.status || "unknown"}): ${link.summary}`),
  ].filter(Boolean);
  const requiredHumanStep =
    humanTestPlan.steps.find((step) => step.owner === "John/Tay" && step.surface !== "Jira evidence") ||
    humanTestPlan.steps.find((step) => step.owner === "John/Tay");
  const agentUpdateTemplate = buildCommentTemplates(input, workRecipe, proofRecipe, humanTestPlan).find(
    (template) => template.id === "agent-test-update",
  )?.body;

  // Most recent human-verification attempt, if any. Surfaces the verdict
  // + reasoning + concerns inline so a re-dispatched agent reads the
  // human failure context without having to navigate to Jira.
  const humanTestResults = extractHumanTestResults(input.comments);
  const latestResult = humanTestResults[0];
  const priorVerification = latestResult
    ? [
        "",
        "Latest human verification (read this before coding):",
        `- Outcome: ${latestResult.outcome}`,
        `- Verifier: ${latestResult.verifier || "(unknown)"}`,
        latestResult.created ? `- When: ${latestResult.created}` : "",
        latestResult.buildOrCommit ? `- Tested on: ${latestResult.buildOrCommit}` : "",
        latestResult.findings ? `- What the human saw:\n${indentBlock(latestResult.findings, "  ")}` : "",
        latestResult.evidence ? `- Evidence:\n${indentBlock(latestResult.evidence, "  ")}` : "",
        latestResult.aiRecommendation ? `- AI recommendation: ${latestResult.aiRecommendation}` : "",
        latestResult.aiReasoning ? `- AI reasoning: ${latestResult.aiReasoning}` : "",
        latestResult.aiNextStep ? `- AI suggested next step: ${latestResult.aiNextStep}` : "",
        "",
        "- If the outcome is 'fail' or 'inconclusive', the prior fix DID NOT pass human verification. Read the reasoning, address the specific concerns, and either patch the code OR rewrite the human test instructions if the test as written was impossible to run.",
        "- If the outcome is 'inconclusive' due to disrupted test conditions, prioritise fixing the test setup (clearer steps, pre-conditions) over more code changes.",
        humanTestResults.length > 1 ? `- ${humanTestResults.length} prior verification attempts total — read them all on the Jira ticket if patterns matter.` : "",
      ].filter(Boolean)
    : [];

  return [
    `Pick up ${input.issueKey}: ${input.summary}`,
    "",
    `Ticket: ${input.issueUrl}`,
    `Branch: ${branchName}`,
    (() => {
      const tagMatch = input.summary.match(/^\s*\[([A-Z0-9/]+)\]\s*/);
      const scopeSource = tagMatch ? tagMatch[1] : workRecipe.kind;
      const scope = scopeSource.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const titleSummary = tagMatch ? input.summary.replace(tagMatch[0], "").trim() : input.summary;
      return `PR title: fix(${scope}): ${titleSummary} (${input.issueKey})`;
    })(),
    "",
    "Repository rules:",
    "- Read the nearest AGENTS.md / CLAUDE.md before editing.",
    "- Jira is the source of truth for MVP stabilization tickets.",
    "- One ticket, one fix, one proof package. Do not bundle nearby bugs or polish.",
    "- Keep scope to the locked acceptance and avoid unrelated cleanup or broad refactors.",
    "- Do not merge your PR. John/Tay merge after review.",
    "- Do not transition Jira to Done.",
    "- Never print or expose tokens, cookies, API keys, env values, PII, account names, or raw private logs.",
    "",
    "Current Jira state:",
    `- URL: ${input.issueUrl}`,
    `- Issue type: ${input.issueType || "Unknown"}`,
    `- Jira status: ${input.status}`,
    `- Priority: ${input.priority || "Unknown"}`,
    `- Assignee: ${input.assignee || "Unassigned"}`,
    `- MVP Track: ${input.customFields.mvpTrack || "Not set"}`,
    `- MVP Loop Stage: ${input.customFields.loopStage || "Not set"}`,
    `- Verification Surface: ${input.customFields.verificationSurface || "Not set"}`,
    `- Human Final Review: ${input.customFields.humanFinalReview || "Not set"}`,
    `- Verified Build/Commit: ${input.customFields.verifiedBuildOrCommit || "Not set"}`,
    "",
    "Dynamic work/testing recipe:",
    `- Work kind: ${workRecipe.kind}`,
    `- Source: ${workRecipe.source}`,
    `- Risk: ${workRecipe.risk}`,
    `- Testing posture: ${workRecipe.testingPosture}`,
    `- AI operating mode: ${workRecipe.aiOperatingModel.label}`,
    `- AI operating summary: ${workRecipe.aiOperatingModel.summary}`,
    `- Smart-zone rule: ${workRecipe.aiOperatingModel.smartZoneRule}`,
    `- Handoff rule: ${workRecipe.aiOperatingModel.handoffRule}`,
    `- Proof authority: ${workRecipe.proofAuthority.label}`,
    `- Agent may claim 100% done: ${workRecipe.proofAuthority.agentMayClaimDone ? "YES, after all named proof steps pass and evidence is included" : "NO"}`,
    `- Agent done language: ${workRecipe.proofAuthority.agentDoneLanguage}`,
    `- Human verification language: ${workRecipe.proofAuthority.humanVerificationLanguage}`,
    `- Dashboard update rule: ${humanTestPlan.dashboardUpdateRule}`,
    "- If you complete automated/simulator/worker testing, paste an Agent Test Update Jira comment so the live checklist reflects your proof.",
    "- If real phones/APNs/BLE/Sentry are required, do not mark done; say exactly what John/Tay must test next.",
    "- Issue signals:",
    ...workRecipe.issueSignals.map((signal) => `  - ${signal}`),
    "- Acceptance questions:",
    ...workRecipe.acceptanceQuestions.map((question) => `  - ${question}`),
    "- Repro steps required before coding:",
    ...workRecipe.reproduceSteps.map((step) => `  - ${step}`),
    "- Coding guardrails:",
    ...workRecipe.aiOperatingModel.promptRules.map((rule) => `  - ${rule}`),
    ...workRecipe.guardrails.map((guardrail) => `  - ${guardrail}`),
    "- Out of scope:",
    ...workRecipe.outOfScope.map((scope) => `  - ${scope}`),
    ...(hasSentryContext
      ? [
          "",
          "Sentry context (check this BEFORE writing code):",
          `- Issue IDs in the ticket: ${sentryIds.length ? sentryIds.join(", ") : "(none parsed — read the description for Sentry references)"}`,
          "- Use the Sentry MCP (mcp__sentry__* tools) to fetch each issue group: get breadcrumbs, stack trace, event count, affected releases, and OS/device clusters.",
          "- If Sentry exposes a Seer / AI root-cause hypothesis, read it as a starting point — verify against the code, do not trust blindly.",
          "- Look for repeating patterns just before the error: retry storms, race-with-network-loss, identity-cache mismatches, unhandled async cancellation.",
          "- After your fix is in a build, watch the same issue groups on the new release; if events keep landing, the fix did not take.",
          "- Privacy: never paste raw stack traces, user emails, account IDs, or breadcrumbs into the PR description, Jira comment, or chat. Summarise patterns only.",
        ]
      : []),
    "",
    "Before touching code:",
    "1. Confirm the ticket is still the same issue, status, and acceptance shown above.",
    "2. Confirm the acceptance/proof recipe is concrete enough to pass or fail.",
    "3. If acceptance is missing or conflicts with the ticket, stop and add a Jira comment asking for the missing decision.",
    "4. Create the branch named above from latest main unless John/Tay explicitly gives another base.",
    "",
    "Implementation contract:",
    "1. Make the smallest code change that satisfies the locked acceptance.",
    "2. Prefer a failing test first when the behavior can be reproduced in automated or simulator form.",
    "3. Follow evidence, not guesses. If the likely root cause is wrong, pause and report the new finding.",
    "4. Do not delete or weaken tests to get green.",
    "5. Do not touch out-of-scope areas unless the locked acceptance is impossible without it; explain any scope expansion.",
    "",
    "Verification contract:",
    "- Run the exact proof recipe below, plus any directly affected existing tests.",
    "- If the surface is Automated, Simulator, or Worker Smoke only, you may say the agent-side proof is complete after every required check passes.",
    "- If the surface includes One Phone, Two Phones, TestFlight/APNs, BLE, or Sentry Watch, you may only say ready for John/Tay verification.",
    "- Include command names and short results. Do not paste huge logs.",
    "- If a command cannot run, say why and what weaker evidence you used.",
    "",
    "Current Jira description / acceptance excerpt:",
    descriptionExcerpt,
    ...priorVerification,
    "",
    "Linked Jira context:",
    linkedIssues.length ? linkedIssues.map((issue) => `- ${issue}`).join("\n") : "- No linked issues returned.",
    "",
    "Required proof recipe:",
    `- Source: ${proofRecipe.source}`,
    `- Missing proof details: ${proofRecipe.missingCount}`,
    proofRecipe.requirements.length
      ? proofRecipe.requirements
          .map((requirement) =>
            [
              `- ${requirement.label}`,
              `  Required because: ${requirement.requiredBecause}`,
              `  Current detail: ${requirement.hasConcreteProof ? requirement.detail : "MISSING - add this before claiming verification is ready"}`,
              `  Tick rule: ${requirement.tickWhen}`,
            ].join("\n"),
          )
          .join("\n")
      : "- No required proof steps generated because Verification Surface is not set.",
    "",
    "Human verification request:",
    requiredHumanStep
      ? [
          `- John/Tay step: ${requiredHumanStep.title}`,
          `- What they should do: ${requiredHumanStep.doThis}`,
          `- Pass means: ${requiredHumanStep.passMeans}`,
          `- Fail means: ${requiredHumanStep.failMeans}`,
        ].join("\n")
      : "- No extra human device step generated. John/Tay should review the proof package and Jira result.",
    "",
    "Writing for John and Tay (non-coders) in the Agent Test Update:",
    "- The 'Human test requested:' section MUST be readable by a non-technical CEO. No jargon, no debug-log sequences, no internal field names.",
    "- End every 'Human test requested:' block with one 'Pass if X.' and one 'Fail if Y.' line. Buddy parses these two sentences and shows them as the concrete green/red criteria on the test card. If you skip this format the user has to read your whole paragraph to know what success looks like — keep it observable, no internal state words.",
    "- For each manual action, write what to physically do, not what happens internally:",
    "  - GOOD: 'Delete the app, reinstall from TestFlight, sign in. App should load normally with no stuck spinners or repeated alerts.'",
    "  - BAD: 'Install the merged build on a phone whose noise_public_key is missing from the auth Postgres. Cold launch. Expected debug-log sequence: 2× JWT authenticate: user not found...'",
    "- Translate technical preconditions into a plain-English how-to. Examples:",
    "  - 'noise_public_key missing from Postgres' → 'delete the app and reinstall (clears the phone identity)'",
    "  - 'cold launch' → 'open the app fresh after install'",
    "  - 'expected debug-log sequence X then Y then Z' → omit; replace with the user-visible outcome ('app signs you in within 5 seconds, no spinner, no error banner')",
    "- For Sentry watch instructions: name the issue groups, the build to watch, and what 'pass' looks like in user terms (events drop / events stay flat). Do NOT paste raw stack traces or breadcrumb logs.",
    "- If technical detail is genuinely useful for Tay (frontend dev) but not John, put it in a separate 'Optional debug detail (for engineers):' section AFTER the human test request.",
    "- The non-coder reader should be able to do the test without opening the codebase, without running terminals, and without consulting Slack.",
    "",
    "Required Jira update before you hand back:",
    "- If Jira write access is available, add the Agent Test Update comment to the ticket.",
    "- If Jira field write access is available, set MVP Loop Stage to Human Verifying, Human Final Review to Ready, and Verified Build/Commit to the exact build/commit you tested.",
    "- If Jira write access is not available, include the full Agent Test Update in your final response so John/Tay can paste it.",
    "- Never set Human Final Review to Passed. That is John/Tay's gate.",
    "",
    "Agent Test Update template:",
    agentUpdateTemplate || "- Agent Test Update template was not generated.",
    "",
    "PR workflow:",
    `- Branch: ${branchName}`,
    `- PR must link ${input.issueKey}.`,
    "- PR body must include: what changed, files touched, proof commands/results, screenshots if UI/simulator, and what John/Tay still need to verify.",
    "- After PR is open, stop. Do not merge.",
    "",
    "Build delivery for John/Tay (so they can actually install the fix):",
    "- John tests on his iPhone via TestFlight; he never builds locally and is non-technical. Tay also tests via TestFlight (he codes on Windows, so no Xcode access).",
    "- The repo has `.github/workflows/deploy-testflight.yml`. Triggers: tag push (`beta-*`, `alpha-*`, `v*`) OR manual `workflow_dispatch`. NOT a regular merge to main — merging alone does not cut a build today.",
    "- AFTER YOUR PR MERGES, you must explicitly trigger the build. Pick one:",
    "  1. `gh workflow run deploy-testflight.yml --ref main -f build_note=\"BDEV-XXX <one-liner>\"` — fires the same workflow against main",
    "  2. Tag the merge commit and push: `git tag beta-1.0.0-<N+1> && git push origin beta-1.0.0-<N+1>` — fires the tag-based trigger. Read the latest beta tag with `gh release list -L 1` to choose <N+1>.",
    "- IF John/Tay explicitly asks for a preview before merging (\"can you cut a build for the PR?\"): trigger the workflow on the PR branch via `gh workflow run deploy-testflight.yml --ref <branch>`. Does not require merge.",
    "- After the workflow run finishes, read the build number from the workflow logs (TestFlight upload step) and post it in Jira's `Verified Build/Commit` field. Also ping #blip-dev so John/Tay see it without checking Jira.",
    "- When you write build instructions in the Agent Test Update, do NOT tell John to checkout commits or run xcodebuild. Tell him: \"Open TestFlight on your phone, install build {N} of HeyBlip Beta.\"",
    "",
    "Slack updates (Workspace: The Mesh):",
    "- After PR opens: post a one-liner in #blip-dev with the ticket key, PR link, and 'agent: ready for review'. Use Slack MCP if available.",
    "- After Agent Test Update lands in Jira: post a short note in #blip-dev so John/Tay see it without checking Jira.",
    `- If real-device verification is required, ping the right task channel: #jmac-tasks for John, #tay-tasks for Tay. Otherwise default to #blip-dev only — do not @-mention people in dev chatter.`,
    "- If you stop or block on a decision: post a brief 'blocked on: [one line]' in #blip-dev so somebody picks it up.",
    "- Slack messages stay short — link to Jira/PR for detail. Never paste secrets, raw stack traces, user emails, or full logs.",
    "",
    "Stop conditions:",
    "- Stop if the fix needs a product decision not written in Jira.",
    "- Stop if real phone/APNs/BLE/Sentry proof is required and you only have simulator evidence.",
    "- Stop if another active PR owns the same hot files and rebase/coordination is needed.",
    "- Stop if you cannot identify the root cause within a reasonable investigation window; report what you found.",
    "",
    "Jira access for this checklist is server-side only:",
    "- Use JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN as environment variables only if they are already configured for your agent.",
    "- Never print or expose their values.",
    "",
    "Deliverable:",
    "- Smallest code change that satisfies locked acceptance.",
    "- Relevant tests/checks run with evidence.",
    "- PR opened and linked to Jira if code changed.",
    "- Agent Test Update posted to Jira or returned for John/Tay to paste.",
    "- Clear statement: agent-side proof complete, or ready for human verification, or blocked with exact unblocker.",
  ].join("\n");
}

export function readJiraConfig(overrides: { jiraApiToken?: string } = {}):
  | { baseUrl: string; email: string; token: string }
  | { missingEnv: string[] } {
  const env = {
    JIRA_BASE_URL: process.env.JIRA_BASE_URL,
    JIRA_EMAIL: process.env.JIRA_EMAIL,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN || overrides.jiraApiToken,
  };
  const missingEnv = Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingEnv.length > 0) {
    return { missingEnv };
  }

  try {
    const url = new URL(env.JIRA_BASE_URL as string);
    return {
      baseUrl: url.origin,
      email: env.JIRA_EMAIL as string,
      token: env.JIRA_API_TOKEN as string,
    };
  } catch {
    return { missingEnv: ["JIRA_BASE_URL"] };
  }
}

export async function jiraFetch<T>(
  config: { baseUrl: string; email: string; token: string },
  path: string,
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`,
    },
  });

  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim();
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Jira returned ${status}. Check server-side Jira credentials and Browse Projects permission.`);
    }
    if (response.status === 404) {
      throw new Error(`Jira returned ${status}. Confirm the issue key exists and the account can browse it.`);
    }
    throw new Error(`Jira returned ${status || "an error"} while loading the issue.`);
  }

  return (await response.json()) as T;
}

// POST helper for the Jira REST API. Same auth pattern as jiraFetch but
// for write actions like adding a comment or transitioning a ticket.
// Returns the parsed JSON body, or `null` for 204 No Content responses
// (Jira transitions return 204 on success).
export async function jiraPost<T>(
  config: { baseUrl: string; email: string; token: string },
  path: string,
  body: unknown,
): Promise<T | null> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const status = `${response.status} ${response.statusText}`.trim();
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Jira returned ${status}. Check Jira credentials and ticket permissions. ${detail.slice(0, 200)}`.trim());
    }
    throw new Error(`Jira returned ${status || "an error"} on POST. ${detail.slice(0, 200)}`.trim());
  }

  if (response.status === 204) return null;
  // Some Jira POSTs (e.g. /comment) return 201 with a JSON body.
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Posts a plain-text comment to a Jira issue via the v3 REST API. The
// body must be ADF — we wrap the text in a single paragraph with hard
// breaks for newlines so the formatting renders. Returns the created
// comment id, or "" if Jira didn't return one.
export async function postJiraComment(
  config: { baseUrl: string; email: string; token: string },
  issueKey: string,
  text: string,
): Promise<string> {
  const adfBody = textToAdf(text);
  const result = await jiraPost<{ id?: string }>(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    { body: adfBody },
  );
  return typeof result?.id === "string" ? result.id : "";
}

// PUT /rest/api/3/issue/{key} with a fields object so we can set
// custom fields (MVP Loop Stage, Human Final Review, etc.) outside the
// workflow transition. Used by the transition route's reopen path to
// reset supporting fields so Buddy's queue no longer treats the
// re-opened ticket as Ready. Throws on non-2xx so callers can decide
// whether to bubble the error up or swallow it (best-effort writes).
export async function editJiraIssueFields(
  config: { baseUrl: string; email: string; token: string },
  issueKey: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(
    `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    {
      method: "PUT",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${config.email}:${config.token}`).toString("base64")}`,
      },
      body: JSON.stringify({ fields }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Jira returned ${response.status} ${response.statusText} when editing ${issueKey}. ${text.slice(0, 200)}`,
    );
  }
}

// Transitions a Jira issue and (optionally) leaves a comment in the same
// payload — Jira lets you bundle a comment with a transition.
export async function transitionJiraIssue(
  config: { baseUrl: string; email: string; token: string },
  issueKey: string,
  transitionId: string,
  comment?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    transition: { id: transitionId },
  };
  if (comment) {
    payload.update = {
      comment: [{ add: { body: textToAdf(comment) } }],
    };
  }
  await jiraPost(
    config,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    payload,
  );
}

// Converts plain text into a minimal ADF (Atlassian Document Format)
// document. Each \n becomes a hardBreak inside a single paragraph.
// Code-fenced blocks (```...```) become ADF codeBlock nodes so the
// posted comment renders evidence/logs with monospace formatting.
function textToAdf(text: string): Record<string, unknown> {
  const lines = (text || "").split(/\r?\n/);
  const content: Array<Record<string, unknown>> = [];
  let i = 0;
  let buffer: string[] = [];

  function flushParagraph() {
    if (!buffer.length) return;
    // Skip a paragraph that's just empty lines.
    const meaningful = buffer.some((line) => line.trim().length > 0);
    if (!meaningful) {
      buffer = [];
      return;
    }
    const paragraphContent: Array<Record<string, unknown>> = [];
    buffer.forEach((line, idx) => {
      if (idx > 0) paragraphContent.push({ type: "hardBreak" });
      if (line) paragraphContent.push({ type: "text", text: line });
    });
    content.push({ type: "paragraph", content: paragraphContent });
    buffer = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flushParagraph();
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i += 1;
      }
      // Skip the closing fence.
      if (i < lines.length) i += 1;
      const codeText = codeLines.join("\n");
      if (codeText) {
        content.push({
          type: "codeBlock",
          content: [{ type: "text", text: codeText }],
        });
      }
      continue;
    }
    // Treat a blank line as a paragraph break.
    if (line.trim() === "") {
      flushParagraph();
      i += 1;
      continue;
    }
    buffer.push(line);
    i += 1;
  }
  flushParagraph();

  return {
    type: "doc",
    version: 1,
    content: content.length
      ? content
      : [{ type: "paragraph", content: [{ type: "text", text: text || "" }] }],
  };
}

function toComment(value: unknown): JiraComment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const author =
    record.author && typeof record.author === "object"
      ? fieldToText((record.author as Record<string, unknown>).displayName)
      : "Unknown author";

  return {
    id: fieldToText(record.id) || "comment",
    author,
    created: fieldToText(record.created),
    text: adfToPlainText(record.body),
  };
}

function toIssueLinks(value: unknown): JiraIssueLink[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((link) => {
      if (!link || typeof link !== "object") return null;
      const record = link as Record<string, unknown>;
      const type = record.type && typeof record.type === "object" ? (record.type as Record<string, unknown>) : {};
      const inwardIssue = record.inwardIssue;
      const outwardIssue = record.outwardIssue;
      const issue = inwardIssue && typeof inwardIssue === "object" ? inwardIssue : outwardIssue;

      if (!issue || typeof issue !== "object") return null;

      const issueRecord = issue as Record<string, unknown>;
      const fields = issueRecord.fields && typeof issueRecord.fields === "object"
        ? (issueRecord.fields as Record<string, unknown>)
        : {};
      const relationship = inwardIssue ? fieldToText(type.inward) : fieldToText(type.outward);

      return {
        key: fieldToText(issueRecord.key),
        relationship: relationship || "linked",
        summary: fieldToText(fields.summary),
        status: nestedText(fields.status, "name"),
      };
    })
    .filter((link): link is JiraIssueLink => Boolean(link?.key));
}

function toParentLink(value: unknown): JiraIssueLink | undefined {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const fields = record.fields && typeof record.fields === "object"
    ? (record.fields as Record<string, unknown>)
    : {};
  const key = fieldToText(record.key);

  if (!key) return undefined;

  return {
    key,
    relationship: "parent",
    summary: fieldToText(fields.summary),
    status: nestedText(fields.status, "name"),
  };
}

function nestedText(value: unknown, key: string): string {
  if (!value || typeof value !== "object") return "";
  return fieldToText((value as Record<string, unknown>)[key]);
}

function fieldToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return compactText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return compactText(value.map(fieldToText).filter(Boolean).join(", "));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    for (const key of ["value", "name", "displayName", "key"]) {
      const nestedValue = record[key];
      if (typeof nestedValue === "string") return compactText(nestedValue);
    }

    if (record.type === "doc" || Array.isArray(record.content)) {
      return adfToPlainText(record);
    }
  }

  return "";
}

function indentBlock(value: string, indent: string): string {
  if (!value) return "";
  return value
    .split(/\r?\n/)
    .map((line) => (line.length ? `${indent}${line}` : line))
    .join("\n");
}

function compactText(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function excerpt(value: string, maxLength: number): string {
  const normalized = compactText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}
