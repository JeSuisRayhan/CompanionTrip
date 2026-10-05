import React, { useState, useEffect } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { THEME, layout, space, themedStyles } from "../lib/theme";
import { loadTrips } from "../lib/storage";
import { isoDate } from "../lib/dates";
import { shareTargets, STATUS_LABELS } from "../lib/shareIntake";
import { Txt, Group, Row, Badge, SectionTitle, EmptyState, ModalHeader } from "../components/ui";

// Opened when another app shares a link or a text to Compagnon de voyage: which trip is it for?
// The answer opens the ideas import with the text already in place.
export default function ShareTargetScreen({ route, navigation }) {
  const text = (route.params && route.params.text) || "";
  const [targets, setTargets] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = shareTargets(await loadTrips(), isoDate(new Date()));
      if (!alive) return;
      // A single trip: nothing to choose.
      if (list.length === 1) navigation.replace("ImportIdeas", { tripId: list[0].trip.id, initialText: text });
      else setTargets(list);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const pick = (tripId) => navigation.replace("ImportIdeas", { tripId, initialText: text });

  if (!targets) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ModalHeader title="Ajouter à un voyage" left={{ label: "Annuler", onPress: () => navigation.goBack() }} />
      {targets.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="airplane-outline"
            tone="gold"
            title="Aucun voyage pour l'instant"
            text="Créez d'abord un voyage, puis partagez de nouveau le lien ou le lieu."
            action={{ label: "Nouveau voyage", icon: "add", onPress: () => navigation.replace("Onboarding") }}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Group style={styles.received}>
            <Row icon="link-outline" tone="blue" title="Reçu d'une autre appli" subtitle={text} />
          </Group>
          <SectionTitle title="Dans quel voyage ?" />
          <Group>
            {targets.map(({ trip, status, label }) => (
              <Row
                key={trip.id}
                icon={status === "past" ? "checkmark-done-outline" : "airplane-outline"}
                tone={status === "current" ? "teal" : "neutral"}
                title={trip.name}
                subtitle={label}
                right={STATUS_LABELS[status] ? <Badge label={STATUS_LABELS[status]} tone={status === "current" ? "teal" : "neutral"} /> : null}
                chevron
                accessibilityLabel={`${trip.name}, ${label}${STATUS_LABELS[status] ? `, ${STATUS_LABELS[status].toLowerCase()}` : ""}`}
                onPress={() => pick(trip.id)}
              />
            ))}
          </Group>
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            Vous pourrez cocher les lieux reconnus avant de les ajouter au carnet d'idées.
          </Txt>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, justifyContent: "center", padding: layout.gutter },
  content: { padding: layout.gutter, paddingBottom: space.xxxl },
  received: { marginBottom: space.lg },
  note: { marginTop: space.md },
}));
