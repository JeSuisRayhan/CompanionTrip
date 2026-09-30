import React from "react";
import { View } from "react-native";

import { THEME, space, themedStyles } from "../lib/theme";
import { Txt, Button, Surface } from "./ui";

// Two things the home screen must say before anything else: the trips could
// not be read (nothing is saved until they can), or a safe copy was used.
// And, more calmly, that an update is ready, or that it is time to save a backup.
export default function HomeNotices({ storage, backup, busy, updatePending, onRetry, onAcknowledge, onBackup, onSnooze, onRestart, onLater }) {
  return (
    <View>
      {storage.blocked ? (
        <Notice
          tone="stamp"
          title="Vos voyages n'ont pas pu être lus"
          text="Rien n'est effacé, mais rien ne sera enregistré tant que la lecture échoue. Réessayez, ou fermez puis rouvrez l'application."
          actions={<Button title="Réessayer" size="sm" onPress={onRetry} />}
        />
      ) : null}
      {storage.recoveredAt ? (
        <Notice
          tone="stamp"
          title="Une copie de secours a été utilisée"
          text="Les données de l'appareil étaient illisibles. Les dernières modifications ont pu être perdues : vérifiez vos voyages."
          actions={<Button title="Compris" size="sm" variant="secondary" onPress={onAcknowledge} />}
        />
      ) : null}
      {updatePending ? (
        <Notice
          tone="gold"
          title="Mise à jour prête"
          text="Une nouvelle version de l'application est téléchargée. Redémarrez pour l'utiliser."
          actions={
            <>
              <Button title="Redémarrer" size="sm" onPress={onRestart} />
              <Button title="Plus tard" size="sm" variant="ghost" onPress={onLater} />
            </>
          }
        />
      ) : null}
      {backup.due ? (
        <Notice
          tone="gold"
          title="Sauvegardez vos voyages"
          text={`${backup.days == null ? "Aucune sauvegarde pour l'instant." : `Dernière sauvegarde il y a ${backup.days} jours.`} Réinstaller l'application efface tout.`}
          actions={
            <>
              <Button title="Sauvegarder" size="sm" loading={busy} disabled={busy} onPress={onBackup} />
              <Button title="Plus tard" size="sm" variant="ghost" disabled={busy} onPress={onSnooze} />
            </>
          }
        />
      ) : null}
    </View>
  );
}

function Notice({ tone, title, text, actions }) {
  return (
    <Surface tone="card" r="lg" pad="lg" style={[styles.notice, tone === "stamp" ? styles.stamp : styles.gold]}>
      <Txt variant="heading" accessibilityRole="header">
        {title}
      </Txt>
      <Txt variant="subhead" style={styles.text}>
        {text}
      </Txt>
      <View style={styles.actions}>{actions}</View>
    </Surface>
  );
}

const styles = themedStyles(() => ({
  notice: { marginBottom: space.lg, borderWidth: 1 },
  stamp: { borderColor: THEME.stamp },
  gold: { borderColor: THEME.gold },
  text: { marginTop: space.xs },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
}));
