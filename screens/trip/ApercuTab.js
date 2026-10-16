// "Aperçu": the first tab of a trip that has not started. The boarding pass with the days left on the departure
// board, then what is booked, what is left to prepare and what the budget keeps.
import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import Icon from "../../components/Icon";
import { THEME, space, type, themedStyles, paperEdge, FONTS } from "../../lib/theme";
import { tripRange, tripStatus, isoDate, formatTicketDates } from "../../lib/dates";
import { loadTrips } from "../../lib/storage";
import { editActivity, toggleChecklistItem, addChecklistItems } from "../../lib/trips";
import { pendingBookings } from "../../lib/booking";
import { reservationRows } from "../../lib/reservations";
import { budgetOverview, formatMoney, formatFigure, currencySymbol, convertAmount } from "../../lib/budget";
import { useTripInk } from "../../lib/tripInk";
import { Stamp, Group, Row, Thumb, Button, IconButton, ProgressBar, round } from "../../components/ui";
import { Section, Perforation, CheckRow, AmountCol, MAIN } from "../../components/mix";
import Flip from "../../components/Flip";
import TripCover from "../../components/TripCover";

const STARTER = ["Vérifier les dates de validité des papiers", "Télécharger ou imprimer les billets", "Confirmer les réservations (hébergement, transport)", "Prévenir la banque du voyage", "Vérifier l'assurance voyage", "Mettre les appareils à charger"];

function daysBetween(fromISO, toISO) {
  return Math.round((new Date(toISO + "T00:00:00") - new Date(fromISO + "T00:00:00")) / 86400000);
}

// The ticket of the trip: its cover, its name and dates, then the stub with the days to go.
export function ApercuTicket({ trip, today, isNext }) {
  const { start, end } = tripRange(trip);
  const diff = start ? daysBetween(today, start) : null;
  const first = trip.days[0];
  return (
    <View style={[styles.ticket, round("xl")]}>
      <TripCover trip={trip} height={148} photoUri={trip.coverImage?.url} style={styles.cover}>
        {start ? (
          <View style={styles.badgeRow}>
            <Stamp label={isNext ? "Prochain départ" : "À venir"} tone="gold" thump delay={280} />
          </View>
        ) : null}
        {trip.coverImage?.url && trip.coverImage?.photographerName ? (
          <Text style={styles.credit} numberOfLines={1}>Photo : {trip.coverImage.photographerName} / Unsplash</Text>
        ) : null}
      </TripCover>
      <View style={styles.titleBlock}>
        <Text style={[type.title, { color: THEME.ink }]} numberOfLines={2}>{trip.name}</Text>
        {start ? <Text style={styles.dates}>{formatTicketDates(start, end)}</Text> : <Text style={styles.dates}>Dates à choisir</Text>}
      </View>
      <Perforation />
      <View style={styles.stub}>
        <Text style={styles.caption}>{diff != null && diff > 1 ? "Départ dans" : "Départ"}</Text>
        {diff != null && diff > 1 ? (
          <View style={styles.stubRow}>
            <Flip value={String(diff)} size="lg" label={`${diff} jours avant le départ`} />
            <View style={styles.stubText}>
              <Text style={styles.stubUnit}>jours</Text>
              {first ? <Text style={styles.stubFirst} numberOfLines={2}>Premier jour : {first.title}</Text> : null}
            </View>
          </View>
        ) : (
          <View style={styles.stubText}>
            <Text style={type.title}>{diff === 1 ? "Demain" : "Dates à choisir"}</Text>
            {first && diff === 1 ? <Text style={styles.stubFirst} numberOfLines={2}>Premier jour : {first.title}</Text> : null}
          </View>
        )}
      </View>
    </View>
  );
}

// The steps still to book, with the tick that says "booked".
export function PendingBookings({ trip, today, navigation, onChange }) {
  const items = pendingBookings(trip, today);
  if (!items.length) return null;
  return (
    <Section title="À réserver" count={items.length}>
      <Group>
        {items.map((it) => (
          <Row
            key={it.step.id}
            icon="ticket-outline"
            tone={it.info && it.info.tone === "stamp" ? "stamp" : "neutral"}
            title={it.step.title}
            subtitle={[it.dayTitle, it.info ? it.info.text : null].filter(Boolean).join(" · ")}
            accessibilityLabel={`${it.step.title}, ${it.dayTitle}${it.info ? ", " + it.info.text : ""}`}
            onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: it.dayId })}
            right={
              <IconButton
                icon="checkmark"
                label={`Marquer comme réservé : ${it.step.title}`}
                size={22}
                filled
                onPress={async () => {
                  await editActivity(trip.id, it.dayId, it.step.id, { booking: "done", bookBy: null });
                  if (onChange) onChange();
                }}
              />
            }
          />
        ))}
      </Group>
    </Section>
  );
}

export default function ApercuTab({ trip, navigation, onChange, onOpenTab, onOpenList }) {
  const ink = useTripInk();
  const today = isoDate(new Date());
  const [isNext, setIsNext] = useState(true);

  // "Prochain départ" only for the nearest trip still to come.
  useEffect(() => {
    let live = true;
    loadTrips()
      .then((all) => {
        if (!live) return;
        const { start } = tripRange(trip);
        const earlier = (all || []).some((t) => t.id !== trip.id && tripStatus(t, today) === "upcoming" && tripRange(t).start < (start || "9999"));
        setIsNext(!earlier);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [trip.id, trip.startDate]);

  const home = trip.homeCurrency || trip.currency || "EUR";
  const local = trip.currency || home;
  const rate = trip.rate || 1;
  const rows = reservationRows(trip);
  const checklist = trip.departureChecklist || [];
  const left = checklist.filter((i) => !i.checked);
  const shown = left.slice(0, 3);
  const overview = budgetOverview(trip, today);
  const sameCurrency = local === home;

  async function toggle(item) {
    await toggleChecklistItem(trip.id, "departureChecklist", item.id);
    if (onChange) onChange();
  }

  return (
    <ScrollView contentContainerStyle={MAIN} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ApercuTicket trip={trip} today={today} isNext={isNext} />

      <PendingBookings trip={trip} today={today} navigation={navigation} onChange={onChange} />

      <Section title="Réservations" count={rows.length || null}>
        <Group>
          {rows.map((r) => (
            <Row
              key={r.key}
              icon={r.icon}
              tone={r.tone}
              title={r.title}
              subtitle={r.subtitle}
              onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: r.dayId })}
              right={r.amount > 0 ? <AmountCol main={formatMoney(convertAmount(r.amount, rate), home)} local={sameCurrency ? null : formatMoney(r.amount, local)} /> : null}
              chevron
            />
          ))}
          <Row
            lead={
              <View style={styles.dashTile}>
                <Icon name="add" size={24} color={THEME.inkMuted} />
              </View>
            }
            title="Ajouter une réservation"
            subtitle="Depuis un PDF ou à la main"
            onPress={() => navigation.navigate("ImportConfirmation", { tripId: trip.id })}
          />
        </Group>
      </Section>

      <Section title="Avant le départ" count={checklist.length ? `${checklist.length - left.length} sur ${checklist.length}` : null}>
        {checklist.length ? <ProgressBar value={(checklist.length - left.length) / checklist.length} tone={ink.name} height={4} /> : null}
        <Group>
          {checklist.length === 0 ? (
            <Row
              icon="list-outline"
              title="Préparer le départ"
              subtitle="Papiers, billets, banque, assurance…"
              onPress={async () => {
                await addChecklistItems(trip.id, "departureChecklist", STARTER);
                if (onChange) onChange();
              }}
              right={<Text style={styles.link}>Ajouter</Text>}
            />
          ) : left.length === 0 ? (
            <Row icon="checkmark-circle-outline" tone={ink.name} title="Tout est prêt" subtitle={`${checklist.length} points faits`} onPress={() => onOpenList("departureChecklist")} chevron />
          ) : (
            shown.map((item) => <CheckRow key={item.id} label={item.label} checked={false} onPress={() => toggle(item)} />)
          )}
          {checklist.length ? (
            <Pressable accessibilityRole="button" onPress={() => onOpenList("departureChecklist")} style={({ pressed }) => [styles.more, pressed && { backgroundColor: THEME.pressed }]}>
              <Text style={[styles.moreText, { color: ink.color }]}>{left.length === 0 ? "Voir la liste" : `Voir les ${checklist.length} points`}</Text>
              <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
            </Pressable>
          ) : null}
        </Group>
      </Section>

      <Section title="Budget" count={overview ? formatMoney(overview.target, home) : null}>
        <Pressable accessibilityRole="button" accessibilityLabel="Ouvrir le budget" onPress={() => onOpenTab("budget")} style={({ pressed }) => [styles.budget, round("lg"), pressed && { backgroundColor: THEME.pressed }]}>
          {overview ? (
            <>
              <View style={styles.budgetTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.figure, overview.over && { color: THEME.stamp }]} accessibilityLabel={`${formatFigure(overview.left)} ${currencySymbol(home)} ${overview.over ? "de trop" : "restants"}`}>
                    {overview.over ? "−" : ""}{formatFigure(Math.abs(overview.left))}
                    <Text style={styles.figureUnit}>{currencySymbol(home)}</Text>
                  </Text>
                  <Text style={styles.budgetLine}>
                    {overview.over ? "de plus que le budget" : overview.booked > 0 ? "restent après les réservations" : "de budget à répartir"}
                    {overview.perDay != null && !overview.over ? `, soit ≈ ${formatMoney(Math.round(overview.perDay), home)} par jour` : ""}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round(overview.bookedRatio * 100)}%`, backgroundColor: ink.color }]} />
              </View>
              <View style={styles.legend}>
                <View style={[styles.swatch, { backgroundColor: ink.color }]} />
                <Text style={styles.legendText}>Réservé {formatMoney(Math.round(overview.booked), home)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.budgetTop}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={type.name}>Pas de budget fixé</Text>
                <Text style={type.subhead}>Fixez ce que vous voulez dépenser : l'appli compte ce qui reste après les réservations.</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={THEME.inkFaint} />
            </View>
          )}
        </Pressable>
      </Section>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  ticket: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  cover: { padding: space.lg },
  badgeRow: { flexDirection: "row" },
  credit: { position: "absolute", right: space.sm, bottom: space.sm, ...type.caption, fontSize: 11, color: THEME.onAccent, backgroundColor: "rgba(27,36,48,0.6)", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden", maxWidth: "70%" },
  titleBlock: { gap: space.xs, paddingHorizontal: 22, paddingTop: 18, paddingBottom: space.xs },
  dates: { ...type.subhead, color: THEME.inkMuted },
  stub: { gap: space.sm, paddingHorizontal: 22, paddingTop: space.xs, paddingBottom: 20 },
  caption: { ...type.caption, color: THEME.inkMuted },
  stubRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  stubText: { flex: 1, gap: 2 },
  stubUnit: { ...type.heading, color: THEME.ink },
  stubFirst: { ...type.caption, color: THEME.inkMuted },
  dashTile: { width: 40, height: 40, borderRadius: 8, borderWidth: 1.5, borderStyle: "dashed", borderColor: THEME.inkFaint, alignItems: "center", justifyContent: "center" },
  more: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 58, paddingHorizontal: space.lg },
  moreText: { ...type.name },
  link: { ...type.label, color: THEME.mark },
  budget: { backgroundColor: THEME.bgCard, padding: space.lg, gap: space.md, ...paperEdge() },
  budgetTop: { flexDirection: "row", alignItems: "center", gap: space.md },
  figure: { fontFamily: FONTS.monoMed, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: THEME.ink },
  figureUnit: { fontFamily: FONTS.monoMed, fontSize: 20, lineHeight: 28, letterSpacing: 0, color: THEME.inkMuted },
  budgetLine: { ...type.subhead, color: THEME.inkMuted },
  bar: { height: 10, borderRadius: 5, backgroundColor: THEME.bgCardAlt, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5 },
  legend: { flexDirection: "row", alignItems: "center", gap: space.sm },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { ...type.caption, color: THEME.ink },
}));
