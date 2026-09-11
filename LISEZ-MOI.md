# Compagnon de voyage (React Native) — compiler l'APK depuis votre tablette

M�me principe que pour la version Capacitor : tout se passe dans le navigateur,
GitHub + Expo compilent l'app à votre place sur leurs serveurs.

**Différence à savoir avant de commencer** : cette fois il faut **deux comptes**
au lieu d'un — GitHub (que vous avez déjà) **et** Expo (nouveau, gratuit).

## Étape 1 — Créer un compte Expo

Allez sur [expo.dev](https://expo.dev), créez un compte gratuit.

Une fois connecté, allez dans **Account settings → Access tokens** (ou
"Personal access tokens"), et créez un nouveau token. **Copiez-le tout de
suite** — il ne sera plus jamais réaffiché après.

## Étape 2 — Créer le dépôt GitHub

Comme pour Capacitor : **New repository**, nom au choix (ex :
`compagnon-voyage-rn`), **Public**, ne cochez rien d'autre, **Create**.

## Étape 3 — Ajouter le token Expo comme secret du dépôt

1. Sur la page de votre nouveau dépôt, allez dans **Settings** (onglet en
   haut, celui du dépôt — pas celui de votre profil)
2. Dans le menu de gauche : **Secrets and variables → Actions**
3. Cliquez **New repository secret**
4. Nom : `EXPO_TOKEN` (exactement comme ça, en majuscules)
5. Valeur : collez le token copié à l'étape 1
6. **Add secret**

Sans ça, la compilation ne pourra pas s'authentifier auprès d'Expo et échouera.

## Étape 4 — Envoyer les fichiers

M�me méthode que pour Capacitor (voir ce guide-là si besoin de détails sur le
glisser-déposer) :

**Paquet 1** — à la racine du dépôt, uploadez : `package.json`, `app.json`,
`eas.json`, `index.js`, `App.js`

**Paquet 2** — le dossier `assets` en entier (6 images) : uploadez chaque
fichier avec son chemin complet, ex. `assets/icon.png`

**Paquet 3** — le dossier `lib` en entier (8 fichiers) : `lib/theme.js`,
`lib/dates.js`, `lib/budget.js`, `lib/script.js`, `lib/constants.js`,
`lib/storage.js`, `lib/notifications.js`, `lib/trips.js`

**Paquet 4** — le dossier `screens` en entier (4 fichiers) :
`screens/HomeScreen.js`, `screens/OnboardingScreen.js`,
`screens/TripScreen.js`, `screens/DayDetailScreen.js`

**Paquet 5** — le fichier de workflow, avec son chemin complet :
`.github/workflows/build-android.yml`

Committez à chaque paquet.

## Étape 5 — Suivre la compilation

Onglet **Actions** de votre dépôt, comme pour Capacitor. Cette fois ça prend
un peu plus longtemps (10 à 20 minutes, EAS Build est un peu plus lent que la
compilation Capacitor classique).

**Honnêteté avant de commencer** : ce pipeline est plus complexe que celui de
Capacitor (plus d'étapes, plus de comptes, extraction du lien de l'APK depuis
la réponse d'EAS) et je n'ai pas pu le tester en conditions réelles de bout en
bout depuis mon environnement. S'il échoue, ouvrez l'exécution en échec dans
Actions, dépliez l'étape qui a un ❌, et copiez-collez-moi le message
d'erreur — on corrige ensemble.

## Étape 6 — Télécharger et installer

Une fois la coche verte affichée : cliquez sur l'exécution → section
**Artifacts** en bas → `compagnon-voyage-rn-apk` → téléchargez, décompressez,
installez sur votre téléphone comme d'habitude (autoriser l'installation
depuis cette source si demandé).

## Pour les mises à jour suivantes

Remplacez les fichiers modifiés sur GitHub (je vous dirai lesquels à chaque
fois), la compilation se relance automatiquement.
