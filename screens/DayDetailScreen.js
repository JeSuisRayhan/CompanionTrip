import React, { useState, useCallback, useEffect, useContext } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Linking, Alert, Platform } from "react-native";
import { SafeAreaView, SafeAreaInsetsContext } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, radius, type, themedStyles, paperEdge } from "../lib/theme";
import { TYPES } from "../lib/constants";
import { scopedId } from "../lib/parkDay";
import { splitTitlePlace } from "../lib/script";
import { directionsUrl } from "../lib/map";
import { driverCard } from "../lib/driverCard";
import { isPdfDoc } from "../lib/documents";
import { getTrip, toggleActivityDone, editActivity, setDayLocation, addActivity, deleteActivity, setDayType, setActivityOrder, setDayJournal, deleteDay, deleteDayMessage } from "../lib/trips";
import { bookingOf, deadlineInfo } from "../lib/booking";
import { resolveDayDate, formatDayLabel, isoDate } from "../lib/dates";
import { formatMoney } from "../lib/budget";
import { dayLegs, formatDistance } from "../lib/travelTime";
import { proximityOrder } from "../lib/dayOrder";
import { journalOf, canWriteJournal, MAX_JOURNAL } from "../lib/journal";
import { fetchDayWeather, weatherInfo } from "../lib/weather";
import { fetchQueueTimes, liveByRideId } from "../lib/queueTimes";
import { fetchFlightStatus, hasFlightStatusKey } from "../lib/flightStatus";
import UndoToast from "../components/UndoToast";
import DayDoneStamp from "../components/DayDoneStamp";
import WaitBadge from "../components/WaitBadge";
import QueueTimesCredit from "../components/QueueTimesCredit";
import LegLine from "../components/LegLine";
import { Txt, Button, IconButton, Chip, Badge, Surface, Field, Group, Row, Thumb, SectionTitle, ProgressBar, EmptyState, Sheet, round } from "../components/ui";

export function WeatherBadge({ day, dateISO, compact, fallbackLocation }) {
  const [weather, setWeather] = useState(undefined); // undefined = loading, null = no data

  useEffect(() => {
    let cancelled = false;
    setWeather(undefined);
    fetchDayWeather(day, dateISO, fallbackLocation).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => {
      cancelled = true;
    };
  }, [day.id, day.location, day.title, dateISO, fallbackLocation]);

  if (weather === undefined) return null; // still loading — avoid flashing a message
  if (weather) {
    const info = weatherInfo(weather.code);
    return (
      <View
        style={styles.weatherBadge}
        accessible
        accessibilityLabel={`Météo${info.label ? " : " + info.label : ""}, maximum ${weather.tempMax}°, minimum ${weather.tempMin}°`}
      >
        <Text style={styles.weatherEmoji}>{info.emoji}</Text>
        <Text style={compact ? styles.weatherTempsSmall : styles.weatherTemps}>
          {weather.tempMax}° / {weather.tempMin}°
        </Text>
      </View>
    );
  }

  // weather === null: say nothing, except where the person can do something
  // about it. On a day card there is room for nothing; on the day itself, a place
  // they typed that the forecast does not know deserves a word (the place chip
  // right below already invites them to add one when there is none).
  if (compact) return null;
  const typed = (day.location || "").trim();
  if (!typed) return null;
  const daysAhead = dateISO ? Math.round((new Date(dateISO + "T00:00:00") - new Date()) / 86400000) : null;
  if (daysAhead != null && (daysAhead > 15 || daysAhead < -1)) return null;
  return <Text style={styles.weatherUnavailable}>Pas de prévision pour « {typed} »</Text>;
}

export default function DayDetailScreen({ route, navigation }) {
  const { tripId, dayId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [flightOpen, setFlightOpen] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", undoActivity: null, undoOrder: null });
  const [orderOpen, setOrderOpen] = useState(false); // the preview of "réordonner par proximité"
  const [journalOpen, setJournalOpen] = useState(false); // the note du soir
  const [dayDone, setDayDone] = useState(false); // "Journée faite" is showing
  const insets = useContext(SafeAreaInsetsContext);

  const refresh = useCallback(async () => {
    const t = await getTrip(tripId);
    setTrip(t);
    setLoading(false);
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // A park day shows the queues of the moment, as the attractions list and the live day do
  const [live, setLive] = useState(null);
  const parkDay = trip ? trip.days.find((d) => d.id === dayId) : null;
  const qtId = parkDay && parkDay.dayType === "park" ? ((trip.tripType === "park" ? trip.park : parkDay.park) || {}).qtId : null;
  useEffect(() => {
    setLive(null);
    if (qtId == null) return undefined;
    let cancelled = false;
    fetchQueueTimes(qtId)
      .then((data) => !cancelled && setLive(liveByRideId(data)))
      .catch(() => {}); // no live data: the estimate written with the step
    return () => {
      cancelled = true;
    };
  }, [qtId]);

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  const dayIndex = trip.days.findIndex((d) => d.id === dayId);
  const day = trip.days[dayIndex];
  if (!day) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <EmptyState
            icon="calendar-outline"
            title="Jour introuvable"
            text="Ce jour n'existe plus dans le voyage."
            action={{ label: "Retour", onPress: () => navigation.goBack() }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const date = resolveDayDate(trip, day, dayIndex);
  const sorted = [...day.activities].sort((a, b) => {
    if (!a.time && !b.time) return 0; // two steps without a time keep the order they were put in
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
  // how far each step is from the one before it (not on a park day: the park has its own walking times)
  const legs = trip.tripType === "park" || day.dayType === "park" ? null : dayLegs(trip, sorted);
  // A shorter way between the steps that have no time, when there is one (offered under the list)
  const suggestion = proximityOrder(trip, day);
  const offer = suggestion && suggestion.changed ? suggestion : null;
  const journal = journalOf(day);
  const mayWriteJournal = canWriteJournal(trip, day, dayIndex, isoDate(new Date()));
  // Steps of a normal day can be located from the map; a park day only has its attractions' positions.
  const hasMapPin = day.activities.some((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)) || (trip.tripType !== "park" && day.dayType !== "park" && day.activities.length > 0);
  const doneCount = day.activities.filter((a) => a.done).length;
  // "Next step" is only marked on a day being lived: today, or already started
  const firstUndoneIndex = date === isoDate(new Date()) || doneCount > 0 ? sorted.findIndex((a) => !a.done) : -1;
  const location = (day.location || "").trim();
  // A park day of a normal trip has its own park and attractions: the park screens open it through a view of the trip.
  const isParkTrip = trip.tripType === "park";
  const parkTripId = isParkTrip ? tripId : scopedId(tripId, dayId);
  // On a park day, the zone of a ride says more than its street address.
  const parkIdeas = day.dayType === "park" ? (isParkTrip ? trip.ideas : (day.park && trip.parkLists && trip.parkLists[day.park.qtId]) || []) : [];
  const parkIdeaOf = (a) => (a.ideaId ? parkIdeas.find((i) => i.id === a.ideaId) || null : null);

  // Ticking the last open step of a day inks "Journée faite" on the screen (dayDone, above).
  async function onToggleDone(activityId) {
    const target = day.activities.find((a) => a.id === activityId);
    const finishes = !!target && !target.done && day.activities.every((a) => a.id === activityId || a.done);
    await toggleActivityDone(tripId, dayId, activityId);
    refresh();
    if (finishes) setDayDone(true);
  }

  // One tap on "À réserver" says it is booked.
  async function onBook(activity) {
    await editActivity(tripId, dayId, activity.id, { booking: "done", bookBy: null });
    refresh();
  }

  async function onDeleteWithUndo(activity) {
    await deleteActivity(tripId, dayId, activity.id);
    await refresh();
    setToast({ visible: true, message: `"${activity.title}" supprimée`, undoActivity: activity, undoOrder: null });
  }

  // The steps without a time go in the order that shortens the way; one tap on "Annuler" puts the old order back.
  async function onApplyOrder() {
    if (!offer) return;
    setOrderOpen(false);
    await setActivityOrder(tripId, dayId, offer.ids);
    await refresh();
    setToast({ visible: true, message: "Journée réordonnée", undoActivity: null, undoOrder: offer.previousIds });
  }

  async function onUndoDelete() {
    const activity = toast.undoActivity;
    const order = toast.undoOrder;
    setToast({ visible: false, message: "", undoActivity: null, undoOrder: null });
    if (order) {
      await setActivityOrder(tripId, dayId, order);
      refresh();
      return;
    }
    if (activity) {
      const { id, ...rest } = activity;
      await addActivity(tripId, dayId, rest);
      refresh();
    }
  }

  function onToastDismiss() {
    setToast({ visible: false, message: "", undoActivity: null, undoOrder: null });
  }

  // A bottom sheet, not Alert.alert: Android alerts show at most 3 buttons and we have 3 choices + cancel.
  function openDayTypeMenu() {
    setTypeMenuOpen(true);
  }

  function chooseDayType(next) {
    setTypeMenuOpen(false);
    setDayType(tripId, dayId, next).then(refresh);
  }

  // Deleting the day takes its steps with it: ask first, and say how many.
  function askDeleteDay() {
    setTypeMenuOpen(false);
    // let the sheet finish closing (iOS)
    setTimeout(() => {
      Alert.alert(`Supprimer « ${day.title} » ?`, deleteDayMessage(day), [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            await deleteDay(tripId, dayId);
            navigation.goBack();
          },
        },
      ]);
    }, 350);
  }

  function addStep() {
    navigation.navigate("ActivityEditor", { tripId, dayId, activity: null });
  }

  const plural = day.activities.length !== 1 ? "s" : "";
  const stepLabel = `étape${plural} faite${plural}`;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Retour" filled onPress={() => navigation.goBack()} />
        <Txt variant="subhead" numberOfLines={1} style={styles.tripName}>
          {trip.name}
        </Txt>
        {hasMapPin ? <IconButton icon="map-outline" label="Voir le jour sur la carte" onPress={() => navigation.navigate("TripMap", { tripId, dayId })} /> : null}
        <IconButton icon="ellipsis-horizontal" label="Type de jour" onPress={openDayTypeMenu} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: layout.tabBarClearance + (insets ? insets.bottom : 0) }]}>
        <View style={styles.titleBlock}>
          <Txt variant="title" numberOfLines={2} accessibilityRole="header">
            {day.title}
          </Txt>
          {date ? <Txt variant="subhead">{formatDayLabel(date)}</Txt> : null}
          <View style={styles.metaRow}>
            {date ? <WeatherBadge day={day} dateISO={date} fallbackLocation={trip.defaultLocation} /> : null}
            <Chip
              icon="location-outline"
              label={location || "Ajouter un lieu"}
              onPress={() => setLocationModalOpen(true)}
              accessibilityLabel={location ? `Lieu du jour : ${location}. Modifier` : "Ajouter un lieu pour ce jour"}
              style={styles.locationChip}
            />
          </View>
        </View>

        {day.activities.length > 0 && day.dayType !== "park" ? (
          <View style={styles.progressRow}>
            <ProgressBar value={doneCount / day.activities.length} height={6} style={styles.progressBar} />
            <Text style={type.caption}>
              <Text style={styles.progressNumber}>
                {doneCount}/{day.activities.length}
              </Text>
              {` ${stepLabel}`}
            </Text>
          </View>
        ) : null}

        {day.dayType === "flight" ? <FlightDayBanner day={day} dateISO={date} /> : null}
        {day.dayType === "flight" ? (
          <TicketsBlock
            docs={(trip.documents || []).filter((d) => d.dayId === dayId)}
            hasRoute={!!(day.flightInfo && (day.flightInfo.origin || day.flightInfo.destination || day.flightInfo.flightNumber || day.flightInfo.seat))}
            onScan={() => navigation.navigate("TicketScanner", { tripId, dayId })}
            onGallery={() => navigation.navigate("Trip", { tripId, addFrom: "library", dayId })}
            onOpen={(doc) => navigation.navigate("Trip", { tripId, viewDocId: doc.id })}
            onEdit={() => setFlightOpen(true)}
          />
        ) : null}
        {day.dayType === "park" ? (
          <ParkDayBanner
            day={day}
            park={isParkTrip ? trip.park : day.park}
            attractionCount={isParkTrip ? 0 : ((day.park && trip.parkLists && trip.parkLists[day.park.qtId]) || []).length}
            ownPark={!isParkTrip}
            onAttractions={() => navigation.navigate("DayAttractions", { tripId, dayId })}
            onPlan={() => navigation.navigate("ParkPlan", { tripId: parkTripId, dayId })}
            onLive={() => navigation.navigate("ParkLive", { tripId: parkTripId, dayId })}
          />
        ) : null}

        {sorted.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="La page est blanche"
            text="À vous de l'écrire."
            action={{ label: "Ajouter une étape", icon: "add", onPress: addStep }}
          />
        ) : (
          <View>
            {sorted.map((a, i) => (
              <React.Fragment key={a.id}>
                {legs && legs.get(a.id) ? <LegLine compact leg={legs.get(a.id)} arriveAt={a.time} /> : null}
                <ActivityRow
                  activity={a}
                  trip={trip}
                  idea={parkIdeaOf(a)}
                  ride={live && parkIdeaOf(a) && parkIdeaOf(a).qtId != null ? live.get(parkIdeaOf(a).qtId) : null}
                  isCurrent={i === firstUndoneIndex}
                  onToggleDone={() => onToggleDone(a.id)}
                  onBook={() => onBook(a)}
                  onPress={() => navigation.navigate("ActivityEditor", { tripId, dayId, activity: a })}
                  onShowDriver={(card) => navigation.navigate("ShowDriver", card)}
                  onDeleteWithUndo={() => onDeleteWithUndo(a)}
                />
              </React.Fragment>
            ))}
          </View>
        )}

        {offer ? (
          <Group style={styles.orderOffer}>
            <Row
              icon="swap-vertical-outline"
              tone="neutral"
              title="Un autre ordre raccourcit la journée"
              subtitle={`${formatDistance(offer.saved)} de moins entre les étapes sans heure`}
              chevron
              onPress={() => setOrderOpen(true)}
              accessibilityLabel={`Un autre ordre raccourcit la journée de ${formatDistance(offer.saved)}. Voir`}
            />
          </Group>
        ) : null}

        {sorted.length > 0 ? <Button title="Ajouter une étape" icon="add" variant="secondary" full onPress={addStep} style={styles.addStep} /> : null}

        {journal ? (
          <Pressable
            onPress={() => setJournalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Note du soir : ${journal}. Modifier`}
            style={({ pressed }) => [styles.journalCard, round("lg"), pressed && { opacity: 0.85 }]}
          >
            <View style={styles.journalHead}>
              <Icon name="moon-outline" size={18} color={THEME.inkMuted} />
              <Text style={type.caption}>Note du soir</Text>
            </View>
            <Text style={type.body}>{journal}</Text>
          </Pressable>
        ) : mayWriteJournal && sorted.length > 0 ? (
          <Group style={styles.journalAdd}>
            <Row icon="moon-outline" tone="neutral" title="Ajouter une note du soir" subtitle="Une phrase pour se souvenir de cette journée" chevron onPress={() => setJournalOpen(true)} accessibilityLabel="Ajouter une note du soir" />
          </Group>
        ) : null}
        {live && sorted.length > 0 ? <QueueTimesCredit /> : null}
      </ScrollView>

      <LocationModal
        visible={locationModalOpen}
        initial={day.location || ""}
        onClose={() => setLocationModalOpen(false)}
        onSave={async (loc) => {
          await setDayLocation(tripId, dayId, loc);
          setLocationModalOpen(false);
          refresh();
        }}
      />

      <FlightSheet
        visible={flightOpen}
        initial={day.flightInfo}
        onClose={() => setFlightOpen(false)}
        onSave={async (info) => {
          setFlightOpen(false);
          await setDayType(tripId, dayId, "flight", info);
          refresh();
        }}
      />

      <Sheet visible={typeMenuOpen} onClose={() => setTypeMenuOpen(false)} title="Type de jour">
        <Txt variant="subhead" style={styles.sheetHelp}>
          Donne un habillage et des rappels adaptés à ce jour.
        </Txt>
        <Group style={styles.typeGroup}>
          <Row icon="today-outline" title="Jour normal" selected={!day.dayType} right={!day.dayType ? <Icon name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType(null)} />
          <Row icon="airplane-outline" title="Jour de vol ou de train" selected={day.dayType === "flight"} right={day.dayType === "flight" ? <Icon name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType("flight")} />
          <Row icon="happy-outline" title="Jour parc d'attractions" selected={day.dayType === "park"} right={day.dayType === "park" ? <Icon name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType("park")} />
        </Group>
        <Group style={styles.typeGroup}>
          <Row icon="trash-outline" tone="stamp" title="Supprimer ce jour" onPress={askDeleteDay} />
        </Group>
      </Sheet>

      <JournalSheet
        visible={journalOpen}
        title={day.title}
        initial={journal}
        onClose={() => setJournalOpen(false)}
        onSave={async (text) => {
          setJournalOpen(false);
          await setDayJournal(tripId, dayId, text);
          refresh();
        }}
      />

      <OrderSheet visible={orderOpen && !!offer} trip={trip} offer={offer} onClose={() => setOrderOpen(false)} onApply={onApplyOrder} />

      <UndoToast visible={toast.visible} message={toast.message} onUndo={onUndoDelete} onDismiss={onToastDismiss} undoLabel={toast.undoOrder ? "Annuler le changement d'ordre" : undefined} />
      {dayDone ? (
        <DayDoneStamp
          onHide={() => {
            setDayDone(false);
            if (!journal && mayWriteJournal) setJournalOpen(true); // the day is done: a line to remember it by
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

// A planner writes "Attente estimée : 30 min" as the note of a ride: shown as a
// small tag instead of a sentence repeated on every step.
const WAIT_NOTE = /^Attente estimée : (\d+) min$/;

// One step of the day, as a small ticket: a stub with the time and the kind of
// step, then the name with what matters under it. Next (first undone) = gold
// stub and outline; done = teal, softened. The round box on the right marks it done.
function ActivityRow({ activity, trip, idea, ride, isCurrent, onToggleDone, onBook, onPress, onShowDriver, onDeleteWithUndo }) {
  const t = TYPES[activity.type] || TYPES.activite;
  const done = !!activity.done;
  const hasPrice = activity.price != null;
  const land = idea ? idea.land : null;
  const split = activity.address ? { title: activity.title, place: null } : splitTitlePlace(activity.title);
  const place = land || activity.address || split.place;
  // "Electric Railway (American Waterfront)" next to its zone "American Waterfront": the zone is said once
  const name = land && split.title.toLowerCase().endsWith(`(${land.toLowerCase()})`) ? split.title.slice(0, -(land.length + 2)).trim() : split.title;
  const waitMatch = activity.note ? activity.note.match(WAIT_NOTE) : null;
  const note = waitMatch ? "" : activity.note;
  // the queue of the moment when Queue-Times has it (a show has none), else the estimate; nothing once done
  const liveWait = !done && !!ride && (!ride.open || ride.wait != null) && !(idea && (idea.categoryId === "spectacle" || idea.showTime));
  const estimate = !done && !liveWait && waitMatch ? waitMatch[1] : null;
  const stubBg = done ? THEME.bgCardAlt : isCurrent ? THEME.goldFill : t.dim;
  const stubInk = done ? THEME.inkFaint : isCurrent ? THEME.onGold : t.color;
  // the usual "activité" pin says nothing: an icon only for the other kinds, or when there is no time to show
  const showIcon = !activity.time || activity.type !== "activite";
  const label = `${activity.title}${activity.time ? ", " + activity.time : ""}${done ? ", fait" : isCurrent ? ", à suivre" : ""}`;
  // a step that is not done yet and has an address or a position can be gone to
  const goUrl = done ? null : directionsUrl(activity, Platform.OS);
  const goThere = () => Linking.openURL(goUrl).catch(() => Alert.alert("Impossible d'ouvrir l'application de cartes"));
  // the address held out to a driver: for a step with a place that is not done yet
  const card = done || idea ? null : driverCard(activity);
  // still to book (with the deadline when there is one), or booked
  const bookState = done ? null : bookingOf(activity);
  const bookInfo = bookState === "todo" && activity.bookBy ? deadlineInfo(activity.bookBy, isoDate(new Date())) : null;

  return (
    <View style={styles.stepWrap}>
      <Swipeable
        containerStyle={styles.swipeContainer}
        renderRightActions={() => (
          <Pressable style={styles.deleteAction} onPress={onDeleteWithUndo} accessibilityRole="button" accessibilityLabel={`Supprimer ${activity.title}`}>
            <Icon name="trash-outline" size={20} color={THEME.bg} />
          </Pressable>
        )}
        overshootRight={false}
      >
        <View style={[styles.card, isCurrent && !done && styles.cardCurrent, done && styles.cardDone]}>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.cardMain, pressed && { backgroundColor: THEME.pressed }]}
          >
            <View style={[styles.stub, { backgroundColor: stubBg }]}>
              {activity.time ? <Text style={[styles.stubTime, { color: stubInk }]}>{activity.time}</Text> : null}
              {showIcon ? <Icon name={t.icon} size={activity.time ? 14 : 18} color={stubInk} /> : null}
            </View>
            <View style={styles.body}>
              <View style={styles.stepTitleRow}>
                <Text style={[styles.stepTitle, done && { color: THEME.inkMuted }]}>{name}</Text>
              </View>
              {place || liveWait || estimate || activity.confirmationCode || hasPrice || goUrl || card || bookState ? (
                <View style={styles.detailLine}>
                  {place ? (
                    <View style={styles.metaLine}>
                      <Icon name="location-outline" size={14} color={THEME.inkFaint} />
                      <Text style={[type.caption, styles.metaText]} numberOfLines={2}>{place}</Text>
                    </View>
                  ) : null}
                  {liveWait ? <WaitBadge ride={ride} idea={idea} /> : null}
                  {estimate ? <Badge label={`~${estimate} min`} icon="hourglass-outline" tone="neutral" /> : null}
                  {bookState === "todo" ? (
                    <Pressable
                      onPress={onBook}
                      hitSlop={space.sm}
                      accessibilityRole="button"
                      accessibilityLabel={`À réserver${bookInfo ? ", " + bookInfo.text : ""}. Marquer comme réservé : ${activity.title}`}
                      style={({ pressed }) => pressed && { opacity: 0.7 }}
                    >
                      <Badge label={bookInfo ? `À réserver · ${bookInfo.text}` : "À réserver"} icon="ticket-outline" tone={bookInfo && bookInfo.tone === "stamp" ? "stamp" : "neutral"} />
                    </Pressable>
                  ) : null}
                  {bookState === "done" ? <Badge label="Réservé" icon="checkmark" tone="teal" /> : null}
                  {activity.confirmationCode ? <Badge label={activity.confirmationCode} icon="key-outline" tone="neutral" /> : null}
                  {hasPrice ? <Text style={styles.stepPrice}>{formatMoney(activity.price, trip.currency)}</Text> : null}
                  {goUrl ? (
                    <Pressable onPress={goThere} hitSlop={space.sm} accessibilityRole="button" accessibilityLabel={`Y aller : ${activity.title}`} style={({ pressed }) => [styles.goPill, pressed && { opacity: 0.7 }]}>
                      <Icon name="navigate" size={13} color={THEME.blue} />
                      <Text style={[type.caption, { color: THEME.blue }]}>Y aller</Text>
                    </Pressable>
                  ) : null}
                  {card ? (
                    <Pressable onPress={() => onShowDriver(card)} hitSlop={space.sm} accessibilityRole="button" accessibilityLabel={`Montrer l'adresse au chauffeur : ${activity.title}`} style={({ pressed }) => [styles.goPill, pressed && { opacity: 0.7 }]}>
                      <Icon name="car-outline" size={14} color={THEME.blue} />
                      <Text style={[type.caption, { color: THEME.blue }]}>Montrer</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {note ? <Text style={[type.subhead, done && { color: THEME.inkFaint }]}>{note}</Text> : null}
            </View>
          </Pressable>
          <Pressable
            onPress={onToggleDone}
            hitSlop={space.sm}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={`Fait : ${activity.title}`}
            style={({ pressed }) => [styles.checkHit, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.check, done && styles.checkDone]}>{done ? <Icon name="checkmark" size={16} color={THEME.onAccent} /> : null}</View>
          </Pressable>
        </View>
      </Swipeable>
    </View>
  );
}

// A row of little dashes, like the tear-off line of a ticket.
function Dashes() {
  return (
    <View style={styles.dashes}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={styles.dash} />
      ))}
    </View>
  );
}

// The flight day's "ticket": route in numerals, then flight and seat, then live status.
function FlightDayBanner({ day, dateISO }) {
  const info = day.flightInfo;
  const [liveStatus, setLiveStatus] = useState(undefined); // undefined = not tried/loading, null = unavailable

  useEffect(() => {
    let cancelled = false;
    if (info?.flightNumber && hasFlightStatusKey()) {
      setLiveStatus(undefined);
      fetchFlightStatus(info.flightNumber.replace(/\s+/g, ""), dateISO)
        .then((s) => !cancelled && setLiveStatus(s))
        .catch(() => !cancelled && setLiveStatus(null));
    }
    return () => {
      cancelled = true;
    };
  }, [info?.flightNumber, dateISO]);

  function formatTime(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  const hasRoute = !!(info && (info.origin || info.destination));
  const hasDetails = hasRoute || !!(info && (info.flightNumber || info.seat));
  const departureGate = liveStatus?.departure?.gate;
  const arrivalGate = liveStatus?.arrival?.gate;

  return (
    <Surface pad="lg" style={styles.panel}>
      {hasDetails ? (
        <>
          {hasRoute ? (
            <View style={styles.flightRoute}>
              <View style={styles.flightAirport}>
                <Text style={styles.flightCode} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{info.origin || "?"}</Text>
                {departureGate ? <Text style={styles.flightGate}>Porte {departureGate}</Text> : null}
              </View>
              <View style={styles.flightPath}>
                <Dashes />
                <Icon name="airplane" size={18} color={THEME.blue} />
                <Dashes />
              </View>
              <View style={[styles.flightAirport, { alignItems: "flex-end" }]}>
                <Text style={styles.flightCode} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{info.destination || "?"}</Text>
                {arrivalGate ? <Text style={styles.flightGate}>Porte {arrivalGate}</Text> : null}
              </View>
            </View>
          ) : null}

          {info.flightNumber || info.seat ? (
            <View style={[styles.flightFacts, hasRoute && styles.flightFactsRuled]}>
              {info.flightNumber ? (
                <View>
                  <Text style={type.caption}>Numéro</Text>
                  <Text style={type.numeral}>{info.flightNumber}</Text>
                </View>
              ) : null}
              {info.seat ? (
                <View>
                  <Text style={type.caption}>Siège</Text>
                  <Text style={type.numeral}>{info.seat}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {liveStatus?.departure?.estimated ? (
            <View style={styles.flightLive}>
              <Text style={[type.caption, { color: THEME.teal }]}>
                Départ estimé <Text style={styles.flightLiveTime}>{formatTime(liveStatus.departure.estimated)}</Text>
                {liveStatus.departure.terminal ? ` · Terminal ${liveStatus.departure.terminal}` : ""}
              </Text>
              {liveStatus.status === "cancelled" ? <Badge label="Vol annulé" tone="stamp" icon="close-circle" /> : null}
            </View>
          ) : null}
          {liveStatus === null && hasFlightStatusKey() ? (
            <Text style={[type.caption, styles.flightNote]}>Statut en temps réel indisponible pour ce vol.</Text>
          ) : null}
        </>
      ) : (
        <View style={styles.panelRow}>
          <Icon name="airplane" size={22} color={THEME.blue} />
          <Txt variant="subhead" style={styles.panelText}>
            Jour de vol ou de train — scannez votre billet ou saisissez le trajet ci-dessous.
          </Txt>
        </View>
      )}
    </Surface>
  );
}

// Tickets of a flight or train day: scan one (the barcode is kept with the
// photo), add one from the gallery, read the ones already added, and type the
// route by hand when there is nothing to scan.
function TicketsBlock({ docs, hasRoute, onScan, onGallery, onOpen, onEdit }) {
  return (
    <View style={styles.tickets}>
      <SectionTitle title="Billets" count={docs.length > 0 ? docs.length : undefined} />
      {docs.length > 0 ? (
        <Group style={styles.ticketList}>
          {docs.map((doc) => (
            <Row
              key={doc.id}
              lead={isPdfDoc(doc) ? <Thumb icon="document-text" tone="stamp" size={44} /> : <Thumb uri={doc.uri} icon="document-text" size={44} />}
              title={doc.title}
              subtitle={doc.scannedCode ? <Text style={type.numeralSmall} numberOfLines={1}>{doc.scannedCode}</Text> : undefined}
              chevron
              accessibilityLabel={`Ouvrir le billet ${doc.title}`}
              onPress={() => onOpen(doc)}
            />
          ))}
        </Group>
      ) : (
        <Txt variant="subhead" style={styles.ticketHelp}>
          Scannez votre billet de vol ou de train : il reste ici, sous la main le jour du départ.
        </Txt>
      )}
      <View style={styles.ticketActions}>
        <Button title="Scanner un billet" icon="qr-code-outline" size="sm" tone="gold" onPress={onScan} />
        <Button title="Galerie" icon="images-outline" size="sm" variant="secondary" accessibilityLabel="Ajouter un billet depuis la galerie" onPress={onGallery} />
        <Button title={hasRoute ? "Modifier le trajet" : "Saisir le trajet"} icon="create-outline" size="sm" variant="secondary" onPress={onEdit} />
      </View>
    </View>
  );
}

// The route of a flight or train day, typed by hand.
// The note of the evening: a few lines about the day. Saving an empty text removes the note.
function JournalSheet({ visible, title, initial, onClose, onSave }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (visible) setText(initial || "");
  }, [visible, initial]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Note du soir">
      <Txt variant="subhead" style={styles.sheetHelp}>{title}</Txt>
      <Field
        label="Comment était cette journée ?"
        value={text}
        onChangeText={setText}
        placeholder="Le meilleur moment, ce qu'on referait, ce qu'il faut retenir…"
        multiline
        maxLength={MAX_JOURNAL}
      />
      <View style={styles.sheetButtons}>
        {initial ? <Button title="Supprimer" variant="secondary" tone="stamp" style={styles.sheetButton} onPress={() => onSave("")} /> : <Button title="Plus tard" variant="secondary" style={styles.sheetButton} onPress={onClose} />}
        <Button title="Enregistrer" style={styles.sheetButton} onPress={() => onSave(text)} />
      </View>
    </Sheet>
  );
}

// Preview of the shorter order: the steps in their new order, how far each is from the one before, the total.
function OrderSheet({ visible, trip, offer, onClose, onApply }) {
  if (!offer) return null;
  const legs = dayLegs(trip, offer.anchor ? [offer.anchor, ...offer.order] : offer.order);
  return (
    <Sheet visible={visible} onClose={onClose} title="Réordonner par proximité">
      <Txt variant="subhead" style={styles.sheetHelp}>
        Les étapes sans heure passent dans l'ordre qui réduit les trajets. Les autres ne bougent pas.
        {offer.anchor ? ` On part de « ${splitTitlePlace(offer.anchor.title).title} ».` : ""}
      </Txt>
      <Group style={styles.typeGroup}>
        {offer.order.map((step, i) => {
          const leg = legs.get(step.id);
          return <Row key={step.id} icon={TYPES[step.type] ? TYPES[step.type].icon : "location-outline"} tone="neutral" title={`${i + 1}. ${splitTitlePlace(step.title).title}`} subtitle={leg ? leg.text : undefined} />;
        })}
      </Group>
      <Txt variant="caption" style={styles.sheetHelp}>
        {`Entre ces étapes : ${formatDistance(offer.before)} aujourd'hui, ${formatDistance(offer.after)} dans ce nouvel ordre (à vol d'oiseau).`}
      </Txt>
      <View style={styles.sheetButtons}>
        <Button title="Annuler" variant="secondary" style={styles.sheetButton} onPress={onClose} />
        <Button title="Appliquer" style={styles.sheetButton} onPress={onApply} />
      </View>
    </Sheet>
  );
}

function FlightSheet({ visible, initial, onClose, onSave }) {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [number, setNumber] = useState("");
  const [seat, setSeat] = useState("");

  useEffect(() => {
    if (visible) {
      setOrigin((initial && initial.origin) || "");
      setDestination((initial && initial.destination) || "");
      setNumber((initial && initial.flightNumber) || "");
      setSeat((initial && initial.seat) || "");
    }
  }, [visible]);

  // "cdg" becomes "CDG"; a city name is left as typed
  const code = (v) => (/^[A-Za-z]{3}$/.test(v.trim()) ? v.trim().toUpperCase() : v.trim());

  return (
    <Sheet visible={visible} onClose={onClose} title="Trajet du jour">
      <Txt variant="subhead" style={styles.sheetHelp}>
        Un vol ou un train : un code d'aéroport (CDG) ou une ville (Lyon).
      </Txt>
      <View style={styles.sheetButtons}>
        <Field label="Départ" value={origin} onChangeText={setOrigin} placeholder="CDG" maxLength={16} style={styles.sheetButton} />
        <Field label="Arrivée" value={destination} onChangeText={setDestination} placeholder="NRT" maxLength={16} style={styles.sheetButton} />
      </View>
      <Field label="Numéro de vol ou de train" value={number} onChangeText={setNumber} placeholder="AF 274" autoCapitalize="characters" maxLength={14} />
      <Field label="Siège ou place" value={seat} onChangeText={setSeat} placeholder="32A" autoCapitalize="characters" maxLength={10} />
      <View style={styles.sheetButtons}>
        <Button title="Annuler" variant="secondary" style={styles.sheetButton} onPress={onClose} />
        <Button title="Enregistrer" style={styles.sheetButton} onPress={() => onSave({ origin: code(origin), destination: code(destination), flightNumber: number.trim(), seat: seat.trim() })} />
      </View>
    </Sheet>
  );
}

// The park day's card. In a park trip the park is the trip's; in a normal trip
// each park day has its own park and list of attractions, chosen from here.
function ParkDayBanner({ day, park, attractionCount, ownPark, onAttractions, onPlan, onLive }) {
  const done = day.activities.filter((a) => a.done).length;
  const total = day.activities.length;
  const many = (n) => (n !== 1 ? "s" : "");
  let line;
  if (total > 0) line = `${done}/${total} attraction${many(total)} faite${many(total)} — bonne journée parc !`;
  else if (!ownPark) line = "Jour parc d'attraction — ajoutez vos attractions !";
  else if (!park) line = "Choisissez le parc pour ajouter ses attractions et préparer la journée.";
  else if (attractionCount === 0) line = "Aucune attraction pour l'instant : ajoutez celles du parc.";
  else line = `${attractionCount} attraction${many(attractionCount)} dans la liste.`;

  return (
    <Surface pad="lg" style={styles.panel}>
      <View style={styles.panelRow}>
        <Icon name="sparkles" size={22} color={THEME.pink} />
        <View style={styles.panelText}>
          {ownPark && park ? (
            <Txt variant="heading" numberOfLines={2}>
              {park.name}
            </Txt>
          ) : null}
          <Txt variant="subhead">{line}</Txt>
        </View>
      </View>
      {total > 0 ? <ProgressBar value={done / total} height={6} style={styles.parkBar} /> : null}
      <View style={styles.parkActions}>
        {ownPark ? (
          <Button
            title={park ? "Attractions" : "Choisir le parc"}
            icon={park ? "list-outline" : "search"}
            size="sm"
            tone={park && attractionCount > 0 ? undefined : "gold"}
            variant={park && attractionCount > 0 ? "secondary" : undefined}
            accessibilityLabel={park ? `Attractions de ${park.name}` : "Choisir le parc de ce jour"}
            onPress={onAttractions}
          />
        ) : null}
        {!ownPark || (park && attractionCount > 0) ? <Button title="Parcours" icon="sparkles-outline" size="sm" tone="gold" accessibilityLabel="Préparer le parcours de ce jour" onPress={onPlan} /> : null}
        {total > 0 ? <Button title="Jour J" icon="play" size="sm" tone="teal" accessibilityLabel="Suivre ce jour en direct" onPress={onLive} /> : null}
      </View>
    </Surface>
  );
}

function LocationModal({ visible, initial, onClose, onSave }) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Lieu de ce jour">
      <Txt variant="subhead" style={styles.sheetHelp}>
        Utilisé pour trouver la météo — ex : « Kyoto », « Rome », « Paris ».
      </Txt>
      <Field value={value} onChangeText={setValue} placeholder="Nom de la ville" accessibilityLabel="Nom de la ville" />
      <View style={styles.sheetButtons}>
        <Button title="Annuler" variant="secondary" style={styles.sheetButton} onPress={onClose} />
        <Button title="Enregistrer" style={styles.sheetButton} onPress={() => onSave(value)} />
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  topBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: layout.gutter, paddingTop: space.xs, paddingBottom: space.xs },
  tripName: { flex: 1 },
  scrollContent: { paddingHorizontal: layout.gutter },
  titleBlock: { gap: space.xs, paddingTop: space.sm, paddingBottom: space.lg },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space.md, rowGap: space.sm, marginTop: space.xs },
  locationChip: { maxWidth: "100%" },

  weatherBadge: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  weatherEmoji: { ...type.subhead },
  weatherTemps: { ...type.numeral, color: THEME.inkMuted },
  weatherTempsSmall: { ...type.numeralSmall },
  weatherUnavailable: { ...type.caption, color: THEME.inkFaint, flexShrink: 1 },

  progressRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.lg },
  progressBar: { flex: 1 },
  progressNumber: { ...type.numeral },

  panel: { marginBottom: space.lg },
  panelRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  panelText: { flex: 1 },
  tickets: { marginBottom: space.lg },
  ticketList: { marginBottom: space.md },
  ticketHelp: { marginBottom: space.md },
  ticketActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  parkActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  parkBar: { marginTop: space.md },

  flightRoute: { flexDirection: "row", alignItems: "center", gap: space.md },
  flightAirport: { alignItems: "flex-start", gap: space.xs, maxWidth: "44%" }, // a city name shrinks instead of pushing the route off the card
  flightCode: { ...type.numeralLarge },
  flightGate: { ...type.caption, color: THEME.blue },
  flightPath: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  dashes: { flex: 1, flexDirection: "row", justifyContent: "space-between" },
  dash: { width: 4, height: 2, borderRadius: 1, backgroundColor: THEME.hairStrong },
  flightFacts: { flexDirection: "row", gap: space.xxl },
  flightFactsRuled: { marginTop: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: THEME.hairStrong },
  flightLive: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  flightLiveTime: { ...type.numeralSmall, color: THEME.teal },
  flightNote: { color: THEME.inkFaint, marginTop: space.md },

  stepWrap: { marginBottom: space.sm },
  swipeContainer: { borderRadius: radius.md },
  card: { flexDirection: "row", alignItems: "stretch", overflow: "hidden", borderRadius: radius.md, borderWidth: 1, borderColor: THEME.light ? THEME.border : THEME.hair, backgroundColor: THEME.bgCard },
  cardCurrent: { borderColor: THEME.gold, borderWidth: 1.5 },
  cardDone: { opacity: 0.65 },
  cardMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "stretch" },
  stub: { width: 64, alignItems: "center", justifyContent: "center", gap: space.xs, paddingVertical: space.md },
  stubTime: { ...type.numeral },
  body: { flex: 1, minWidth: 0, gap: space.xs + 2, paddingVertical: space.md, paddingLeft: space.md, paddingRight: space.xs },
  stepTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  stepTitle: { ...type.name, flex: 1, minWidth: 0 },
  stepPrice: { ...type.numeral, color: THEME.inkMuted, flexShrink: 0 },
  detailLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: space.xs + 2 },
  metaLine: { flexShrink: 1, flexDirection: "row", alignItems: "flex-start", gap: space.xs + 2 },
  metaText: { flexShrink: 1 },
  goPill: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, minHeight: 28, borderRadius: radius.full, backgroundColor: THEME.blueDim },
  checkHit: { width: 52, alignItems: "center", paddingTop: space.md - 2 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: THEME.hairStrong, alignItems: "center", justifyContent: "center" },
  checkDone: { backgroundColor: THEME.teal, borderColor: THEME.teal },
  deleteAction: {
    width: 72,
    marginLeft: space.sm,
    borderRadius: radius.md,
    backgroundColor: THEME.stamp,
    alignItems: "center",
    justifyContent: "center",
  },
  addStep: { marginTop: space.xl },
  orderOffer: { marginTop: space.lg },
  journalCard: { gap: space.sm, backgroundColor: THEME.bgCard, ...paperEdge(), borderWidth: 1, borderColor: THEME.hairStrong, padding: space.md, marginTop: space.lg },
  journalHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  journalAdd: { marginTop: space.lg },

  sheetHelp: { marginBottom: space.lg },
  typeGroup: { marginBottom: space.md },
  sheetButtons: { flexDirection: "row", gap: space.md },
  sheetButton: { flex: 1 },
}));
