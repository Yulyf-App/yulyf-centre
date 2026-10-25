import { execFileSync } from 'node:child_process';
import { Account, Client, Query, TablesDB, Teams } from 'appwrite';

const endpoint = 'https://fra.cloud.appwrite.io/v1';
const projectId = '6aa80924002a9a6b3cf7';
const databaseId = 'lyc';
const tableId = 'yulyf_centres';
const profilesTableId = 'yulyf_centre_member_profiles';
const teamId = 'centre-technique-z';
const memberUserId = '7f350333-4098-4217-8db2-e0323cbde651';
let session;

function cli(args) {
  const command = process.platform === 'win32' ? process.env.ComSpec : 'appwrite';
  const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'appwrite', ...args] : args;
  const output = execFileSync(command, commandArgs, { cwd: new URL('..', import.meta.url), encoding: 'utf8', windowsHide: true });
  return JSON.parse(output);
}

try {
  session = cli(['users', 'create-session', '--user-id', memberUserId, '--show-secrets', '-R']);
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setSession(session.secret);
  const account = new Account(client);
  const teams = new Teams(client);
  const tables = new TablesDB(client);

  const user = await account.get();
  if (user.$id !== memberUserId) throw new Error('La session technique ne correspond pas au praticien attendu.');

  const joinedTeams = await teams.list({ queries: [Query.equal('$id', [teamId]), Query.limit(1)] });
  if (!joinedTeams.teams?.some(team => team.$id === teamId)) throw new Error('Le praticien ne retrouve pas son équipe centre.');

  const memberships = await teams.listMemberships({ teamId, queries: [Query.equal('userId', [memberUserId]), Query.limit(1)] });
  const membership = memberships.memberships?.[0];
  if (!membership?.roles?.includes('yc-praticien') || !membership.roles.includes('p-agenda-edit')) throw new Error('Les droits du praticien ne sont pas enregistrés.');

  const centres = await tables.listRows({ databaseId, tableId, queries: [Query.equal('teamId', [teamId]), Query.limit(1)] });
  const centre = centres.rows?.[0];
  if (!centre || centre.$id !== 'centre-technique-z') throw new Error('Le praticien ne retrouve pas le bon centre.');
  const privateProfiles = await tables.listRows({ databaseId, tableId: profilesTableId, queries: [Query.equal('teamId', [teamId]), Query.limit(10)] });
  if (privateProfiles.rows?.length) throw new Error('Le praticien peut lire le registre administratif des accès.');

  let centreUpdateBlocked = false;
  let roleEscalationBlocked = false;
  try {
    await tables.updateRow({ databaseId, tableId, rowId: centre.$id, data: { publicName: `${centre.publicName} [contrôle interdit]` } });
    await tables.updateRow({ databaseId, tableId, rowId: centre.$id, data: { publicName: centre.publicName } });
  } catch { centreUpdateBlocked = true; }
  try { await teams.updateMembership({ teamId, membershipId: membership.$id, roles: ['owner'] }); } catch { roleEscalationBlocked = true; }
  if (!centreUpdateBlocked || !roleEscalationBlocked) throw new Error(`Protection incomplète (centre=${centreUpdateBlocked}, rôles=${roleEscalationBlocked}).`);

  console.log(JSON.stringify({ status: 'ok', member: user.name, centre: centre.name, teamResolved: true, roleResolved: true, memberProfilesHidden: true, centreUpdateBlocked, roleEscalationBlocked }));
} finally {
  if (session?.$id) {
    try { cli(['users', 'delete-session', '--user-id', memberUserId, '--session-id', session.$id, '-R']); } catch {}
  }
}
