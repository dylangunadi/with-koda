import { getResendApiKey, getAppUrl } from "@/lib/env";
import type { GeneratedMove } from "./generateRecruitingMoves";

interface BriefEmailParams {
  to: string;
  userName: string;
  moves: GeneratedMove[];
}

export async function sendBriefEmail({
  to,
  userName,
  moves,
}: BriefEmailParams): Promise<{ sent: boolean; method: "resend" | "logged" }> {
  const apiKey = getResendApiKey();
  const appUrl = getAppUrl();

  const subject = `Your Koda Brief — ${moves.length} new recruiting moves`;
  const html = buildBriefHtml(userName, moves, appUrl);

  if (!apiKey) {
    console.log("[koda:email] No RESEND_API_KEY — logging brief instead.");
    console.log(`[koda:email] To: ${to}`);
    console.log(`[koda:email] Subject: ${subject}`);
    console.log(`[koda:email] Moves: ${moves.map((m) => m.title).join(", ")}`);
    return { sent: false, method: "logged" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Koda <koda@withkoda.app>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[koda:email] Resend error:", err);
    return { sent: false, method: "resend" };
  }

  return { sent: true, method: "resend" };
}

function buildBriefHtml(
  userName: string,
  moves: GeneratedMove[],
  appUrl: string
): string {
  const moveRows = moves
    .map(
      (m) => `
      <tr>
        <td style="padding: 16px; border-bottom: 1px solid #eee;">
          <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">${escapeHtml(m.title)}</div>
          ${m.company ? `<div style="font-size: 13px; color: #666;">${escapeHtml(m.company)}</div>` : ""}
          <div style="font-size: 13px; color: #888; margin-top: 8px;">${escapeHtml(m.fit_reason || "")}</div>
          ${m.source_note ? `<div style="font-size: 12px; color: #0d7377; margin-top: 6px; font-style: italic;">Why this move: ${escapeHtml(m.source_note)}</div>` : ""}
        </td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #faf9f7; padding: 32px;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <div style="padding: 24px 24px 16px; border-bottom: 1px solid #eee;">
      <h1 style="font-size: 20px; margin: 0; color: #0d7377;">Koda</h1>
      <p style="font-size: 14px; color: #666; margin: 8px 0 0;">Hey ${escapeHtml(userName)}, here are your recruiting moves for today.</p>
    </div>
    <table style="width: 100%; border-collapse: collapse;">
      ${moveRows}
    </table>
    <div style="padding: 20px 24px; text-align: center;">
      <a href="${escapeHtml(appUrl)}/inbox" style="display: inline-block; background: #0d7377; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">View in Koda</a>
    </div>
    <div style="padding: 16px 24px; text-align: center; font-size: 11px; color: #aaa;">
      This is an AI-generated brief from Koda. Review all suggestions before acting.
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
