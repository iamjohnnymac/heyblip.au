"use server";

import { Resend } from "resend";

export type OrganiserFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<keyof OrganiserFields, string>>;
};

type OrganiserFields = {
  eventName: string;
  eventType: string;
  eventDate: string;
  city: string;
  country: string;
  venue: string;
  expectedAttendance: string;
  organiserName: string;
  email: string;
  phone: string;
  website: string;
  description: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitize(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 4000);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function submitOrganiserApplication(
  _prev: OrganiserFormState,
  formData: FormData,
): Promise<OrganiserFormState> {
  // Honeypot — hidden field real users never fill in. Silently succeed.
  const honeypot = sanitize(formData.get("companyName"));
  if (honeypot) {
    return { ok: true };
  }

  const fields: OrganiserFields = {
    eventName: sanitize(formData.get("eventName")),
    eventType: sanitize(formData.get("eventType")),
    eventDate: sanitize(formData.get("eventDate")),
    city: sanitize(formData.get("city")),
    country: sanitize(formData.get("country")),
    venue: sanitize(formData.get("venue")),
    expectedAttendance: sanitize(formData.get("expectedAttendance")),
    organiserName: sanitize(formData.get("organiserName")),
    email: sanitize(formData.get("email")),
    phone: sanitize(formData.get("phone")),
    website: sanitize(formData.get("website")),
    description: sanitize(formData.get("description")),
  };

  const fieldErrors: OrganiserFormState["fieldErrors"] = {};
  if (!fields.eventName) fieldErrors.eventName = "Event name is required.";
  if (!fields.eventType) fieldErrors.eventType = "Pick an event type.";
  if (!fields.eventDate) fieldErrors.eventDate = "Add at least an approximate date.";
  if (!fields.city) fieldErrors.city = "City is required.";
  if (!fields.country) fieldErrors.country = "Country is required.";
  if (!fields.expectedAttendance) fieldErrors.expectedAttendance = "Give us a ballpark.";
  if (!fields.organiserName) fieldErrors.organiserName = "Your name is required.";
  if (!fields.email) {
    fieldErrors.email = "Email is required.";
  } else if (!EMAIL_RE.test(fields.email)) {
    fieldErrors.email = "That email doesn't look right.";
  }
  if (!fields.description) {
    fieldErrors.description = "Tell us a little about the event.";
  } else if (fields.description.length < 20) {
    fieldErrors.description = "Give us a bit more detail (20+ characters).";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[organisers] RESEND_API_KEY not set");
    return { ok: false, error: "Form is temporarily unavailable. Please email hello@heyblip.au directly." };
  }

  const fromAddress = process.env.ORGANISERS_EMAIL_FROM || "Blip <hello@heyblip.au>";
  const toAddress = process.env.ORGANISERS_EMAIL_TO || "hello@heyblip.au";

  const subject = `Organiser application — ${fields.eventName}`;

  const rows: Array<[string, string]> = [
    ["Event name", fields.eventName],
    ["Event type", fields.eventType],
    ["Date", fields.eventDate],
    ["Venue", fields.venue || "—"],
    ["City", fields.city],
    ["Country", fields.country],
    ["Expected attendance", fields.expectedAttendance],
    ["Organiser", fields.organiserName],
    ["Email", fields.email],
    ["Phone", fields.phone || "—"],
    ["Website / socials", fields.website || "—"],
  ];

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
      <h2 style="margin: 0 0 8px;">New organiser application</h2>
      <p style="margin: 0 0 24px; color: #666;">Submitted via heyblip.au/organisers</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding: 8px 12px; background: #f6f6f6; font-weight: 600; width: 180px; vertical-align: top;">${escapeHtml(label)}</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${escapeHtml(value)}</td>
          </tr>`,
          )
          .join("")}
      </table>
      <h3 style="margin: 24px 0 8px;">About the event</h3>
      <p style="white-space: pre-wrap; margin: 0; font-size: 14px; line-height: 1.6;">${escapeHtml(fields.description)}</p>
    </div>
  `;

  const text = [
    "New organiser application",
    "Submitted via heyblip.au/organisers",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "About the event:",
    fields.description,
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: fromAddress,
      to: toAddress,
      replyTo: fields.email,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error("[organisers] Resend error:", result.error);
      return { ok: false, error: "Couldn't send your application. Please try again or email hello@heyblip.au." };
    }

    return { ok: true };
  } catch (err) {
    console.error("[organisers] Send failed:", err);
    return { ok: false, error: "Couldn't send your application. Please try again or email hello@heyblip.au." };
  }
}
