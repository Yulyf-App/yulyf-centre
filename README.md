# YulyfCentre

Application web de YulyfCentre pour les centres multidisciplinaires.

La première couche fonctionnelle permet de créer un compte administrateur, enregistrer l’identité et les horaires d’un centre dans l’environnement Appwrite européen dédié `yulyf-centre`, conserver un brouillon puis activer l’espace. La table `centres` utilise la sécurité par ligne et n’enregistre aucune donnée médicale.

Les autres écrans restent des aperçus utilisant uniquement des données fictives et les comptes explicitement dédiés aux tests (`Praticien technique C` et `Patient technique C`).

Le contenu publié se trouve dans `dist/`.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
```
