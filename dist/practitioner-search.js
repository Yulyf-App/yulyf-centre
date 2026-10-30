export function normalizePractitionerSearch(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bpracticien\b/g, 'praticien')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesPractitionerSearch(practitioner = {}, value = '') {
  const query = normalizePractitionerSearch(value);
  if (!query) return true;
  const searchable = normalizePractitionerSearch([
    practitioner.name,
    practitioner.email,
    practitioner.practitionerNumber,
    practitioner.activity,
  ].filter(Boolean).join(' '));
  return query.split(' ').every(term => searchable.includes(term));
}
