// The link that reopens an application on the join page. After a booked call
// it lands on the confirmation screen, which offers "Pick a new one"; after a
// missed call (released by "Didn't happen") it lands on the booking step. The
// application id is the credential, as everywhere else in the join flow.
const SITE = "https://silverandsaltcapital.com";

/** @param {string} applicationId */
export const rescheduleUrl = (applicationId) => `${SITE}/join?application=${encodeURIComponent(applicationId)}`;
