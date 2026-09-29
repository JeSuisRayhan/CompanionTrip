import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";

import { THEME, space, layout, radius, type, themedStyles } from "../lib/theme";
import { getErrorLog, clearErrorLog, formatErrorReport } from "../lib/errorLog";
import { formatShortDate, isoDate } from "../lib/dates";
import { Txt, Button, Group, Row, Badge, EmptyState, BackHeader } from "../components/ui";
import { shareErrorReport, deviceLabel } from "../components/ErrorBoundary";

const pad2 = (n) => String(n).padStart(2, "0");
const when = (iso) => {
  const d = new Date(iso);
  return `${formatShortDate(isoDate(d), false)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// Réglages > Journal d'erreurs: what went wrong on this phone. Stays on the
// phone; the person decides whether to share it.
export default function ErrorLogScreen({ navigation }) {
  const [entries, setEntries] = useState(null);
  const [open, setOpen] = useState(null); // id of the entry whose details are shown
  const [note, setNote] = useState("");

  const load = useCallback(async () => setEntries(await getErrorLog()), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function copy() {
    await Clipboard.setStringAsync(formatErrorReport(entries, { device: deviceLabel() }));
    setNote("Rapport copié.");
  }

  function confirmClear() {
    Alert.alert("Vider le journal ?", "Les erreurs enregistrées seront supprimées.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Vider",
        style: "destructive",
        onPress: async () => {
          await clearErrorLog();
          setNote("");
          await load();
        },
      },
    ]);
  }

  const header = <BackHeader title="Journal d'erreurs" onBack={() => navigation.goBack()} />;

  if (!entries) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  if (entries.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <EmptyState icon="checkmark-circle-outline" tone="teal" title="Aucune erreur" text="Rien à signaler pour l'instant. Si l'app rencontre un problème, il apparaîtra ici." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Txt variant="subhead">Ce journal reste sur votre téléphone. Vous choisissez de le partager ou non, par exemple pour qu'on corrige un problème.</Txt>
        <Button title="Partager le rapport" icon="share-outline" full style={styles.share} onPress={() => shareErrorReport().catch(() => {})} />
        <View style={styles.buttons}>
          <Button title="Copier" icon="copy-outline" variant="secondary" style={styles.flex} onPress={copy} />
          <Button title="Vider" icon="trash-outline" variant="danger" style={styles.flex} onPress={confirmClear} />
        </View>
        {note ? (
          <Txt variant="caption" color="teal" accessibilityLiveRegion="polite" style={styles.note}>
            {note}
          </Txt>
        ) : null}

        <Group style={styles.list}>
          {entries.map((e) => (
            <View key={e.id}>
              <Row
                icon="bug-outline"
                tone="stamp"
                title={e.message}
                subtitle={`${when(e.at)}, ${e.source}`}
                right={e.count > 1 ? <Badge label={`x${e.count}`} tone="neutral" /> : null}
                selected={open === e.id}
                accessibilityLabel={`${e.source}, ${e.message}, ${when(e.at)}${e.count > 1 ? `, ${e.count} fois` : ""}`}
                onPress={() => setOpen(open === e.id ? null : e.id)}
              />
              {open === e.id ? (
                <View style={styles.detail}>
                  <Text style={styles.stack} selectable>
                    {e.stack || "Pas de détail disponible."}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxl },
  share: { marginTop: space.md },
  buttons: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  flex: { flex: 1 },
  note: { marginTop: space.sm },
  list: { marginTop: space.lg },
  detail: { marginHorizontal: space.lg, marginBottom: space.md, padding: space.md, borderRadius: radius.sm, backgroundColor: THEME.surfaceSunk },
  stack: { ...type.numeralSmall, color: THEME.inkMuted },
}));
