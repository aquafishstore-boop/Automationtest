/**
 * Microsoft 365 Graph API Integration
 * SharePoint evidence vault, Excel test data, Teams Adaptive Cards.
 *
 * Requires Azure AD app registration with:
 *   - Files.ReadWrite.All (SharePoint)
 *   - Sites.ReadWrite.All (SharePoint)
 *   - ChannelMessage.Send (Teams)
 *   - Files.Read.All (Excel)
 */

import fs from "fs";
import path from "path";

const TENANT_ID = process.env.O365_TENANT_ID || "";
const CLIENT_ID = process.env.O365_CLIENT_ID || "";
const CLIENT_SECRET = process.env.O365_CLIENT_SECRET || "";
const SHAREPOINT_SITE = process.env.O365_SHAREPOINT_SITE || "";
const SHAREPOINT_DRIVE = process.env.O365_SHAREPOINT_DRIVE || "uat-evidence";
const TEAMS_CHANNEL = process.env.O365_TEAMS_CHANNEL || "";
const TEAMS_WEBHOOK = process.env.O365_TEAMS_WEBHOOK || process.env.TEAMS_WEBHOOK_URL || "";
const EXCEL_FILE_ID = process.env.O365_EXCEL_FILE_ID || "";

let accessToken = null;
let tokenExpires = 0;

export function isConfigured() {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

async function getToken() {
  if (accessToken && Date.now() < tokenExpires) return accessToken;
  if (!isConfigured()) throw new Error("O365 not configured. Set O365_TENANT_ID, O365_CLIENT_ID, O365_CLIENT_SECRET");

  const resp = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials"
      })
    }
  );

  if (!resp.ok) throw new Error(`O365 token fetch failed: ${resp.status}`);
  const data = await resp.json();
  accessToken = data.access_token;
  tokenExpires = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

function graphHeaders() {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

/**
 * Upload evidence to SharePoint Document Library
 */
export async function uploadToSharePoint(filename, buffer, folder = "uat-evidence") {
  const token = await getToken();
  const datePath = new Date().toISOString().slice(0, 10);
  const remotePath = `${folder}/${datePath}/${filename}`;

  try {
    // Use SharePoint drive path: /sites/{site}/drive/root:/{path}:/content
    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE}/drive/root:/${remotePath}:/content`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/png"
        },
        body: buffer instanceof Uint8Array ? Buffer.from(buffer) : buffer,
        signal: AbortSignal.timeout(30000)
      }
    );
    if (!resp.ok) throw new Error(`SharePoint upload failed: ${resp.status}`);
    const data = await resp.json();
    return { uploaded: true, url: data.webUrl, id: data.id };
  } catch (err) {
    return { uploaded: false, error: err.message };
  }
}

/**
 * Read test patient data from Excel workbook on SharePoint/OneDrive
 */
export async function readExcelTestData() {
  if (!EXCEL_FILE_ID) throw new Error("O365_EXCEL_FILE_ID not set");
  const token = await getToken();
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${EXCEL_FILE_ID}/workbook/worksheets`,
    { headers: graphHeaders() }
  );
  if (!resp.ok) throw new Error(`Excel worksheets fetch failed: ${resp.status}`);
  const sheets = await resp.json();

  // Read first worksheet
  const sheet = sheets.value?.[0];
  if (!sheet) throw new Error("No worksheets found");

  const rangeResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${EXCEL_FILE_ID}/workbook/worksheets/${sheet.id}/range(address='A1:Z100')`,
    { headers: graphHeaders() }
  );
  if (!rangeResp.ok) throw new Error(`Excel range fetch failed: ${rangeResp.status}`);
  const range = await rangeResp.json();

  // Convert to patient objects
  const rows = range.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const patient = {};
    headers.forEach((h, i) => { patient[h.toLowerCase()] = row[i] || ""; });
    return patient;
  }).filter(p => p.id || p.nhsnumber);
}

/**
 * Post rich Adaptive Card to Teams channel
 */
export async function postTeamsCard(card) {
  const url = TEAMS_WEBHOOK;
  if (!url) throw new Error("TEAMS_WEBHOOK_URL not configured");

  const defaultCard = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: card || {
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          { type: "TextBlock", size: "Medium", weight: "Bolder", text: "UAT Test Run Complete" },
          { type: "FactSet", facts: [
            { title: "Status", value: "✅ Passed" },
            { title: "Passed", value: "5/5" },
            { title: "System", value: "Winpath Enterprise" },
            { title: "Duration", value: "45s" }
          ]},
          { type: "ActionSet", actions: [
            { type: "Action.OpenUrl", title: "View Report", url: "https://UATAPPv1.aetheriscloudgroup.uk" }
          ]}
        ]
      }
    }]
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(defaultCard),
    signal: AbortSignal.timeout(10000)
  });
  return { sent: resp.ok, status: resp.status };
}

export function buildRunCard(runResult) {
  const statusEmoji = runResult.failed > 0 ? "❌" : "✅";
  const color = runResult.failed > 0 ? "attention" : "good";
  return {
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      { type: "TextBlock", size: "Medium", weight: "Bolder", text: `${statusEmoji} UAT Test Run: ${runResult.scriptName || "Unnamed"}` },
      { type: "FactSet", facts: [
        { title: "Status", value: `${statusEmoji} ${runResult.passed}/${runResult.total || runResult.passed + runResult.failed} passed` },
        { title: "System", value: runResult.system || "N/A" },
        { title: "Duration", value: `${Math.round((runResult.duration || 0) / 1000)}s` },
        { title: "Screenshots", value: `${runResult.screenshots || 0} captured` },
        ...(runResult.failed > 0 ? [{ title: "Failures", value: `${runResult.failed} step(s) failed — see report` }] : [])
      ]},
      { type: "ActionSet", actions: [
        { type: "Action.OpenUrl", title: "View Full Report", url: `https://UATAPPv1.aetheriscloudgroup.uk/api/runs/${runResult.runId}/report` }
      ]}
    ]
  };
}

export function getO365Status() {
  return {
    configured: isConfigured(),
    sharePoint: !!SHAREPOINT_SITE,
    teams: !!TEAMS_WEBHOOK,
    excel: !!EXCEL_FILE_ID,
    tenantId: TENANT_ID ? TENANT_ID.slice(0, 8) + "..." : "not set"
  };
}
