# YulyfCentre

Application web de YulyfCentre pour les centres multidisciplinaires.

Les couches fonctionnelles actuelles permettent de créer un compte administrateur, enregistrer l’identité, les horaires et le logo d’un centre dans l’environnement Appwrite européen, conserver un brouillon puis activer l’espace. La table `yulyf_centres` utilise la sécurité par ligne et n’enregistre aucune donnée médicale.

Chaque centre possède une équipe Appwrite. Le propriétaire peut inviter une personne, choisir un rôle puis régler chaque onglet sur `modifier`, `consulter` ou `masqué`. Ces droits sont stockés dans l’appartenance Appwrite, et non dans le navigateur. L’invitation rattache uniquement la personne au centre concerné.

Les autres écrans restent des aperçus utilisant uniquement des données fictives et les comptes explicitement dédiés aux tests (`Praticien technique C` et `Patient technique C`).

Le contenu publié se trouve dans `dist/`.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
```
