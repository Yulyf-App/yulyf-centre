import { execFileSync } from 'node:child_process';
import { Client, Functions, Query, TablesDB } from 'appwrite';

const endpoint = 'https://fra.cloud.appwrite.io/v1';
const projectId = '6aa80924002a9a6b3cf7';
const databaseId = 'lyc';
const centreId = 'centre-technique-z';
const teamId = 'centre-technique-z';
const ownerId = 'centre-technique-z-admin';
const practitionerId = '7f350333-4098-4217-8db2-e0323cbde651';
const practitionerEmail = 'auditstructu@outlook.com';
const gatewayId = 'yulyf-centre-practitioner-gateway';
const relationsTableId = 'yulyf_centre_practitioners';
const recordsTableId = 'records';
const outsiderId = `yc-pract-out-${Date.now().toString(36)}`;
const password = `Yc-Pract-${Date.now().toString(36)}-A1!`;

function cli(args) {
  const command = process.platform === 'win32' ? process.execPath : 'appwrite';
  const commandArgs = process.platform === 'win32' ? [`${process.env.APPDATA}\\npm\\node_modules\\appwrite-cli\\run.js`, ...args] : args;
  const output = execFileSync(command, commandArgs, { cwd: new URL('..', import.meta.url), encoding: 'utf8', windowsHide: true });
  return output.trim() ? JSON.parse(output) : {};
}

function services(secret) {
  const client = new Client().setEndpoint(endpoint).setProject(projectId).setSession(secret);
  return { functions: new Functions(client), tables: new TablesDB(client) };
}

async function gateway(functions, action, data = {}) {
  let execution = await functions.createExecution({ functionId: gatewayId, body: JSON.stringify({ action, centreId, teamId, data }), async: action !== 'directory', path: '/', method: 'POST', headers: { 'content-type': 'application/json' } });
  const startedAt = Date.now();
  while (!['completed', 'failed'].includes(execution.status)) {
    if (Date.now() - startedAt > 180000) throw new Error(`Délai dépassé pour l’action ${action}.`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    execution = await functions.getExecution({ functionId: gatewayId, executionId: execution.$id });
  }
  return { status: execution.responseStatusCode, payload: JSON.parse(execution.responseBody || '{}') };
}

let outsiderCreated = false;
try {
  const ownerSession = cli(['users', 'create-session', '--user-id', ownerId, '--show-secrets', '-R']);
  const owner = services(ownerSession.secret);
  let directory = await gateway(owner.functions, 'directory');
  if (directory.status !== 200) throw new Error(`Annuaire refusé : ${directory.payload.error || directory.status}`);
  const practitioner = directory.payload.directory?.find(item => item.id === practitionerId);
  if (!practitioner) throw new Error('Praticien technique C absent de l’annuaire Yulyf partagé.');
  if (practitioner.email !== practitionerEmail) throw new Error(`Adresse technique incorrecte : ${practitioner.email || 'vide'}.`);

  let relation = directory.payload.relations?.find(item => item.practitionerUserId === practitionerId);
  if (!relation) {
    const invited = await gateway(owner.functions, 'invite', { practitionerUserId: practitioner.id, practitionerNumber: practitioner.practitionerNumber, name: practitioner.name, email: practitioner.email, activity: practitioner.activity, returnUrl: 'https://yulyf-app.github.io/yulyf-centre/' });
    if (invited.status !== 200) throw new Error(`Invitation refusée : ${invited.payload.error || invited.status}`);
  }
  const synchronized = await gateway(owner.functions, 'sync');
  if (synchronized.status !== 200) throw new Error(`Synchronisation refusée : ${synchronized.payload.error || synchronized.status}`);
  const persistedRelations = await owner.tables.listRows({ databaseId, tableId: relationsTableId, queries: [Query.equal('centreId', [centreId])] });
  relation = persistedRelations.rows.find(item => item.practitionerUserId === practitionerId);
  if (!relation || relation.status !== 'active' || relation.accountMode !== 'personal' || relation.billedBy !== 'practitioner') throw new Error('La relation bidirectionnelle du compte Yulyf existant est incohérente.');

  const profileRow = cli(['tablesdb', 'get-row', '--database-id', databaseId, '--table-id', recordsTableId, '--row-id', `profile-${practitionerId.slice(0, 28)}`, '-R']);
  const profile = JSON.parse(profileRow.payload || '{}');
  const linkedLocation = profile.workLocations?.find(item => item.connectedCenterId === centreId);
  if (!linkedLocation || linkedLocation.type !== 'centre') throw new Error('Le Centre technique Z n’apparaît pas dans les lieux du praticien technique C.');

  cli(['users', 'create', '--user-id', outsiderId, '--email', `${outsiderId}@example.com`, '--password', password, '--name', 'Test extérieur', '-R']);
  outsiderCreated = true;
  const outsiderSession = cli(['users', 'create-session', '--user-id', outsiderId, '--show-secrets', '-R']);
  const outsiderAttempt = await gateway(services(outsiderSession.secret).functions, 'directory');
  if (outsiderAttempt.status !== 403) throw new Error('Un utilisateur extérieur peut consulter l’annuaire du centre.');

  const visibleRelations = await owner.tables.listRows({ databaseId, tableId: relationsTableId, queries: [Query.equal('centreId', [centreId])] });
  const serialized = JSON.stringify(visibleRelations.rows);
  if (/diagnostic|analyse|medical|history|notes/i.test(serialized)) throw new Error('Une donnée sensible a été copiée dans la relation centre–praticien.');
  console.log(JSON.stringify({ status: 'ok', directoryUsesAccountEmail: true, technicalPractitionerLinked: true, bidirectionalLocationLinked: true, existingAccountNotCentreBilled: true, outsiderBlocked: true, noPatientOrClinicalData: true }));
} finally {
  if (outsiderCreated) cli(['users', 'delete', '--user-id', outsiderId, '--force', '-R']);
}
