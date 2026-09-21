// The host's actual cron events. Chapter supplies the signup, payment,
// booking, welcome and gift contracts; declaring an event never enables it.
const identity = ["firstName", "lastName", "email", "phone", "state"];
const event = (label, trigger, audience, variables) => ({
  label, trigger, audience, variables, optionalVariables: ["phone", "state"], requiresTier: true,
});

export const SIGNUP_EMAIL_EVENTS = {
  bookingReminder: event("Paid member booking reminder", "Payment is over 24 hours old and the call is still unbooked", "Applicant", [...identity, "membersUrl"]),
  bookingReminderFree: event("Associate booking reminder", "A free application is over 24 hours old and the call is still unbooked", "Applicant", [...identity, "membersUrl"]),
  paymentReminder: event("Payment reminder", "A paid-tier application is over 24 hours old and payment is incomplete", "Applicant", [...identity, "membersUrl"]),
  bookingReminderAdmin: event("Unbooked member notice", "A paid member receives her booking reminder", "Administrator", [...identity, "membersUrl"]),
  callBookedAdmin: event("Call booked notice", "A new introduction call is found on the calendar", "Administrator", [...identity, "meetingTime", "tierName", "adminUrl"]),
  paidApprovedAdmin: event("Paid and approved notice", "A member pays and is approved with the call waived", "Administrator", [...identity, "tierName", "adminUrl"]),
};
