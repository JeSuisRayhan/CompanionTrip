import React from "react";
import { View, Text } from "react-native";

import { THEME, space, type, radius, themedStyles } from "../lib/theme";
import { Txt, Button, Surface } from "./ui";
import Icon from "./Icon";

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
        <View style={styles.update} accessibilityRole="alert">
          <Icon name="refresh" size={22} color={THEME.gold} />
          <Text style={styles.updateText} numberOfLines={2}>Mise à jour prête</Text>
          <Button title="Redémarrer" size="sm" onPress={onRestart} />
        </View>
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
  // The update is one line: what it is, and the button.
  update: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, paddingLeft: 14, paddingRight: space.md, marginBottom: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: THEME.goldFill, backgroundColor: THEME.goldDim },
  updateText: { ...type.label, flex: 1, fontFamily: type.label.fontFamily, color: THEME.ink },
  notice: { marginBottom: space.lg, borderWidth: 1 },
  stamp: { borderColor: THEME.stamp },
  gold: { borderColor: THEME.gold },
  text: { marginTop: space.xs },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
}));
