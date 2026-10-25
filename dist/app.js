import { Account, Client, ID, Permission, Query, Role, TablesDB } from 'appwrite';

const APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = '6aa80924002a9a6b3cf7';
const APPWRITE_DATABASE_ID = 'lyc';
const APPWRITE_CENTRES_TABLE_ID = 'yulyf_centres';
const appwriteClient = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const account = new Account(appwriteClient);
const tables = new TablesDB(appwriteClient);
let currentUser = null;
let centreRow = null;

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
  language: 'Français', timezone: 'Europe/Brussels', website: '', logo: '', locationName: 'Centre technique Z · Namur', roomCount: '4',
  openStart: '08:00', openEnd: '20:00', openingDays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'], clientsReady: false, calendarProvider: '', emailProvider: '', teamReady: false,
  billingReady: false, notificationsReady: false, termsReady: false
  ,accessName: '', accessEmail: '', accessRole: 'Accueil', rolePermissions: { dashboard: 'edit', clients: 'view', practitioners: 'none', agenda: 'edit', requests: 'edit', billing: 'none', documents: 'view', statistics: 'none', settings: 'none' }
};
let setup = loadSetup();

function loadSetup() {
  try { return { ...setupDefaults, ...JSON.parse(localStorage.getItem(setupKey) || '{}') }; }
  catch { return { ...setupDefaults }; }
}

function saveSetup(patch = {}) {
  setup = { ...setup, ...patch };
  localStorage.setItem(setupKey, JSON.stringify(setup));
  const state = document.getElementById('setupSaveState');
  if (state) { state.textContent = '✓ Enregistré dans cette démonstration'; state.classList.add('saved'); }
  updateSetupProgress();
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
      ${mode === 'register' ? '<label>Votre nom<input name="name" autocomplete="name" maxlength="128" required></label>' : ''}
      <label>Adresse e-mail<input name="email" type="email" autocomplete="email" required></label>
      <label>Mot de passe<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
      <button class="primary" type="submit">${mode === 'register' ? 'Créer mon compte et continuer' : 'Se connecter'}</button>
    </form>
    <button class="auth-switch" data-auth-switch="${mode === 'register' ? 'login' : 'register'}">${mode === 'register' ? 'J’ai déjà un espace centre' : 'Créer un nouvel espace centre'}</button>
    <small class="auth-security">⚿ Environnement Appwrite européen · aucune donnée médicale demandée</small>
  </section>`;
}

function centreFormValue(form, name) {
  return String(new FormData(form).get(name) || '').trim();
}

function validateCentre(data) {
  const required = ['centreName', 'email', 'phone', 'address', 'city', 'country', 'language', 'timezone', 'openStart', 'openEnd'];
  if (required.some(key => !String(data[key] || '').trim())) return 'Complète tous les champs obligatoires du centre.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Indique une adresse e-mail valide.';
  if (data.openStart >= data.openEnd) return 'L’heure de fermeture doit être postérieure à l’heure d’ouverture.';
  if (!Array.isArray(data.openingDays) || !data.openingDays.length) return 'Sélectionne au moins un jour d’ouverture.';
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
  if (setup.website.trim()) data.website = setup.website.trim();
  return data;
}

async function persistCentre(status = centreRow?.status || 'draft') {
  const data = centreData(status);
  const validation = validateCentre({ ...setup, ...data, centreName: data.name });
  if (validation) throw new Error(validation);
  if (centreRow) {
    centreRow = await tables.updateRow({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_CENTRES_TABLE_ID, rowId: centreRow.$id, data });
  } else {
    centreRow = await tables.createRow({
      databaseId: APPWRITE_DATABASE_ID,
      tableId: APPWRITE_CENTRES_TABLE_ID,
      rowId: ID.unique(),
      data,
      permissions: [Permission.read(Role.user(currentUser.$id)), Permission.update(Role.user(currentUser.$id)), Permission.delete(Role.user(currentUser.$id))],
    });
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
  });
  document.querySelector('.centre-switcher strong').textContent = row.publicName || row.name;
  document.querySelector('.centre-switcher small').textContent = row.status === 'active' ? 'Espace actif' : 'Configuration en cours';
  document.querySelector('.centre-switcher .avatar').textContent = (row.publicName || row.name).split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function renderCentreOnboarding(message = '') {
  const gate = document.getElementById('authGate');
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  gate.hidden = false;
  gate.innerHTML = `<section class="auth-card centre-onboarding-card">
    <div class="auth-brand"><div class="brand-mark" aria-hidden="true"><span></span></div><div><strong>Yulyf<span>Centre</span></strong><small>Création de l’espace</small></div></div>
    <p class="eyebrow">Première couche · Salon</p><h1>${centreRow ? 'Paramètres du centre' : 'Créer votre centre'}</h1>
    <p>Ces informations administratives seront enregistrées dans l’environnement sécurisé du centre. Aucun dossier médical n’est demandé.</p>
    ${message ? `<div class="auth-message">${safeText(message)}</div>` : ''}
    <form id="centreOnboardingForm" class="onboarding-form">
      <div class="onboarding-grid">
        <label>Nom public du centre *<input name="centreName" value="${safeText(setup.centreName)}" maxlength="160" required></label>
        <label>Raison sociale<input name="company" value="${safeText(setup.company)}" maxlength="200"></label>
        <label>E-mail principal *<input name="email" type="email" value="${safeText(setup.email)}" required></label>
        <label>Téléphone *<input name="phone" type="tel" value="${safeText(setup.phone)}" maxlength="40" required></label>
        <label>N° d’entreprise / TVA<input name="vat" value="${safeText(setup.vat)}" maxlength="40"></label>
        <label>Site internet<input name="website" type="url" value="${safeText(setup.website)}"></label>
        <label class="wide">Adresse *<input name="address" value="${safeText(setup.address)}" maxlength="250" required></label>
        <label>Code postal<input name="postal" value="${safeText(setup.postal)}" maxlength="20"></label>
        <label>Ville *<input name="city" value="${safeText(setup.city)}" maxlength="120" required></label>
        <label>Pays *<input name="country" value="${safeText(setup.country)}" maxlength="100" required></label>
        <label>Langue<select name="language"><option ${setup.language === 'Français' ? 'selected' : ''}>Français</option><option ${setup.language === 'Nederlands' ? 'selected' : ''}>Nederlands</option><option ${setup.language === 'English' ? 'selected' : ''}>English</option></select></label>
        <label>Fuseau horaire<select name="timezone"><option ${setup.timezone === 'Europe/Brussels' ? 'selected' : ''}>Europe/Brussels</option><option ${setup.timezone === 'Europe/Paris' ? 'selected' : ''}>Europe/Paris</option><option ${setup.timezone === 'Europe/Luxembourg' ? 'selected' : ''}>Europe/Luxembourg</option></select></label>
        <label>Ouverture *<input name="openStart" type="time" value="${safeText(setup.openStart)}" required></label>
        <label>Fermeture *<input name="openEnd" type="time" value="${safeText(setup.openEnd)}" required></label>
      </div>
      <fieldset><legend>Jours d’ouverture *</legend><div class="onboarding-days">${days.map(day => `<label><input type="checkbox" name="openingDays" value="${day}" ${setup.openingDays.includes(day) ? 'checked' : ''}><span>${day}</span></label>`).join('')}</div></fieldset>
      <div class="onboarding-actions"><button class="outline" type="submit" name="intent" value="draft">Enregistrer le brouillon</button><button class="primary" type="submit" name="intent" value="active">Activer l’espace centre</button></div>
    </form>
    <button class="auth-switch" data-action="logout">Se déconnecter</button>
  </section>`;
}

async function loadCentre() {
  const result = await tables.listRows({ databaseId: APPWRITE_DATABASE_ID, tableId: APPWRITE_CENTRES_TABLE_ID, queries: [Query.equal('ownerId', [currentUser.$id]), Query.limit(1)] });
  centreRow = result.rows?.[0] || null;
  if (centreRow) applyCentreRow(centreRow);
  return centreRow;
}

function openApplication() {
  document.getElementById('authGate').hidden = true;
  document.body.classList.remove('auth-pending');
  const displayName = currentUser.name || currentUser.email;
  document.getElementById('currentUserName').textContent = displayName;
  document.getElementById('currentUserAvatar').textContent = displayName.trim().charAt(0).toUpperCase() || 'C';
  document.getElementById('currentUserRole').textContent = 'Administrateur du centre';
  render(location.hash.slice(1) || 'today', false);
}

async function bootstrap() {
  try {
    currentUser = await account.get();
    await loadCentre();
    if (!centreRow || centreRow.status !== 'active') return renderCentreOnboarding();
    openApplication();
  } catch {
    document.body.classList.add('auth-pending');
    renderAuthGate('login');
  }
}

function setupSteps() {
  return [
    ['identity', Boolean(setup.centreName && setup.email && setup.phone && setup.address && setup.city)],
    ['branding', Boolean(setup.logo)],
    ['locations', Boolean(setup.locationName && setup.openStart && setup.openEnd)],
    ['clients', setup.clientsReady],
    ['connections', Boolean(setup.calendarProvider && setup.emailProvider)],
    ['team', setup.teamReady],
    ['billing-settings', setup.billingReady],
    ['notifications', setup.notificationsReady],
    ['terms', setup.termsReady]
  ];
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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function render(view, push = true) {
  if (!views[view]) view = 'today';
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
}

function field(label, name, value, type = 'text', extra = '') {
  return `<label class="setup-field"><span>${label}</span><input type="${type}" name="${name}" value="${String(value || '').replaceAll('"', '&quot;')}" ${extra}></label>`;
}

function settingsHeader(title, text, badge = '') {
  return `<div class="settings-section-head"><div>${badge ? `<p class="eyebrow">${badge}</p>` : ''}<h2>${title}</h2><p>${text}</p></div></div>`;
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
      <form class="panel setup-form" data-setup-form><div class="setup-grid">${field('Nom public du centre *', 'centreName', setup.centreName)}${field('E-mail principal *', 'email', setup.email, 'email')}${field('Téléphone *', 'phone', setup.phone, 'tel')}${field('Site internet', 'website', setup.website, 'url')}${field('Raison sociale', 'company', setup.company)}${field('N° d’entreprise / TVA', 'vat', setup.vat)}${field('Adresse *', 'address', setup.address)}${field('Code postal', 'postal', setup.postal)}${field('Ville *', 'city', setup.city)}${field('Pays', 'country', setup.country)}</div><div class="setup-grid compact-grid"><label class="setup-field"><span>Langue</span><select name="language"><option ${setup.language === 'Français' ? 'selected' : ''}>Français</option><option ${setup.language === 'Nederlands' ? 'selected' : ''}>Nederlands</option><option ${setup.language === 'English' ? 'selected' : ''}>English</option></select></label><label class="setup-field"><span>Fuseau horaire</span><select name="timezone"><option ${setup.timezone === 'Europe/Brussels' ? 'selected' : ''}>Europe/Brussels</option><option ${setup.timezone === 'Europe/Paris' ? 'selected' : ''}>Europe/Paris</option><option ${setup.timezone === 'Europe/Luxembourg' ? 'selected' : ''}>Europe/Luxembourg</option></select></label></div><div class="form-actions"><span class="setup-live-status">${centreRow?.status === 'active' ? '● Espace actif' : '● Brouillon'}</span><button class="primary" type="submit">Enregistrer dans Appwrite</button></div></form>`,
    branding: `${settingsHeader('Logo et apparence', 'Comme dans Yulyf, le logo est prévisualisé avant son enregistrement.', 'Étape 2')}
      <div class="panel branding-setup"><label class="logo-drop"><span>◉</span><div><strong>Choisir ou remplacer le logo</strong><small>PNG, JPG ou WEBP · 150 Ko maximum</small></div><input id="centreLogoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><div class="logo-preview ${setup.logo ? 'has-logo' : ''}">${setup.logo ? `<img src="${setup.logo}" alt="Logo du centre">` : '<span>CZ</span>'}<div><strong>Aperçu du portail client</strong><small>${setup.centreName}</small></div></div>${setup.logo ? '<button class="outline" data-action="remove-centre-logo">Retirer le logo</button>' : ''}<p class="setup-note">Le même visuel sera utilisé dans le portail, les e-mails administratifs et les factures du centre.</p></div>`,
    locations: `${settingsHeader('Lieux et horaires d’activité', 'Ajoute l’adresse principale, le nombre de salles et les heures d’ouverture.', 'Étape 3')}
      <form class="panel setup-form" data-setup-form><div class="setup-grid">${field('Nom du lieu *', 'locationName', setup.locationName)}${field('Nombre de salles', 'roomCount', setup.roomCount, 'number', 'min="1" max="99"')}${field('Ouverture', 'openStart', setup.openStart, 'time')}${field('Fermeture', 'openEnd', setup.openEnd, 'time')}</div><div class="weekday-picker"><span>Jours d’ouverture</span>${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(day => `<button type="button" data-opening-day="${day}" class="${setup.openingDays.includes(day) ? 'selected' : ''}">${day}</button>`).join('')}</div><div class="form-actions"><button type="button" class="outline" data-action="add-location">＋ Ajouter un autre lieu</button><button class="primary" type="submit">Enregistrer dans Appwrite</button></div></form>`,
    clients: `${settingsHeader('Clients du centre', 'Crée un client manuellement ou importe une liste existante. Rien n’est enregistré avant confirmation.', 'Étape 4')}
      <div class="setup-two-cols"><article class="panel setup-choice"><span class="choice-icon">＋</span><h3>Ajouter manuellement</h3><p>Nom, prénom, e-mail, téléphone, adresse et praticien du centre.</p><button class="outline" data-action="setup-manual-client">Créer un client fictif</button></article><article class="panel setup-choice"><span class="choice-icon">⇧</span><h3>Importer une liste</h3><p>CSV ou Excel. Les doublons seront signalés avant confirmation.</p><label class="primary file-button">Choisir un fichier fictif<input id="centreClientsInput" type="file" accept=".csv,.xlsx,text/csv" hidden></label></article></div><div id="clientImportPreview"></div>
      <article class="panel data-boundary"><strong>Colonnes autorisées</strong><p>Prénom · Nom · E-mail · Téléphone · Adresse · Praticien du centre</p><strong>Colonnes refusées</strong><p>Diagnostic · Notes · Analyses · Consentements · Comptes rendus médicaux</p></article>`,
    connections: `${settingsHeader('Agenda et messagerie', 'Le centre relie ses outils existants. Les rendez-vous administratifs sont synchronisés, jamais le contenu clinique.', 'Étape 5')}
      <div class="connection-block panel"><div><h3>Agenda du centre</h3><p>Synchronisation bidirectionnelle des créneaux et rendez-vous du centre.</p></div><div class="provider-grid"><button data-provider-type="calendarProvider" data-provider="Google" class="${setup.calendarProvider === 'Google' ? 'selected' : ''}"><b>G</b> Google Calendar<small>${setup.calendarProvider === 'Google' ? 'Sélectionné' : 'Choisir'}</small></button><button data-provider-type="calendarProvider" data-provider="Microsoft" class="${setup.calendarProvider === 'Microsoft' ? 'selected' : ''}"><b>M</b> Microsoft Outlook<small>${setup.calendarProvider === 'Microsoft' ? 'Sélectionné' : 'Choisir'}</small></button></div></div>
      <div class="connection-block panel"><div><h3>Adresse d’envoi du centre</h3><p>Les confirmations et rappels partiront de l’adresse officielle du centre.</p></div><div class="provider-grid"><button data-provider-type="emailProvider" data-provider="Gmail" class="${setup.emailProvider === 'Gmail' ? 'selected' : ''}"><b>G</b> Gmail<small>${setup.emailProvider === 'Gmail' ? 'Sélectionné' : 'Choisir'}</small></button><button data-provider-type="emailProvider" data-provider="Microsoft" class="${setup.emailProvider === 'Microsoft' ? 'selected' : ''}"><b>M</b> Outlook / Microsoft 365<small>${setup.emailProvider === 'Microsoft' ? 'Sélectionné' : 'Choisir'}</small></button><button data-provider-type="emailProvider" data-provider="Autre" class="${setup.emailProvider === 'Autre' ? 'selected' : ''}"><b>@</b> OVH ou autre<small>${setup.emailProvider === 'Autre' ? 'Sélectionné' : 'Choisir'}</small></button></div></div><p class="setup-note">Dans cette maquette, le choix est mémorisé sans lancer une connexion réelle. Le raccordement OAuth sera réalisé dans la couche Appwrite.</p>`,
    team: `${settingsHeader('Praticiens, utilisateurs et accès', 'Chaque personne reçoit un rôle. Les droits se règlent ensuite onglet par onglet : modifier, voir uniquement ou aucun accès.', 'Étape 6')}
      <article class="panel technical-test"><span class="avatar violet">TC</span><div><h3>Praticien technique C</h3><p>Compte de test Yulyf disponible pour valider le lien contrôlé.</p></div><span class="tag mint-tag">Yulyf relié</span></article><div class="setup-two-cols"><article class="panel setup-choice"><h3>Praticien déjà sur Yulyf</h3><p>Il se connecte avec son compte personnel. Le centre reçoit uniquement ses présences, ses créneaux et ses clients rattachés au centre.</p><button class="primary" data-action="setup-team-ready">Inviter avec Yulyf</button></article><article class="panel setup-choice"><h3>Nouveau sur Yulyf</h3><p>Le centre crée une invitation. Le praticien choisira ensuite son mot de passe et ses accès.</p><button class="outline" data-action="setup-team-ready">Créer une invitation</button></article></div>
      <article class="panel role-builder"><div class="role-builder-head"><div><h3>Créer un accès à l’application</h3><p>Renseigne la personne, choisis un rôle de départ puis adapte ses droits onglet par onglet.</p></div><label>Rôle de départ<select id="rolePreset"><option ${setup.accessRole === 'Accueil' ? 'selected' : ''}>Accueil</option><option ${setup.accessRole === 'Administrateur du centre' ? 'selected' : ''}>Administrateur du centre</option><option ${setup.accessRole === 'Comptabilité' ? 'selected' : ''}>Comptabilité</option><option ${setup.accessRole === 'Praticien' ? 'selected' : ''}>Praticien</option><option ${setup.accessRole === 'Personnalisé' ? 'selected' : ''}>Personnalisé</option></select></label></div><div class="access-identity">${field('Nom de la personne', 'accessName', setup.accessName, 'text', 'data-access-field')}${field('Adresse e-mail', 'accessEmail', setup.accessEmail, 'email', 'data-access-field')}</div><div class="permission-table"><div class="permission-row permission-head"><strong>Onglet</strong><span>Droit accordé</span></div>${permissionRows(setup.rolePermissions)}</div><div class="permission-legend"><span><i class="edit-dot"></i> Peut voir et interagir</span><span><i class="view-dot"></i> Lecture seule</span><span><i class="none-dot"></i> Onglet invisible</span></div><div class="role-builder-actions"><div class="role-lock">⚿ Valou · Supadmin + Support conserve toujours l’accès complet.</div><button class="primary" data-action="create-access-demo">Créer l’accès fictif</button></div></article>`,
    'billing-settings': `${settingsHeader('Facturation du centre', 'Les réglages administratifs du centre restent séparés de la facturation personnelle des praticiens.')}${simpleToggleCard('TVA, compte bancaire et numérotation des factures', 'billingReady', setup.billingReady)}`,
    notifications: `${settingsHeader('Notifications', 'Configure les confirmations, rappels de rendez-vous et messages administratifs.')}${simpleToggleCard('Rappels automatiques et e-mails du centre', 'notificationsReady', setup.notificationsReady)}`,
    subscription: `${settingsHeader('Abonnement YulyfCentre', 'L’abonnement et le nombre de praticiens seront contrôlés depuis BackofficeLYC.')}<article class="panel subscription-card"><div><small>BASE CENTRE</small><strong>33 € <em>/ mois</em></strong><p>+ 12 € / mois par praticien qui n’a pas déjà Yulyf</p></div><span class="tag gold-tag">Démonstration</span></article>`,
    terms: `${settingsHeader('Conditions et consentements', 'Centralise les conditions d’utilisation du centre et les informations administratives remises au client.')}${simpleToggleCard('Conditions du centre relues et prêtes', 'termsReady', setup.termsReady)}`
  };
  pane.innerHTML = pages[section] || pages.overview;
  updateSetupProgress();
}

function simpleToggleCard(title, key, active) {
  return `<article class="panel setup-toggle-card"><div><h3>${title}</h3><p>${active ? 'Cette rubrique est marquée comme prête dans la démonstration.' : 'Ouvre et valide cette rubrique avant l’activation du centre.'}</p></div><button class="${active ? 'outline' : 'primary'}" data-setup-toggle="${key}">${active ? 'Marquer à revoir' : 'Marquer comme prêt'}</button></article>`;
}

function permissionRows(permissions) {
  const labels = { dashboard: "Aujourd'hui", clients: 'Clients du centre', practitioners: 'Praticiens', agenda: 'Agenda', requests: 'Demandes', billing: 'Facturation', documents: 'Documents', statistics: 'Statistiques', settings: 'Paramètres du centre' };
  return Object.entries(labels).map(([key, label]) => `<div class="permission-row"><strong>${label}</strong><select data-role-permission="${key}"><option value="edit" ${permissions[key] === 'edit' ? 'selected' : ''}>Voir et interagir</option><option value="view" ${permissions[key] === 'view' ? 'selected' : ''}>Voir uniquement</option><option value="none" ${permissions[key] === 'none' ? 'selected' : ''}>Ne pas voir</option></select></div>`).join('');
}

document.addEventListener('click', event => {
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

  const setupSection = event.target.closest('[data-setup-section]');
  if (setupSection) return renderSettings(setupSection.dataset.setupSection);

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
    return account.deleteSession({ sessionId: 'current' }).catch(() => {}).finally(() => { currentUser = null; centreRow = null; document.body.classList.add('auth-pending'); renderAuthGate('login', 'Vous êtes déconnecté.'); });
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
    ,'add-location': 'Un second lieu pourra être ajouté dans la couche de données Appwrite.'
    ,'setup-manual-client': 'Client fictif préparé : seules les données administratives sont demandées.'
    ,'setup-team-ready': 'Invitation de démonstration préparée. Aucun e-mail réel n’est envoyé.'
    ,'create-access-demo': 'Accès fictif créé avec les droits sélectionnés. Aucun e-mail réel n’est envoyé.'
  };
  if (action.dataset.action === 'remove-centre-logo') { saveSetup({ logo: '' }); renderSettings('branding'); return showToast('Logo retiré de la démonstration.'); }
  if (action.dataset.action === 'setup-manual-client') saveSetup({ clientsReady: true });
  if (action.dataset.action === 'setup-team-ready') saveSetup({ teamReady: true });
  if (action.dataset.action === 'create-access-demo') {
    const accessName = document.querySelector('[name="accessName"]')?.value.trim() || '';
    const accessEmail = document.querySelector('[name="accessEmail"]')?.value.trim() || '';
    if (!accessName || !accessEmail) return showToast('Indique le nom et l’adresse e-mail de la personne.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accessEmail)) return showToast('Indique une adresse e-mail valide.');
    saveSetup({ accessName, accessEmail, teamReady: true });
  }
  showToast(messages[action.dataset.action] || 'Action de démonstration.');
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'centreAuthForm') {
    event.preventDefault();
    const form = event.target, mode = form.dataset.authMode, data = new FormData(form), email = String(data.get('email') || '').trim().toLowerCase(), password = String(data.get('password') || '');
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      if (mode === 'register') await account.create({ userId: ID.unique(), email, password, name: String(data.get('name') || '').trim() });
      await account.createEmailPasswordSession({ email, password });
      currentUser = await account.get();
      await loadCentre();
      if (mode === 'register' && !centreRow) saveSetup({ centreName: '', publicName: '', email: currentUser.email || email, phone: '', company: '', vat: '', website: '', address: '', postal: '', city: '', country: 'Belgique', language: 'Français', timezone: 'Europe/Brussels', openStart: '08:00', openEnd: '20:00', openingDays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'] });
      if (!centreRow || centreRow.status !== 'active') renderCentreOnboarding(); else openApplication();
    } catch (error) { renderAuthGate(mode, appwriteMessage(error)); }
    return;
  }
  if (event.target.id === 'centreOnboardingForm') {
    event.preventDefault();
    const form = event.target, data = new FormData(form), submitter = event.submitter, status = submitter?.value === 'active' ? 'active' : 'draft';
    saveSetup({
      centreName: centreFormValue(form, 'centreName'), publicName: centreFormValue(form, 'centreName'), company: centreFormValue(form, 'company'), email: centreFormValue(form, 'email'), phone: centreFormValue(form, 'phone'), vat: centreFormValue(form, 'vat'), website: centreFormValue(form, 'website'), address: centreFormValue(form, 'address'), postal: centreFormValue(form, 'postal'), city: centreFormValue(form, 'city'), country: centreFormValue(form, 'country'), language: centreFormValue(form, 'language'), timezone: centreFormValue(form, 'timezone'), openStart: centreFormValue(form, 'openStart'), openEnd: centreFormValue(form, 'openEnd'), openingDays: data.getAll('openingDays').map(String)
    });
    form.querySelectorAll('button[type="submit"]').forEach(button => button.disabled = true);
    try {
      await persistCentre(status);
      if (status === 'active') { openApplication(); showToast('Espace centre activé et enregistré dans Appwrite.'); }
      else renderCentreOnboarding('Brouillon enregistré dans Appwrite. Tu peux le compléter puis l’activer.');
    } catch (error) { renderCentreOnboarding(error.message || appwriteMessage(error)); }
    return;
  }
  const form = event.target.closest('[data-setup-form]');
  if (!form) return;
  event.preventDefault();
  saveSetup(Object.fromEntries(new FormData(form).entries()));
  try { await persistCentre(centreRow?.status || 'draft'); showToast('Paramètres enregistrés dans Appwrite.'); }
  catch (error) { showToast(error.message || appwriteMessage(error)); }
});

document.addEventListener('change', event => {
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
    saveSetup({ rolePermissions, teamReady: true });
    return showToast('Droit du rôle enregistré dans la démonstration.');
  }
  if (event.target.id === 'centreLogoInput') {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return showToast('Format refusé : utilise PNG, JPG ou WEBP.');
    if (file.size > 150000) return showToast('Le logo doit peser moins de 150 Ko.');
    const reader = new FileReader();
    reader.onload = () => { saveSetup({ logo: String(reader.result) }); renderSettings('branding'); showToast('Logo ajouté à la démonstration.'); };
    reader.readAsDataURL(file);
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
