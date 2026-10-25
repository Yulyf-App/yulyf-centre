import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Account, Client, ID, Permission, Query, Role, TablesDB, Teams } from 'appwrite';

const endpoint = 'https://fra.cloud.appwrite.io/v1';
const projectId = '6aa80924002a9a6b3cf7';
const databaseId = 'lyc';
const tableId = 'yulyf_centres';
const suffix = Date.now().toString(36);
const ownerId = `yc-owner-${suffix}`;
const outsiderId = `yc-out-${suffix}`;
const password = `YcTest-${suffix}-A1!`;
const ownerEmail = `${ownerId}@example.com`;
const outsiderEmail = `${outsiderId}@example.com`;
let ownerSession;
let outsiderSession;
let ownerTeams;
let ownerTables;
let teamId;
let rowId;
let result;
const cleanupErrors = [];

function cli(args) {
  const command = process.platform === 'win32' ? process.env.ComSpec : 'appwrite';
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'appwrite', ...args] : args;
  const output = execFileSync(command, commandArgs, { cwd: new URL('..', import.meta.url), encoding: 'utf8', windowsHide: true });
  return output.trim() ? JSON.parse(output) : {};
}

function sessionClient(secret) {
  return new Client().setEndpoint(endpoint).setProject(projectId).setSession(secret);
}

function assertSourceContracts() {
  const source = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
  const contracts = [
    ['création automatique de l’espace actif', /await persistCentre\('active'\)/],
    ['compte créé avec les seuls identifiants', /account\.create\(\{ userId: ID\.unique\(\), email, password \}\)/],
    ['confirmation du mot de passe', /name="passwordConfirm"/],
    ['alerte de progression', /il reste \$\{progress\.remaining\}% dans la création de votre espace/],
    ['accès direct aux paramètres', /data-action="complete-centre-profile"/],
    ['signal doré dans la navigation', /settingsAttention/],
    ['nom public distinct du nom administratif', /'publicName', setup\.publicName/],
    ['effacement du site internet pris en charge', /website: setup\.website\.trim\(\)/],
  ];
  for (const [label, pattern] of contracts) {
    if (!pattern.test(source)) throw new Error(`Contrat absent : ${label}.`);
  }
}

try {
  assertSourceContracts();
  cli(['users', 'create', '--user-id', ownerId, '--email', ownerEmail, '--password', password, '--name', 'Centre temporaire', '-R']);
  cli(['users', 'create', '--user-id', outsiderId, '--email', outsiderEmail, '--password', password, '--name', 'Utilisateur extérieur', '-R']);
  ownerSession = cli(['users', 'create-session', '--user-id', ownerId, '--show-secrets', '-R']);
  outsiderSession = cli(['users', 'create-session', '--user-id', outsiderId, '--show-secrets', '-R']);

  const ownerClient = sessionClient(ownerSession.secret);
  const outsiderClient = sessionClient(outsiderSession.secret);
  const ownerAccount = new Account(ownerClient);
  ownerTeams = new Teams(ownerClient);
  ownerTables = new TablesDB(ownerClient);
  const outsiderTables = new TablesDB(outsiderClient);

  const owner = await ownerAccount.get();
  if (owner.$id !== ownerId) throw new Error('La session propriétaire ne correspond pas au compte temporaire.');

  const team = await ownerTeams.create({ teamId: ID.unique(), name: 'Centre temporaire', roles: ['owner', 'yc-admin'] });
  teamId = team.$id;
  const now = new Date().toISOString();
  const activeSpace = await ownerTables.createRow({
    databaseId,
    tableId,
    rowId: ID.unique(),
    data: {
      ownerId,
      teamId,
      name: 'Centre temporaire',
      publicName: 'Centre temporaire',
      email: '',
      phone: '',
      company: '',
      vat: '',
      address: '',
      postal: '',
      city: '',
      country: '',
      language: 'Français',
      timezone: 'Europe/Brussels',
      openStart: '',
      openEnd: '',
      openingDays: [],
      status: 'active',
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    permissions: [Permission.read(Role.user(ownerId)), Permission.read(Role.team(teamId)), Permission.update(Role.user(ownerId)), Permission.delete(Role.user(ownerId))],
  });
  rowId = activeSpace.$id;
  if (activeSpace.status !== 'active' || activeSpace.email !== '') throw new Error('L’espace actif incomplet n’a pas été créé correctement.');

  const outsiderRows = await outsiderTables.listRows({ databaseId, tableId, queries: [Query.equal('ownerId', [ownerId]), Query.limit(1)] });
  if (outsiderRows.rows?.length) throw new Error('Un utilisateur extérieur peut voir le centre en brouillon.');
  let directReadBlocked = false;
  try { await outsiderTables.getRow({ databaseId, tableId, rowId }); } catch { directReadBlocked = true; }
  if (!directReadBlocked) throw new Error('La lecture directe du centre par un utilisateur extérieur est autorisée.');

  const updatedAt = new Date().toISOString();
  const completedProfile = await ownerTables.updateRow({
    databaseId,
    tableId,
    rowId,
    data: {
      name: 'Centre administratif temporaire',
      publicName: 'Centre public temporaire',
      email: ownerEmail,
      phone: '+32 81 00 00 00',
      company: 'Centre temporaire SRL',
      vat: 'BE 0123.456.789',
      website: 'https://centre-temporaire.example',
      address: 'Adresse technique',
      postal: '5000',
      city: 'Namur',
      country: 'Belgique',
      openStart: '08:00',
      openEnd: '20:00',
      openingDays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'],
      updatedAt,
    },
  });
  if (completedProfile.status !== 'active' || completedProfile.city !== 'Namur' || completedProfile.publicName !== 'Centre public temporaire' || completedProfile.company !== 'Centre temporaire SRL') throw new Error('Le profil administratif du centre n’est pas complétable après sa création.');

  const clearedOptionalField = await ownerTables.updateRow({
    databaseId,
    tableId,
    rowId,
    data: { website: '', updatedAt: new Date().toISOString() },
  });
  if (clearedOptionalField.website !== '') throw new Error('Un champ administratif facultatif ne peut pas être effacé.');

  result = { status: 'ok', activeSpaceCreatedFromCredentials: true, administrativeIdentityPersisted: true, optionalFieldsClearable: true, profileCompletableLater: true, outsiderHidden: true, directReadBlocked };
} finally {
  if (rowId && ownerTables) {
    try { await ownerTables.deleteRow({ databaseId, tableId, rowId }); } catch { cleanupErrors.push('row'); }
  }
  if (teamId && ownerTeams) {
    try { await ownerTeams.delete({ teamId }); } catch { cleanupErrors.push('team'); }
  }
  for (const userId of [ownerId, outsiderId]) {
    try { cli(['users', 'delete', '--user-id', userId, '--force', '-R']); } catch { cleanupErrors.push(userId); }
  }
}

if (cleanupErrors.length) throw new Error(`Nettoyage incomplet des données temporaires : ${cleanupErrors.join(', ')}.`);
console.log(JSON.stringify({ ...result, temporaryDataRemovedAfterTest: true }));
