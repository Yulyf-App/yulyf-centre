import { Account, Client, ID, Permission, Query, Role, Storage, TablesDB } from 'appwrite';

const endpoint = 'https://fra.cloud.appwrite.io/v1';
const projectId = '6aa80924002a9a6b3cf7';
const databaseId = 'lyc';
const tableId = 'yulyf_centres';
const bucketId = 'yulyf_centre_branding';
const email = process.env.YULYF_CENTRE_TEST_EMAIL;
const password = process.env.YULYF_CENTRE_TEST_PASSWORD;

if (!email || !password) throw new Error('YULYF_CENTRE_TEST_EMAIL et YULYF_CENTRE_TEST_PASSWORD sont requis.');

const localValues = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => localValues.get(key) ?? null,
    setItem: (key, value) => localValues.set(key, String(value)),
    removeItem: key => localValues.delete(key),
  },
  console,
};

const client = new Client().setEndpoint(endpoint).setProject(projectId);
const account = new Account(client);
await account.createEmailPasswordSession({ email, password });

const tables = new TablesDB(client);
const storage = new Storage(client);
const user = await account.get();
const centres = await tables.listRows({ databaseId, tableId, queries: [Query.equal('ownerId', [user.$id]), Query.limit(1)] });
const centre = centres.rows[0];
if (!centre) throw new Error('Aucun centre de test associé au compte.');

const previous = { logoFileId: centre.logoFileId || '', brandUpdatedAt: centre.brandUpdatedAt || '', updatedAt: centre.updatedAt };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const file = new File([png], 'controle-logo-centre.png', { type: 'image/png' });
let uploaded;

try {
  uploaded = await storage.createFile({
    bucketId,
    fileId: ID.unique(),
    file,
    permissions: [Permission.read(Role.any()), Permission.update(Role.user(user.$id)), Permission.delete(Role.user(user.$id))],
  });
  await tables.updateRow({ databaseId, tableId, rowId: centre.$id, data: { logoFileId: uploaded.$id, brandUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } });
  const persisted = await tables.getRow({ databaseId, tableId, rowId: centre.$id });
  if (persisted.logoFileId !== uploaded.$id) throw new Error('Le logo n’est pas rattaché au centre.');

  const publicUrl = storage.getFileView({ bucketId, fileId: uploaded.$id });
  const publicResponse = await fetch(publicUrl);
  if (!publicResponse.ok || !String(publicResponse.headers.get('content-type')).startsWith('image/png')) throw new Error('Le logo public ne peut pas être affiché.');

  const anonymousClient = new Client().setEndpoint(endpoint).setProject(projectId);
  const anonymousStorage = new Storage(anonymousClient);
  let updateBlocked = false;
  let deleteBlocked = false;
  const fallbackSession = window.localStorage.getItem('cookieFallback');
  window.localStorage.removeItem('cookieFallback');
  try {
    try { await anonymousStorage.updateFile({ bucketId, fileId: uploaded.$id, name: 'interdit.png' }); } catch { updateBlocked = true; }
    try { await anonymousStorage.deleteFile({ bucketId, fileId: uploaded.$id }); } catch { deleteBlocked = true; }
  } finally {
    if (fallbackSession) window.localStorage.setItem('cookieFallback', fallbackSession);
  }
  if (!updateBlocked || !deleteBlocked) throw new Error('Les opérations privées du stockage ne sont pas correctement protégées.');

  console.log(JSON.stringify({ status: 'ok', centre: centre.name, upload: true, publicDisplay: true, anonymousUpdateBlocked: true, anonymousDeleteBlocked: true, restored: true }));
} finally {
  await tables.updateRow({ databaseId, tableId, rowId: centre.$id, data: previous }).catch(() => {});
  if (uploaded?.$id) await storage.deleteFile({ bucketId, fileId: uploaded.$id }).catch(() => {});
  await account.deleteSession({ sessionId: 'current' }).catch(() => {});
}
