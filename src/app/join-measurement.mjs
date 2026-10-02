// Observe Chapter's server-confirmed states without touching submission,
// payments, or booking. The capability stays in this tab; only safe labels
// reach the analytics emitter. Storage/analytics failure must never block joining.
export function createJoinMeasurement({ emit, storage, initialApplicationId = null }) {
  const key = 'ssc-join-measurement-v1';
  let ledger;
  try { ledger = JSON.parse(storage?.getItem(key) || 'null'); } catch {}
  if (!ledger || typeof ledger.id !== 'string' || !Array.isArray(ledger.sent)) ledger = null;
  let previous = 'form';
  return (state, tier) => {
    const { step, applicationId } = state;
    if (!applicationId || !['payment', 'paymentPending', 'booking', 'done', 'accepted'].includes(step)) {
      previous = step;
      return;
    }
    const fresh = applicationId !== initialApplicationId;
    const known = ledger?.id === applicationId;
    if (!known) ledger = { id: applicationId, sent: [], active: fresh };
    if (!['done', 'accepted'].includes(step)) ledger.active = true;
    const once = (name, extra = {}) => {
      if (ledger.sent.includes(name)) return;
      try {
        if (!emit(name, { membership_tier: tier, ...extra })) return;
        ledger.sent.push(name);
        storage?.setItem(key, JSON.stringify(ledger));
      } catch { /* Measurement is optional; the application is not. */ }
    };
    // A resumed historical application is not a new lead.
    if (fresh) once('generate_lead');
    // A saved terminal screen alone is not a new conversion. Continue counting
    // tracked journeys and an applicant who resumes booking then finishes it.
    const active = fresh || ledger.active || (previous !== 'form' && previous !== 'done' && previous !== 'accepted');
    if (active && (step === 'done' || step === 'accepted')) {
      once('application_complete', {
        completion_type: step === 'done' ? 'onboarding_booked' : 'approved_without_call',
      });
      if (step === 'accepted') once('membership_approved');
    }
    previous = step;
  };
}
