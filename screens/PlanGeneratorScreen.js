import React, { useState, useMemo, useCallback } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, TONES, space, layout, radius, type, themedStyles } from "../lib/theme";
import { getTrip } from "../lib/trips";
import { formatDayLabel } from "../lib/dates";
import { formatIdeaDuration, ideaAddressLine, hasPosition } from "../lib/ideas";
import { RHYTHMS, generatePlan, buildPreview, moveInPlan, applyPlan, undoPlan } from "../lib/planner";
import DayPickerModal from "../components/DayPickerModal";
import { Txt, Button, IconButton, Chip, Group, Row, EmptyState, BackHeader } from "../components/ui";

// Same lookup as the Idées tab: a category stores its colour, the tone with
// that foreground gives the tinted pair.
function toneOfCategory(cat) {
  return Object.keys(TONES).find((k) => TONES[k].fg === cat.color) || "neutral";
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

// "Construire mon voyage", phase 2: the proposed programme. The traveller sees
// what would go where, changes what they disagree with, then adds it to the days.
export default function PlanGeneratorScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rhythm, setRhythm] = useState("normal");
  const [edits, setEdits] = useState(null); // { plan, assign } — hand changes to the current proposal
  const [pickerIdea, setPickerIdea] = useState(null);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(null); // { ids, count, days } once added

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const t = await getTrip(tripId);
        if (!cancelled) {
          setTrip(t);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [tripId])
  );

  // The proposal is recomputed when the trip or the rhythm changes. Hand edits
  // belong to one proposal: a new proposal starts clean (no effect needed).
  const plan = useMemo(() => (trip ? generatePlan(trip, { rhythm }) : null), [trip, rhythm]);
  const assign = edits && edits.plan === plan ? edits.assign : plan ? plan.assign : null;
  const preview = useMemo(() => (trip && plan ? buildPreview(trip, assign, plan.order) : null), [trip, plan, assign]);

  const back = () => navigation.goBack();
  const header = <BackHeader title="Planning proposé" subtitle={trip ? trip.name : undefined} onBack={back} />;

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={THEME.teal} />
          ) : (
            <EmptyState icon="alert-circle-outline" title="Voyage introuvable" text="Ce voyage n'existe plus sur cet appareil." action={{ label: "Retour", onPress: back }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  async function onApply() {
    setApplying(true);
    try {
      const ids = await applyPlan(trip.id, assign, plan.order);
      const fresh = await getTrip(trip.id);
      if (ids.length > 0) setDone({ ids, count: ids.length, days: preview.days.length });
      setTrip(fresh);
    } finally {
      setApplying(false);
    }
  }

  async function onUndo() {
    await undoPlan(trip.id, done.ids);
    setDone(null);
    setTrip(await getTrip(trip.id));
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <EmptyState
            icon="checkmark-circle-outline"
            tone="teal"
            title="Planning ajouté"
            text={`${plural(done.count, "étape placée", "étapes placées")} sur ${plural(done.days, "jour")}. Retrouvez-les dans l'onglet Jours, et déplacez ce que vous voulez.`}
            action={{ label: "Voir le voyage", onPress: back }}
          />
          <Button title="Annuler l'ajout" icon="arrow-undo-outline" variant="secondary" onPress={onUndo} style={styles.undo} />
        </View>
      </SafeAreaView>
    );
  }

  if (trip.days.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <EmptyState icon="calendar-outline" tone="gold" title="Aucun jour pour l'instant" text="Ajoutez des jours dans l'onglet Jours, puis revenez générer le planning." action={{ label: "Retour", onPress: back }} />
        </View>
      </SafeAreaView>
    );
  }

  const candidatesCount = preview.placedCount + preview.unplaced.length;
  if (candidatesCount === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.center}>
          <EmptyState
            icon="bulb-outline"
            tone="gold"
            title="Rien à planifier"
            text="Toutes vos idées sont déjà sur un jour, ou le carnet est vide. Les hôtels se réservent depuis l'onglet Idées."
            action={{ label: "Retour", onPress: back }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const chosen = RHYTHMS.find((r) => r.key === rhythm) || RHYTHMS[1];
  const noPosition = preview.days.reduce((n, d) => n + d.items.filter((it) => !hasPosition(it.idea)).length, 0);

  // The map shows this proposal (with the hand changes), not what is saved.
  function openMap(dayId) {
    navigation.navigate("TripMap", { tripId: trip.id, dayId, plan: { assign, order: plan.order } });
  }

  function pickDay(dayId) {
    const idea = pickerIdea;
    setPickerIdea(null);
    setEdits({ plan, assign: moveInPlan(assign, idea.id, dayId) });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Txt variant="caption" style={styles.label}>
          Rythme
        </Txt>
        <View style={styles.chipRow}>
          {RHYTHMS.map((r) => (
            <Chip key={r.key} label={r.label} selected={rhythm === r.key} tone="gold" onPress={() => setRhythm(r.key)} />
          ))}
        </View>
        <Txt variant="subhead" style={styles.hint}>
          {`${chosen.hint}. Changer le rythme refait la proposition.`}
        </Txt>

        <View style={styles.summary}>
          <View style={styles.summaryText}>
            <Txt variant="label">{`${plural(preview.placedCount, "idée")} sur ${plural(preview.days.length, "jour")}`}</Txt>
            {preview.unplaced.length > 0 && (
              <Txt variant="caption" color="stamp">
                {`${preview.unplaced.length} sans place`}
              </Txt>
            )}
          </View>
          <Button title="Carte" icon="map-outline" variant="secondary" size="sm" accessibilityLabel="Voir le planning proposé sur la carte" onPress={() => openMap()} />
        </View>
        {noPosition > 0 && (
          <Txt variant="caption" color="inkFaint" style={styles.note}>
            {`${plural(noPosition, "idée")} sans position : les distances ne peuvent pas être prises en compte pour ${noPosition === 1 ? "elle" : "elles"}.`}
          </Txt>
        )}

        {preview.days.map((day) => (
          <View key={day.dayId} style={styles.daySection}>
            <View style={styles.dayHead}>
              <View style={styles.dayHeadText}>
                <Text style={[type.heading, styles.dayTitle]} accessibilityRole="header" numberOfLines={1}>
                  {day.title}
                </Text>
                {day.date ? <Txt variant="subhead">{formatDayLabel(day.date)}</Txt> : null}
              </View>
              {day.items.some((it) => hasPosition(it.idea)) ? (
                <IconButton icon="map-outline" label={`Voir ${day.title} sur la carte`} onPress={() => openMap(day.dayId)} style={styles.dayMap} />
              ) : null}
            </View>
            {day.flight ? (
              <Txt variant="caption" color="inkFaint" style={styles.note}>
                Jour de vol : programme allégé, à partir de 14 h.
              </Txt>
            ) : null}
            <Group>
              {day.items.map((it) => (
                <StepRow key={it.idea.id} item={it} trip={trip} onPress={() => setPickerIdea(it.idea)} />
              ))}
            </Group>
          </View>
        ))}

        {preview.unplaced.length > 0 && (
          <View style={styles.daySection}>
            <View style={styles.dayHead}>
              <Text style={type.heading} accessibilityRole="header">
                Sans place
              </Text>
            </View>
            <Txt variant="caption" color="inkFaint" style={styles.note}>
              Pas assez de temps dans les jours. Passez à un rythme plus soutenu, ajoutez un jour, ou placez-les vous-même.
            </Txt>
            <Group>
              {preview.unplaced.map((c) => (
                <Row
                  key={c.idea.id}
                  icon={c.cat.icon}
                  tone={toneOfCategory(c.cat)}
                  title={c.idea.name}
                  subtitle={ideaAddressLine(c.idea) || undefined}
                  accessibilityLabel={`${c.idea.name}, sans place. Choisir un jour`}
                  onPress={() => setPickerIdea(c.idea)}
                  right={<Button title="Placer" size="sm" tone="gold" accessibilityLabel={`Placer ${c.idea.name}`} onPress={() => setPickerIdea(c.idea)} />}
                />
              ))}
            </Group>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={preview.placedCount > 0 ? `Ajouter ${plural(preview.placedCount, "étape")} au programme` : "Rien à ajouter"}
          icon="checkmark"
          full
          loading={applying}
          disabled={preview.placedCount === 0}
          onPress={onApply}
        />
      </View>

      <DayPickerModal
        visible={!!pickerIdea}
        trip={trip}
        title={pickerIdea ? `Où mettre « ${pickerIdea.name} » ?` : ""}
        currentDayId={pickerIdea ? assign[pickerIdea.id] : undefined}
        removeLabel="Ne pas placer"
        onClose={() => setPickerIdea(null)}
        onPick={pickDay}
        onRemove={() => {
          const idea = pickerIdea;
          setPickerIdea(null);
          setEdits({ plan, assign: moveInPlan(assign, idea.id, null) });
        }}
      />
    </SafeAreaView>
  );
}

// One proposed step: time on the left, then name, then category / duration.
function StepRow({ item, trip, onPress }) {
  const { idea, cat, time } = item;
  const tone = toneOfCategory(cat);
  const duration = formatIdeaDuration(idea.durationMin || cat.durationMin);
  const line = ideaAddressLine(idea);
  return (
    <Row
      lead={<Text style={[type.numeral, styles.time]} numberOfLines={1}>{time}</Text>}
      title={idea.name}
      subtitle={line || undefined}
      accessibilityLabel={`${time}, ${idea.name}, ${cat.label}. Changer de jour`}
      onPress={onPress}
      chevron
    >
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Icon name={cat.icon} size={12} color={TONES[tone].fg} />
          <Text style={type.caption}>{cat.label}</Text>
        </View>
        {!!duration && <Text style={type.numeralSmall}>{duration}</Text>}
        {idea.priority === "must" && (
          <View style={styles.metaItem}>
            <View style={[styles.dot, { backgroundColor: THEME.stamp }]} />
            <Text style={type.caption}>Indispensable</Text>
          </View>
        )}
      </View>
    </Row>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  undo: { marginTop: space.md },
  scrollContent: { padding: layout.gutter, paddingBottom: space.xxl },
  label: { marginBottom: space.sm },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  hint: { marginTop: space.md },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.xl },
  summaryText: { flex: 1, gap: 2 },
  note: { marginTop: space.xs, marginBottom: space.sm },
  daySection: { marginTop: space.xl },
  dayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginBottom: space.sm },
  dayHeadText: { flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md },
  dayTitle: { flexShrink: 1 },
  dayMap: { marginRight: -space.sm },
  time: { minWidth: 48, flexShrink: 0, alignSelf: "flex-start", paddingTop: 2 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: 2, marginTop: space.xs },
  metaItem: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  dot: { width: space.sm, height: space.sm, borderRadius: radius.full },
  footer: { paddingHorizontal: layout.gutter, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong, backgroundColor: THEME.bg },
}));
