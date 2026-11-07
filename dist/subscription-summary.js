const money = value => Math.round(Number(value) * 100) / 100;

export function centreMonthlySubscription(relations = [], pricing = null, now = new Date()) {
  const active = relations.filter(relation => relation?.status === 'active');
  const sponsoredPractitioners = active.filter(relation => relation.accountMode === 'centre_created' || relation.billedBy === 'centre').length;
  const personalYulyfPractitioners = active.length - sponsoredPractitioners;
  const available = pricing?.source === 'backoffice'
    && Number(pricing.annualBasePrice) >= 0
    && Number(pricing.sponsoredAnnualPrice) >= 0
    && Number(pricing.installments) === 12;
  const baseAnnualPrice = available ? money(pricing.annualBasePrice) : null;
  const sponsoredAnnualPrice = available ? money(pricing.sponsoredAnnualPrice) : null;
  const baseAmount = available ? money(baseAnnualPrice / 12) : null;
  const sponsoredPractitionerPrice = available ? money(sponsoredAnnualPrice / 12) : null;
  const practitionerAmount = available ? money(sponsoredPractitioners * sponsoredPractitionerPrice) : null;
  const totalAmount = available ? money(baseAmount + practitionerAmount) : null;
  const rawMonth = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' }).format(now);
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
  return {
    monthLabel,
    pricingAvailable: available,
    installments: 12,
    baseAnnualPrice,
    baseAmount,
    sponsoredPractitioners,
    sponsoredAnnualPrice,
    sponsoredPractitionerPrice,
    practitionerAmount,
    personalYulyfPractitioners,
    personalYulyfAmount: 0,
    totalAmount,
  };
}
