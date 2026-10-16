// "Bilan": the first tab of a trip that is over (and, from the programme, of any trip). The ticket of the trip with the
// days since the return, the trip in figures on a departure board, the budget against what was planned, the notes of
// the evenings and the photos kept of it.
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Image, Modal, Share, Alert, Dimensions } from "react-native";
import { THEME, TONES, FONTS, layout, type, themedStyles, paperEdge, withAlpha } from "../../lib/theme";
import { isoDate, tripRange, tripStatus, formatTicketDates, formatLongDay, diffDaysISO } from "../../lib/dates";
import { todayPlan } from "../../lib/today";
import { tripRecap, recapText } from "../../lib/recap";
import { journalEntries } from "../../lib/journal";
import { budgetOverview, expensesByCategory, reservedByCategory, reservedTotal, expensesTotal, EXPENSE_CATEGORIES, formatMoney, formatFigure, currencySymbol } from "../../lib/budget";
import { souvenirsOf, souvenirsLeft, pickSouvenirs, addSouvenirs, removeSouvenir, MAX_SOUVENIRS } from "../../lib/souvenirs";
import { useTripInk } from "../../lib/tripInk";
import { Stamp, Button, IconButton, Group, Row, round } from "../../components/ui";
import { Section, Perforation, DayNum, SplitBar, MAIN } from "../../components/mix";
import Flip, { Plate } from "../../components/Flip";
import TripCover from "../../components/TripCover";

const CATEGORY_ORDER = ["hotel", "transport", "repas", "other"];
const COLUMNS = 3;
const GAP = 12;
// the prints are not quite straight: a turn and the tape on top of each
const TURNS = [-2.5, 1.8, -1.2, 2.2, -1.8, 1.4];
const TAPES = [-5, 4, -3, 5, -4, 3];

// A day's own name only when it has one ("Jour 3" says nothing more).
const named = (title) => (title && !/^jour\s*\d+$/i.test(title.trim()) ? title : null);

// What the stub of the ticket says: the days since the return, the day of the trip, or the days before it.
function stubOf(trip, today, status) {
  const { start, end } = tripRange(trip);
  if (status === "past" && end) {
    const n = Math.max(1, diffDaysISO(end, today));
    return { value: String(n), unit: n > 1 ? "jours depuis le retour" : "jour depuis le retour", note: `Retour le ${formatLongDay(end).toLowerCase()}` };
  }
  if (status === "current") {
    const plan = todayPlan(trip, today);
    if (plan) return { value: String(plan.dayNumber), unit: `jour sur ${plan.dayCount}`, note: "Le voyage est en cours" };
  }
  if (status === "upcoming" && start) {
    const n = Math.max(1, diffDaysISO(today, start));
    return { value: String(n), unit: n > 1 ? "jours avant le départ" : "jour avant le départ", note: `Départ le ${formatLongDay(start).toLowerCase()}` };
  }
  return null;
}

export default function BilanTab({ trip, navigation, onChange }) {
  const ink = useTripInk();
  const today = isoDate(new Date());
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);

  const status = tripStatus(trip, today);
  const recap = tripRecap(trip);
  const photos = souvenirsOf(trip);
  const left = souvenirsLeft(trip);
  const notes = journalEntries(trip);
  const { start, end } = tripRange(trip);
  const stub = stubOf(trip, today, status);

  const home = trip.homeCurrency || trip.currency || "EUR";
  const rate = trip.rate || 1;
  const overview = budgetOverview(trip, today);
  const m = (n) => formatMoney(Math.round(n), home);
  const reserved = reservedByCategory(trip);
  const spentBy = expensesByCategory(trip);
  const bookedHome = reservedTotal(trip) * rate;
  const spentHome = expensesTotal(trip) * rate;
  const outlay = bookedHome + spentHome;
  const rows = CATEGORY_ORDER.map((key) => ({ cat: EXPENSE_CATEGORIES.find((c) => c.key === key), amount: (reserved[key] + spentBy[key]) * rate })).filter((r) => r.cat && r.amount > 0);
  const tile = Math.floor((Dimensions.get("window").width - layout.gutter * 2 - 8 - GAP * (COLUMNS - 1)) / COLUMNS);

  async function add(source) {
    if (busy) return;
    setBusy(true);
    try {
      const uris = await pickSouvenirs(source, left);
      if (!uris.length) return;
      const { skipped } = await addSouvenirs(trip.id, uris);
      if (onChange) await onChange();
      if (skipped > 0) Alert.alert(skipped === 1 ? "Une photo n'a pas pu être ajoutée" : `${skipped} photos n'ont pas pu être ajoutées`, "Elles étaient illisibles ou la limite de photos était atteinte.");
    } catch (e) {
      if (e && e.code === "PERMISSION_DENIED") {
        Alert.alert("Autorisation refusée", source === "camera" ? "Autorisez l'appareil photo dans les réglages du téléphone." : "Autorisez l'accès aux photos dans les réglages du téléphone.");
      } else {
        Alert.alert("Impossible d'ajouter les photos");
      }
    } finally {
      setBusy(false);
    }
  }
  function confirmRemove(photo) {
    Alert.alert("Supprimer cette photo ?", "Elle sera retirée des souvenirs de ce voyage.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          setViewing(null);
          await removeSouvenir(trip.id, photo.id);
          if (onChange) await onChange();
        },
      },
    ]);
  }
  const share = () => Share.share({ message: recapText(recap), title: trip.name }).catch(() => {});

  const stepsValue = recap.steps.done > 0 ? recap.steps.done : recap.steps.total;
  const board = [
    { key: "days", label: "Jours", value: recap.dayCount, unit: "", spoken: `${recap.dayCount} jour${recap.dayCount > 1 ? "s" : ""}` },
    recap.steps.total > 0
      ? { key: "steps", label: recap.steps.done > 0 ? "Étapes faites" : "Étapes", sub: recap.steps.done > 0 ? `sur ${recap.steps.total} prévues` : "au programme", value: stepsValue, unit: recap.steps.done > 0 ? `/ ${recap.steps.total}` : "", spoken: `${stepsValue} étapes` }
      : null,
    recap.legCount > 0 && recap.distanceKm > 0 ? { key: "km", label: "Entre les étapes", sub: "à vol d'oiseau", value: recap.distanceKm, unit: "km", spoken: `${recap.distanceKm} kilomètres` } : null,
    recap.photos > 0 ? { key: "photos", label: "Photos souvenirs", value: recap.photos, unit: "", spoken: `${recap.photos} photos` } : null,
  ].filter(Boolean);
  const busiestDay = recap.busiest ? trip.days[recap.busiest.dayNumber - 1] : null;
  const busiestText = recap.busiest ? [`Jour ${recap.busiest.dayNumber}`, named(recap.busiest.title), `${recap.busiest.count} étapes faites`].filter(Boolean).join(" · ") : "";

  return (
    <ScrollView contentContainerStyle={MAIN} showsVerticalScrollIndicator={false}>
      <View style={[styles.ticket, round("xl")]}>
        <TripCover trip={trip} height={148} photoUri={trip.coverImage && trip.coverImage.url} postmarkAt="end" style={styles.cover}>
          <Stamp label={status === "past" ? "Voyage terminé" : status === "current" ? "En cours" : "À venir"} tone={status === "past" ? "stamp" : "gold"} icon={status === "past" ? "flag" : undefined} />
        </TripCover>
        <View style={styles.tkTitle}>
          <Text style={type.title} numberOfLines={2}>{recap.name}</Text>
          {start ? <Text style={type.subhead}>{formatTicketDates(start, end)}</Text> : null}
        </View>
        {stub ? (
          <>
            <Perforation />
            <View style={styles.stub}>
              <Flip value={stub.value} size="lg" tone="trip" label={`${stub.value} ${stub.unit}`} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.stubUnit}>{stub.unit}</Text>
                <Text style={type.caption}>{stub.note}</Text>
              </View>
            </View>
          </>
        ) : (
          <View style={{ height: 18 }} />
        )}
      </View>

      <Plate cap="Le voyage en chiffres" style={styles.plate}>
        <View>
          {board.map((r, i) => (
            <View key={r.key} style={[styles.boardRow, i > 0 && styles.boardLine]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.boardK}>{r.label}</Text>
                {r.sub ? <Text style={styles.boardSub}>{r.sub}</Text> : null}
              </View>
              <Flip value={String(r.value)} size="sm" tone="trip" label={r.spoken} />
              <Text style={styles.boardUnit}>{r.unit}</Text>
            </View>
          ))}
        </View>
      </Plate>

      {recap.busiest && busiestDay ? (
        <Group>
          <Row icon="trophy-outline" tone="gold" title="Journée la plus remplie" subtitle={busiestText} chevron onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: busiestDay.id })} accessibilityLabel={`Journée la plus remplie : ${busiestText}`} />
        </Group>
      ) : null}

      {outlay > 0 ? (
        <Section title="Budget">
          <View style={[styles.budget, round("lg")]}>
            <View style={styles.budgetTop}>
              <View style={styles.figureRow}>
                <Text style={styles.figure} numberOfLines={1} accessibilityLabel={`${formatFigure(Math.round(outlay))} ${currencySymbol(home)} dépensés`}>
                  {formatFigure(Math.round(outlay))}
                  <Text style={styles.figureUnit}>{currencySymbol(home)}</Text>
                </Text>
                {overview ? <Text style={styles.figureNote}>{`dépensés sur ${m(overview.target)}`}</Text> : <Text style={styles.figureNote}>dépensés en tout</Text>}
              </View>
              <SplitBar
                height={10}
                parts={[
                  { ratio: bookedHome / Math.max(overview ? overview.target : outlay, outlay), color: ink.color },
                  { ratio: spentHome / Math.max(overview ? overview.target : outlay, outlay), color: THEME.goldFill },
                ]}
              />
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: ink.color }]} />
                  <Text style={type.subhead}>{`Réservé ${m(bookedHome)}`}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.swatch, { backgroundColor: THEME.goldFill }]} />
                  <Text style={type.subhead}>{`Sur place ${m(spentHome)}`}</Text>
                </View>
              </View>
              {overview ? (
                <Stamp
                  label={overview.over ? `${m(-overview.left)} au-dessus du budget` : `${m(overview.left)} sous le budget`}
                  tone={overview.over ? "stamp" : "teal"}
                  icon={overview.over ? "alert" : "checkmark"}
                  small
                  style={{ alignSelf: "flex-start" }}
                />
              ) : null}
            </View>
            {rows.length ? <Perforation /> : null}
            {rows.map((r, i) => (
              <View key={r.cat.key} style={[styles.catRow, i > 0 && styles.catLine]} accessible accessibilityLabel={`${r.cat.label}, ${m(r.amount)}`}>
                <View style={[styles.swatch, { backgroundColor: TONES[r.cat.tone].fg }]} />
                <Text style={[type.name, { flex: 1 }]}>{r.cat.label}</Text>
                <Text style={styles.catAmount}>{m(r.amount)}</Text>
              </View>
            ))}
            {rows.length ? <View style={{ height: 6 }} /> : null}
          </View>
        </Section>
      ) : null}

      {notes.length > 0 ? (
        <Section title="Notes du soir" count={notes.length}>
          <Group>
            {notes.map((n) => (
              <Row
                key={n.dayId}
                lead={<DayNum date={n.date} index={n.dayNumber - 1} />}
                title={named(n.title) || `Jour ${n.dayNumber}`}
                subtitle={n.text}
                onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: n.dayId })}
                accessibilityLabel={`Jour ${n.dayNumber}, note du soir : ${n.text}`}
                style={{ alignItems: "flex-start", paddingVertical: 12 }}
              />
            ))}
          </Group>
        </Section>
      ) : null}

      <Section title="Souvenirs" count={photos.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : null}>
        {photos.length === 0 ? (
          <Text style={type.subhead}>Gardez ici les photos qui racontent le voyage. Elles sont incluses dans la sauvegarde.</Text>
        ) : (
          <View style={styles.prints}>
            {photos.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => setViewing(p)}
                accessibilityRole="button"
                accessibilityLabel={`Photo souvenir ${i + 1} sur ${photos.length}`}
                style={({ pressed }) => [styles.print, { width: tile, transform: [{ rotate: `${TURNS[i % TURNS.length]}deg` }] }, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.tape, { transform: [{ rotate: `${TAPES[i % TAPES.length]}deg` }] }]} />
                <Image source={{ uri: p.uri }} style={{ width: tile - 14, height: tile - 14, backgroundColor: ink.dim }} accessibilityIgnoresInvertColors />
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.photoButtons}>
          <Button title="Galerie" icon="images-outline" variant="secondary" size="sm" disabled={busy || left === 0} loading={busy} onPress={() => add("library")} style={{ flex: 1 }} accessibilityLabel="Ajouter des photos depuis la galerie" />
          <Button title="Appareil photo" icon="camera-outline" variant="secondary" size="sm" disabled={busy || left === 0} onPress={() => add("camera")} style={{ flex: 1 }} />
        </View>
        {left === 0 ? <Text style={type.caption}>{`${MAX_SOUVENIRS} photos au maximum : supprimez-en une pour en ajouter.`}</Text> : null}
      </Section>

      <Button title="Partager le bilan" icon="share-outline" size="lg" full onPress={share} />

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel="Fermer la photo">
          {viewing ? <Image source={{ uri: viewing.uri }} style={styles.viewerImage} resizeMode="contain" /> : null}
          <View style={styles.viewerBar}>
            <Button title="Supprimer" icon="trash-outline" variant="danger" size="sm" onPress={() => viewing && confirmRemove(viewing)} accessibilityLabel="Supprimer cette photo" />
            <IconButton icon="close" label="Fermer" size={24} onPress={() => setViewing(null)} tone="neutral" />
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  ticket: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  cover: { padding: 16 },
  tkTitle: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 4, gap: 4 },
  stub: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 22, paddingTop: 4, paddingBottom: 22 },
  stubUnit: { fontFamily: FONTS.head, fontSize: 20, lineHeight: 24, color: THEME.ink },

  plate: { paddingTop: 14, paddingHorizontal: 18, paddingBottom: 8 },
  boardRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  boardLine: { borderTopWidth: 1, borderTopColor: withAlpha(THEME.plateInk, 0.12) },
  boardK: { fontFamily: FONTS.bodySemi, fontSize: 16, lineHeight: 20, color: THEME.plateInk },
  boardSub: { fontFamily: FONTS.bodyMed, fontSize: 13, lineHeight: 17, color: THEME.plateDim },
  boardUnit: { width: 44, fontFamily: FONTS.monoMed, fontSize: 15, lineHeight: 18, color: THEME.plateDim },

  budget: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  budgetTop: { padding: 20, paddingBottom: 18, gap: 14 },
  figureRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  figure: { fontFamily: FONTS.monoMed, fontSize: 48, lineHeight: 52, letterSpacing: -1.5, color: THEME.ink },
  figureUnit: { fontFamily: FONTS.monoMed, fontSize: 22, lineHeight: 30, letterSpacing: 0, color: THEME.inkMuted },
  figureNote: { ...type.subhead, flexShrink: 1, textAlign: "right" },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 50, paddingHorizontal: 20 },
  catLine: { borderTopWidth: 1, borderTopColor: THEME.hair },
  catAmount: { fontFamily: FONTS.monoMed, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, color: THEME.ink },

  prints: { flexDirection: "row", flexWrap: "wrap", columnGap: GAP, rowGap: 18, paddingHorizontal: 4, paddingTop: 12 },
  print: { backgroundColor: "#FFFDF8", paddingTop: 6, paddingHorizontal: 6, paddingBottom: 14, borderRadius: 3, borderWidth: 1, borderColor: THEME.border, boxShadow: "0 1px 1px rgba(70, 48, 16, 0.06), 0 6px 14px -8px rgba(70, 48, 16, 0.24)" },
  tape: { position: "absolute", top: -9, left: "50%", width: 40, height: 15, marginLeft: -20, backgroundColor: "rgba(240, 181, 58, 0.6)", zIndex: 2 },
  photoButtons: { flexDirection: "row", gap: 10 },

  viewer: { flex: 1, backgroundColor: "#000000EE", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "80%" },
  viewerBar: { position: "absolute", left: 16, right: 16, bottom: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
}));
