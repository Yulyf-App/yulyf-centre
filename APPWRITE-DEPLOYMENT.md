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
- Déploiement actif contrôlé : `6adf303fdac5368c0ba8`
- Règle de domaine vérifiée : `85550227b5626fd79a788548c73b1ef5`

La première couche fonctionnelle permet de créer un compte centre, d’enregistrer
un brouillon, puis d’activer l’espace. Chaque ligne de centre est protégée par des
permissions Appwrite réservées à son propriétaire authentifié. La table est
isolée des tables historiques `records` et `admin_records` de LYC.

## Couche identité administrative du centre

- Le compte et le centre actif sont créés avant le remplissage du profil.
- Le nom administratif (`name`) reste distinct du nom public (`publicName`).
- Coordonnées persistées : e-mail, téléphone, site internet, adresse, code
  postal, ville, pays, langue et fuseau horaire.
- Identité légale facultative : raison sociale et numéro d’entreprise / TVA.
- Les champs facultatifs peuvent être corrigés ou vidés sans conserver une
  ancienne valeur dans Appwrite.
- La complétion de cette étape exige le nom administratif, le nom public et les
  coordonnées indispensables, mais ne bloque jamais l’accès à l’espace actif.

## Couche lieux et horaires

- Table dédiée : `yulyf_centre_locations`.
- Plusieurs lieux par centre avec nom, adresse complète, pays, nombre de salles,
  jours et heures d’ouverture.
- Colonne `weeklySchedule` : planning JSON détaillé pour les sept jours.
- Chaque jour est activable séparément et possède une première plage obligatoire
  lorsqu’il est ouvert, ainsi qu’une seconde plage facultative (par exemple après
  une fermeture sur le temps de midi).
- Les plages incomplètes, inversées ou qui se chevauchent sont refusées avant
  l’enregistrement.
- Les anciennes données `openingDays`, `openStart` et `openEnd` sont converties
  automatiquement et restent alimentées pour la compatibilité avec l’agenda.
- Un seul lieu principal ; le choix d’un nouveau lieu principal rétrograde
  automatiquement le précédent.
- Lecture réservée au propriétaire et aux membres de l’équipe du centre.
- Modification et suppression réservées au propriétaire et aux membres ayant
  le rôle Appwrite `yc-admin`.
- Les permissions sont rattachées au propriétaire et au rôle, jamais au compte
  personnel de la personne qui crée le lieu.
- Les horaires du lieu principal restent répliqués dans `yulyf_centres` pour la
  compatibilité avec la vue agenda existante.

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

## Couche clients et liaisons Yulyf

- Table `yulyf_centre_clients` : répertoire administratif unique du centre
  (nom, coordonnées et adresse), sans donnée clinique.
- Table `yulyf_centre_client_links` : une liaison séparée par praticien et par
  dossier Yulyf. Un client du centre peut donc être suivi par plusieurs
  praticiens sans fusionner leurs dossiers privés.
- Référence visible fournie par Yulyf.me : `YUL-AAAA-NNNNNN/PNNNN`, par exemple
  `YUL-2026-487949/P0001`. YulyfCentre la consomme mais ne la génère pas.
- Fonction `yulyf-centre-client-gateway` : vérifie côté serveur que l’utilisateur
  appartient au centre et possède le droit de modifier les clients avant toute
  création. Les tables ne sont pas ouvertes globalement aux utilisateurs.
- Les permissions des lignes sont construites côté serveur pour le propriétaire,
  les administrateurs et les rôles clients du centre concerné.
- Import CSV/XLSX analysé localement, limité à 500 lignes et 2 Mo, avec rejet
  des colonnes médicales, des lignes invalides et des doublons avant confirmation.
- Patient technique C est créé dans le répertoire administratif de Centre
  technique Z. Sa liaison à Praticien technique C sera ajoutée dès que son numéro
  patient réel sera disponible dans Yulyf.me.
- Test automatisé : création autorisée pour le propriétaire, refusée pour un
  utilisateur extérieur, isolation lecture/écriture, unicité de la liaison et
  absence de colonnes cliniques.

## Ancien aperçu statique

- Projet Appwrite partagé d’aperçus : `69eb57e00020de70ed30`
- Site : `yulyf-centre-preview`
- Domaine : `https://yulyf-centre-preview.appwrite.network/`
- Déploiement historique actif : `6ad9f73e65186cf39978`

Cet ancien aperçu est conservé uniquement comme référence visuelle. Le
développement fonctionnel se poursuit sur le site YulyfCentre du projet LYC.
