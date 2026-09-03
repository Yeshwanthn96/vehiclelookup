// Optional Google Sheets sink. Set SHEETS_WEBHOOK_URL to an Apps Script Web App
// that appends the posted JSON as a row; unset, this is a no-op.
// See scripts/sheet-webhook.gs for the script to deploy.
const WEBHOOK = process.env.SHEETS_WEBHOOK_URL;

export const sheetEnabled = Boolean(WEBHOOK);

export async function pushToSheet(entry) {
  if (!WEBHOOK) return;
  // Apps Script answers with a 302 to script.googleusercontent.com; fetch follows it.
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...entry, searched_at: new Date().toISOString() }),
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Sheet webhook responded ${res.status}`);
}
