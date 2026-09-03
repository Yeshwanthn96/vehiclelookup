/**
 * Google Apps Script webhook for vehicledet.vercel.app search logging.
 *
 * Setup (in the target sheet, not a standalone script):
 *   1. Open https://docs.google.com/spreadsheets/d/1uI49xGeb8HpCLutmpWHFprzdmfM_w98fCXDuqwA-rrw/edit
 *   2. Extensions -> Apps Script, replace Code.gs with this file, Save.
 *   3. Deploy -> New deployment -> Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *   4. Copy the /exec URL and set it as SHEETS_WEBHOOK_URL in Vercel, then redeploy.
 *
 * The /exec URL must stay secret: anyone holding it can append rows.
 */

const HEADERS = [
  "Time",
  "RC",
  "Model",
  "Owner",
  "Found",
  "City",
  "Region",
  "Country",
  "IP",
];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      data.searched_at ? new Date(data.searched_at) : new Date(),
      data.rc || "",
      data.model || "",
      data.owner || "",
      data.found === true ? "Yes" : data.found === false ? "No" : "",
      data.city || "",
      data.region || "",
      data.country || "",
      data.ip || "",
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(error) }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
