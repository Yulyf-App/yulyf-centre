# YulyfCentre

Application web de YulyfCentre pour les centres multidisciplinaires.

Les couches fonctionnelles actuelles permettent de créer immédiatement un espace centre actif avec un compte administrateur, puis de compléter séparément son identité administrative, son nom public, ses coordonnées, son logo, ses différents lieux et leurs horaires dans l’environnement Appwrite européen. Les tables YulyfCentre utilisent la sécurité par ligne et n’enregistrent aucune donnée médicale.

Chaque centre possède une équipe Appwrite. Le propriétaire peut inviter une personne, choisir un rôle puis régler chaque onglet sur `modifier`, `consulter` ou `masqué`. Ces droits sont stockés dans l’appartenance Appwrite, et non dans le navigateur. L’invitation rattache uniquement la personne au centre concerné.

Les autres écrans restent des aperçus utilisant uniquement des données fictives et les comptes explicitement dédiés aux tests (`Praticien technique C` et `Patient technique C`).

Le contenu publié se trouve dans `dist/`.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
```
