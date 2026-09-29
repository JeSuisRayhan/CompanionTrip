// Adresse des mises à jour à distance : https://u.expo.dev/<identifiant du projet>.
// L'identifiant n'est pas dans le dépôt : « eas init » (dans les workflows GitHub)
// l'écrit dans app.json, et ce script complète app.json avec l'adresse.
//
//   node scripts/set-updates-url.js             -> échoue si l'identifiant manque
//   node scripts/set-updates-url.js --optional  -> prévient seulement (workflow de build :
//                                                  l'APK se compile quand même, sans mises à jour)
const fs = require("fs");

const file = "app.json";
const optional = process.argv.includes("--optional");
const config = JSON.parse(fs.readFileSync(file, "utf8"));
const expo = config.expo || {};
const projectId = expo.extra && expo.extra.eas && expo.extra.eas.projectId;

if (!projectId) {
  const message = "Identifiant de projet EAS introuvable dans app.json : les mises à jour à distance ne seront pas configurées.";
  if (optional) {
    console.log(`::warning::${message}`);
    process.exit(0);
  }
  console.error(`::error::${message}`);
  process.exit(1);
}

expo.updates = { ...(expo.updates || {}), url: `https://u.expo.dev/${projectId}` };
config.expo = expo;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log(`Mises à jour configurées : ${expo.updates.url}, version d'exécution « ${expo.version} ».`);
