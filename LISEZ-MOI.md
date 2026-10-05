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

## Ajouter la clé Aviationstack (statut de vol en temps réel)

Cette clé **ne va jamais dans le dépôt GitHub** — elle est injectée directement à la compilation par Expo, à partir d'une variable configurée sur leur tableau de bord.

1. Créez un compte gratuit sur [aviationstack.com/signup/free](https://aviationstack.com/signup/free) (aucune carte bancaire), copiez votre clé d'accès (Access Key).
2. Allez sur [expo.dev](https://expo.dev), ouvrez votre projet `compagnon-de-voyage`.
3. Dans le menu du projet, cherchez **Environment variables** (ou "Variables d'environnement").
4. **Create a variable** (ou équivalent) :
   - **Name** : `EXPO_PUBLIC_AVIATIONSTACK_API_KEY` (exactement ce nom, avec le préfixe `EXPO_PUBLIC_` — c'est ce qui permet à Expo de l'injecter dans l'app au moment de la compilation)
   - **Value** : votre clé Aviationstack
   - **Visibility** : `Sensitive` (chiffrée, jamais affichée dans les logs)
   - **Environment** : `preview` (doit correspondre au profil utilisé dans `eas.json`)
5. Enregistrez, puis relancez une compilation (**Actions → Build Android APK (EAS) → Run workflow**).

Une fois fait, plus rien à taper dans l'app — le statut de vol en temps réel apparaît automatiquement sur les jours marqués "vol", si Aviationstack a l'information pour ce vol précis.


## Mises à jour sans nouveau build

Depuis le build qui inclut `expo-updates`, un changement de code JavaScript
(écrans, textes, calculs) peut arriver sur le téléphone **sans compiler de
nouvel APK** et sans consommer de crédits de build.

**Publier :** onglet **Actions** du dépôt → **Publier une mise à jour (sans
nouveau build)** → **Run workflow** → écrivez une courte description → **Run**.

**Sur le téléphone :** l'application cherche la mise à jour à son ouverture, la
télécharge, et l'applique au démarrage suivant. Une bannière « Mise à jour
prête » apparaît sur l'accueil, avec un bouton **Redémarrer**. On peut aussi
aller dans **Réglages → Mise à jour → Rechercher une mise à jour**.

**Quand il faut quand même un nouvel APK :** dès qu'on ajoute un module Expo,
une permission, un plugin ou une icône. Dans ce cas, changez aussi `"version"`
dans `app.json` (par exemple `1.0.0` → `1.1.0`) : les mises à jour ne sont
envoyées qu'aux APK de la même version, ce qui évite qu'un ancien APK reçoive
du code qu'il ne sait pas exécuter.

**Clés intégrées :** la mise à jour reprend les variables EAS de l'environnement
`preview` (celles de l'étape précédente : `EXPO_PUBLIC_AVIATIONSTACK_API_KEY`,
`EXPO_PUBLIC_UNSPLASH_ACCESS_KEY`), comme le fait le build : rien de plus à faire.

## Envoyer un lien ou un lieu vers l'app (Partager)

Depuis TikTok, YouTube, Google Maps ou le navigateur : **Partager → Compagnon de
voyage**. L'app demande pour quel voyage (une seule question s'il y en a
plusieurs), puis ouvre l'import d'idées avec le lien ou le texte déjà en place :
il ne reste qu'à appuyer sur **Analyser** et à cocher les lieux reconnus.

Cette fonction ajoute un module natif : elle demande **un nouvel APK** (la
version de l'app est passée à `1.1.0` pour cette raison). Les mises à jour
publiées avec cette version ne vont qu'aux APK `1.1.0` ; l'ancien APK continue de
recevoir celles de la version `1.0.0`.

## Vérification avant chaque build

Le workflow de build commence par vérifier que le code compile
(`expo export`). Si ce n'est pas le cas, il s'arrête **avant** d'appeler EAS :
aucun crédit de build consommé. Le même contrôle tourne sur chaque proposition
de fusion vers `main` (workflow « Vérification du code »).
