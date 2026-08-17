/* ==========================================================
   Email Service — Nagpur Connect
   Handles sending email updates (EmailJS / Resend / Webhook)
   ========================================================== */

import { query } from "@/lib/db";

export interface EmailPayload {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
}

/**
 * Core send email function — extensible for EmailJS, Resend, or AWS SES
 */
export async function sendEmail(payload: EmailPayload): Promise<void> {
  console.log(`[EmailService] Sending email to: ${payload.to} | Subject: ${payload.subject}`);
  
  // Future EmailJS REST API execution
  // fetch('https://api.emailjs.com/api/v1.0/email/send', ...)
}

/**
 * Look up citizen email and send status notification if enabled
 */
export async function notifyCitizenViaEmail(citizenId: string, payload: {
  title: string;
  publicReference: string;
  statusText: string;
  reason?: string;
}): Promise<void> {
  try {
    let email: string | null = null;
    let name: string = "Citizen";
    let emailEnabled: boolean = true;

    if (citizenId.startsWith("google_")) {
      const googleId = citizenId.replace("google_", "");
      const rows = await query<{ email: string; name: string; notification_email_enabled: number }>(
        `SELECT email, name, notification_email_enabled FROM citizens WHERE google_id = ? LIMIT 1`,
        [googleId]
      ).catch(() => []);
      if (rows.length > 0) {
        email = rows[0].email;
        name = rows[0].name || name;
        emailEnabled = !!rows[0].notification_email_enabled;
      }
    } else if (citizenId.startsWith("guest_")) {
      const guestId = citizenId.replace("guest_", "");
      const rows = await query<{ email: string; name: string; notification_email_enabled: number }>(
        `SELECT email, name, notification_email_enabled FROM citizens WHERE guest_id = ? LIMIT 1`,
        [guestId]
      ).catch(() => []);
      if (rows.length > 0) {
        email = rows[0].email;
        name = rows[0].name || name;
        emailEnabled = !!rows[0].notification_email_enabled;
      }
    }

    if (!email || !emailEnabled) {
      return;
    }

    const subject = `[Nagpur Connect] Report Update: ${payload.publicReference}`;
    const bodyHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 16px;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Nagpur Connect Incident Update</h2>
        <p style="color: #475569; font-size: 14px;">Hello ${name},</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Your reported incident <strong>"${payload.title}"</strong> (Ref: <code>${payload.publicReference}</code>) has been updated:
        </p>
        <div style="background-color: #f1f5f9; padding: 14px 18px; border-radius: 12px; margin: 16px 0;">
          <p style="margin: 0; font-weight: bold; color: #0284c7; font-size: 15px;">Status: ${payload.statusText}</p>
          ${payload.reason ? `<p style="margin: 6px 0 0; color: #64748b; font-size: 13px;">Note: ${payload.reason}</p>` : ""}
        </div>
        <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
          Nagpur Municipal Corporation (NMC) Civic Response System
        </p>
      </div>
    `;

    await sendEmail({
      to: email,
      subject,
      bodyHtml,
      bodyText: `Your report ${payload.publicReference} (${payload.title}) status is now: ${payload.statusText}`,
    });
  } catch (err) {
    console.warn("[EmailService] Failed to notify citizen via email:", err);
  }
}

