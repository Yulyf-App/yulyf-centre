# Déploiement Appwrite — YulyfCentre

## Environnement fonctionnel dans LYC

- Projet Appwrite LYC : `6aa80924002a9a6b3cf7`
- Nom affiché actuellement dans Appwrite : `My first project`
- Région : `fra`
- Base TablesDB : `lyc`
- Table dédiée de la première couche : `yulyf_centres`
- Site Appwrite : `yulyf-centre`
- Domaine stable : `https://yulyf-centre.appwrite.network/`
- Lien de suivi GitHub Pages : `https://yulyf-app.github.io/yulyf-centre/`
- Répertoire publié : `dist/`
- Déploiement : activation automatique à la fin du build (`--activate`)
- Déploiement actif contrôlé : `6ade3687407daabdda5e`
- Règle de domaine vérifiée : `85550227b5626fd79a788548c73b1ef5`

La première couche fonctionnelle permet de créer un compte centre, d’enregistrer
un brouillon, puis d’activer l’espace. Chaque ligne de centre est protégée par des
permissions Appwrite réservées à son propriétaire authentifié. La table est
isolée des tables historiques `records` et `admin_records` de LYC.

## Couche logo et identité visuelle

- Bucket : `yulyf_centre_branding`
- Taille maximale : 150 Ko
- Formats : PNG, JPG, JPEG et WEBP
- Chiffrement, antivirus et suppression des métadonnées activés
- Remplacement et suppression réservés au propriétaire du centre
- Lecture publique des fichiers, car les logos identifient publiquement les
  centre dans son portail, ses e-mails administratifs et ses factures
- Champs centre : `logoFileId` et `brandUpdatedAt`
- Remplacement transactionnel : le nouveau fichier est rattaché avant que
  l’ancien soit supprimé ; un échec de rattachement supprime le nouveau fichier

## Couche accès et rôles

- Une équipe Appwrite par centre, référencée par `yulyf_centres.teamId`
- Lecture du centre accordée uniquement au propriétaire et à son équipe
- Rôle fonctionnel et droits par onglet stockés dans l’appartenance Appwrite
- Trois niveaux par onglet : interaction, lecture seule ou invisible
- Invitation réelle par e-mail avec retour vers le lien stable YulyfCentre
- Table `yulyf_centre_member_profiles` : identité administrative de l’accès,
  lisible et modifiable uniquement par le propriétaire du centre
- L’autorisation ne dépend jamais de cette table administrative : Appwrite Teams
  reste la source de vérité des droits
- Test technique : Praticien technique C retrouve son centre et son rôle, mais
  ne peut ni modifier le centre, ni lire le registre des accès, ni s’auto-promouvoir

## Ancien aperçu statique

- Projet Appwrite partagé d’aperçus : `69eb57e00020de70ed30`
- Site : `yulyf-centre-preview`
- Domaine : `https://yulyf-centre-preview.appwrite.network/`
- Déploiement historique actif : `6ad9f73e65186cf39978`

Cet ancien aperçu est conservé uniquement comme référence visuelle. Le
développement fonctionnel se poursuit sur le site YulyfCentre du projet LYC.
