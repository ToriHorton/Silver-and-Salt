# Form Setup — Silver & Salt Capital

Follow these steps once to connect your application form to Google Sheets.
The whole thing takes about 5 minutes.

---

## Step 1 — Create your Google Sheet

1. Go to [Google Drive](https://drive.google.com) and create a new Google Sheet
2. Name it **Silver & Salt Capital — Applications**
3. Leave the first tab as-is (the script will set up the columns automatically)

---

## Step 2 — Add the Apps Script

1. In your new Sheet, click **Extensions → Apps Script**
2. Delete any existing code in the editor
3. Open `membership-form-script.gs` (in this folder) and paste its entire contents
4. Click **Save** (the floppy disk icon)

---

## Step 3 — Deploy as a Web App

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Select type" and choose **Web app**
3. Fill in:
   - **Description:** Silver & Salt Application Form
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. Authorize the app when prompted (click through the Google permissions screens)
6. **Copy the Web App URL** — it will look like:
   `https://script.google.com/macros/s/XXXXXXX/exec`

---

## Step 4 — Connect to the form

1. Open `join.html` in a text editor
2. Find this line:
   ```
   action="APPS_SCRIPT_URL"
   ```
3. Replace `APPS_SCRIPT_URL` with the URL you copied in Step 3
4. Save the file and re-upload it to your website

---

## What happens when someone submits

- A new row is added to your **Applications** sheet instantly
- You receive an email at tori@silverandsaltcapital.com with the full application
- The applicant receives a confirmation email acknowledging their submission

---

## Redeploying after changes

If you ever edit the Apps Script, you must create a **new deployment** (not update the existing one) for changes to take effect. Copy the new URL and update `join.html` again.
