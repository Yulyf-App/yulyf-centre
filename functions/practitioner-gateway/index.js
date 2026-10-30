const databaseId = 'lyc';
const centresTableId = 'yulyf_centres';
const locationsTableId = 'yulyf_centre_locations';
const relationsTableId = 'yulyf_centre_practitioners';
const recordsTableId = 'records';
const adminTableId = 'admin_records';

const text = (value, max = 320) => String(value || '').trim().slice(0, max);
const email = value => text(value, 320).toLowerCase();
const encode = value => encodeURIComponent(String(value));
const equal = (attribute, value) => JSON.stringify({ method: 'equal', attribute, values: Array.isArray(value) ? value : [value] });
const limit = value => JSON.stringify({ method: 'limit', values: [value] });
const rowsPath = (tableId, queries = []) => `/tablesdb/${databaseId}/tables/${tableId}/rows${queries.length ? `?${queries.map(item => `queries[]=${encode(item)}`).join('&')}` : ''}`;

async function api(req, path, options = {}) {
  const response = await fetch(`${process.env.APPWRITE_FUNCTION_API_ENDPOINT}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-appwrite-project': process.env.APPWRITE_FUNCTION_PROJECT_ID,
      'x-appwrite-key': req.headers['x-appwrite-key'],
      ...(req.headers['x-appwrite-user-jwt'] ? { 'x-appwrite-user-jwt': req.headers['x-appwrite-user-jwt'] } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || `Appwrite ${response.status}`), { status: response.status, body });
  return body;
}

function parsePayload(row) {
  try { return JSON.parse(row?.payload || '{}'); } catch { return {}; }
}

function permissions(ownerId, teamId, practitionerUserId = '') {
  const values = [
    `read(\"user:${ownerId}\")`, `update(\"user:${ownerId}\")`, `delete(\"user:${ownerId}\")`,
    `read(\"team:${teamId}/owner\")`, `read(\"team:${teamId}/yc-admin\")`,
    `update(\"team:${teamId}/owner\")`, `update(\"team:${teamId}/yc-admin\")`,
  ];
  if (practitionerUserId) values.push(`read(\"user:${practitionerUserId}\")`);
  return values;
}

async function context(req, centreId, userId, teamId) {
  if (!teamId) throw Object.assign(new Error('Équipe du centre manquante.'), { status: 400 });
  const [centre, memberships] = await Promise.all([
    api(req, `/tablesdb/${databaseId}/tables/${centresTableId}/rows/${encode(centreId)}`),
    api(req, `/teams/${encode(teamId)}/memberships?total=false`),
  ]);
  if (centre.teamId !== teamId) throw Object.assign(new Error('Le centre et son équipe ne correspondent pas.'), { status: 403 });
  const membership = memberships.memberships?.find(item => item.userId === userId);
  const admin = userId === centre.ownerId || membership?.roles?.some(role => ['owner', 'yc-admin'].includes(role));
  if (!admin) throw Object.assign(new Error('Seul un administrateur du centre peut gérer les praticiens.'), { status: 403 });
  return { centre, memberships: memberships.memberships || [] };
}

async function listRelations(req, centreId) {
  const result = await api(req, rowsPath(relationsTableId, [equal('centreId', centreId), limit(500)]));
  return result.rows || [];
}

async function directorySources(req) {
  return Promise.all([
    api(req, rowsPath(adminTableId, [equal('kind', 'subscription'), limit(500)])),
    api(req, '/users?total=false'),
  ]);
}

function directory(relations, subscriptionsResult, usersResult) {
  const accounts = new Map((usersResult.users || []).map(account => [account.$id, account]));
  return (subscriptionsResult.rows || []).map(row => {
    const subscription = parsePayload(row);
    const account = accounts.get(row.practitioner) || {};
    const accountEmail = email(account.email);
    const relation = relations.find(item => item.practitionerUserId === row.practitioner || email(item.email) === accountEmail);
    return {
      id: row.practitioner,
      name: text(account.name || subscription.workspaceName || 'Praticien Yulyf', 128),
      email: accountEmail,
      practitionerNumber: text(subscription.dossierNumber, 32),
      activity: text(subscription.activity, 128),
      yulyfStatus: 'existing',
      relationStatus: relation?.status || '',
      relationId: relation?.$id || '',
      alreadyLinked: Boolean(relation && relation.status !== 'ended'),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function createRelation(req, input, centre, memberships) {
  const practitionerUserId = text(input.practitionerUserId, 36);
  const targetEmail = email(input.email);
  const name = text(input.name, 128);
  const accountMode = practitionerUserId ? 'personal' : 'centre_created';
  if (!targetEmail || !name) throw Object.assign(new Error('Le nom et l’adresse e-mail professionnelle sont obligatoires.'), { status: 400 });
  const existing = (await listRelations(req, centre.$id)).find(item => (practitionerUserId && item.practitionerUserId === practitionerUserId) || email(item.email) === targetEmail);
  if (existing && existing.status !== 'ended') throw Object.assign(new Error('Ce praticien est déjà lié ou invité dans ce centre.'), { status: 409 });
  const roles = ['yc-praticien', 'p-dashboard-view', 'p-clients-view', 'p-practitioners-none', 'p-agenda-edit', 'p-requests-view', 'p-billing-none', 'p-documents-view', 'p-statistics-none', 'p-settings-none'];
  const currentMembership = memberships.find(item => (practitionerUserId && item.userId === practitionerUserId) || email(item.userEmail) === targetEmail);
  // L’adresse e-mail doit toujours être utilisée ici. Avec userId, Appwrite ajoute
  // directement le compte existant à l’équipe et n’envoie aucune invitation.
  const body = { roles, name, url: text(input.returnUrl, 512), email: targetEmail };
  const membership = currentMembership || await api(req, `/teams/${encode(centre.teamId)}/memberships`, { method: 'POST', body: JSON.stringify(body) });
  const now = new Date().toISOString();
  const data = {
    centreId: centre.$id,
    teamId: centre.teamId,
    membershipId: membership.$id,
    practitionerUserId: practitionerUserId || text(membership.userId, 36),
    practitionerNumber: text(input.practitionerNumber, 32),
    name,
    email: targetEmail,
    activity: text(input.activity, 128),
    status: membership.confirm ? 'active' : 'invited',
    accountMode,
    sponsorPlan: accountMode === 'centre_created' ? 'yulyf_ai' : '',
    billedBy: accountMode === 'centre_created' ? 'centre' : 'practitioner',
    locationId: '',
    createdAt: now,
    updatedAt: now,
  };
  const relation = await api(req, `/tablesdb/${databaseId}/tables/${relationsTableId}/rows`, { method: 'POST', body: JSON.stringify({ rowId: 'unique()', data, permissions: permissions(centre.ownerId, centre.teamId, data.practitionerUserId) }) });
  return { relation, membership };
}

const dayNumber = { Dim: 0, Lun: 1, Mar: 2, Mer: 3, Jeu: 4, Ven: 5, Sam: 6 };

async function synchronize(req, centre, memberships, relations) {
  const locations = await api(req, rowsPath(locationsTableId, [equal('centreId', centre.$id), limit(100)]));
  const location = (locations.rows || []).find(item => item.isPrimary) || locations.rows?.[0];
  let activated = 0;
  let profileUpdated = 0;
  for (const relation of relations) {
    const membership = memberships.find(item => item.$id === relation.membershipId);
    const status = membership?.confirm ? 'active' : relation.status === 'ended' ? 'ended' : 'invited';
    const practitionerUserId = text(membership?.userId || relation.practitionerUserId, 36);
    if (status !== relation.status || (practitionerUserId && practitionerUserId !== relation.practitionerUserId)) {
      await api(req, `/tablesdb/${databaseId}/tables/${relationsTableId}/rows/${encode(relation.$id)}`, { method: 'PATCH', body: JSON.stringify({ data: { status, practitionerUserId, updatedAt: new Date().toISOString() }, permissions: permissions(centre.ownerId, centre.teamId, practitionerUserId) }) });
    }
    if (status !== 'active' || !practitionerUserId || !location) continue;
    activated += 1;
    const profiles = await api(req, rowsPath(recordsTableId, [equal('owner', practitionerUserId), equal('kind', 'profile'), limit(1)]));
    const profileRow = profiles.rows?.[0];
    if (!profileRow) continue;
    const profile = parsePayload(profileRow);
    const existingLocations = Array.isArray(profile.workLocations) ? profile.workLocations : [];
    const linkedId = `yc-${centre.$id}`.slice(0, 36);
    const linked = {
      id: linkedId,
      type: 'centre',
      name: centre.publicName || centre.name,
      address: [location.address, `${location.postal} ${location.city}`.trim(), location.country].filter(Boolean).join(', '),
      phone: centre.phone || '',
      color: '#168c91',
      days: (location.openingDays || []).map(day => dayNumber[day]).filter(value => value !== undefined),
      start: location.openStart || centre.openStart || '09:00',
      end: location.openEnd || centre.openEnd || '18:00',
      active: true,
      connectedCenterId: centre.$id,
    };
    const workLocations = relation.accountMode === 'centre_created'
      ? [linked]
      : [...existingLocations.filter(item => item.connectedCenterId !== centre.$id), linked];
    const next = { ...profile, workLocations };
    if (relation.accountMode === 'centre_created') Object.assign(next, { centreSponsored: true, centreSponsorId: centre.$id, centreSponsorName: centre.publicName || centre.name, centreSponsorPlan: 'yulyf_ai', centreSponsorMinimumPlan: 'yulyf_ai', centreSponsorBilling: 'centre' });
    await api(req, `/tablesdb/${databaseId}/tables/${recordsTableId}/rows/${encode(profileRow.$id)}`, { method: 'PATCH', body: JSON.stringify({ data: { payload: JSON.stringify(next) } }) });
    await api(req, `/tablesdb/${databaseId}/tables/${relationsTableId}/rows/${encode(relation.$id)}`, { method: 'PATCH', body: JSON.stringify({ data: { locationId: location.$id, updatedAt: new Date().toISOString() } }) });
    profileUpdated += 1;
  }
  return { activated, profileUpdated };
}

export default async ({ req, res, error }) => {
  try {
    if (req.method !== 'POST') return res.json({ error: 'Méthode refusée.' }, 405);
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Connexion requise.' }, 401);
    const body = JSON.parse(req.bodyText || '{}');
    const centreId = text(body.centreId, 36);
    if (!centreId) return res.json({ error: 'Centre manquant.' }, 400);
    const teamId = text(body.teamId, 36);
    if (body.action === 'directory') {
      const [{ centre, memberships }, relations, sources] = await Promise.all([
        context(req, centreId, userId, teamId),
        listRelations(req, centreId),
        directorySources(req),
      ]);
      void centre; void memberships;
      return res.json({ relations, directory: directory(relations, ...sources) });
    }
    const [{ centre, memberships }, initialRelations] = await Promise.all([context(req, centreId, userId, teamId), listRelations(req, centreId)]);
    let relations = initialRelations;
    if (body.action === 'invite') {
      const result = await createRelation(req, body.data || {}, centre, memberships);
      relations = await listRelations(req, centreId);
      return res.json({ ...result, relations });
    }
    if (body.action === 'sync') {
      const sync = await synchronize(req, centre, memberships, relations);
      relations = await listRelations(req, centreId);
      const sources = await directorySources(req);
      return res.json({ sync, relations, directory: directory(relations, ...sources) });
    }
    return res.json({ error: 'Action inconnue.' }, 400);
  } catch (cause) {
    error(cause?.stack || String(cause));
    return res.json({ error: cause?.message || 'Erreur interne.' }, cause?.status || 500);
  }
};
