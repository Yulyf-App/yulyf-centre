export function normalizeWebsite(value) {
  const website = String(value || '').trim();
  if (!website) return '';
  return /^[a-z][a-z\d+.-]*:\/\//i.test(website) ? website : `https://${website}`;
}

export function validWebsite(value) {
  if (!value) return true;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}
