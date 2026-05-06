// Soft collision indicator for Buddy.
// When a tester loads a ticket, we record { sessionId, at } in Vercel KV under
// a short TTL. The queue endpoint reads this back and the UI can show
// "loaded by another tester N min ago". Sessions are anonymous (random UUID
// kept in localStorage) so John and Tay are distinguishable without identifying.
//
// If KV is not configured (no KV_REST_API_URL env), every call is a graceful
// no-op so the rest of Buddy keeps working.

const PRESENCE_TTL_SECONDS = 600;

type PresenceRecord = {
  sessionId: string;
  at: number;
};

type KvClient = {
  set: (key: string, value: PresenceRecord, opts?: { ex?: number }) => Promise<unknown>;
  mget: <T>(...keys: string[]) => Promise<Array<T | null>>;
};

let cachedKv: KvClient | null | undefined;

async function loadKv(): Promise<KvClient | null> {
  if (cachedKv !== undefined) return cachedKv;
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    cachedKv = null;
    return null;
  }
  try {
    const mod = (await import("@vercel/kv")) as { kv: KvClient };
    cachedKv = mod.kv;
  } catch {
    cachedKv = null;
  }
  return cachedKv;
}

function presenceKey(issueKey: string): string {
  return `buddy:presence:${issueKey}`;
}

export async function recordPresence(issueKey: string, sessionId: string): Promise<void> {
  const kv = await loadKv();
  if (!kv) return;
  try {
    await kv.set(presenceKey(issueKey), { sessionId, at: Date.now() }, { ex: PRESENCE_TTL_SECONDS });
  } catch {
    // Presence is sugar; never crash a request because the indicator failed.
  }
}

export async function getPresenceMany(issueKeys: string[]): Promise<Record<string, PresenceRecord | null>> {
  const result: Record<string, PresenceRecord | null> = {};
  if (!issueKeys.length) return result;
  const kv = await loadKv();
  if (!kv) {
    for (const key of issueKeys) result[key] = null;
    return result;
  }
  try {
    const values = await kv.mget<PresenceRecord>(...issueKeys.map(presenceKey));
    issueKeys.forEach((key, index) => {
      result[key] = values[index] || null;
    });
  } catch {
    for (const key of issueKeys) result[key] = null;
  }
  return result;
}

export type { PresenceRecord };
