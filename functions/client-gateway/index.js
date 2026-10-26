const databaseId = 'lyc';
const centresTableId = 'yulyf_centres';
const clientsTableId = 'yulyf_centre_clients';
const linksTableId = 'yulyf_centre_client_links';

function appwriteHeaders(req) {
  return { 'content-type': 'application/json', 'x-appwrite-project': process.env.APPWRITE_FUNCTION_PROJECT_ID, 'x-appwrite-key': req.headers['x-appwrite-key'] };
}

async function api(req, path, options = {}) {
  const response = await fetch(`${process.env.APPWRITE_FUNCTION_API_ENDPOINT}${path}`, { ...options, headers: { ...appwriteHeaders(req), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message || 'Appwrite a refusé l’opération.'), { status: response.status });
  return data;
}

function permissions(ownerId, teamId) {
  return [
    `read("user:${ownerId}")`, `update("user:${ownerId}")`, `delete("user:${ownerId}")`,
    `read("team:${teamId}/owner")`, `read("team:${teamId}/yc-admin")`, `read("team:${teamId}/p-clients-view")`, `read("team:${teamId}/p-clients-edit")`,
    `update("team:${teamId}/owner")`, `update("team:${teamId}/yc-admin")`, `update("team:${teamId}/p-clients-edit")`,
    `delete("team:${teamId}/owner")`, `delete("team:${teamId}/yc-admin")`,
  ];
}

function text(value, max) { return String(value || '').trim().slice(0, max); }
function validEmail(value) { return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

export default async ({ req, res, error }) => {
  try {
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Authentification requise.' }, 401);
    if (req.method !== 'POST') return res.json({ error: 'Méthode refusée.' }, 405);
    const body = req.bodyJson || {};
    const centreId = text(body.centreId, 36);
    if (!centreId) return res.json({ error: 'Centre manquant.' }, 400);
    const centre = await api(req, `/tablesdb/${databaseId}/tables/${centresTableId}/rows/${centreId}`);
    const memberships = await api(req, `/teams/${centre.teamId}/memberships?total=false`);
    const membership = memberships.memberships?.find(item => item.userId === userId);
    const allowed = userId === centre.ownerId || membership?.roles?.some(role => ['owner', 'yc-admin', 'p-clients-edit'].includes(role));
    if (!allowed) return res.json({ error: 'Tu ne peux pas modifier les clients de ce centre.' }, 403);
    const now = new Date().toISOString();

    if (body.action === 'createClient') {
      const input = body.data || {};
      const firstName = text(input.firstName, 128), lastName = text(input.lastName, 128), emailAddress = text(input.email, 320).toLowerCase(), phone = text(input.phone, 40);
      if (!firstName || !lastName || (!emailAddress && !phone) || !validEmail(emailAddress)) return res.json({ error: 'La fiche administrative est incomplète ou invalide.' }, 400);
      const data = { centreId, teamId: centre.teamId, firstName, lastName, email: emailAddress, phone, address: text(input.address, 320), postal: text(input.postal, 20), city: text(input.city, 128), country: text(input.country || 'Belgique', 64), practitionerUserId: '', practitionerName: '', source: text(input.source || 'manual', 24), yulyfPatientId: '', yulyfAccountId: text(input.yulyfAccountId, 36), sourceOwnerId: '', dedupeKey: text(input.dedupeKey, 256), active: true, createdAt: now, updatedAt: now };
      const created = await api(req, `/tablesdb/${databaseId}/tables/${clientsTableId}/rows`, { method: 'POST', body: JSON.stringify({ rowId: 'unique()', data, permissions: permissions(centre.ownerId, centre.teamId) }) });
      return res.json({ row: created }, 201);
    }

    if (body.action === 'createLink') {
      const input = body.data || {};
      const clientId = text(input.clientId, 36), practitionerUserId = text(input.practitionerUserId, 36), patientReference = text(input.patientReference, 25).toUpperCase();
      if (!/^YUL-\d{4}-\d{6}\/P\d{4}$/.test(patientReference)) return res.json({ error: 'Référence patient Yulyf invalide.' }, 400);
      const centreClient = await api(req, `/tablesdb/${databaseId}/tables/${clientsTableId}/rows/${clientId}`);
      if (centreClient.centreId !== centreId) return res.json({ error: 'Ce client appartient à un autre centre.' }, 403);
      const practitioner = memberships.memberships?.find(item => item.userId === practitionerUserId);
      if (!practitioner) return res.json({ error: 'Le praticien ne fait pas partie de ce centre.' }, 400);
      const practitionerName = text(input.practitionerName || practitioner.userName || 'Praticien Yulyf', 128);
      const data = { centreId, teamId: centre.teamId, clientId, practitionerUserId, practitionerName, practitionerNumber: patientReference.split('/')[0], patientReference, yulyfPatientId: text(input.yulyfPatientId, 36), status: 'active', dedupeKey: `${centreId}|${practitionerUserId}|${patientReference}`, createdAt: now, updatedAt: now };
      const created = await api(req, `/tablesdb/${databaseId}/tables/${linksTableId}/rows`, { method: 'POST', body: JSON.stringify({ rowId: 'unique()', data, permissions: permissions(centre.ownerId, centre.teamId) }) });
      return res.json({ row: created }, 201);
    }
    return res.json({ error: 'Action inconnue.' }, 400);
  } catch (caught) {
    error(caught.message);
    return res.json({ error: caught.message || 'Erreur interne.' }, caught.status || 500);
  }
};
