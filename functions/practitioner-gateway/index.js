import crypto from 'node:crypto';

const databaseId = 'lyc';
const centresTableId = 'yulyf_centres';
const locationsTableId = 'yulyf_centre_locations';
const relationsTableId = 'yulyf_centre_practitioners';
const recordsTableId = 'records';
const adminTableId = 'admin_records';
const practitionerRoles = ['yc-praticien', 'p-dashboard-view', 'p-clients-view', 'p-practitioners-none', 'p-agenda-edit', 'p-requests-view', 'p-billing-none', 'p-documents-view', 'p-statistics-none', 'p-settings-none'];

const text = (value, max = 320) => String(value || '').trim().slice(0, max);
const email = value => text(value, 320).toLowerCase();
const encode = value => encodeURIComponent(String(value));
const equal = (attribute, value) => JSON.stringify({ method: 'equal', attribute, values: Array.isArray(value) ? value : [value] });
const limit = value => JSON.stringify({ method: 'limit', values: [value] });
const rowsPath = (tableId, queries = []) => `/tablesdb/${databaseId}/tables/${tableId}/rows${queries.length ? `?${queries.map(item => `queries[]=${encode(item)}`).join('&')}` : ''}`;
const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');
const validId = value => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(value);
const normalize = value => text(value, 320).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const demoCentres = new Set(['centre-technique-z', '6ade495b0032d398fa50']);
const demoOwners = new Set(['centre-technique-z-admin', '6ade495a001fed5a9f34']);

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

async function usersBy(req, attribute, value) {
  const result = await api(req, `/users?queries[]=${encode(equal(attribute, value))}&total=false`);
  return result.users || [];
}

async function demoHandoff(req, centre, role) {
  if (!demoCentres.has(centre.$id) && !demoOwners.has(centre.ownerId)) {
    throw Object.assign(new Error('Le passage direct est réservé aux environnements de démonstration.'), { status: 403 });
  }
  if (!['practitioner', 'patient'].includes(role)) {
    throw Object.assign(new Error('Démonstration inconnue.'), { status: 400 });
  }
  const practitionerName = 'Praticien technique C';
  const practitioner = (await usersBy(req, 'name', practitionerName)).find(item => normalize(item.name) === normalize(practitionerName));
  if (!practitioner) throw Object.assign(new Error('Le compte praticien technique est introuvable.'), { status: 404 });

  let account = practitioner;
  let space = 'practitioner';
  if (role === 'patient') {
    const patientName = 'Patient technique C';
    const rows = await api(req, rowsPath(recordsTableId, [equal('owner', practitioner.$id), equal('kind', 'patients'), limit(500)]));
    const record = (rows.rows || []).find(row => {
      const patient = parsePayload(row);
      return normalize(`${patient.first || ''} ${patient.last || ''}`) === normalize(patientName);
    });
    if (!record) throw Object.assign(new Error('Le dossier accompagné technique est introuvable.'), { status: 404 });
    const patient = parsePayload(record);
    if (!patient.email) throw Object.assign(new Error('Le dossier accompagné technique ne contient pas d’adresse e-mail.'), { status: 409 });
    account = (await usersBy(req, 'email', patient.email)).find(item => email(item.email) === email(patient.email));
    if (!account) throw Object.assign(new Error('Le compte accompagné technique est introuvable.'), { status: 404 });
    space = `patient:${record.$id}`;
  }

  const token = await api(req, `/users/${encode(account.$id)}/tokens`, { method: 'POST', body: JSON.stringify({ length: 64, expire: 120 }) });
  if (!token.secret) throw Object.assign(new Error('Le passage sécurisé n’a pas pu être créé.'), { status: 503 });
  return {
    role,
    handoff: Buffer.from(JSON.stringify({ userId: account.$id, secret: token.secret, space })).toString('base64url'),
  };
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

function bridgeAuthenticated(req, provided) {
  const expected = process.env.LYC_CENTRE_BRIDGE_SECRET || '';
  const header = text(req.headers['x-yulyf-centre-bridge-secret'], 512);
  const candidate = text(provided || header, 512);
  return expected.length > 0
    && expected.length === candidate.length
    && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
}

async function acceptRelation(req, body) {
  if (!bridgeAuthenticated(req, body.secret)) throw Object.assign(new Error('Passerelle refusée.'), { status: 401 });
  const relationId = text(body.relationId, 36);
  const token = text(body.token, 256);
  if (!validId(relationId) || token.length < 32) throw Object.assign(new Error('Invitation invalide.'), { status: 400 });
  const relation = await api(req, `/tablesdb/${databaseId}/tables/${relationsTableId}/rows/${encode(relationId)}`);
  const centre = await api(req, `/tablesdb/${databaseId}/tables/${centresTableId}/rows/${encode(relation.centreId)}`);
  if (relation.status === 'active') return { accepted: true, alreadyAccepted: true, centreName: text(centre.publicName || centre.name || 'ce centre', 128) };
  if (relation.status !== 'invited' || relation.inviteTokenHash !== hashToken(token)) throw Object.assign(new Error('Invitation expirée.'), { status: 409 });
  const practitionerUserId = text(relation.practitionerUserId || body.practitionerUserId, 36);
  if (!validId(practitionerUserId)) throw Object.assign(new Error('Compte praticien manquant.'), { status: 400 });
  const account = await api(req, `/users/${encode(practitionerUserId)}`);
  if (email(account.email) !== email(relation.email)) throw Object.assign(new Error('Le compte praticien ne correspond pas à l’invitation.'), { status: 403 });
  const memberships = await api(req, `/teams/${encode(relation.teamId)}/memberships?total=false`);
  let membership = memberships.memberships?.find(item => item.userId === practitionerUserId);
  if (!membership) membership = await api(req, `/teams/${encode(relation.teamId)}/memberships`, { method: 'POST', body: JSON.stringify({ userId: practitionerUserId, roles: practitionerRoles }) });
  const now = new Date().toISOString();
  await api(req, `/tablesdb/${databaseId}/tables/${relationsTableId}/rows/${encode(relationId)}`, { method: 'PATCH', body: JSON.stringify({ data: { membershipId: membership.$id, practitionerUserId, practitionerNumber: text(body.practitionerNumber || relation.practitionerNumber, 32), status: 'active', inviteTokenHash: '', acceptedAt: now, updatedAt: now }, permissions: permissions(centre.ownerId, relation.teamId, practitionerUserId) }) });
  return { accepted: true, alreadyAccepted: false, membershipId: membership.$id, centreName: text(centre.publicName || centre.name || 'ce centre', 128) };
}

async function directorySources(req) {
  return Promise.all([
    api(req, rowsPath(adminTableId, [equal('kind', 'subscription'), limit(500)])),
    api(req, '/users?total=false'),
    api(req, rowsPath(adminTableId, [equal('kind', 'subscription_catalog'), limit(1)])),
    api(req, rowsPath(adminTableId, [equal('kind', 'centre_subscription_pricing'), limit(1)])),
  ]);
}

function subscriptionPricing(catalogResult, centrePricingResult) {
  const catalog = parsePayload(catalogResult?.rows?.[0]);
  const centrePricing = parsePayload(centrePricingResult?.rows?.[0]);
  const proAssist = Array.isArray(catalog.offers) ? catalog.offers.find(offer => offer?.id === 'yulyf_ai' && offer?.active !== false) : null;
  const annualBasePrice = Number(centrePricing.annualBasePrice);
  const sponsoredMonthlyPrice = Number(proAssist?.price);
  if (!Number.isFinite(annualBasePrice) || annualBasePrice < 0 || !Number.isFinite(sponsoredMonthlyPrice) || sponsoredMonthlyPrice < 0) {
    return { source: 'unavailable', installments: 12 };
  }
  return {
    source: 'backoffice',
    installments: 12,
    annualBasePrice: Math.round(annualBasePrice * 100) / 100,
    sponsoredPlanId: 'yulyf_ai',
    sponsoredAnnualPrice: Math.round(sponsoredMonthlyPrice * 12 * 100) / 100,
  };
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

async function createRelation(req, input, centre) {
  const practitionerUserId = text(input.practitionerUserId, 36);
  const targetEmail = email(input.email);
  const name = text(input.name, 128);
  const accountMode = practitionerUserId ? 'personal' : 'centre_created';
  if (!targetEmail || !name) throw Object.assign(new Error('Le nom et l’adresse e-mail professionnelle sont obligatoires.'), { status: 400 });
  const existing = (await listRelations(req, centre.$id)).find(item => (practitionerUserId && item.practitionerUserId === practitionerUserId) || email(item.email) === targetEmail);
  if (existing && existing.status !== 'ended') throw Object.assign(new Error('Ce praticien est déjà lié ou invité dans ce centre.'), { status: 409 });
  const now = new Date().toISOString();
  const inviteToken = crypto.randomBytes(32).toString('base64url');
  const inviteTokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
  const data = {
    centreId: centre.$id,
    teamId: centre.teamId,
    membershipId: '',
    practitionerUserId,
    practitionerNumber: text(input.practitionerNumber, 32),
    name,
    email: targetEmail,
    activity: text(input.activity, 128),
    status: 'invited',
    accountMode,
    sponsorPlan: accountMode === 'centre_created' ? 'yulyf_ai' : '',
    billedBy: accountMode === 'centre_created' ? 'centre' : 'practitioner',
    locationId: '',
    inviteTokenHash,
    invitedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const relation = await api(req, `/tablesdb/${databaseId}/tables/${relationsTableId}/rows`, { method: 'POST', body: JSON.stringify({ rowId: 'unique()', data, permissions: permissions(centre.ownerId, centre.teamId, data.practitionerUserId) }) });
  const secret = process.env.LYC_CENTRE_BRIDGE_SECRET || '';
  if (!secret) {
    await api(req, `/tablesdb/${databaseId}/tables/${relationsTableId}/rows/${encode(relation.$id)}`, { method: 'DELETE' }).catch(() => {});
    throw Object.assign(new Error('Le canal sécurisé YulyfCentre → Yulyf n’est pas configuré.'), { status: 503 });
  }
  const origin = (process.env.LYC_SITE_ORIGIN || 'https://yulyf.me').replace(/\/$/, '');
  const notification = await fetch(`${origin}/api/lyc/yulyf-centre-invitation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-yulyf-centre-bridge-secret': secret },
    body: JSON.stringify({ relationId: relation.$id, token: inviteToken }),
  }).then(async response => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || `Notification Yulyf refusée (${response.status}).`), { status: 502 });
    return payload;
  }).catch(async cause => {
    await api(req, `/tablesdb/${databaseId}/tables/${relationsTableId}/rows/${encode(relation.$id)}`, { method: 'DELETE' }).catch(() => {});
    throw cause;
  });
  return { relation, notification };
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
    const body = JSON.parse(req.bodyText || '{}');
    if (body.action === 'accept') return res.json(await acceptRelation(req, body));
    const userId = req.headers['x-appwrite-user-id'];
    if (!userId) return res.json({ error: 'Connexion requise.' }, 401);
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
      return res.json({ relations, directory: directory(relations, ...sources), pricing: subscriptionPricing(sources[2], sources[3]) });
    }
    const verified = await context(req, centreId, userId, teamId);
    if (body.action === 'demo_handoff') return res.json(await demoHandoff(req, verified.centre, text(body.data?.role, 32)));
    const [{ centre, memberships }, initialRelations] = await Promise.all([Promise.resolve(verified), listRelations(req, centreId)]);
    let relations = initialRelations;
    if (body.action === 'invite') {
      const result = await createRelation(req, body.data || {}, centre);
      relations = await listRelations(req, centreId);
      return res.json({ ...result, relations });
    }
    if (body.action === 'sync') {
      const sync = await synchronize(req, centre, memberships, relations);
      relations = await listRelations(req, centreId);
      const sources = await directorySources(req);
      return res.json({ sync, relations, directory: directory(relations, ...sources), pricing: subscriptionPricing(sources[2], sources[3]) });
    }
    return res.json({ error: 'Action inconnue.' }, 400);
  } catch (cause) {
    error(cause?.stack || String(cause));
    return res.json({ error: cause?.message || 'Erreur interne.' }, cause?.status || 500);
  }
};
