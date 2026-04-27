// ─────────────────────────────────────────────────────────────
//  Silver & Salt Capital — Membership Application Handler
//  Paste this into Google Apps Script and deploy as a Web App
// ─────────────────────────────────────────────────────────────

var SHEET_NAME  = "Applications";          // Tab name in your Google Sheet
var NOTIFY_EMAIL = "tori@silverandsaltcapital.com";  // Your email

// Column headers — must match the order in setupSheet()
var HEADERS = [
  "Timestamp",
  "First Name",
  "Last Name",
  "Email",
  "How They Found Us",
  "Referred By",
  "Who They Are",
  "Interests",
  "LinkedIn",
  "Why Silver & Salt Capital"
];

// ── Interest color tags ───────────────────────────────────────
var INTEREST_TAGS = {
  "Investing in line with my values":        "🟢",
  "Finding community with like-minded women": "🟣",
  "Building financial confidence":           "🔵",
  "Planning for my family's future":         "🟡",
  "Starting or growing a business":          "🟠",
  "Figuring out my next chapter":            "🩷",
  "Not sure yet — just exploring":           "⚪"
};

function tagInterest(interest) {
  var dot = INTEREST_TAGS[interest] || "•";
  return dot + " " + interest;
}

// ── Entry point ──────────────────────────────────────────────
function doPost(e) {
  try {
    var sheet = getOrCreateSheet();
    var data  = e.parameter;

    // Build the row
    var row = [
      new Date(),
      data.first_name      || "",
      data.last_name       || "",
      data.email           || "",
      data.referral        || "",
      data.referral_name   || "",
      data.who_you_are     || "",
      (data.focus ? data.focus.split(",").map(s => tagInterest(s.trim())).join("\n") : ""),
      data.linkedin        || "",
      data.message         || ""
    ];

    sheet.appendRow(row);

    // Notify Tori
    sendAdminNotification(data);

    // Confirm to applicant
    sendApplicantConfirmation(data);

    return ContentService
      .createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Sheet setup ──────────────────────────────────────────────
function getOrCreateSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);

    // Style the header row
    var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#2F3E34");
    headerRange.setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);   // Timestamp
    sheet.setColumnWidth(10, 300);  // Why Silver & Salt Capital
  }

  return sheet;
}

// ── Admin notification ───────────────────────────────────────
function sendAdminNotification(data) {
  var name    = (data.first_name || "") + " " + (data.last_name || "");
  var subject = "New Membership Application — " + name.trim();

  var body = "A new application has been submitted to Silver & Salt Capital.\n\n"
    + "Name:       " + name.trim()                    + "\n"
    + "Email:      " + (data.email || "")             + "\n"
    + "Found us:   " + (data.referral || "")          + "\n"
    + (data.referral_name ? "Referred by: " + data.referral_name + "\n" : "")
    + "Who they are: " + (data.who_you_are || "")     + "\n"
    + "Interests:  " + (data.focus || "")             + "\n"
    + "LinkedIn:   " + (data.linkedin || "—")         + "\n\n"
    + "Why Silver & Salt Capital:\n" + (data.message || "") + "\n\n"
    + "────────────────────────────────────────\n"
    + "View all applications in your Google Sheet.";

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}

// ── Applicant confirmation ────────────────────────────────────
function sendApplicantConfirmation(data) {
  if (!data.email) return;

  var firstName = data.first_name || "there";
  var subject   = "We received your application — Silver & Salt Capital";

  var body = "Hi " + firstName + ",\n\n"
    + "Thank you for applying to Silver & Salt Capital. We've received your application and will be in touch within two business days.\n\n"
    + "In the meantime, you can schedule your introduction call using the link on the application page.\n\n"
    + "Warm regards,\n"
    + "Tori\n"
    + "Silver & Salt Capital";

  MailApp.sendEmail(data.email, subject, body);
}
