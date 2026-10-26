const databaseId = 'lyc';
const centresTableId = 'yulyf_centres';
const clientsTableId = 'yulyf_centre_clients';
const linksTableId = 'yulyf_centre_client_links';
const yulyfRecordsTableId = 'records';

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
function equal(attribute, values) { return JSON.stringify({ method: 'equal', attribute, values: Array.isArray(values) ? values : [values] }); }
function limit(value) { return JSON.stringify({ method: 'limit', values: [value] }); }
function rowsPath(tableId, queries = []) {
  const params = new URLSearchParams();
  queries.forEach(query => params.append('queries[]', query));
  return `/tablesdb/${databaseId}/tables/${tableId}/rows${params.size ? `?${params}` : ''}`;
}
function patientReference(payload) {
  return text(payload.patientNumber || payload.patientReference || payload.dossierNumber, 25).toUpperCase();
}
function normalizedEmail(value) { return text(value, 320).toLowerCase(); }

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

    if (body.action === 'syncLinks') {
      const [clientsResult, linksResult] = await Promise.all([
        api(req, rowsPath(clientsTableId, [equal('centreId', centreId), limit(500)])),
        api(req, rowsPath(linksTableId, [equal('centreId', centreId), limit(500)])),
      ]);
      const clients = clientsResult.rows || [];
      const links = linksResult.rows || [];
      const members = memberships.memberships || [];
      const practitionerIds = [...new Set([centre.ownerId, ...members.filter(item => item.confirm !== false).map(item => item.userId)].filter(Boolean))];
      let created = 0, updated = 0, matched = 0, awaitingNumber = 0;

      for (const practitionerUserId of practitionerIds) {
        const patientRows = await api(req, rowsPath(yulyfRecordsTableId, [equal('owner', practitionerUserId), equal('kind', 'patients'), limit(500)]));
        const practitioner = members.find(item => item.userId === practitionerUserId);
        const practitionerName = text(practitioner?.userName || (practitionerUserId === centre.ownerId ? 'Propriétaire du centre' : 'Praticien Yulyf'), 128);
        for (const patientRow of patientRows.rows || []) {
          let patient = {};
          try { patient = JSON.parse(patientRow.payload || '{}'); } catch { continue; }
          const reference = patientReference(patient);
          const accountId = text(patient.yulyfAccountId || patient.accountId || patient.userId, 36);
          const email = normalizedEmail(patient.email || patientRow.access);
          const centreClient = clients.find(client => (accountId && client.yulyfAccountId === accountId) || (email && normalizedEmail(client.email) === email));
          if (!centreClient) continue;
          matched += 1;
          if (!/^YUL-\d{4}-\d{6}\/P\d{4}$/.test(reference)) { awaitingNumber += 1; continue; }
          const yulyfPatientId = text(patient.id || patientRow.$id, 36);
          const existing = links.find(link => link.clientId === centreClient.$id && link.practitionerUserId === practitionerUserId);
          const data = { centreId, teamId: centre.teamId, clientId: centreClient.$id, practitionerUserId, practitionerName, practitionerNumber: reference.split('/')[0], patientReference: reference, yulyfPatientId, status: 'active', dedupeKey: `${centreId}|${practitionerUserId}|${reference}`, createdAt: existing?.createdAt || now, updatedAt: now };
          if (existing) {
            if (existing.patientReference !== reference || existing.yulyfPatientId !== yulyfPatientId || existing.status !== 'active') {
              await api(req, `/tablesdb/${databaseId}/tables/${linksTableId}/rows/${existing.$id}`, { method: 'PATCH', body: JSON.stringify({ data }) });
              updated += 1;
            }
          } else {
            await api(req, `/tablesdb/${databaseId}/tables/${linksTableId}/rows`, { method: 'POST', body: JSON.stringify({ rowId: 'unique()', data, permissions: permissions(centre.ownerId, centre.teamId) }) });
            created += 1;
          }
        }
      }
      return res.json({ sync: { created, updated, matched, awaitingNumber } });
    }
    return res.json({ error: 'Action inconnue.' }, 400);
  } catch (caught) {
    error(caught.message);
    return res.json({ error: caught.message || 'Erreur interne.' }, caught.status || 500);
  }
};
