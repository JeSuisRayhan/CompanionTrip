import React, { useState, useEffect } from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { THEME, layout, space, themedStyles } from "../lib/theme";
import { loadTrips } from "../lib/storage";
import { isoDate } from "../lib/dates";
import { shareTargets, shareKind, filesLabel, STATUS_LABELS } from "../lib/shareIntake";
import { Txt, Group, Row, Badge, SectionTitle, EmptyState, ModalHeader } from "../components/ui";

// Opened when another app shares something to Compagnon de voyage: which trip is it for?
// A booking (a confirmation text, a screenshot, a PDF) opens the reservation reader, which reads it right away;
// a link or a place opens the ideas import. Both with what was shared already in place.
export default function ShareTargetScreen({ route, navigation }) {
  const params = route.params || {};
  const text = params.text || "";
  const files = params.files || [];
  const unsupported = !!params.unsupported;
  const booking = shareKind({ text, files }) === "booking";
  const [targets, setTargets] = useState(null);

  const open = (tripId) =>
    booking
      ? navigation.replace("ImportConfirmation", { tripId, initialText: text, initialFiles: files, autoRead: true })
      : navigation.replace("ImportIdeas", { tripId, initialText: text });

  useEffect(() => {
    if (unsupported) return undefined;
    let alive = true;
    (async () => {
      const list = shareTargets(await loadTrips(), isoDate(new Date()));
      if (!alive) return;
      // A single trip: nothing to choose.
      if (list.length === 1) open(list[0].trip.id);
      else setTargets(list);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (unsupported) {
    return (
      <SafeAreaView style={styles.safe}>
        <ModalHeader title="Ajouter à un voyage" left={{ label: "Fermer", onPress: () => navigation.goBack() }} />
        <View style={styles.center}>
          <EmptyState
            icon="document-outline"
            tone="gold"
            title="Ce fichier n'est pas pris en charge"
            text="Partagez une capture d'écran (PNG ou JPEG), un PDF, ou le texte du mail de confirmation."
          />
        </View>
      </SafeAreaView>
    );
  }

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
            text={"Créez d'abord un voyage, puis partagez de nouveau " + (booking ? "la réservation." : "le lien ou le lieu.")}
            action={{ label: "Nouveau voyage", icon: "add", onPress: () => navigation.replace("Onboarding") }}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Group style={styles.received}>
            <Row
              icon={files.length ? (files[0].kind === "pdf" ? "document-outline" : "image-outline") : booking ? "mail-outline" : "link-outline"}
              tone="blue"
              title="Reçu d'une autre appli"
              subtitle={[filesLabel(files), text].filter(Boolean).join("\n")}
            />
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
                onPress={() => open(trip.id)}
              />
            ))}
          </Group>
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            {booking
              ? "La réservation est lue pour vous : vous pourrez vérifier et cocher les étapes avant de les ajouter au planning."
              : "Vous pourrez cocher les lieux reconnus avant de les ajouter au carnet d'idées."}
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
