export const CENTRE_MONTHLY_BASE_PRICE = 33;
export const CENTRE_SPONSORED_PRACTITIONER_PRICE = 12;

export function centreMonthlySubscription(relations = [], now = new Date()) {
  const active = relations.filter(relation => relation?.status === 'active');
  const sponsoredPractitioners = active.filter(relation => relation.accountMode === 'centre_created' || relation.billedBy === 'centre').length;
  const personalYulyfPractitioners = active.length - sponsoredPractitioners;
  const practitionerAmount = sponsoredPractitioners * CENTRE_SPONSORED_PRACTITIONER_PRICE;
  const totalAmount = CENTRE_MONTHLY_BASE_PRICE + practitionerAmount;
  const rawMonth = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' }).format(now);
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
  return {
    monthLabel,
    baseAmount: CENTRE_MONTHLY_BASE_PRICE,
    sponsoredPractitioners,
    sponsoredPractitionerPrice: CENTRE_SPONSORED_PRACTITIONER_PRICE,
    practitionerAmount,
    personalYulyfPractitioners,
    personalYulyfAmount: 0,
    totalAmount,
  };
}
