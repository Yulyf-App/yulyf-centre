import { Account, Client, ID, Permission, Query, Role, Storage, TablesDB, Teams } from 'appwrite';
import { normalizeWebsite, validWebsite } from './website.js';

const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6aa80924002a9a6b3cf7';
const APPWRITE_DATABASE_ID = 'lyc';
const APPWRITE_CENTRES_TABLE_ID = 'yulyf_centres';
const APPWRITE_LOCATIONS_TABLE_ID = 'yulyf_centre_locations';
const APPWRITE_MEMBER_PROFILES_TABLE_ID = 'yulyf_centre_member_profiles';
const APPWRITE_BRANDING_BUCKET_ID = 'yulyf_centre_branding';
const appwriteClient = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const account = new Account(appwriteClient);
const tables = new TablesDB(appwriteClient);
const storage = new Storage(appwriteClient);
const teams = new Teams(appwriteClient);
let currentUser = null;
let centreRow = null;
let centreMembership = null;
let centreMembers = [];
let centreMemberProfiles = [];
let centreLocations = [];
let editingLocationId = '';

const permissionKeys = ['dashboard', 'clients', 'practitioners', 'agenda', 'requests', 'billing', 'documents', 'statistics', 'settings'];
const viewPermissionKeys = { today: 'dashboard', patients: 'clients', practitioners: 'practitioners', agenda: 'agenda', requests: 'requests', billing: 'billing', documents: 'documents', statistics: 'statistics', settings: 'settings', portal: 'clients' };
const roleLabels = { 'yc-admin': 'Administrateur du centre', 'yc-accueil': 'Accueil', 'yc-comptabilite': 'Comptabilité', 'yc-praticien': 'Praticien', 'yc-personnalise': 'Personnalisé' };

const views = {
  today: "Aujourd'hui",
  patients: "Clients du centre",
  practitioners: "Praticiens",
  agenda: "Agenda",
  requests: "Demandes",
  billing: "Facturation",
  documents: "Documents",
  statistics: "Statistiques",
  portal: "Aperçu portail client",
  settings: "Paramètres du centre",
  access: "Accès & confidentialité",
  support: "Support technique"
};

const content = document.getElementById('content');
const breadcrumb = document.getElementById('breadcrumbTitle');
const sidebar = document.getElementById('sidebar');
const toast = document.getElementById('toast');
const setupKey = 'yulyf-centre-setup-v2';
const setupDefaults = {
  centreName: 'Centre technique Z', publicName: 'Centre technique Z', email: 'centre-technique-z@example.test', phone: '+32 81 00 00 00',
  company: 'Centre technique Z', vat: 'BE 0000.000.000', address: 'Adresse fictive de démonstration', postal: '5000', city: 'Namur', country: 'Belgique',
  language: 'Français', timezone: 'Europe/Brussels', website: '', logo: '', locationName: 'Centre technique Z · Namur', locationAddress: 'Adresse fictive de démonstration', locationPostal: '5000', locationCity: 'Namur', locationCountry: 'Belgique', roomCount: '4',
  openStart: '08:00', openEnd: '20:00', openingDays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'], clientsReady: false, calendarProvider: '', emailProvider: '', teamReady: false,
  billingReady: false, notificationsReady: false, termsReady: false
  ,accessName: '', accessEmail: '', accessRole: 'Accueil', accessMembershipId: '', rolePermissions: { dashboard: 'edit', clients: 'view', practitioners: 'none', agenda: 'edit', requests: 'edit', billing: 'none', documents: 'view', statistics: 'none', settings: 'none' }
};
let setup = loadSetup();

function roleSlug(label = 'Personnalisé') {
  return ({ Accueil: 'yc-accueil', 'Administrateur du centre': 'yc-admin', 'Comptabilité': 'yc-comptabilite', Praticien: 'yc-praticien' })[label] || 'yc-personnalise';
}

function membershipRoles(label, permissions) {
  return [roleSlug(label), ...permissionKeys.map(key => `p-${key}-${permissions[key] || 'none'}`)];
}

function membershipPermissions(membership = centreMembership) {
  if (!membership || membership.roles?.includes('owner')) return Object.fromEntries(permissionKeys.map(key => [key, 'edit']));
  return Object.fromEntries(permissionKeys.map(key => {
    const role = membership.roles?.find(item => item.startsWith(`p-${key}-`));
    return [key, role?.slice(`p-${key}-`.length) || 'none'];
  }));
}

function currentRoleLabel(membership = centreMembership) {
  if (!membership || membership.roles?.includes('owner')) return 'Administrateur du centre';
  const role = membership.roles?.find(item => roleLabels[item]);
  return roleLabels[role] || 'Accès personnalisé';
}

function accessLevel(view) {
  if (view === 'access' || view === 'support') return 'view';
  const key = viewPermissionKeys[view];
  return key ? membershipPermissions()[key] : 'none';
}

function isCentreOwner() {
  return currentUser?.$id === centreRow?.ownerId || centreMembership?.roles?.includes('owner');
}

function loadSetup() {
  try { return { ...setupDefaults, ...JSON.parse(localStorage.getItem(setupKey) || '{}') }; }
  catch { return { ...setupDefaults }; }
}

function newCentreSetup(email) {
  return {
    centreName: '', publicName: '', email, phone: '', company: '', vat: '', website: '', address: '', postal: '', city: '', country: 'Belgique',
    language: 'Français', timezone: 'Europe/Brussels', logo: '', locationName: '', locationAddress: '', locationPostal: '', locationCity: '', locationCountry: 'Belgique', roomCount: '', openStart: '', openEnd: '', openingDays: [],
    clientsReady: false, calendarProvider: '', emailProvider: '', teamReady: false, billingReady: false, notificationsReady: false, termsReady: false,
  };
}

function saveSetup(patch = {}) {
  setup = { ...setup, ...patch };
  localStorage.setItem(setupKey, JSON.stringify(setup));
  const state = document.getElementById('setupSaveState');
  if (state) { state.textContent = '✓ Enregistré dans cette démonstration'; state.classList.add('saved'); }
  updateSetupProgress();
  updateCentreAttention();
}

function centreInitials() {
  return (setup.publicName || setup.centreName || 'YC').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function logoView(fileId = centreRow?.logoFileId) {
  return fileId ? String(storage.getFileView({ bucketId: APPWRITE_BRANDING_BUCKET_ID, fileId })) : '';
}

function applyCentreBranding() {
  const avatar = document.querySelector('.centre-switcher .avatar');
  if (!avatar) return;
  avatar.innerHTML = setup.logo ? `<img src="${safeText(setup.logo)}" alt="">` : safeText(centreInitials());
  avatar.classList.toggle('has-centre-logo', Boolean(setup.logo));
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function appwriteMessage(error) {
  const code = String(error?.code || '');
  const type = String(error?.type || '');
  if (code === '401' || type.includes('user_invalid_credentials')) return 'Adresse e-mail ou mot de passe incorrect.';
  if (code === '409' || type.includes('user_already_exists')) return 'Un compte existe déjà avec cette adresse e-mail.';
  if (type.includes('password')) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (type.includes('rate_limit')) return 'Trop de tentatives. Patiente quelques instants avant de réessayer.';
  return 'La connexion à YulyfCentre a échoué. Réessaie ou contacte le Support.';
}

function renderAuthGate(mode = 'login', message = '') {
  const gate = document.getElementById('authGate');
  gate.hidden = false;
  gate.innerHTML = `<section class="auth-card">
    <div class="auth-brand"><div class="brand-mark" aria-hidden="true"><span></span></div><div><strong>Yulyf<span>Centre</span></strong><small>Le centre, simplement.</small></div></div>
    <p class="eyebrow">${mode === 'register' ? 'Créer un espace' : 'Connexion sécurisée'}</p>
    <h1>${mode === 'register' ? 'Créer votre espace centre' : 'Retrouver votre centre'}</h1>
    <p>${mode === 'register' ? 'Le premier compte devient administrateur du centre. Les autres accès seront ajoutés plus tard depuis les rôles.' : 'Connectez-vous avec le compte utilisé lors de la création du centre.'}</p>
    ${message ? `<div class="auth-message">${safeText(message)}</div>` : ''}
    <form id="centreAuthForm" data-auth-mode="${mode}">
      <label>Adresse e-mail<input name="email" type="email" autocomplete="email" required></label>
      <label>Mot de passe<input name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" minlength="8" required></label>
      ${mode === 'register' ? '<label>Confirmer le mot de passe<input name="passwordConfirm" type="password" autocomplete="new-password" minlength="8" required></label>' : ''}
      <button class="primary" type="submit">${mode === 'register' ? 'Créer mon compte et continuer' : 'Se connecter'}</button>
    </form>
    <button class="auth-switch" data-auth-switch="${mode === 'register' ? 'login' : 'register'}">${mode === 'register' ? 'J’ai déjà un espace centre' : 'Créer un nouvel espace centre'}</button>
    <small class="auth-security">⚿ Environnement Appwrite européen · aucune donnée médicale demandée</small>
  </section>`;
}

function validateCentre(data) {
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Indique une adresse e-mail valide.';
  if (data.phone && !/^[+()0-9.\s/-]{6,40}$/.test(data.phone)) return 'Indique un numéro de téléphone valide.';
  if (!validWebsite(data.website)) return 'Indique une adresse de site complète commençant par http:// ou https://.';
  if (data.openStart && data.openEnd && data.openStart >= data.openEnd) return 'L’heure de fermeture doit être postérieure à l’heure d’ouverture.';
  return '';
}

function centreData(status = centreRow?.status || 'draft') {
  const now = new Date().toISOString();
  const data = {
    ownerId: currentUser.$id,
    name: setup.centreName.trim(),
    publicName: (setup.publicName || setup.centreName).trim(),
    email: setup.email.trim().toLowerCase(),
    phone: setup.phone.trim(),
    company: setup.company.trim(),
    vat: setup.vat.trim(),
    website: normalizeWebsite(setup.website),
    address: setup.address.trim(),
    postal: setup.postal.trim(),
    city: setup.city.trim(),
    country: setup.country.trim(),
    language: setup.language,
    timezone: setup.timezone,
    openStart: setup.openStart,
    openEnd: setup.openEnd,
    openingDays: setup.openingDays,
    status,
    activatedAt: status === 'active' ? (centreRow?.activatedAt || now) : null,
    createdAt: centreRow?.createdAt || now,
    updatedAt: now,
  };
  if (centreRow?.teamId) data.teamId = centreRow.teamId;
  return data;
}

async function persistCentre(status = centreRow?.status || 'draft') {
  const baseData = centreData(status);
  const validation = validateCentre({ ...setup, ...baseData, centreName: baseData.name });
  if (validation) throw new Error(validation);
  let createdTeam = null;
  if (!centreRow?.teamId) {
    createdTeam = await teams.create({ teamId: ID.unique(), name: (setup.publicName || setup.centreName).trim() || 'Espace YulyfCentre', roles: ['owner', 'yc-admin'] });
  }
  const data = { ...baseData, teamId: centreRow?.teamId || createdTeam.$id };
  try {
    if (centreRow) {
      centreRow = await tables.updateRow({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: APPWRITE_CENTRES_TABLE_ID,
        rowId: centreRow.$id,
        data,
        ...(createdTeam ? { permissions: [Permission.read(Role.user(currentUser.$id)), Permission.read(Role.team(data.teamId)), Permission.update(Role.user(currentUser.$id)), Permission.delete(Role.user(currentUser.$id))] } : {}),
      });
    } else {
      centreRow = await tables.createRow({
        databaseId: APPWRITE_DATABASE_ID,
        tableId: APPWRITE_CENTRES_TABLE_ID,
        rowId: ID.unique(),
        data,
        permissions: [Permission.read(Role.user(currentUser.$id)), Permission.read(Role.team(data.teamId)), Permission.update(Role.user(currentUser.$id)), Permission.delete(Role.user(currentUser.$id))],
      });
    }
  } catch (error) {
    if (createdTeam) await teams.delete({ teamId: createdTeam.$id }).catch(() => {});
    throw error;
  }
  applyCentreRow(centreRow);
  return centreRow;
}

function applyCentreRow(row) {
  if (!row) return;
  saveSetup({
    centreName: row.name,
    publicName: row.publicName,
    email: row.email,
    phone: row.phone,
    company: row.company || '',
    vat: row.vat || '',
    website: row.website || '',
    address: row.address,
    postal: row.postal || '',
    city: row.city,
    country: row.country,
    language: row.language,
    timezone: row.timezone,
    openStart: row.openStart,
    openEnd: row.openEnd,
    openingDays: row.openingDays || [],
    locationName: row.publicName || row.name || '',
    locationAddress: row.address || '',
    locationPostal: row.postal || '',
    locationCity: row.city || '',
    locationCountry: row.country || 'Belgique',
    logo: logoView(row.logoFileId),
  });
  document.querySelector('.centre-switcher strong').textContent = row.publicName || row.name || 'Mon centre';
  document.querySelector('.centre-switcher small').textContent = row.status === 'active' ? 'Espace actif' : 'Configuration en cours';
  applyCentreBranding();
}

function locationSetup(location) {
  return {
    locationName: location?.name || '',
    locationAddress: location?.address || '',
    locationPostal: location?.postal || '',
    locationCity: location?.city || '',
    locationCountry: location?.country || 'Belgique',
    roomCount: location?.roomCount ? String(location.roomCount) : '',
    openStart: location?.openStart || '',
    openEnd: location?.openEnd || '',
    openingDays: location?.openingDays || [],
  };
}

async function refreshCentreLocations({ selectPrimary = false } = {}) {
  if (!centreRow) { centreLocations = []; return; }
  const result = await tables.listRows({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: APPWRITE_LOCATIONS_TABLE_ID,
    queries: [Query.equal('centreId', [centreRow.$id]), Query.limit(100)],
  });
  centreLocations = result.rows || [];
  if (selectPrimary && centreLocations.length) {
    const location = centreLocations.find(item => item.isPrimary) || centreLocations[0];
    editingLocationId = location.$id;
    saveSetup(locationSetup(location));
  }
}

function locationPermissions() {
  const teamId = centreRow?.teamId;
  const ownerId = centreRow?.ownerId;
  const permissions = [
    Permission.read(Role.user(ownerId)),
    Permission.update(Role.user(ownerId)),
    Permission.delete(Role.user(ownerId)),
  ];
  if (teamId) {
    permissions.push(Permission.read(Role.team(teamId)));
    permissions.push(Permission.update(Role.team(teamId, 'yc-admin')));
    permissions.push(Permission.delete(Role.team(teamId, 'yc-admin')));
  }
  return permissions;
}

function validateLocation(data) {
  if (!data.name || !data.address || !data.postal || !data.city || !data.country) return 'Complète le nom et l’adresse du lieu.';
  if (!Number.isInteger(data.roomCount) || data.roomCount < 1 || data.roomCount > 99) return 'Le nombre de salles doit être compris entre 1 et 99.';
  if (!data.openStart || !data.openEnd || data.openStart >= data.openEnd) return 'Indique des heures d’ouverture et de fermeture valides.';
  if (!data.openingDays.length) return 'Choisis au moins un jour d’ouverture.';
  return '';
}

async function persistLocation(makePrimary = false) {
  if (!centreRow?.teamId) throw new Error('Le centre doit être relié à son équipe avant d’ajouter un lieu.');
  const now = new Date().toISOString();
  const existing = centreLocations.find(item => item.$id === editingLocationId) || null;
  const isPrimary = makePrimary || !centreLocations.length || Boolean(existing?.isPrimary);
  const data = {
    centreId: centreRow.$id,
    teamId: centreRow.teamId,
    name: setup.locationName.trim(),
    address: setup.locationAddress.trim(),
    postal: setup.locationPostal.trim(),
    city: setup.locationCity.trim(),
    country: setup.locationCountry.trim(),
    roomCount: Number(setup.roomCount),
    openStart: setup.openStart,
    openEnd: setup.openEnd,
    openingDays: setup.openingDays,
    isPrimary,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const validation = validateLocation(data);
  if (validation) throw new Error(validation);
  if (isPrimary) {
    await Promise.all(centreLocations.filter(item => item.isPrimary && item.$id !== existing?.$id).map(item => tables.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_LOCATIONS_TABLE_ID,
      rowId: item.$id,
      data: { isPrimary: false, updatedAt: now },
    })));
  }
  const saved = existing
    ? await tables.updateRow({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_LOCATIONS_TABLE_ID, rowId: existing.$id, data })
    : await tables.createRow({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_LOCATIONS_TABLE_ID, rowId: ID.unique(), data, permissions: locationPermissions() });
  editingLocationId = saved.$id;
  if (isPrimary) {
    centreRow = await tables.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CENTRES_TABLE_ID,
      rowId: centreRow.$id,
      data: { openStart: data.openStart, openEnd: data.openEnd, openingDays: data.openingDays, updatedAt: now },
    });
  }
  await refreshCentreLocations();
  saveSetup(locationSetup(saved));
  return saved;
}

async function deleteLocation(locationId) {
  const location = centreLocations.find(item => item.$id === locationId);
  if (!location) throw new Error('Ce lieu est introuvable.');
  if (location.isPrimary && centreLocations.length > 1) throw new Error('Définis un autre lieu principal avant de supprimer celui-ci.');
  await tables.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_LOCATIONS_TABLE_ID, rowId: locationId });
  editingLocationId = '';
  await refreshCentreLocations();
  saveSetup(locationSetup(null));
}

async function uploadCentreLogo(file) {
  if (!centreRow) throw new Error('Le centre doit être créé avant d’ajouter son logo.');
  const previousFileId = centreRow.logoFileId || '';
  const uploaded = await storage.createFile({
    bucketId: APPWRITE_BRANDING_BUCKET_ID,
    fileId: ID.unique(),
    file,
    permissions: [
      Permission.read(Role.any()),
      Permission.update(Role.user(currentUser.$id)),
      Permission.delete(Role.user(currentUser.$id)),
    ],
  });
  try {
    centreRow = await tables.updateRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CENTRES_TABLE_ID,
      rowId: centreRow.$id,
      data: { logoFileId: uploaded.$id, brandUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    });
  } catch (error) {
    await storage.deleteFile({ bucketId: APPWRITE_BRANDING_BUCKET_ID, fileId: uploaded.$id }).catch(() => {});
    throw error;
  }
  if (previousFileId && previousFileId !== uploaded.$id) {
    await storage.deleteFile({ bucketId: APPWRITE_BRANDING_BUCKET_ID, fileId: previousFileId }).catch(() => {});
  }
  saveSetup({ logo: logoView(uploaded.$id) });
  applyCentreBranding();
}

async function removeCentreLogo() {
  if (!centreRow?.logoFileId) return;
  const previousFileId = centreRow.logoFileId;
  centreRow = await tables.updateRow({
    databaseId: APPWRITE_DATABASE_ID,
    tableId: APPWRITE_CENTRES_TABLE_ID,
    rowId: centreRow.$id,
    data: { logoFileId: '', brandUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  });
  saveSetup({ logo: '' });
  applyCentreBranding();
  await storage.deleteFile({ bucketId: APPWRITE_BRANDING_BUCKET_ID, fileId: previousFileId }).catch(() => {});
}

async function loadCentre() {
  const owned = await tables.listRows({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_CENTRES_TABLE_ID, queries: [Query.equal('ownerId', [currentUser.$id]), Query.limit(1)] });
  centreRow = owned.rows?.[0] || null;
  if (!centreRow) {
    const memberships = await teams.list({ queries: [Query.limit(100)] });
    const teamIds = memberships.teams?.map(team => team.$id) || [];
    if (teamIds.length) {
      const joined = await tables.listRows({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_CENTRES_TABLE_ID, queries: [Query.equal('teamId', teamIds), Query.limit(1)] });
      centreRow = joined.rows?.[0] || null;
    }
  }
  if (centreRow) {
    applyCentreRow(centreRow);
    if (centreRow.teamId) {
      await refreshCentreMembers();
    }
    await refreshCentreLocations({ selectPrimary: true });
  }
  return centreRow;
}

function openApplication() {
  document.getElementById('authGate').hidden = true;
  document.body.classList.remove('auth-pending');
  const displayName = currentUser.name || currentUser.email;
  document.getElementById('currentUserName').textContent = displayName;
  document.getElementById('currentUserAvatar').textContent = displayName.trim().charAt(0).toUpperCase() || 'C';
  document.getElementById('currentUserRole').textContent = currentRoleLabel();
  applyNavigationPermissions();
  updateCentreAttention();
  render(location.hash.slice(1) || 'today', false);
}

async function bootstrap() {
  try {
    const invite = new URLSearchParams(location.search);
    if (invite.get('teamId') && invite.get('membershipId') && invite.get('userId') && invite.get('secret')) {
      await teams.updateMembershipStatus({ teamId: invite.get('teamId'), membershipId: invite.get('membershipId'), userId: invite.get('userId'), secret: invite.get('secret') });
      history.replaceState({}, '', `${location.pathname}${location.hash || ''}`);
    }
    currentUser = await account.get();
    await loadCentre();
    if (!centreRow) {
      saveSetup(newCentreSetup(currentUser.email || ''));
      await persistCentre('active');
    }
    openApplication();
  } catch (error) {
    document.body.classList.add('auth-pending');
    renderAuthGate('login', new URLSearchParams(location.search).get('secret') ? 'Cette invitation est invalide ou a déjà été utilisée.' : '');
  }
}

function setupSteps() {
  return [
    ['identity', Boolean(setup.centreName && setup.publicName && setup.email && setup.phone && setup.address && setup.postal && setup.city && setup.country)],
    ['branding', Boolean(setup.logo)],
    ['locations', centreLocations.length > 0],
    ['clients', setup.clientsReady],
    ['connections', Boolean(setup.calendarProvider && setup.emailProvider)],
    ['team', setup.teamReady],
    ['billing-settings', setup.billingReady],
    ['notifications', setup.notificationsReady],
    ['terms', setup.termsReady]
  ];
}

function centreProfileCompletion() {
  const steps = setupSteps();
  const completed = steps.filter(([, done]) => done).length;
  const percent = Math.round(completed / steps.length * 100);
  return { completed, total: steps.length, percent, remaining: 100 - percent };
}

function updateCentreAttention() {
  const marker = document.getElementById('settingsAttention');
  if (!marker) return;
  const { remaining } = centreProfileCompletion();
  marker.hidden = remaining === 0;
  marker.title = remaining ? `Configuration du centre à compléter · ${remaining}% restant` : '';
}

function renderCentreCompletionAlert(view) {
  if (view !== 'today' || !isCentreOwner()) return;
  const progress = centreProfileCompletion();
  if (!progress.remaining) return;
  const alert = document.createElement('section');
  alert.className = 'centre-completion-alert';
  alert.setAttribute('role', 'status');
  alert.innerHTML = `<div class="centre-completion-value">${progress.remaining}%</div><div><strong>Attention, il reste ${progress.remaining}% dans la création de votre espace.</strong><p>Ton espace est déjà actif. Complète les informations administratives quand tu le souhaites dans les paramètres.</p></div><button class="primary" data-action="complete-centre-profile">Aller dans mes paramètres</button>`;
  content.prepend(alert);
}

function updateSetupProgress() {
  const steps = setupSteps(), done = steps.filter(([, value]) => value).length, percent = Math.round(done / steps.length * 100);
  const ring = document.getElementById('setupProgressRing');
  const copy = document.getElementById('setupProgressText');
  if (ring) ring.textContent = `${percent}%`;
  if (copy) copy.textContent = `${done} étape${done > 1 ? 's' : ''} sur ${steps.length} complétée${done > 1 ? 's' : ''}.`;
  document.querySelectorAll('[data-setup-section]').forEach(button => {
    const item = steps.find(([name]) => name === button.dataset.setupSection);
    if (item) button.classList.toggle('complete', item[1]);
  });
}

function applyNavigationPermissions() {
  document.querySelectorAll('.nav-item[data-view]').forEach(button => {
    button.hidden = accessLevel(button.dataset.view) === 'none';
  });
}

function firstAccessibleView() {
  return ['today', 'patients', 'practitioners', 'agenda', 'requests', 'billing', 'documents', 'statistics', 'portal', 'settings', 'access', 'support'].find(view => accessLevel(view) !== 'none') || 'support';
}

function applyViewPermission(view) {
  const level = accessLevel(view);
  content.dataset.accessLevel = level;
  if (level !== 'view') return;
  const notice = document.createElement('div');
  notice.className = 'readonly-notice';
  notice.textContent = '◉ Lecture seule · ton rôle permet de consulter cet onglet sans le modifier.';
  content.prepend(notice);
  content.querySelectorAll('input, textarea, select, button[data-action], button[data-setup-section], button[data-opening-day], button[data-provider-type], button[data-setup-toggle]').forEach(control => { control.disabled = true; });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function render(view, push = true) {
  if (!views[view]) view = 'today';
  if (accessLevel(view) === 'none') {
    view = firstAccessibleView();
    showToast('Cet onglet n’est pas autorisé pour ton rôle.');
  }
  const template = document.getElementById(`${view}-view`);
  content.replaceChildren(template.content.cloneNode(true));
  breadcrumb.textContent = views[view];
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  sidebar.classList.remove('open');
  if (push) history.pushState({ view }, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (view === 'settings') renderSettings('overview');
  const displayName = currentUser?.name || currentUser?.email || 'Administrateur';
  if (view === 'today') document.getElementById('dashboardGreeting').textContent = `Bonjour ${displayName}.`;
  if (view === 'support') document.getElementById('supportGreeting').textContent = `Bonjour ${displayName},`;
  renderCentreCompletionAlert(view);
  applyViewPermission(view);
}

function field(label, name, value, type = 'text', extra = '') {
  return `<label class="setup-field"><span>${label}</span><input type="${type}" name="${name}" value="${String(value || '').replaceAll('"', '&quot;')}" ${extra}></label>`;
}

function settingsHeader(title, text, badge = '') {
  return `<div class="settings-section-head"><div>${badge ? `<p class="eyebrow">${badge}</p>` : ''}<h2>${title}</h2><p>${text}</p></div></div>`;
}

function memberRoleLabel(member) {
  if (member.roles?.includes('owner')) return 'Propriétaire du centre';
  return currentRoleLabel(member);
}

function memberProfile(member) {
  return centreMemberProfiles.find(profile => profile.membershipId === member.$id) || null;
}

function membersPanel() {
  if (!centreMembers.length) return '<article class="panel member-empty"><p>Aucun accès supplémentaire.</p></article>';
  return `<article class="panel member-list"><div class="panel-head"><div><h3>Accès existants</h3><p>${centreMembers.length} personne${centreMembers.length > 1 ? 's' : ''} rattachée${centreMembers.length > 1 ? 's' : ''} à ce centre.</p></div></div>${centreMembers.map(member => { const profile = memberProfile(member); const name = profile?.name || member.userName || 'Membre du centre'; const email = profile?.email || member.userEmail || ''; return `<div class="member-row"><span class="avatar">${safeText(name.charAt(0).toUpperCase())}</span><div><strong>${safeText(name)}</strong><small>${safeText(email)}</small></div><span class="tag ${member.confirm ? 'mint-tag' : 'gold-tag'}">${member.confirm ? 'Actif' : 'Invitation envoyée'}</span><b>${safeText(memberRoleLabel(member))}</b>${member.roles?.includes('owner') ? '<em>Accès complet</em>' : `<div class="member-actions"><button class="outline" data-member-edit="${safeText(member.$id)}">Modifier</button><button class="text-button danger" data-member-remove="${safeText(member.$id)}">Retirer</button></div>`}</div>`; }).join('')}</article>`;
}

function locationsPanel() {
  if (!centreLocations.length) return '<article class="panel location-empty"><strong>Aucun lieu enregistré</strong><p>Complète le formulaire ci-dessous pour créer le premier lieu du centre.</p></article>';
  return `<div class="location-list">${centreLocations.map(location => `<article class="panel location-card ${location.$id === editingLocationId ? 'selected' : ''}"><div><span class="location-pin">⌖</span><div><strong>${safeText(location.name)}</strong><small>${safeText(`${location.address}, ${location.postal} ${location.city} · ${location.country}`)}</small><em>${safeText((location.openingDays || []).join(' · '))} · ${safeText(location.openStart)}–${safeText(location.openEnd)} · ${location.roomCount} salle${location.roomCount > 1 ? 's' : ''}</em></div></div><div class="location-actions">${location.isPrimary ? '<span class="tag mint-tag">Lieu principal</span>' : ''}<button class="outline" data-location-edit="${safeText(location.$id)}">Modifier</button><button class="text-button danger" data-location-delete="${safeText(location.$id)}">Supprimer</button></div></article>`).join('')}</div>`;
}

async function refreshCentreMembers() {
  if (!centreRow?.teamId) return;
  const result = await teams.listMemberships({ teamId: centreRow.teamId, queries: [Query.limit(100)] });
  centreMembers = result.memberships || [];
  centreMembership = centreMembers.find(membership => membership.userId === currentUser.$id) || centreMembership;
  const profiles = await tables.listRows({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_MEMBER_PROFILES_TABLE_ID, queries: [Query.equal('teamId', [centreRow.teamId]), Query.limit(100)] }).catch(() => ({ rows: [] }));
  centreMemberProfiles = profiles.rows || [];
}

async function saveCentreAccess() {
  if (!isCentreOwner()) throw new Error('Seul le propriétaire du centre peut gérer les accès.');
  const accessName = document.querySelector('[name="accessName"]')?.value.trim() || '';
  const accessEmail = document.querySelector('[name="accessEmail"]')?.value.trim().toLowerCase() || '';
  if (!accessName || !accessEmail) throw new Error('Indique le nom et l’adresse e-mail de la personne.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accessEmail)) throw new Error('Indique une adresse e-mail valide.');
  const roles = membershipRoles(setup.accessRole, setup.rolePermissions);
  if (setup.accessMembershipId) {
    await teams.updateMembership({ teamId: centreRow.teamId, membershipId: setup.accessMembershipId, roles });
    const profile = centreMemberProfiles.find(item => item.membershipId === setup.accessMembershipId);
    if (profile) await tables.updateRow({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_MEMBER_PROFILES_TABLE_ID, rowId: profile.$id, data: { name: accessName, updatedAt: new Date().toISOString() } });
  } else {
    const membership = await teams.createMembership({ teamId: centreRow.teamId, roles, email: accessEmail, name: accessName, url: `${location.origin}${location.pathname}` });
    try {
      const now = new Date().toISOString();
      await tables.createRow({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_MEMBER_PROFILES_TABLE_ID, rowId: ID.unique(), data: { centreId: centreRow.$id, teamId: centreRow.teamId, membershipId: membership.$id, name: accessName, email: accessEmail, createdAt: now, updatedAt: now }, permissions: [Permission.read(Role.user(currentUser.$id)), Permission.update(Role.user(currentUser.$id)), Permission.delete(Role.user(currentUser.$id))] });
    } catch (error) {
      await teams.deleteMembership({ teamId: centreRow.teamId, membershipId: membership.$id }).catch(() => {});
      throw error;
    }
  }
  await refreshCentreMembers();
  saveSetup({ accessName: '', accessEmail: '', accessMembershipId: '', teamReady: true });
}

function renderSettings(section) {
  const pane = document.getElementById('settingsPane');
  if (!pane) return;
  document.querySelectorAll('.settings-nav [data-setup-section]').forEach(button => button.classList.toggle('active', button.dataset.setupSection === section));
  const completed = Object.fromEntries(setupSteps());
  const status = key => `<span class="setup-status ${completed[key] ? 'done' : ''}">${completed[key] ? '✓ Complété' : 'À compléter'}</span>`;
  const pages = {
    overview: `${settingsHeader('Créons le centre, étape par étape', 'Les réglages de Yulyf sont repris ici avec les besoins propres à un centre. Tu peux revenir sur chaque étape à tout moment.', 'Démarrage')}
      <div class="setup-roadmap">
        <button data-setup-section="identity"><b>1</b><div><strong>Identifier le centre</strong><small>Nom, coordonnées, entreprise et adresse.</small></div>${status('identity')}</button>
        <button data-setup-section="branding"><b>2</b><div><strong>Ajouter le logo</strong><small>Visible sur le portail, les e-mails et les factures.</small></div>${status('branding')}</button>
        <button data-setup-section="locations"><b>3</b><div><strong>Définir les lieux et horaires</strong><small>Adresses, salles et jours d’ouverture.</small></div>${status('locations')}</button>
        <button data-setup-section="clients"><b>4</b><div><strong>Ajouter les clients du centre</strong><small>Manuellement ou par import CSV/Excel.</small></div>${status('clients')}</button>
        <button data-setup-section="connections"><b>5</b><div><strong>Relier agenda et messagerie</strong><small>Google, Microsoft, OVH ou un autre fournisseur.</small></div>${status('connections')}</button>
        <button data-setup-section="team"><b>6</b><div><strong>Inviter les praticiens</strong><small>Lier leur Yulyf personnel sans ouvrir leurs dossiers privés.</small></div>${status('team')}</button>
      </div>
      <div class="privacy-callout compact"><div class="shield">✓</div><div><strong>Limite appliquée dès l’import</strong><p>Le centre ne reçoit que le nom, l’adresse, l’e-mail, le téléphone et le rattachement administratif. Les notes, analyses, consentements et documents médicaux sont exclus.</p></div></div>`,
    identity: `${settingsHeader('Identité du centre', 'Ces informations sont enregistrées dans Appwrite et alimentent le portail client, les e-mails administratifs et la facturation.', 'Étape 1')}
      <form class="panel setup-form" data-setup-form><div class="setup-grid">${field('Nom du centre *', 'centreName', setup.centreName, 'text', 'maxlength="128"')}${field('Nom public affiché *', 'publicName', setup.publicName, 'text', 'maxlength="128"')}${field('Raison sociale', 'company', setup.company, 'text', 'maxlength="160"')}${field('N° d’entreprise / TVA', 'vat', setup.vat, 'text', 'maxlength="40"')}${field('E-mail principal *', 'email', setup.email, 'email', 'maxlength="320"')}${field('Téléphone *', 'phone', setup.phone, 'tel', 'maxlength="40"')}${field('Site internet', 'website', setup.website, 'text', 'inputmode="url" maxlength="512" placeholder="www.moncentre.be"')}${field('Adresse *', 'address', setup.address, 'text', 'maxlength="255"')}${field('Code postal *', 'postal', setup.postal, 'text', 'maxlength="24"')}${field('Ville *', 'city', setup.city, 'text', 'maxlength="96"')}${field('Pays *', 'country', setup.country, 'text', 'maxlength="96"')}</div><div class="setup-grid compact-grid"><label class="setup-field"><span>Langue administrative</span><select name="language"><option ${setup.language === 'Français' ? 'selected' : ''}>Français</option><option ${setup.language === 'Nederlands' ? 'selected' : ''}>Nederlands</option><option ${setup.language === 'English' ? 'selected' : ''}>English</option></select></label><label class="setup-field"><span>Fuseau horaire</span><select name="timezone"><option ${setup.timezone === 'Europe/Brussels' ? 'selected' : ''}>Europe/Brussels</option><option ${setup.timezone === 'Europe/Paris' ? 'selected' : ''}>Europe/Paris</option><option ${setup.timezone === 'Europe/Luxembourg' ? 'selected' : ''}>Europe/Luxembourg</option></select></label></div><p class="setup-note">Le nom public et le logo seront visibles dans le portail client et les communications. La raison sociale et le numéro d’entreprise restent réservés aux documents administratifs.</p><div class="form-actions"><span class="setup-live-status">${centreRow?.status === 'active' ? '● Espace actif' : '● Brouillon'}</span><button class="primary" type="submit">Enregistrer dans Appwrite</button></div></form>`,
    branding: `${settingsHeader('Logo et apparence', 'Le logo est contrôlé, prévisualisé puis enregistré dans l’espace sécurisé du centre.', 'Étape 2')}
      <div class="panel branding-setup"><label class="logo-drop"><span>◉</span><div><strong>${setup.logo ? 'Remplacer le logo' : 'Choisir le logo du centre'}</strong><small>PNG, JPG ou WEBP · 150 Ko maximum · métadonnées retirées</small></div><input id="centreLogoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><div class="logo-preview ${setup.logo ? 'has-logo' : ''}">${setup.logo ? `<img src="${safeText(setup.logo)}" alt="Logo de ${safeText(setup.publicName || setup.centreName)}">` : `<span>${safeText(centreInitials())}</span>`}<div><strong>Aperçu de l’identité du centre</strong><small>${safeText(setup.publicName || setup.centreName)}</small><em>${setup.logo ? 'Logo enregistré dans Appwrite' : 'Initiales utilisées tant qu’aucun logo n’est ajouté'}</em></div></div>${setup.logo ? '<button class="outline" data-action="remove-centre-logo">Retirer définitivement le logo</button>' : ''}<p class="setup-note">Ce logo public identifiera le centre dans YulyfCentre, puis dans son portail client, ses e-mails administratifs et ses factures. Seul un administrateur du centre peut le remplacer ou le supprimer.</p></div>`,
    locations: `${settingsHeader('Lieux et horaires d’activité', 'Chaque lieu est enregistré séparément dans Appwrite avec son adresse, ses salles et ses heures d’ouverture.', 'Étape 3')}
      ${locationsPanel()}
      <form class="panel setup-form location-form" data-location-form><div class="location-form-title"><div><h3>${editingLocationId ? 'Modifier le lieu' : 'Ajouter un lieu'}</h3><p>${editingLocationId ? 'Les modifications seront appliquées au lieu sélectionné.' : 'Le premier lieu créé devient automatiquement le lieu principal.'}</p></div>${editingLocationId ? '<button type="button" class="outline" data-action="add-location">＋ Nouveau lieu</button>' : ''}</div><div class="setup-grid">${field('Nom du lieu *', 'locationName', setup.locationName, 'text', 'maxlength="128"')}${field('Nombre de salles *', 'roomCount', setup.roomCount, 'number', 'min="1" max="99"')}${field('Adresse *', 'locationAddress', setup.locationAddress, 'text', 'maxlength="255"')}${field('Code postal *', 'locationPostal', setup.locationPostal, 'text', 'maxlength="24"')}${field('Ville *', 'locationCity', setup.locationCity, 'text', 'maxlength="96"')}${field('Pays *', 'locationCountry', setup.locationCountry, 'text', 'maxlength="96"')}${field('Ouverture *', 'openStart', setup.openStart, 'time')}${field('Fermeture *', 'openEnd', setup.openEnd, 'time')}</div><div class="weekday-picker"><span>Jours d’ouverture *</span>${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(day => `<button type="button" data-opening-day="${day}" class="${setup.openingDays.includes(day) ? 'selected' : ''}">${day}</button>`).join('')}</div><label class="primary-location-choice"><input type="checkbox" name="isPrimary" ${(!centreLocations.length || centreLocations.find(item => item.$id === editingLocationId)?.isPrimary) ? 'checked' : ''}><span>Définir comme lieu principal du centre</span></label><div class="form-actions"><button class="primary" type="submit">${editingLocationId ? 'Enregistrer les modifications' : 'Ajouter le lieu'}</button></div></form>`,
    clients: `${settingsHeader('Clients du centre', 'Crée un client manuellement ou importe une liste existante. Rien n’est enregistré avant confirmation.', 'Étape 4')}
      <div class="setup-two-cols"><article class="panel setup-choice"><span class="choice-icon">＋</span><h3>Ajouter manuellement</h3><p>Nom, prénom, e-mail, téléphone, adresse et praticien du centre.</p><button class="outline" data-action="setup-manual-client">Créer un client fictif</button></article><article class="panel setup-choice"><span class="choice-icon">⇧</span><h3>Importer une liste</h3><p>CSV ou Excel. Les doublons seront signalés avant confirmation.</p><label class="primary file-button">Choisir un fichier fictif<input id="centreClientsInput" type="file" accept=".csv,.xlsx,text/csv" hidden></label></article></div><div id="clientImportPreview"></div>
      <article class="panel data-boundary"><strong>Colonnes autorisées</strong><p>Prénom · Nom · E-mail · Téléphone · Adresse · Praticien du centre</p><strong>Colonnes refusées</strong><p>Diagnostic · Notes · Analyses · Consentements · Comptes rendus médicaux</p></article>`,
    connections: `${settingsHeader('Agenda et messagerie', 'Le centre relie ses outils existants. Les rendez-vous administratifs sont synchronisés, jamais le contenu clinique.', 'Étape 5')}
      <div class="connection-block panel"><div><h3>Agenda du centre</h3><p>Synchronisation bidirectionnelle des créneaux et rendez-vous du centre.</p></div><div class="provider-grid"><button data-provider-type="calendarProvider" data-provider="Google" class="${setup.calendarProvider === 'Google' ? 'selected' : ''}"><b>G</b> Google Calendar<small>${setup.calendarProvider === 'Google' ? 'Sélectionné' : 'Choisir'}</small></button><button data-provider-type="calendarProvider" data-provider="Microsoft" class="${setup.calendarProvider === 'Microsoft' ? 'selected' : ''}"><b>M</b> Microsoft Outlook<small>${setup.calendarProvider === 'Microsoft' ? 'Sélectionné' : 'Choisir'}</small></button></div></div>
      <div class="connection-block panel"><div><h3>Adresse d’envoi du centre</h3><p>Les confirmations et rappels partiront de l’adresse officielle du centre.</p></div><div class="provider-grid"><button data-provider-type="emailProvider" data-provider="Gmail" class="${setup.emailProvider === 'Gmail' ? 'selected' : ''}"><b>G</b> Gmail<small>${setup.emailProvider === 'Gmail' ? 'Sélectionné' : 'Choisir'}</small></button><button data-provider-type="emailProvider" data-provider="Microsoft" class="${setup.emailProvider === 'Microsoft' ? 'selected' : ''}"><b>M</b> Outlook / Microsoft 365<small>${setup.emailProvider === 'Microsoft' ? 'Sélectionné' : 'Choisir'}</small></button><button data-provider-type="emailProvider" data-provider="Autre" class="${setup.emailProvider === 'Autre' ? 'selected' : ''}"><b>@</b> OVH ou autre<small>${setup.emailProvider === 'Autre' ? 'Sélectionné' : 'Choisir'}</small></button></div></div><p class="setup-note">Dans cette maquette, le choix est mémorisé sans lancer une connexion réelle. Le raccordement OAuth sera réalisé dans la couche Appwrite.</p>`,
    team: `${settingsHeader('Praticiens, utilisateurs et accès', 'Les invitations et les droits sont appliqués par Appwrite au centre concerné. Chaque onglet peut être masqué, consultable ou modifiable.', 'Étape 6')}
      <article class="panel technical-test"><span class="avatar violet">TC</span><div><h3>Praticien technique C</h3><p>Compte Yulyf réellement rattaché à l’équipe Appwrite de Centre technique Z.</p></div><span class="tag mint-tag">Accès actif</span></article>
      ${membersPanel()}
      <article class="panel role-builder"><div class="role-builder-head"><div><h3>${setup.accessMembershipId ? 'Modifier cet accès' : 'Inviter une personne'}</h3><p>Le lien reçu permet d’utiliser un compte Yulyf existant ou d’en créer un, sans ouvrir les données privées.</p></div><label>Rôle de départ<select id="rolePreset"><option ${setup.accessRole === 'Accueil' ? 'selected' : ''}>Accueil</option><option ${setup.accessRole === 'Administrateur du centre' ? 'selected' : ''}>Administrateur du centre</option><option ${setup.accessRole === 'Comptabilité' ? 'selected' : ''}>Comptabilité</option><option ${setup.accessRole === 'Praticien' ? 'selected' : ''}>Praticien</option><option ${setup.accessRole === 'Personnalisé' ? 'selected' : ''}>Personnalisé</option></select></label></div><div class="access-identity">${field('Nom de la personne', 'accessName', setup.accessName, 'text', 'data-access-field')}${field('Adresse e-mail', 'accessEmail', setup.accessEmail, 'email', `data-access-field ${setup.accessMembershipId ? 'readonly' : ''}`)}</div><div class="permission-table"><div class="permission-row permission-head"><strong>Onglet</strong><span>Droit accordé</span></div>${permissionRows(setup.rolePermissions)}</div><div class="permission-legend"><span><i class="edit-dot"></i> Peut voir et interagir</span><span><i class="view-dot"></i> Lecture seule</span><span><i class="none-dot"></i> Onglet invisible</span></div><div class="role-builder-actions"><div class="role-lock">⚿ Valou · Supadmin + Support conserve toujours l’accès complet.</div>${setup.accessMembershipId ? '<button class="outline" data-action="cancel-access-edit">Annuler</button>' : ''}<button class="primary" data-action="save-centre-access">${setup.accessMembershipId ? 'Enregistrer les droits' : 'Envoyer l’invitation'}</button></div></article>`,
    'billing-settings': `${settingsHeader('Facturation du centre', 'Les réglages administratifs du centre restent séparés de la facturation personnelle des praticiens.')}${simpleToggleCard('TVA, compte bancaire et numérotation des factures', 'billingReady', setup.billingReady)}`,
    notifications: `${settingsHeader('Notifications', 'Configure les confirmations, rappels de rendez-vous et messages administratifs.')}${simpleToggleCard('Rappels automatiques et e-mails du centre', 'notificationsReady', setup.notificationsReady)}`,
    subscription: `${settingsHeader('Abonnement YulyfCentre', 'L’abonnement et le nombre de praticiens seront contrôlés depuis BackofficeLYC.')}<article class="panel subscription-card"><div><small>BASE CENTRE</small><strong>33 € <em>/ mois</em></strong><p>+ 12 € / mois par praticien qui n’a pas déjà Yulyf</p></div><span class="tag gold-tag">Démonstration</span></article>`,
    terms: `${settingsHeader('Conditions et consentements', 'Centralise les conditions d’utilisation du centre et les informations administratives remises au client.')}${simpleToggleCard('Conditions du centre relues et prêtes', 'termsReady', setup.termsReady)}`
  };
  pane.innerHTML = pages[section] || pages.overview;
  updateSetupProgress();
  if (accessLevel('settings') === 'view') pane.querySelectorAll('input, textarea, select, button').forEach(control => { control.disabled = true; });
}

function simpleToggleCard(title, key, active) {
  return `<article class="panel setup-toggle-card"><div><h3>${title}</h3><p>${active ? 'Cette rubrique est marquée comme prête dans la démonstration.' : 'Ouvre et valide cette rubrique avant l’activation du centre.'}</p></div><button class="${active ? 'outline' : 'primary'}" data-setup-toggle="${key}">${active ? 'Marquer à revoir' : 'Marquer comme prêt'}</button></article>`;
}

function permissionRows(permissions) {
  const labels = { dashboard: "Aujourd'hui", clients: 'Clients du centre', practitioners: 'Praticiens', agenda: 'Agenda', requests: 'Demandes', billing: 'Facturation', documents: 'Documents', statistics: 'Statistiques', settings: 'Paramètres du centre' };
  return Object.entries(labels).map(([key, label]) => `<div class="permission-row"><strong>${label}</strong><select data-role-permission="${key}"><option value="edit" ${permissions[key] === 'edit' ? 'selected' : ''}>Voir et interagir</option><option value="view" ${permissions[key] === 'view' ? 'selected' : ''}>Voir uniquement</option><option value="none" ${permissions[key] === 'none' ? 'selected' : ''}>Ne pas voir</option></select></div>`).join('');
}

document.addEventListener('click', async event => {
  const authSwitch = event.target.closest('[data-auth-switch]');
  if (authSwitch) return renderAuthGate(authSwitch.dataset.authSwitch);

  const openingDay = event.target.closest('[data-opening-day]');
  if (openingDay) {
    const day = openingDay.dataset.openingDay;
    const openingDays = setup.openingDays.includes(day) ? setup.openingDays.filter(item => item !== day) : [...setup.openingDays, day];
    saveSetup({ openingDays });
    openingDay.classList.toggle('selected');
    return;
  }
  const nav = event.target.closest('[data-view]');
  if (nav) return render(nav.dataset.view);

  const link = event.target.closest('[data-view-link]');
  if (link) return render(link.dataset.viewLink);

  const completionLink = event.target.closest('[data-action="complete-centre-profile"]');
  if (completionLink) {
    render('settings');
    renderSettings('identity');
    return;
  }

  const setupSection = event.target.closest('[data-setup-section]');
  if (setupSection) return renderSettings(setupSection.dataset.setupSection);

  const locationEdit = event.target.closest('[data-location-edit]');
  if (locationEdit) {
    const location = centreLocations.find(item => item.$id === locationEdit.dataset.locationEdit);
    if (!location) return showToast('Ce lieu est introuvable.');
    editingLocationId = location.$id;
    saveSetup(locationSetup(location));
    renderSettings('locations');
    return;
  }

  const locationDelete = event.target.closest('[data-location-delete]');
  if (locationDelete) {
    const location = centreLocations.find(item => item.$id === locationDelete.dataset.locationDelete);
    if (!location || !confirm(`Supprimer le lieu « ${location.name} » ?`)) return;
    locationDelete.disabled = true;
    try {
      await deleteLocation(location.$id);
      renderSettings('locations');
      showToast('Lieu supprimé du centre.');
    } catch (error) { locationDelete.disabled = false; showToast(error.message || appwriteMessage(error)); }
    return;
  }

  const memberEdit = event.target.closest('[data-member-edit]');
  if (memberEdit) {
    const member = centreMembers.find(item => item.$id === memberEdit.dataset.memberEdit);
    if (!member) return showToast('Cet accès est introuvable.');
    const profile = memberProfile(member);
    saveSetup({ accessMembershipId: member.$id, accessName: profile?.name || member.userName || '', accessEmail: profile?.email || member.userEmail || '', accessRole: currentRoleLabel(member), rolePermissions: membershipPermissions(member) });
    renderSettings('team');
    return;
  }

  const memberRemove = event.target.closest('[data-member-remove]');
  if (memberRemove) {
    const member = centreMembers.find(item => item.$id === memberRemove.dataset.memberRemove);
    if (!member || !confirm(`Retirer l’accès de ${member.userName || member.userEmail} ?`)) return;
    memberRemove.disabled = true;
    try {
      await teams.deleteMembership({ teamId: centreRow.teamId, membershipId: member.$id });
      const profile = memberProfile(member);
      if (profile) await tables.deleteRow({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_MEMBER_PROFILES_TABLE_ID, rowId: profile.$id }).catch(() => {});
      await refreshCentreMembers();
      renderSettings('team');
      showToast('Accès retiré du centre.');
    } catch (error) { memberRemove.disabled = false; showToast(error.message || appwriteMessage(error)); }
    return;
  }

  const provider = event.target.closest('[data-provider-type]');
  if (provider) {
    saveSetup({ [provider.dataset.providerType]: provider.dataset.provider });
    renderSettings('connections');
    return showToast(`${provider.dataset.provider} sélectionné dans la démonstration.`);
  }

  const setupToggle = event.target.closest('[data-setup-toggle]');
  if (setupToggle) {
    const key = setupToggle.dataset.setupToggle;
    saveSetup({ [key]: !setup[key] });
    return renderSettings(key === 'billingReady' ? 'billing-settings' : key === 'termsReady' ? 'terms' : 'notifications');
  }

  const action = event.target.closest('[data-action]');
  if (!action) return;
  if (action.dataset.action === 'logout') {
    return account.deleteSession({ sessionId: 'current' }).catch(() => {}).finally(() => { currentUser = null; centreRow = null; centreMembership = null; centreMembers = []; centreMemberProfiles = []; centreLocations = []; editingLocationId = ''; document.body.classList.add('auth-pending'); renderAuthGate('login', 'Vous êtes déconnecté.'); });
  }
  const messages = {
    'new-appointment': 'Formulaire de rendez-vous prêt pour la prochaine couche.',
    'new-patient': 'Ajout d’un client : seules les données administratives seront demandées.',
    'new-message': 'Le message sera identifié « Centre technique Z » dans le portail.',
    'new-invoice': 'Création de facture simulée — aucune donnée réelle.',
    'new-practitioner': 'Invitation praticien simulée. Le lien Yulyf restera contrôlé.',
    'open-practitioner': 'Fiche des accès du praticien ouverte en démonstration.',
    'open-patient': 'Fiche administrative uniquement — aucun dossier sensible.',
    'new-request': 'Nouvelle demande administrative simulée.',
    'accept-request': 'Demande acceptée dans la démonstration.',
    'refuse-request': 'Demande refusée dans la démonstration.',
    'reply-request': 'Réponse du centre simulée.',
    'new-document': 'Dépôt réservé aux documents administratifs du centre.',
    'switch-patient': 'Le changement de client sera actif avec la base de démonstration.',
    'request-change': 'Demande de modification envoyée au centre (simulation).',
    'download-demo': 'Téléchargement de démonstration — aucun fichier réel.'
    ,'add-capture': 'Ajout de capture simulé — aucun fichier n’est envoyé.'
    ,'support-next': 'Demande préparée pour BackofficeLYC — aucun ticket réel n’est créé.'
    ,'tutorials': 'Les tutoriels Yulyf seront réutilisés pour YulyfCentre.'
    ,'grant-demo': 'Accès temporaire simulé. En production, il expirera automatiquement.'
    ,'setup-manual-client': 'Client fictif préparé : seules les données administratives sont demandées.'
    ,'setup-team-ready': 'Les accès sont maintenant gérés dans le formulaire ci-dessous.'
  };
  if (action.dataset.action === 'remove-centre-logo') {
    action.disabled = true;
    return removeCentreLogo().then(() => { renderSettings('branding'); showToast('Logo retiré de YulyfCentre et supprimé du stockage.'); }).catch(error => { action.disabled = false; showToast(error.message || appwriteMessage(error)); });
  }
  if (action.dataset.action === 'add-location') {
    editingLocationId = '';
    saveSetup(locationSetup(null));
    renderSettings('locations');
    return;
  }
  if (action.dataset.action === 'setup-manual-client') saveSetup({ clientsReady: true });
  if (action.dataset.action === 'setup-team-ready') saveSetup({ teamReady: true });
  if (action.dataset.action === 'cancel-access-edit') {
    saveSetup({ accessName: '', accessEmail: '', accessMembershipId: '', accessRole: 'Accueil', rolePermissions: { ...setupDefaults.rolePermissions } });
    renderSettings('team');
    return;
  }
  if (action.dataset.action === 'save-centre-access') {
    action.disabled = true;
    try {
      const wasEditing = Boolean(setup.accessMembershipId);
      await saveCentreAccess();
      renderSettings('team');
      showToast(wasEditing ? 'Droits enregistrés dans Appwrite.' : 'Invitation réelle envoyée par e-mail.');
    } catch (error) { action.disabled = false; showToast(error.message || appwriteMessage(error)); }
    return;
  }
  showToast(messages[action.dataset.action] || 'Action de démonstration.');
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'centreAuthForm') {
    event.preventDefault();
    const form = event.target, mode = form.dataset.authMode, data = new FormData(form), email = String(data.get('email') || '').trim().toLowerCase(), password = String(data.get('password') || '');
    if (mode === 'register' && password !== String(data.get('passwordConfirm') || '')) {
      renderAuthGate(mode, 'Les deux mots de passe ne correspondent pas.');
      return;
    }
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      if (mode === 'register') await account.create({ userId: ID.unique(), email, password });
      await account.createEmailPasswordSession({ email, password });
      currentUser = await account.get();
      await loadCentre();
      if (!centreRow) {
        saveSetup(newCentreSetup(currentUser.email || email));
        await persistCentre('active');
      }
      openApplication();
    } catch (error) { renderAuthGate(mode, appwriteMessage(error)); }
    return;
  }
  const locationForm = event.target.closest('[data-location-form]');
  if (locationForm) {
    event.preventDefault();
    const formData = new FormData(locationForm);
    const makePrimary = formData.get('isPrimary') === 'on';
    formData.delete('isPrimary');
    saveSetup(Object.fromEntries(formData.entries()));
    const submit = locationForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await persistLocation(makePrimary);
      renderSettings('locations');
      showToast('Lieu et horaires enregistrés dans Appwrite.');
    } catch (error) { submit.disabled = false; showToast(error.message || appwriteMessage(error)); }
    return;
  }
  const form = event.target.closest('[data-setup-form]');
  if (!form) return;
  event.preventDefault();
  saveSetup(Object.fromEntries(new FormData(form).entries()));
  try { await persistCentre(centreRow?.status || 'draft'); showToast('Paramètres enregistrés dans Appwrite.'); }
  catch (error) { showToast(error.message || appwriteMessage(error)); }
});

document.addEventListener('change', async event => {
  if (event.target.id === 'rolePreset') {
    const presets = {
      'Accueil': { dashboard: 'edit', clients: 'view', practitioners: 'none', agenda: 'edit', requests: 'edit', billing: 'none', documents: 'view', statistics: 'none', settings: 'none' },
      'Administrateur du centre': { dashboard: 'edit', clients: 'edit', practitioners: 'edit', agenda: 'edit', requests: 'edit', billing: 'edit', documents: 'edit', statistics: 'view', settings: 'edit' },
      'Comptabilité': { dashboard: 'view', clients: 'view', practitioners: 'none', agenda: 'view', requests: 'none', billing: 'edit', documents: 'view', statistics: 'view', settings: 'none' },
      'Praticien': { dashboard: 'view', clients: 'view', practitioners: 'none', agenda: 'edit', requests: 'view', billing: 'none', documents: 'view', statistics: 'none', settings: 'none' }
    };
    const accessRole = event.target.value;
    saveSetup({ accessRole, ...(presets[accessRole] ? { rolePermissions: presets[accessRole] } : {}) });
    renderSettings('team');
    return showToast(`Rôle ${accessRole} appliqué.`);
  }
  if (event.target.matches('[data-access-field]')) {
    saveSetup({ [event.target.name]: event.target.value });
  }
  if (event.target.dataset.rolePermission) {
    const rolePermissions = { ...setup.rolePermissions, [event.target.dataset.rolePermission]: event.target.value };
    saveSetup({ rolePermissions, accessRole: 'Personnalisé', teamReady: true });
    return showToast('Droit personnalisé prêt à enregistrer.');
  }
  if (event.target.id === 'centreLogoInput') {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return showToast('Format refusé : utilise PNG, JPG ou WEBP.');
    if (file.size > 150000) return showToast('Le logo doit peser moins de 150 Ko.');
    const picker = event.target.closest('.logo-drop');
    picker?.classList.add('uploading');
    try {
      await uploadCentreLogo(file);
      renderSettings('branding');
      showToast('Logo enregistré dans Appwrite et appliqué au centre.');
    } catch (error) {
      picker?.classList.remove('uploading');
      showToast(error.message || appwriteMessage(error));
    }
    return;
  }
  if (event.target.id === 'centreClientsInput') {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = document.getElementById('clientImportPreview');
    const finish = count => { saveSetup({ clientsReady: true }); preview.innerHTML = `<article class="panel import-ready"><span>✓</span><div><strong>${count} ligne${count > 1 ? 's' : ''} prête${count > 1 ? 's' : ''} à vérifier</strong><p>${file.name} · aucune donnée n’a été envoyée.</p></div><button class="primary" data-action="confirm-demo-import">Confirmer l’import fictif</button></article>`; showToast('Fichier analysé localement dans la démonstration.'); };
    if (file.name.toLowerCase().endsWith('.csv')) { const reader = new FileReader(); reader.onload = () => finish(Math.max(1, String(reader.result).trim().split(/\r?\n/).length - 1)); reader.readAsText(file); }
    else finish(1);
  }
});

document.addEventListener('input', event => {
  if (event.target.matches('[data-access-field]')) saveSetup({ [event.target.name]: event.target.value });
  const id = event.target.dataset.tableSearch;
  if (!id) return;
  const query = event.target.value.toLowerCase().trim();
  document.querySelectorAll(`#${id} tbody tr`).forEach(row => {
    row.hidden = !row.textContent.toLowerCase().includes(query);
  });
});

document.getElementById('menuToggle').addEventListener('click', () => sidebar.classList.toggle('open'));
window.addEventListener('popstate', () => render(location.hash.slice(1) || 'today', false));

bootstrap();
