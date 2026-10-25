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
- Déploiement actif contrôlé : `6ade2f179ed624afb511`
- Règle de domaine vérifiée : `85550227b5626fd79a788548c73b1ef5`

La première couche fonctionnelle permet de créer un compte centre, d’enregistrer
un brouillon, puis d’activer l’espace. Chaque ligne de centre est protégée par des
permissions Appwrite réservées à son propriétaire authentifié. La table est
isolée des tables historiques `records` et `admin_records` de LYC.

## Ancien aperçu statique

- Projet Appwrite partagé d’aperçus : `69eb57e00020de70ed30`
- Site : `yulyf-centre-preview`
- Domaine : `https://yulyf-centre-preview.appwrite.network/`
- Déploiement historique actif : `6ad9f73e65186cf39978`

Cet ancien aperçu est conservé uniquement comme référence visuelle. Le
développement fonctionnel se poursuit sur le site YulyfCentre du projet LYC.
