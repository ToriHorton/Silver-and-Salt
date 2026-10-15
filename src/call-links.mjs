// Shared pieces of the call emails.
//
// The link that reopens an application on the join page. After a booked call
// it lands on the confirmation screen, which offers "Pick a new one"; after a
// missed call (released by "Didn't happen") it lands on the booking step. The
// application id is the credential, as everywhere else in the join flow.
const SITE = "https://silverandsaltcapital.com";

/** @param {string} applicationId */
export const rescheduleUrl = (applicationId) => `${SITE}/join?application=${encodeURIComponent(applicationId)}`;

/** "Tuesday, September 23, 2026 at 10:00 AM MDT", the booking confirmation's format.
 *  @param {number} startAt @param {string} timezone */
export function callTimeLabel(startAt, timezone) {
  try {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(startAt);
    const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(startAt);
    return `${day} at ${time}`;
  } catch {
    return new Date(startAt).toISOString();
  }
}
