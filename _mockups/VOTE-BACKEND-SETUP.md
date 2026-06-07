# Vote Backend Setup (2 minutes)

## Step 1: Create the Google Sheet
1. Go to https://sheets.new (creates a new Google Sheet)
2. Name it "Hero Votes"
3. In cell A1 type: `Name` — in B1 type: `Choice` — in C1 type: `Time`
4. Copy the spreadsheet ID from the URL (the long string between `/d/` and `/edit`)

## Step 2: Create the Apps Script
1. Go to https://script.google.com/home
2. Click "+ New project"
3. Delete everything in the editor
4. Paste the code below
5. Replace `YOUR_SHEET_ID_HERE` with the ID from Step 1
6. Click **Deploy > New deployment**
7. Type: **Web app**
8. Execute as: **Me**
9. Who has access: **Anyone**
10. Click **Deploy**
11. Copy the Web App URL — it looks like: `https://script.google.com/macros/s/.../exec`
12. Send that URL to Claude so the voting page can be updated

## Apps Script Code

```javascript
const SHEET_ID = 'YOUR_SHEET_ID_HERE';

function doGet(e) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  const data = sheet.getDataRange().getValues();

  // Skip header row, tally votes
  const votes = { A: 0, B: 0, C: 0, D: 0 };
  const log = [];

  for (let i = 1; i < data.length; i++) {
    const choice = data[i][1];
    if (votes.hasOwnProperty(choice)) {
      votes[choice]++;
    }
    log.push({
      name: data[i][0],
      choice: data[i][1],
      time: data[i][2]
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify({ votes, log }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  const body = JSON.parse(e.postData.contents);

  sheet.appendRow([body.name, body.choice, new Date().toISOString()]);

  // Return updated tallies
  return doGet(e);
}
```
