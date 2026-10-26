import { execFileSync } from 'node:child_process';
import { Account, Client, ID, Permission, Query, Role, TablesDB, Teams } from 'appwrite';

const endpoint = 'https://fra.cloud.appwrite.io/v1';
const projectId = '6aa80924002a9a6b3cf7';
const databaseId = 'lyc';
const centresTableId = 'yulyf_centres';
const locationsTableId = 'yulyf_centre_locations';
const suffix = Date.now().toString(36);
const ownerId = `ycl-owner-${suffix}`;
const outsiderId = `ycl-out-${suffix}`;
const password = `YcLoc-${suffix}-A1!`;
let ownerTeams;
let ownerTables;
let centreId;
let teamId;
const locationIds = [];
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

try {
  cli(['users', 'create', '--user-id', ownerId, '--email', `${ownerId}@example.com`, '--password', password, '--name', 'Propriétaire lieux', '-R']);
  cli(['users', 'create', '--user-id', outsiderId, '--email', `${outsiderId}@example.com`, '--password', password, '--name', 'Utilisateur extérieur', '-R']);
  const ownerSession = cli(['users', 'create-session', '--user-id', ownerId, '--show-secrets', '-R']);
  const outsiderSession = cli(['users', 'create-session', '--user-id', outsiderId, '--show-secrets', '-R']);
  const ownerClient = sessionClient(ownerSession.secret);
  const outsiderClient = sessionClient(outsiderSession.secret);
  ownerTeams = new Teams(ownerClient);
  ownerTables = new TablesDB(ownerClient);
  const outsiderTables = new TablesDB(outsiderClient);
  const owner = await new Account(ownerClient).get();

  const team = await ownerTeams.create({ teamId: ID.unique(), name: 'Centre lieux temporaire', roles: ['owner', 'yc-admin'] });
  teamId = team.$id;
  const now = new Date().toISOString();
  const centre = await ownerTables.createRow({
    databaseId,
    tableId: centresTableId,
    rowId: ID.unique(),
    data: { ownerId: owner.$id, teamId, name: 'Centre lieux temporaire', publicName: 'Centre lieux temporaire', email: '', phone: '', company: '', vat: '', address: '', postal: '', city: '', country: '', language: 'Français', timezone: 'Europe/Brussels', openStart: '', openEnd: '', openingDays: [], status: 'active', activatedAt: now, createdAt: now, updatedAt: now },
    permissions: [Permission.read(Role.user(owner.$id)), Permission.read(Role.team(teamId)), Permission.update(Role.user(owner.$id)), Permission.delete(Role.user(owner.$id))],
  });
  centreId = centre.$id;
  const permissions = [Permission.read(Role.user(owner.$id)), Permission.read(Role.team(teamId)), Permission.update(Role.user(owner.$id)), Permission.update(Role.team(teamId, 'yc-admin')), Permission.delete(Role.user(owner.$id)), Permission.delete(Role.team(teamId, 'yc-admin'))];
  const first = await ownerTables.createRow({ databaseId, tableId: locationsTableId, rowId: ID.unique(), data: { centreId, teamId, name: 'Site principal', address: 'Rue du Test 1', postal: '1000', city: 'Bruxelles', country: 'Belgique', roomCount: 4, openStart: '08:00', openEnd: '18:00', openingDays: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'], isPrimary: true, createdAt: now, updatedAt: now }, permissions });
  locationIds.push(first.$id);
  const second = await ownerTables.createRow({ databaseId, tableId: locationsTableId, rowId: ID.unique(), data: { centreId, teamId, name: 'Site secondaire', address: 'Rue du Test 2', postal: '5000', city: 'Namur', country: 'Belgique', roomCount: 2, openStart: '09:00', openEnd: '17:00', openingDays: ['Mar', 'Jeu'], isPrimary: false, createdAt: now, updatedAt: now }, permissions });
  locationIds.push(second.$id);

  await ownerTables.updateRow({ databaseId, tableId: locationsTableId, rowId: first.$id, data: { isPrimary: false, updatedAt: new Date().toISOString() } });
  await ownerTables.updateRow({ databaseId, tableId: locationsTableId, rowId: second.$id, data: { isPrimary: true, updatedAt: new Date().toISOString() } });
  const ownerRows = await ownerTables.listRows({ databaseId, tableId: locationsTableId, queries: [Query.equal('centreId', [centreId]), Query.limit(100)] });
  if (ownerRows.rows.length !== 2 || ownerRows.rows.filter(item => item.isPrimary).length !== 1) throw new Error('Les lieux multiples ou le lieu principal ne sont pas correctement enregistrés.');

  const outsiderRows = await outsiderTables.listRows({ databaseId, tableId: locationsTableId, queries: [Query.equal('centreId', [centreId]), Query.limit(100)] });
  if (outsiderRows.rows.length) throw new Error('Un utilisateur extérieur peut lister les lieux du centre.');
  let directReadBlocked = false;
  let updateBlocked = false;
  try { await outsiderTables.getRow({ databaseId, tableId: locationsTableId, rowId: first.$id }); } catch { directReadBlocked = true; }
  try { await outsiderTables.updateRow({ databaseId, tableId: locationsTableId, rowId: first.$id, data: { name: 'Interdit' } }); } catch { updateBlocked = true; }
  if (!directReadBlocked || !updateBlocked) throw new Error('Les permissions des lieux ne bloquent pas un utilisateur extérieur.');

  console.log(JSON.stringify({ status: 'ok', multipleLocationsPersisted: true, singlePrimaryLocation: true, outsiderHidden: true, directReadBlocked, updateBlocked }));
} finally {
  if (ownerTables) {
    for (const rowId of locationIds.reverse()) {
      try { await ownerTables.deleteRow({ databaseId, tableId: locationsTableId, rowId }); } catch { cleanupErrors.push(rowId); }
    }
    if (centreId) {
      try { await ownerTables.deleteRow({ databaseId, tableId: centresTableId, rowId: centreId }); } catch { cleanupErrors.push(centreId); }
    }
  }
  if (teamId && ownerTeams) {
    try { await ownerTeams.delete({ teamId }); } catch { cleanupErrors.push(teamId); }
  }
  for (const userId of [ownerId, outsiderId]) {
    try { cli(['users', 'delete', '--user-id', userId, '--force', '-R']); } catch { cleanupErrors.push(userId); }
  }
}

if (cleanupErrors.length) throw new Error(`Nettoyage incomplet des données temporaires : ${cleanupErrors.join(', ')}.`);
