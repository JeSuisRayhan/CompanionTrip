// "Aujourd'hui": the first tab of a trip that is under way. The next step as a ticket (its hour on the departure board,
// how far away it is, "Y aller", "Fait"), the steps of the day in a timeline, then what the day costs. Once everything
// is done the tab turns into the evening: the day's stamp, the note of the evening, the budget, tomorrow.
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Linking, Alert, Platform } from "react-native";
import Icon from "../../components/Icon";
import { THEME, FONTS, type, themedStyles, paperEdge } from "../../lib/theme";
import { splitTitlePlace } from "../../lib/script";
import { directionsUrl } from "../../lib/map";
import { driverCard } from "../../lib/driverCard";
import { isPdfDoc, openDocumentFile } from "../../lib/documents";
import { toggleActivityDone, setDayJournal } from "../../lib/trips";
import { isoDate, formatLongDay, tripStatus, tripRange, daysUntilLabel, formatShortDate, resolveDayDate } from "../../lib/dates";
import { todayPlan } from "../../lib/today";
import { dayLegs, legShort, legAdvice } from "../../lib/travelTime";
import { budgetOverview, formatMoney, formatFigure, currencySymbol, convertAmount } from "../../lib/budget";
import { journalOf, MAX_JOURNAL } from "../../lib/journal";
import { fetchDayWeather, weatherInfo } from "../../lib/weather";
import { formatIdeaDuration } from "../../lib/ideas";
import { useTripInk } from "../../lib/tripInk";
import { Stamp, Button, Group, Row, Thumb, EmptyState, SectionTitle, round } from "../../components/ui";
import { Section, Perforation, DayNum, Tag, StepDot, DotLine, MAIN } from "../../components/mix";
import { stepTone, stepIcon, noteOf, priceOf } from "../../lib/stepLook";
import Flip from "../../components/Flip";
import { PendingBookings } from "./ApercuTab";
import { scopedId } from "../../lib/parkDay";

const REFRESH_MS = 30000; // the countdown moves with the clock

const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// What the step says about itself: its name, and where it is.
function stepText(step) {
  if (step.address) return { name: step.title, place: step.address };
  const split = splitTitlePlace(step.title);
  return { name: split.title, place: split.place };
}

// "Gratuit" belongs to the page of a day; here only what is to be paid shows.
const paid = (p) => (p === "Gratuit" ? null : p);

// A step with a "show the address to the driver" button: the next one, or a road transport / a step with a local address.
function wantsDriver(step) {
  return !!driverCard(step) && (!!step.localAddress || (step.type === "transport" && !["avion", "train", "bateau"].includes(step.transportMode)));
}

// The sum of the prices of the steps of a day, in the person's currency.
const plannedOf = (steps, rate) => steps.reduce((sum, s) => sum + (Number(s.price) > 0 ? Number(s.price) : 0), 0) * rate;

function WeatherTag({ day, dateISO, fallbackLocation }) {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    let off = false;
    setWeather(null);
    fetchDayWeather(day, dateISO, fallbackLocation)
      .then((w) => {
        if (!off) setWeather(w || null);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [day.id, day.location, day.title, dateISO, fallbackLocation]);
  if (!weather) return null;
  const info = weatherInfo(weather.code);
  return <Tag mono tone="trip" label={`${info.emoji} ${weather.tempMax} °C`} accessibilityLabel={`Météo${info.label ? " : " + info.label : ""}, maximum ${weather.tempMax}°, minimum ${weather.tempMin}°`} style={styles.headTag} />;
}

export default function TodayTab({ trip, navigation, onChange, onOpenTab }) {
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const today = isoDate(now);
  const plan = todayPlan(trip, today, now);
  const home = trip.homeCurrency || trip.currency || "EUR";
  const rate = trip.rate || 1;
  const sameCurrency = (trip.currency || home) === home;
  const m = (n) => formatMoney(Math.round(n), home);

  // No day of the trip falls on today: say where the trip stands rather than show an empty page.
  if (!plan) {
    const status = tripStatus(trip, today);
    let title = "Rien de prévu aujourd'hui";
    let text = "Aucun jour du programme ne tombe sur aujourd'hui.";
    if (status === "upcoming") {
      const first = tripRange(trip).start;
      title = "Le voyage n'a pas commencé";
      text = first ? `Départ ${daysUntilLabel(first, today) || formatShortDate(first)}.` : "Il commence bientôt.";
    } else if (status === "past") {
      title = "Ce voyage est terminé";
      text = "Retrouvez le programme et les souvenirs dans le voyage.";
    } else if (status === "undated") {
      title = "Ce voyage n'a pas de dates";
      text = "Ajoutez des dates pour voir ce qui vous attend chaque jour.";
    }
    return (
      <ScrollView contentContainerStyle={[MAIN, { flexGrow: 1, justifyContent: "center" }]}>
        <EmptyState icon="calendar-outline" tone="gold" title={title} text={text} action={{ label: "Voir le programme", onPress: () => onOpenTab("programme") }} />
      </ScrollView>
    );
  }

  const { day, next, done, total, allDone, countdown, docs, tomorrow } = plan;
  const dayId = day.id;
  const isPark = trip.tripType === "park" || day.dayType === "park";
  const legs = isPark ? null : dayLegs(trip, plan.steps);
  const nextLeg = next && legs ? legs.get(next.id) || null : null;

  async function toggle(step) {
    if (busy) return;
    setBusy(true);
    try {
      await toggleActivityDone(trip.id, dayId, step.id);
      if (onChange) await onChange();
    } finally {
      setBusy(false);
    }
  }
  function goThere(step) {
    const url = directionsUrl(step, Platform.OS);
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert("Impossible d'ouvrir l'application de cartes"));
  }
  function openDoc(doc) {
    if (isPdfDoc(doc)) openDocumentFile(doc).catch(() => Alert.alert("Impossible d'ouvrir ce PDF depuis l'application"));
    else navigation.navigate("Trip", { tripId: trip.id, viewDocId: doc.id });
  }
  const editStep = (step) => navigation.navigate("ActivityEditor", { tripId: trip.id, dayId, activity: step });
  const openDay = () => navigation.navigate("DayDetail", { tripId: trip.id, dayId });
  const noteExpense = (step) =>
    navigation.navigate("Expense", {
      tripId: trip.id,
      prefill: { label: stepText(step).name, category: step.type === "repas" ? "repas" : step.type === "transport" ? "transport" : step.type === "hotel" ? "hotel" : "other", amount: Number(step.price) > 0 ? Number(step.price) : null, stepId: step.id },
    });

  // what the day cost, against what the steps planned
  const spentToday = (trip.expenses || []).filter((e) => e.date === today).reduce((sum, e) => sum + (e.amount || 0), 0) * rate;
  const plannedToday = plannedOf(plan.steps, rate);
  const overview = budgetOverview(trip, today);
  const overPlan = plannedToday > 0 && spentToday > plannedToday + 0.5;
  const longDate = `${formatLongDay(today)} · jour ${plan.dayNumber} sur ${plan.dayCount}`;

  return (
    <ScrollView contentContainerStyle={MAIN} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.head}>
        <Text style={type.subhead}>{longDate}</Text>
        <View style={styles.headRow}>
          <Text style={[type.display, { flex: 1 }]} numberOfLines={2} accessibilityRole="header">{day.title}</Text>
          {allDone ? <Tag mono icon="moon-outline" label="Soirée" style={styles.headTag} /> : <WeatherTag day={day} dateISO={today} fallbackLocation={trip.defaultLocation} />}
        </View>
      </View>

      {isPark && total > 0 ? (
        <Group>
          <Row
            icon="pulse"
            tone="teal"
            title="Jour J au parc"
            subtitle="Attentes en direct, prochaine attraction"
            chevron
            onPress={() => navigation.navigate("ParkLive", { tripId: trip.tripType === "park" ? trip.id : scopedId(trip.id, dayId), dayId })}
          />
        </Group>
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon="sunny-outline"
          tone="gold"
          title="Journée libre"
          text="Rien n'est prévu aujourd'hui. Ajoutez une étape si vous avez une idée."
          action={{ label: "Ajouter une étape", icon: "add", onPress: () => navigation.navigate("ActivityEditor", { tripId: trip.id, dayId, activity: null }) }}
        />
      ) : allDone ? (
        <DoneTicket total={total} />
      ) : (
        <NextTicket
          step={next}
          trip={trip}
          countdown={countdown}
          leg={nextLeg}
          now={now}
          busy={busy}
          home={home}
          rate={rate}
          sameCurrency={sameCurrency}
          onGo={() => goThere(next)}
          onDone={() => toggle(next)}
          onEdit={() => editStep(next)}
          onShowDriver={(card) => navigation.navigate("ShowDriver", card)}
        />
      )}

      {allDone ? <EveningNote key={dayId} trip={trip} day={day} /> : null}

      {allDone ? (
        <Section title="Budget du jour">
          <Stats spentToday={spentToday} plannedToday={plannedToday} overPlan={overPlan} overview={overview} home={home} m={m} evening onPress={() => onOpenTab("budget")} />
        </Section>
      ) : null}

      {allDone && tomorrow ? (
        <Section title="Demain">
          <Group>
            <Row
              lead={<DayNum date={resolveDayDate(trip, tomorrow.day, plan.dayNumber)} index={plan.dayNumber} />}
              title={tomorrow.day.title}
              subtitle={tomorrow.firstStep ? `${tomorrow.firstStep.time ? tomorrow.firstStep.time + " · " : ""}${tomorrow.firstStep.title}` : "Rien de prévu pour l'instant"}
              chevron
              onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: tomorrow.day.id })}
              accessibilityLabel={`Demain : ${tomorrow.day.title}`}
            />
          </Group>
        </Section>
      ) : null}

      {total > 0 ? (
        <Section title={allDone ? "La journée" : "Aujourd'hui"} count={`${done.length} faite${done.length > 1 ? "s" : ""} sur ${total}`} action={{ label: "Ouvrir le jour", onPress: openDay }}>
          <View>
            {plan.steps.map((step, i) => (
              <TimelineStep
                key={step.id}
                step={step}
                state={step.done ? "done" : next && step.id === next.id ? "next" : "todo"}
                last={i === plan.steps.length - 1}
                trip={trip}
                home={home}
                rate={rate}
                sameCurrency={sameCurrency}
                busy={busy}
                onToggle={() => toggle(step)}
                onEdit={() => editStep(step)}
                onNoteExpense={() => noteExpense(step)}
                onShowDriver={(card) => navigation.navigate("ShowDriver", card)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      <PendingBookings trip={trip} today={today} navigation={navigation} onChange={onChange} />

      {docs.length > 0 ? (
        <Section title="Documents du jour" count={docs.length}>
          <Group>
            {docs.map((doc) => (
              <Row
                key={doc.id}
                lead={isPdfDoc(doc) ? <Thumb icon="document-text" tone="stamp" size={40} /> : <Thumb uri={doc.uri} icon="image" tone="blue" size={40} />}
                title={doc.title}
                subtitle={isPdfDoc(doc) ? "PDF · s'ouvre avec une autre application" : "Photo"}
                chevron
                onPress={() => openDoc(doc)}
                accessibilityLabel={`Ouvrir ${doc.title}`}
              />
            ))}
          </Group>
        </Section>
      ) : null}

      {!allDone ? (
        <Section title="Budget" action={{ label: "Noter une dépense", onPress: () => navigation.navigate("Expense", { tripId: trip.id }) }}>
          <Stats spentToday={spentToday} plannedToday={plannedToday} overPlan={overPlan} overview={overview} home={home} m={m} onPress={() => onOpenTab("budget")} />
        </Section>
      ) : null}
    </ScrollView>
  );
}

// ---------- The next step, as a ticket ----------
function NextTicket({ step, trip, countdown, leg, now, busy, home, rate, sameCurrency, onGo, onDone, onEdit, onShowDriver }) {
  const { name, place } = stepText(step);
  const canGo = !!directionsUrl(step, Platform.OS);
  const card = driverCard(step);
  const idea = step.ideaId ? (trip.ideas || []).find((i) => i.id === step.ideaId) : null;
  const duration = idea && idea.durationMin ? formatIdeaDuration(idea.durationMin) : null;
  const price = paid(priceOf(step, rate, home, sameCurrency));
  const note = noteOf(step);
  const sub = [note, duration, price].filter(Boolean).join(" · ");
  const late = countdown && countdown.tone === "stamp";
  const advice = leg ? legAdvice(leg, step.time, now) : null;
  const way = legShort(leg);
  const label = `Prochaine étape : ${step.title}${step.time ? ", " + step.time.replace(":", " h ") : ""}${countdown ? ", " + countdown.label : ""}`;
  return (
    <View style={[styles.ticket, round("xl")]}>
      <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Modifier l'étape" style={({ pressed }) => [styles.tkTitle, pressed && { opacity: 0.85 }]}>
        <Stamp label="Prochaine étape" tone="gold" style={{ alignSelf: "flex-start" }} />
        <Text style={[type.title, { paddingTop: 6 }]} numberOfLines={3}>{name}</Text>
        {sub ? <Text style={type.subhead} numberOfLines={2}>{sub}</Text> : null}
        {place ? (
          <View style={styles.placeLine}>
            <Icon name="location-outline" size={16} color={THEME.inkFaint} style={{ marginTop: 2 }} />
            <Text style={[type.subhead, { flex: 1 }]} numberOfLines={2}>{place}</Text>
          </View>
        ) : null}
      </Pressable>
      <Perforation />
      <View style={styles.stub}>
        {step.time ? <Flip value={step.time} size="lg" tone="gold" label={step.time.replace(":", " h ")} /> : null}
        <View style={styles.whenRow}>
          <Icon name="time-outline" size={16} color={late ? THEME.stamp : THEME.ink} />
          <Text style={styles.when}>
            <Text style={[styles.whenBold, late && { color: THEME.stamp }]}>{countdown ? cap(countdown.label) : "Sans horaire"}</Text>
            {way ? ` · ${way}` : ""}
          </Text>
        </View>
        {advice ? <Text style={[type.caption, advice.tone === "stamp" && { color: THEME.stamp }]}>{advice.text}</Text> : null}
      </View>
      <View style={styles.btns}>
        {canGo ? <Button title="Y aller" icon="navigate" size="lg" onPress={onGo} accessibilityLabel={`Y aller : ${step.title}`} style={styles.btn} /> : null}
        <Button title="Fait" icon="checkmark" size="lg" tone={canGo ? "nature" : undefined} onPress={onDone} disabled={busy} accessibilityLabel={`Marquer comme fait : ${step.title}`} style={styles.btn} />
      </View>
      {card ? (
        <View style={styles.driver}>
          <Button title="Montrer l'adresse au chauffeur" icon="car-outline" variant="secondary" size="sm" full onPress={() => onShowDriver(card)} accessibilityLabel={`Montrer l'adresse au chauffeur : ${step.title}`} />
        </View>
      ) : null}
    </View>
  );
}

// ---------- The day is done ----------
function DoneTicket({ total }) {
  return (
    <View style={[styles.ticket, round("xl")]} accessible accessibilityLabel={`Journée terminée, ${total} étapes sur ${total} faites`}>
      <View style={[styles.tkTitle, { paddingTop: 24, gap: 10 }]}>
        <Stamp label="Journée terminée" tone="teal" icon="checkmark" large style={{ alignSelf: "flex-start" }} />
        <Text style={[type.body, { color: THEME.inkMuted, paddingTop: 6 }]}>Bonne soirée !</Text>
      </View>
      <Perforation />
      <View style={[styles.stub, { flexDirection: "row", alignItems: "center", gap: 16, paddingBottom: 22 }]}>
        <Flip value={`${total}/${total}`} size="lg" tone="trip" label={`${total} étapes sur ${total}`} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.doneTitle}>étape{total > 1 ? "s" : ""} faite{total > 1 ? "s" : ""}</Text>
          <Text style={type.caption}>Tout le programme du jour</Text>
        </View>
      </View>
    </View>
  );
}

// ---------- The note of the evening: a few lines on ruled paper, saved as they are written ----------
const LINE = 28;
function EveningNote({ trip, day }) {
  const stored = journalOf(day);
  const [text, setText] = useState(stored);
  const [height, setHeight] = useState(140);
  const latest = useRef(text);
  latest.current = text;
  const saved = useRef(stored);

  const save = useCallback(() => {
    const value = latest.current.trim();
    if (value === saved.current) return;
    saved.current = value;
    setDayJournal(trip.id, day.id, value).catch(() => {});
  }, [trip.id, day.id]);

  // a moment after the last key, and when the tab is left
  useEffect(() => {
    const id = setTimeout(save, 900);
    return () => clearTimeout(id);
  }, [text, save]);
  useEffect(() => save, [save]);

  const rules = Math.max(0, Math.floor((height - 14 - 6) / LINE));
  return (
    <View style={{ gap: 12 }}>
      <SectionTitle title="Note du soir" count={`${text.length} sur ${MAX_JOURNAL}`} style={{ marginBottom: 0 }} />
      <View style={[styles.note, round("md")]} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
        {Array.from({ length: rules }).map((_, i) => (
          <View key={i} pointerEvents="none" style={[styles.rule, { top: 14 + 24 + i * LINE }]} />
        ))}
        <TextInput
          accessibilityLabel="Note du soir"
          value={text}
          onChangeText={(t) => setText(t.slice(0, MAX_JOURNAL))}
          onBlur={save}
          multiline
          maxLength={MAX_JOURNAL}
          placeholder="Une phrase pour se souvenir de cette journée"
          placeholderTextColor={THEME.placeholder}
          selectionColor={THEME.mark}
          cursorColor={THEME.mark}
          textAlignVertical="top"
          style={styles.noteInput}
        />
      </View>
      <Text style={styles.hint}>Une phrase pour se souvenir de cette journée.</Text>
    </View>
  );
}

// ---------- What the day cost, and what the trip still has ----------
function StatTile({ figure, unit, caption, tone, onPress, label }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.stat, round("lg"), pressed && { backgroundColor: THEME.pressed }]}>
      <Text style={[styles.statFigure, tone === "gold" && { color: THEME.gold }, tone === "stamp" && { color: THEME.stamp }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {figure}
        <Text style={styles.statUnit}>{unit}</Text>
      </Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </Pressable>
  );
}

function Stats({ spentToday, plannedToday, overPlan, overview, home, m, evening, onPress }) {
  const unit = currencySymbol(home);
  const spent = Math.round(spentToday);
  const planned = plannedToday > 0 ? m(plannedToday) : null;
  const caption = overPlan && evening ? `dépensés, ${m(spentToday - plannedToday)} de plus que prévu` : `dépensés${evening ? "" : " aujourd'hui"}${planned ? `, sur ${planned} prévus` : ""}`;
  return (
    <View style={styles.stats}>
      <StatTile figure={formatFigure(spent)} unit={unit} caption={caption} tone={overPlan && evening ? "gold" : undefined} onPress={onPress} label={`${formatFigure(spent)} ${unit} ${caption}. Ouvrir le budget`} />
      {overview ? (
        <StatTile
          figure={`${overview.over ? "−" : ""}${formatFigure(Math.abs(Math.round(overview.left)))}`}
          unit={unit}
          caption={overview.over ? "de plus que le budget du voyage" : `restent pour le voyage${overview.perDay != null ? `, soit ≈ ${m(overview.perDay)} par jour` : ""}`}
          tone={overview.over ? "stamp" : undefined}
          onPress={onPress}
          label={`${overview.over ? "Budget dépassé de" : "Il reste"} ${formatFigure(Math.abs(Math.round(overview.left)))} ${unit}. Ouvrir le budget`}
        />
      ) : (
        <StatTile figure="+" unit="" caption="Fixer un budget pour suivre ce qu'il reste" onPress={onPress} label="Fixer un budget" />
      )}
    </View>
  );
}

// ---------- One step of the timeline ----------
function TimelineStep({ step, state, last, trip, home, rate, sameCurrency, busy, onToggle, onEdit, onNoteExpense, onShowDriver }) {
  const ink = useTripInk();
  const { name, place } = stepText(step);
  const done = state === "done";
  const next = state === "next";
  const idea = step.ideaId ? (trip.ideas || []).find((i) => i.id === step.ideaId) : null;
  const duration = idea && idea.durationMin ? formatIdeaDuration(idea.durationMin) : null;
  const meta = [noteOf(step) || place, duration].filter(Boolean).join(" · ");
  const price = paid(priceOf(step, rate, home, sameCurrency));
  const expense = (trip.expenses || []).find((e) => e.stepId === step.id);
  const card = driverCard(step);
  const showDriver = !done && !next && card && wantsDriver(step);
  const canNote = done && !expense && (step.type === "repas" || Number(step.price) > 0);
  return (
    <View style={styles.stepRow}>
      <Text style={[styles.time, next && { fontFamily: FONTS.monoSemi }, done && { color: THEME.inkFaint }]} numberOfLines={1}>{step.time || "—"}</Text>
      <View style={styles.nodeCol}>
        <StepDot
          icon={stepIcon(step)}
          tone={stepTone(step)}
          state={state}
          label={`${step.title}${step.time ? ", " + step.time.replace(":", " h ") : ""}`}
          hint={done ? "Annuler" : "Marquer comme fait"}
          disabled={busy}
          onPress={onToggle}
        />
        {!last ? <DotLine color={ink.color} /> : null}
      </View>
      <View style={[styles.stepBody, !last && { minHeight: 56 }]}>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Modifier ${step.title}`} style={({ pressed }) => [{ gap: 6 }, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.ttl, done && styles.ttlDone]} numberOfLines={3}>{name}</Text>
          {meta || price ? (
            <View style={styles.meta}>
              {meta ? <Text style={[type.subhead, { flexShrink: 1 }]} numberOfLines={2}>{meta}</Text> : null}
              {price ? <Tag mono tone={stepTone(step)} label={price} /> : null}
            </View>
          ) : null}
        </Pressable>
        {expense ? <Tag mono tone="trip" icon="wallet-outline" label={`Dépensé ${formatMoney(convertAmount(expense.amount, rate), home)}`} /> : null}
        {canNote ? <Button title="Noter la dépense" icon="add" variant="secondary" size="sm" onPress={onNoteExpense} style={styles.small} accessibilityLabel={`Noter la dépense : ${step.title}`} /> : null}
        {showDriver ? <Button title="Montrer au chauffeur" icon="phone-portrait-outline" variant="secondary" size="sm" onPress={() => onShowDriver(card)} style={styles.small} accessibilityLabel={`Montrer l'adresse au chauffeur : ${step.title}`} /> : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  head: { gap: 6 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headTag: { height: 30, paddingHorizontal: 10 },

  ticket: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  tkTitle: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 4, gap: 4 },
  stub: { paddingHorizontal: 22, paddingTop: 4, paddingBottom: 16, gap: 10 },
  whenRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  when: { ...type.subhead, color: THEME.ink, flexShrink: 1 },
  whenBold: { fontFamily: FONTS.bodySemi },
  btns: { flexDirection: "row", gap: 10, paddingHorizontal: 22, paddingBottom: 22 },
  btn: { flex: 1 },
  driver: { paddingHorizontal: 22, paddingBottom: 22, marginTop: -8 },
  doneTitle: { fontFamily: FONTS.head, fontSize: 20, lineHeight: 24, color: THEME.ink },

  note: { backgroundColor: THEME.bgCard, minHeight: 140, borderWidth: 1.5, borderColor: THEME.hairStrong, overflow: "hidden" },
  rule: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: THEME.hairStrong },
  noteInput: { minHeight: 140, paddingTop: 14, paddingBottom: 12, paddingHorizontal: 16, fontFamily: FONTS.body, fontSize: 17, lineHeight: LINE, color: THEME.ink },
  hint: { ...type.caption, color: THEME.inkFaint },

  stats: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, backgroundColor: THEME.bgCard, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 10, ...paperEdge() },
  statFigure: { fontFamily: FONTS.monoMed, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: THEME.ink },
  statUnit: { fontFamily: FONTS.monoMed, fontSize: 18, lineHeight: 24, letterSpacing: 0, color: THEME.inkMuted },
  statCaption: { fontFamily: FONTS.bodyMed, fontSize: 14, lineHeight: 18, color: THEME.inkMuted },

  stepRow: { flexDirection: "row", gap: 10 },
  time: { width: 54, fontFamily: FONTS.monoMed, fontSize: 17, lineHeight: 34, letterSpacing: -0.35, textAlign: "right", color: THEME.ink },
  nodeCol: { width: 34, alignItems: "center" },
  placeLine: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  stepBody: { flex: 1, minWidth: 0, paddingBottom: 18, gap: 6 },
  ttl: { fontFamily: FONTS.headSemi, fontSize: 18, lineHeight: 24, letterSpacing: -0.1, color: THEME.ink },
  ttlDone: { color: THEME.inkFaint, textDecorationLine: "line-through" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 6 },
  small: { alignSelf: "flex-start" },
}));
