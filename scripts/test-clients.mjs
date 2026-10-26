import { execFileSync } from 'node:child_process';
import { Client, Functions, Permission, Query, Role, TablesDB, Teams } from 'appwrite';

const endpoint = 'https://fra.cloud.appwrite.io/v1';
const projectId = '6aa80924002a9a6b3cf7';
const databaseId = 'lyc';
const centresTableId = 'yulyf_centres';
const clientsTableId = 'yulyf_centre_clients';
const linksTableId = 'yulyf_centre_client_links';
const gatewayId = 'yulyf-centre-client-gateway';
const suffix = Date.now().toString(36);
const ownerId = `ycc-owner-${suffix}`;
const outsiderId = `ycc-out-${suffix}`;
const centreId = `ycc-centre-${suffix}`;
const password = `YcClient-${suffix}-A1!`;
const cleanupErrors = [];
let ownerTables, ownerTeams, teamId, createdClientId, createdLinkId;

function cli(args) {
  const command = process.platform === 'win32' ? process.execPath : 'appwrite';
  const commandArgs = process.platform === 'win32' ? [`${process.env.APPDATA}\\npm\\node_modules\\appwrite-cli\\run.js`, ...args] : args;
  const output = execFileSync(command, commandArgs, { cwd: new URL('..', import.meta.url), encoding: 'utf8', windowsHide: true });
  return output.trim() ? JSON.parse(output) : {};
}

function sessionServices(secret) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setSession(secret);
  return { tables: new TablesDB(client), teams: new Teams(client), functions: new Functions(client) };
}

async function gateway(functions, action, centreIdValue, data) {
  const execution = await functions.createExecution({ functionId: gatewayId, body: JSON.stringify({ action, centreId: centreIdValue, data }), async: false, path: '/', method: 'POST', headers: { 'content-type': 'application/json' } });
  return { status: execution.responseStatusCode, payload: JSON.parse(execution.responseBody || '{}') };
}

try {
  cli(['users', 'create', '--user-id', ownerId, '--email', `${ownerId}@example.com`, '--password', password, '--name', 'Propriétaire clients', '-R']);
  cli(['users', 'create', '--user-id', outsiderId, '--email', `${outsiderId}@example.com`, '--password', password, '--name', 'Utilisateur extérieur', '-R']);
  const ownerSession = cli(['users', 'create-session', '--user-id', ownerId, '--show-secrets', '-R']);
  const outsiderSession = cli(['users', 'create-session', '--user-id', outsiderId, '--show-secrets', '-R']);
  const owner = sessionServices(ownerSession.secret), outsider = sessionServices(outsiderSession.secret);
  ownerTables = owner.tables; ownerTeams = owner.teams;
  const team = await ownerTeams.create({ teamId: centreId, name: 'Centre clients temporaire', roles: ['owner', 'yc-admin', 'p-clients-edit'] });
  teamId = team.$id;
  const now = new Date().toISOString();
  await ownerTables.createRow({ databaseId, tableId: centresTableId, rowId: centreId, data: { ownerId, teamId, name: 'Centre clients temporaire', publicName: 'Centre clients temporaire', email: `${ownerId}@example.com`, phone: '', company: '', vat: '', address: '', postal: '', city: '', country: 'Belgique', language: 'Français', timezone: 'Europe/Brussels', openStart: '', openEnd: '', openingDays: [], status: 'active', activatedAt: now, createdAt: now, updatedAt: now }, permissions: [Permission.read(Role.user(ownerId)), Permission.read(Role.team(teamId)), Permission.update(Role.user(ownerId)), Permission.delete(Role.user(ownerId))] });

  const clientInput = { firstName: 'Patient', lastName: 'Technique', email: `${suffix}@example.com`, phone: '', address: '', postal: '', city: '', country: 'Belgique', source: 'technical-test', dedupeKey: `${centreId}|email:${suffix}@example.com` };
  const clientExecution = await gateway(owner.functions, 'createClient', centreId, clientInput);
  if (clientExecution.status !== 201 || !clientExecution.payload.row?.$id) throw new Error(`La passerelle n’a pas créé le client : ${clientExecution.payload.error || clientExecution.status}`);
  createdClientId = clientExecution.payload.row.$id;
  const linkInput = { clientId: createdClientId, practitionerUserId: ownerId, practitionerName: 'Praticien technique', patientReference: 'YUL-2026-487949/P0001', yulyfPatientId: 'technical-patient' };
  const linkExecution = await gateway(owner.functions, 'createLink', centreId, linkInput);
  if (linkExecution.status !== 201 || !linkExecution.payload.row?.$id) throw new Error(`La passerelle n’a pas créé la liaison : ${linkExecution.payload.error || linkExecution.status}`);
  createdLinkId = linkExecution.payload.row.$id;

  const ownerClients = await ownerTables.listRows({ databaseId, tableId: clientsTableId, queries: [Query.equal('centreId', [centreId])] });
  const ownerLinks = await ownerTables.listRows({ databaseId, tableId: linksTableId, queries: [Query.equal('clientId', [createdClientId])] });
  if (ownerClients.rows.length !== 1 || ownerLinks.rows.length !== 1 || ownerLinks.rows[0].patientReference !== 'YUL-2026-487949/P0001') throw new Error('La fiche ou sa référence patient n’est pas persistée correctement.');
  await ownerTables.updateRow({ databaseId, tableId: clientsTableId, rowId: createdClientId, data: { phone: '+32000000000', updatedAt: new Date().toISOString() } });

  const outsiderAttempt = await gateway(outsider.functions, 'createClient', centreId, { ...clientInput, email: `outsider-${suffix}@example.com`, dedupeKey: `${centreId}|email:outsider-${suffix}@example.com` });
  if (outsiderAttempt.status !== 403) throw new Error('La passerelle autorise un utilisateur extérieur à créer un client.');
  const outsiderClients = await outsider.tables.listRows({ databaseId, tableId: clientsTableId, queries: [Query.equal('centreId', [centreId])] });
  const outsiderLinks = await outsider.tables.listRows({ databaseId, tableId: linksTableId, queries: [Query.equal('centreId', [centreId])] });
  let directReadBlocked = false, updateBlocked = false;
  try { await outsider.tables.getRow({ databaseId, tableId: linksTableId, rowId: createdLinkId }); } catch { directReadBlocked = true; }
  try { await outsider.tables.updateRow({ databaseId, tableId: clientsTableId, rowId: createdClientId, data: { lastName: 'Interdit' } }); } catch { updateBlocked = true; }
  if (outsiderClients.rows.length || outsiderLinks.rows.length || !directReadBlocked || !updateBlocked) throw new Error('L’isolation entre centres n’est pas appliquée.');

  const duplicate = await gateway(owner.functions, 'createLink', centreId, linkInput);
  const duplicateBlocked = duplicate.status === 409 || /unique|existe|constraint/i.test(duplicate.payload.error || '');
  if (!duplicateBlocked) throw new Error('Une référence patient identique peut être reliée deux fois au même praticien et centre.');
  const schema = cli(['tablesdb', 'get-table', '--database-id', databaseId, '--table-id', linksTableId, '-R']);
  const forbidden = ['diagnostic', 'notes', 'analysis', 'medical', 'consent'].filter(key => schema.columns.some(column => column.key.toLowerCase().includes(key)));
  if (forbidden.length) throw new Error(`La table de liaison contient des champs sensibles : ${forbidden.join(', ')}.`);
  console.log(JSON.stringify({ status: 'ok', gatewayValidatedMembership: true, administrativeClientPersisted: true, patientReferencePersisted: true, practitionerLinkSeparated: true, duplicateBlocked, outsiderCreationBlocked: true, outsiderHidden: true, directReadBlocked, updateBlocked, noClinicalColumns: true }));
} finally {
  if (ownerTables) {
    for (const [tableId, rowId] of [[linksTableId, createdLinkId], [clientsTableId, createdClientId], [centresTableId, centreId]]) {
      if (!rowId) continue;
      try { await ownerTables.deleteRow({ databaseId, tableId, rowId }); } catch { cleanupErrors.push(rowId); }
    }
  }
  if (teamId && ownerTeams) { try { await ownerTeams.delete({ teamId }); } catch { cleanupErrors.push(teamId); } }
  for (const userId of [ownerId, outsiderId]) {
    try { cli(['users', 'delete', '--user-id', userId, '--force', '-R']); } catch { cleanupErrors.push(userId); }
  }
}

if (cleanupErrors.length) throw new Error(`Nettoyage incomplet : ${cleanupErrors.join(', ')}.`);
