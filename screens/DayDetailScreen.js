import React, { useState, useCallback, useEffect, useContext, useRef } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Linking, Alert, Platform, Image } from "react-native";
import { SafeAreaView, SafeAreaInsetsContext } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, FONTS, space, layout, radius, type, themedStyles, paperEdge } from "../lib/theme";
import { TYPES } from "../lib/constants";
import { scopedId } from "../lib/parkDay";
import { splitTitlePlace } from "../lib/script";
import { directionsUrl, buildMapModel, stepPlaceName } from "../lib/map";
import { usePlacePhoto } from "../lib/placePhotos";
import { driverCard } from "../lib/driverCard";
import { isPdfDoc } from "../lib/documents";
import { getTrip, toggleActivityDone, editActivity, setDayLocation, addActivity, deleteActivity, setDayType, setActivityOrder, setDayJournal, deleteDay, deleteDayMessage, duplicateDay } from "../lib/trips";
import { bookingOf, deadlineInfo } from "../lib/booking";
import { resolveDayDate, formatFullDate, isoDate } from "../lib/dates";
import { formatMoney, convertAmount, moneyOf } from "../lib/budget";
import { dayLegs, formatDistance, legShort, legAdvice, legIcon } from "../lib/travelTime";
import { withLegEdit, legPrice } from "../lib/leg";
import { proximityOrder } from "../lib/dayOrder";
import { journalOf, canWriteJournal, MAX_JOURNAL } from "../lib/journal";
import { fetchDayWeather, weatherInfo } from "../lib/weather";
import { fetchQueueTimes, liveByRideId } from "../lib/queueTimes";
import { fetchFlightStatus, hasFlightStatusKey } from "../lib/flightStatus";
import { stepTone, stepIcon, noteOf, priceOf } from "../lib/stepLook";
import { dayState } from "../lib/dayState";
import { tripInk, TripInkContext, useTripInk } from "../lib/tripInk";
import UndoToast from "../components/UndoToast";
import DayDoneStamp from "../components/DayDoneStamp";
import WaitBadge from "../components/WaitBadge";
import QueueTimesCredit from "../components/QueueTimesCredit";
import LegSheet from "../components/LegSheet";
import TileMap from "../components/TileMap";
import { Txt, Button, Chip, Badge, Surface, Field, Group, Row, Thumb, SectionTitle, ProgressBar, EmptyState, Sheet, round } from "../components/ui";
import { TripTopBar, TopButton, DayChip, StepDot, DotLine, Tag } from "../components/mix";


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
  const [legFor, setLegFor] = useState(null); // id of the step whose way (price of the trip to it) is being edited
  const [photoIds, setPhotoIds] = useState({}); // steps showing a Wikipedia photo (for the credit under the day)
  const onPhoto = useCallback((id, has) => setPhotoIds((m) => (!!m[id] === has ? m : { ...m, [id]: has })), []);
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

  // another day opened from the strip: nothing of the previous one stays on screen
  useEffect(() => {
    setToast({ visible: false, message: "", undoActivity: null, undoOrder: null });
    setDayDone(false);
    setJournalOpen(false);
    setLegFor(null);
  }, [dayId]);

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
  const isParkDay = trip.tripType === "park" || day.dayType === "park";
  const legs = isParkDay ? null : dayLegs(trip, sorted);
  // The day on a map: the steps with a position, numbered in the order of the day, the way between them.
  // The same number sits on the step in the list.
  const ideaOf = (a) => (a.ideaId ? (trip.ideas || []).find((i) => i.id === a.ideaId) || null : null);
  const dayPins = [];
  const pinOrder = new Map();
  if (!isParkDay) {
    const dayModel = buildMapModel(trip).days.find((d) => d.dayId === dayId);
    sorted.forEach((a) => {
      const pin = dayModel && dayModel.pins.find((p) => p.activityId === a.id);
      if (!pin) return;
      pinOrder.set(a.id, dayPins.length + 1);
      dayPins.push({ ...pin, order: dayPins.length + 1 });
    });
  }
  // What to look a photo up for: the place a step goes to (its idea's name when it comes from the notebook).
  const city = (day.location || trip.defaultLocation || "").trim();
  const photoQueryOf = (a) => {
    if (isParkDay) return null;
    const idea = ideaOf(a);
    const name = idea && idea.name ? idea.name : stepPlaceName(a);
    if (!name) return null;
    const at = Number.isFinite(a.lat) && Number.isFinite(a.lng) ? a : idea && Number.isFinite(idea.lat) && Number.isFinite(idea.lng) ? idea : null;
    return { name, city, ...(at ? { lat: at.lat, lng: at.lng } : {}) };
  };
  // Morning, afternoon, evening: the day in three parts once it has times (the steps without one come last).
  const showParts = !isParkDay && sorted.length >= 2 && sorted.some((a) => a.time);
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

  // The price of the way to a step (and what it was done by), typed from the line between two steps; nothing left removes it.
  async function onSaveLeg({ price, label }) {
    const target = day.activities.find((a) => a.id === legFor);
    setLegFor(null);
    if (!target) return;
    await editActivity(tripId, dayId, target.id, { leg: withLegEdit(target.leg, { price, label }) });
    refresh();
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

  // Duplicating a day puts a copy (without its date) right after it: back to the programme, where it shows.
  function askDuplicateDay() {
    setTypeMenuOpen(false);
    setTimeout(async () => {
      await duplicateDay(tripId, dayId);
      navigation.goBack();
    }, 350);
  }

  function addStep() {
    navigation.navigate("ActivityEditor", { tripId, dayId, activity: null });
  }

  // the day is being lived: today, or already started
  const today = isoDate(new Date());
  const living = date === today || doneCount > 0;
  const home = trip.homeCurrency || trip.currency || "EUR";
  const rate = trip.rate || 1;
  const sameCurrency = (trip.currency || home) === home;
  const ink = tripInk(trip);

  // "5 étapes · de 9 h 30 à 16 h 15 · ≈ 40 € prévus"
  const clock = (t) => `${Number(t.slice(0, 2))} h ${t.slice(3)}`;
  const timed = sorted.filter((a) => a.time);
  // what the tags of the steps and of the ways between them add up to (each one rounded, as it is told), so the total matches what is read
  const planned = day.activities.reduce((sum, a) => sum + (Number(a.price) > 0 ? Math.round(convertAmount(Number(a.price), rate)) : 0) + (legPrice(a) > 0 ? Math.round(convertAmount(legPrice(a), rate)) : 0), 0);
  const summary = [
    sorted.length === 0 ? "Aucune étape" : `${sorted.length} étape${sorted.length > 1 ? "s" : ""}`,
    timed.length > 1 ? `de ${clock(timed[0].time)} à ${clock(timed[timed.length - 1].time)}` : null,
    planned > 0 ? `${sameCurrency ? "" : "≈ "}${formatMoney(planned, home)} prévus` : null,
    doneCount > 0 && day.dayType !== "park" ? `${doneCount} faite${doneCount > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TripInkContext.Provider value={ink}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <TripTopBar
          name={`${trip.name} · jour ${dayIndex + 1} sur ${trip.days.length}`}
          onBack={() => navigation.goBack()}
          backLabel="Retour"
          right={<TopButton icon="ellipsis-horizontal" label="Options du jour" onPress={openDayTypeMenu} />}
        />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {trip.days.length > 1 ? (
            <DayStrip
              trip={trip}
              today={today}
              selectedId={dayId}
              onSelect={(id) => id !== dayId && navigation.setParams({ dayId: id })}
            />
          ) : null}

          {dayPins.length > 0 ? (
            <DayMapCard
              pins={dayPins}
              fitKey={`${dayId}:${dayPins.map((p) => p.id).join(",")}`}
              missing={sorted.filter((a) => a.type !== "transport" && !pinOrder.has(a.id)).length}
              onOpen={() => navigation.navigate("TripMap", { tripId, dayId })}
            />
          ) : null}

          <View style={styles.titleBlock}>
            {date ? <Text style={type.subhead}>{formatFullDate(date)}</Text> : null}
            <Text style={type.display} numberOfLines={2} accessibilityRole="header">{day.title}</Text>
            <Text style={type.subhead}>{summary}</Text>
            <View style={styles.metaRow}>
              {date ? <WeatherBadge day={day} dateISO={date} fallbackLocation={trip.defaultLocation} /> : null}
              <Chip
                icon="location-outline"
                label={location || "Ajouter un lieu"}
                onPress={() => setLocationModalOpen(true)}
                accessibilityLabel={location ? `Lieu du jour : ${location}. Modifier` : "Ajouter un lieu pour ce jour"}
                style={styles.locationChip}
              />
              {hasMapPin && dayPins.length === 0 ? <Chip icon="map-outline" label="Carte" onPress={() => navigation.navigate("TripMap", { tripId, dayId })} accessibilityLabel="Voir le jour sur la carte" /> : null}
            </View>
          </View>

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
            <EmptyState icon="calendar-outline" title="La page est blanche" text="À vous de l'écrire." />
          ) : (
            <View style={styles.timeline}>
              {sorted.map((a, i) => {
                const following = sorted[i + 1];
                const part = showParts ? partOf(a.time) : null;
                const newPart = !!part && (i === 0 || partOf(sorted[i - 1].time).key !== part.key);
                return (
                  <React.Fragment key={a.id}>
                    {newPart ? <PartHeader part={part} first={i === 0} /> : null}
                    <StepRow
                      activity={a}
                      trip={trip}
                      idea={parkIdeaOf(a)}
                      ride={live && parkIdeaOf(a) && parkIdeaOf(a).qtId != null ? live.get(parkIdeaOf(a).qtId) : null}
                      isCurrent={i === firstUndoneIndex}
                      living={living}
                      last={i === sorted.length - 1}
                      home={home}
                      rate={rate}
                      sameCurrency={sameCurrency}
                      nextLeg={legs && following && !following.done ? legs.get(following.id) || null : null}
                      nextTime={following ? following.time : null}
                      nextName={following ? splitTitlePlace(following.title).title : ""}
                      onLeg={() => following && setLegFor(following.id)}
                      onToggleDone={() => onToggleDone(a.id)}
                      onBook={() => onBook(a)}
                      onPress={() => navigation.navigate("ActivityEditor", { tripId, dayId, activity: a })}
                      onShowDriver={(card) => navigation.navigate("ShowDriver", card)}
                      onDeleteWithUndo={() => onDeleteWithUndo(a)}
                      order={pinOrder.get(a.id) || null}
                      photoQuery={photoQueryOf(a)}
                      onPhoto={onPhoto}
                    />
                  </React.Fragment>
                );
              })}
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
          {sorted.some((a) => photoIds[a.id]) ? <Text style={[type.caption, styles.photoCredit]}>Photos des lieux : Wikipédia</Text> : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets ? insets.bottom : 0, 12) }]}>
          <Button title="Ajouter une étape" icon="add" size="lg" full onPress={addStep} />
        </View>

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

        <LegSheet
          visible={!!legFor && !!legs && legs.has(legFor)}
          leg={legFor && legs ? legs.get(legFor) || null : null}
          toTitle={legFor && day.activities.some((a) => a.id === legFor) ? splitTitlePlace(day.activities.find((a) => a.id === legFor).title).title : ""}
          money={moneyOf(trip)}
          onClose={() => setLegFor(null)}
          onSave={onSaveLeg}
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

        <Sheet visible={typeMenuOpen} onClose={() => setTypeMenuOpen(false)} title="Ce jour">
          <Txt variant="subhead" style={styles.sheetHelp}>
            Le type de jour donne un habillage et des rappels adaptés.
          </Txt>
          <Group style={styles.typeGroup}>
            <Row icon="today-outline" title="Jour normal" selected={!day.dayType} right={!day.dayType ? <Icon name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType(null)} />
            <Row icon="airplane-outline" title="Jour de vol ou de train" selected={day.dayType === "flight"} right={day.dayType === "flight" ? <Icon name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType("flight")} />
            <Row icon="happy-outline" title="Jour parc d'attractions" selected={day.dayType === "park"} right={day.dayType === "park" ? <Icon name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType("park")} />
          </Group>
          <Group style={styles.typeGroup}>
            <Row icon="copy-outline" title="Dupliquer ce jour" subtitle="Une copie sans date, juste après" onPress={askDuplicateDay} />
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
    </TripInkContext.Provider>
  );
}

// The days of the trip as a strip of tickets: one tap opens that day.
function DayStrip({ trip, today, selectedId, onSelect }) {
  const ref = useRef(null);
  const index = trip.days.findIndex((d) => d.id === selectedId);
  useEffect(() => {
    // bring the open day into view when the trip has more days than the strip shows
    if (ref.current && index > 3) ref.current.scrollTo({ x: Math.max(0, index * 64 - 90), animated: false });
  }, [index]);
  return (
    <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
      {trip.days.map((d, i) => {
        const date = resolveDayDate(trip, d, i);
        const state = dayState(d, date, today);
        return (
          <DayChip
            key={d.id}
            date={date}
            index={i}
            state={state}
            selected={d.id === selectedId}
            onPress={() => onSelect(d.id)}
            label={`Jour ${i + 1}, ${d.title}${state === "today" ? ", aujourd'hui" : ""}`}
          />
        );
      })}
    </ScrollView>
  );
}

// A planner writes "Attente estimée : 30 min" as the note of a ride: shown as a
// small tag instead of a sentence repeated on every step.
const WAIT_NOTE = /^Attente estimée : (\d+) min$/;

// One step of the day on the timeline: its hour, the node that ticks it, then its name with what matters under it (its
// place, its note, its price, what is left to book) and the way to the next step. Swipe the body to delete it.
function StepRow({ activity, trip, idea, ride, isCurrent, living, last, home, rate, sameCurrency, nextLeg, nextTime, nextName, onLeg, onToggleDone, onBook, onPress, onShowDriver, onDeleteWithUndo, order, photoQuery, onPhoto }) {
  const ink = useTripInk();
  const done = !!activity.done;
  const photo = usePlacePhoto(photoQuery);
  const hasPhoto = !!photo;
  useEffect(() => {
    if (onPhoto) onPhoto(activity.id, hasPhoto);
  }, [activity.id, hasPhoto, onPhoto]);
  const land = idea ? idea.land : null;
  const split = activity.address ? { title: activity.title, place: null } : splitTitlePlace(activity.title);
  const place = land || activity.address || split.place;
  // "Electric Railway (American Waterfront)" next to its zone "American Waterfront": the zone is said once
  const name = land && split.title.toLowerCase().endsWith(`(${land.toLowerCase()})`) ? split.title.slice(0, -(land.length + 2)).trim() : split.title;
  const waitMatch = activity.note ? activity.note.match(WAIT_NOTE) : null;
  const note = waitMatch ? "" : noteOf(activity);
  // the queue of the moment when Queue-Times has it (a show has none), else the estimate; nothing once done
  const liveWait = !done && !!ride && (!ride.open || ride.wait != null) && !(idea && (idea.categoryId === "spectacle" || idea.showTime));
  const estimate = !done && !liveWait && waitMatch ? waitMatch[1] : null;
  const tone = stepTone(activity);
  const state = done ? "done" : isCurrent ? "next" : "todo";
  const price = priceOf(activity, rate, home, sameCurrency);
  const label = `${activity.title}${activity.time ? ", " + activity.time : ""}${done ? ", fait" : isCurrent ? ", à suivre" : ""}`;
  // on the day being lived, a step not done yet with an address or a position can be gone to, or shown to a driver
  const goUrl = done || !living ? null : directionsUrl(activity, Platform.OS);
  const goThere = () => Linking.openURL(goUrl).catch(() => Alert.alert("Impossible d'ouvrir l'application de cartes"));
  const card = done || idea || !living ? null : driverCard(activity);
  // still to book (with the deadline when there is one), or booked
  const bookState = done ? null : bookingOf(activity);
  const bookInfo = bookState === "todo" && activity.bookBy ? deadlineInfo(activity.bookBy, isoDate(new Date())) : null;
  const hasTags = !!(note || price || liveWait || estimate || bookState || activity.confirmationCode);

  return (
    <View style={[styles.stepRow, !last && { minHeight: 74 }]}>
      <Text style={[styles.time, isCurrent && { fontFamily: FONTS.monoSemi }, done && { color: THEME.inkFaint }]} numberOfLines={1}>{activity.time || "—"}</Text>
      <View style={styles.nodeCol}>
        <StepDot icon={stepIcon(activity)} tone={tone} state={state} label={label} hint={done ? "Annuler" : "Marquer comme fait"} onPress={onToggleDone} />
        {!last ? <DotLine color={ink.color} /> : null}
      </View>
      <Swipeable
        containerStyle={styles.swipe}
        renderRightActions={() => (
          <Pressable style={styles.deleteAction} onPress={onDeleteWithUndo} accessibilityRole="button" accessibilityLabel={`Supprimer ${activity.title}`}>
            <Icon name="trash-outline" size={20} color={THEME.bg} />
          </Pressable>
        )}
        overshootRight={false}
      >
        <View style={styles.stepBody}>
          <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Modifier l'étape" style={({ pressed }) => [{ gap: 6 }, pressed && { opacity: 0.7 }]}>
            <View style={styles.stepHead}>
              {photo ? (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: photo.uri }} style={[styles.photo, done && { opacity: 0.45 }]} accessibilityIgnoresInvertColors />
                  {order ? <MapNumber n={order} style={styles.photoNumber} /> : null}
                </View>
              ) : null}
              <View style={styles.stepHeadText}>
                <View style={styles.nameRow}>
                  {!photo && order ? <MapNumber n={order} /> : null}
                  <Text style={[styles.ttl, styles.flexText, done && styles.ttlDone]}>{name}</Text>
                </View>
                {place ? (
                  <View style={styles.metaLine}>
                    <Icon name="location-outline" size={14} color={THEME.inkFaint} style={{ marginTop: 3 }} />
                    <Text style={[type.subhead, styles.metaText]} numberOfLines={2}>{place}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {hasTags ? (
              <View style={styles.meta}>
                {note ? <Text style={[type.subhead, styles.metaText]} numberOfLines={2}>{note}</Text> : null}
                {price ? <Tag mono tone={price === "Gratuit" ? "nature" : tone} label={price} accessibilityLabel={price === "Gratuit" ? "Gratuit" : `Prix : ${formatMoney(activity.price, trip.currency)}`} /> : null}
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
                {activity.confirmationCode ? <Tag mono icon="key-outline" label={activity.confirmationCode} /> : null}
              </View>
            ) : null}
          </Pressable>
          {goUrl || card ? (
            <View style={styles.pills}>
              {goUrl ? (
                <Pressable onPress={goThere} hitSlop={space.sm} accessibilityRole="button" accessibilityLabel={`Y aller : ${activity.title}`} style={({ pressed }) => [styles.goPill, pressed && { opacity: 0.7 }]}>
                  <Icon name="navigate" size={14} color={THEME.blue} />
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
          {nextLeg ? <LegNote leg={nextLeg} toName={nextName} arriveAt={nextTime} advise={living && !done} price={priceOf(nextLeg, rate, home, sameCurrency)} onPress={onLeg} /> : null}
        </View>
      </Swipeable>
    </View>
  );
}

// The number of a step on the map of the day, the same gold disc as its pin.
function MapNumber({ n, style }) {
  return (
    <View style={[styles.mapNumber, style]} accessible accessibilityLabel={`Numéro ${n} sur la carte`}>
      <Text style={styles.mapNumberText}>{n}</Text>
    </View>
  );
}

// Morning before noon, afternoon until six, evening after; a step without a time is "sans heure".
const PARTS = [
  { key: "matin", label: "Matin", icon: "sunny-outline", until: "12:00" },
  { key: "aprem", label: "Après-midi", icon: "partly-sunny-outline", until: "18:00" },
  { key: "soir", label: "Soir", icon: "moon-outline", until: "99:99" },
];
const NO_TIME = { key: "libre", label: "Sans heure", icon: "time-outline" };
function partOf(time) {
  if (!time) return NO_TIME;
  return PARTS.find((p) => time < p.until) || PARTS[PARTS.length - 1];
}

// The title of a part of the day, on the line of the timeline.
function PartHeader({ part, first }) {
  const ink = useTripInk();
  return (
    <View style={styles.partRow} accessibilityRole="header">
      <View style={styles.partTime} />
      <View style={styles.nodeCol}>{!first ? <DotLine color={ink.color} style={styles.partLine} /> : null}</View>
      <View style={styles.partLabel}>
        <Icon name={part.icon} size={16} color={THEME.gold} />
        <Text style={styles.partText}>{part.label.toUpperCase()}</Text>
      </View>
    </View>
  );
}

// The map of the day at the top: a picture of it (it scrolls with the page); a touch opens the full map.
function DayMapCard({ pins, fitKey, missing, onOpen }) {
  const label = `Carte du jour, ${pins.length} étape${pins.length > 1 ? "s" : ""}${missing > 0 ? `, ${missing} sans position` : ""}. Ouvrir la carte`;
  return (
    <View style={styles.dayMapBlock}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.dayMap, round("xl"), pressed && { opacity: 0.9 }]}>
        <TileMap pins={pins} route={pins} fitKey={fitKey} fitPadding={30} interactive={false} style={StyleSheet.absoluteFill} />
        <View style={styles.dayMapOpen} pointerEvents="none">
          <Icon name="expand-outline" size={16} color={THEME.ink} />
          <Text style={[type.caption, { color: THEME.ink }]}>Agrandir</Text>
        </View>
      </Pressable>
      {missing > 0 ? (
        <Text style={type.caption}>{`${missing} étape${missing > 1 ? "s ne sont" : " n'est"} pas sur la carte : touchez la carte pour ${missing > 1 ? "les" : "la"} localiser.`}</Text>
      ) : null}
    </View>
  );
}

// The way to the next step, on one line: "10 min à pied". A tap opens the price of the way. The advice
// ("Partir à 14:20") only on the day being lived, or when the two hours are closer than the way.
// `price`: what the way cost, told like the price of a step (in the person's currency, "≈" when it is worked out from a rate).
function LegNote({ leg, toName, arriveAt, advise, price, onPress }) {
  const advice = legAdvice(leg, arriveAt, null);
  const showAdvice = advice && (advice.tone === "stamp" || advise);
  const text = legShort(leg);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={space.xs}
      accessibilityRole="button"
      accessibilityLabel={`${text}${toName ? ` jusqu'à ${toName}` : ""}${showAdvice ? ". " + advice.text : ""}${price ? `. Prix : ${price}` : ""}. ${price ? "Modifier le prix du trajet" : "Ajouter le prix du trajet"}`}
      style={({ pressed }) => [styles.leg, pressed && { opacity: 0.7 }]}
    >
      <Icon name={legIcon(leg)} size={16} color={THEME.inkFaint} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.subhead}>{text}</Text>
        {showAdvice ? <Text style={[type.caption, advice.tone === "stamp" && { color: THEME.stamp }]}>{advice.text}</Text> : null}
      </View>
      {price ? <Tag mono label={price} /> : null}
    </Pressable>
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

  scrollContent: { paddingHorizontal: layout.gutter, paddingTop: 12, paddingBottom: space.xl },
  titleBlock: { gap: 6, paddingTop: space.sm, paddingBottom: space.xl },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space.md, rowGap: space.sm, marginTop: space.xs },
  locationChip: { maxWidth: "100%" },

  weatherBadge: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  weatherEmoji: { ...type.subhead },
  weatherTemps: { ...type.numeral, color: THEME.inkMuted },
  weatherTempsSmall: { ...type.numeralSmall },
  weatherUnavailable: { ...type.caption, color: THEME.inkFaint, flexShrink: 1 },

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

  timeline: { marginTop: space.xs },
  stepRow: { flexDirection: "row", gap: 10 },
  stepHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepHeadText: { flex: 1, minWidth: 0, gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  flexText: { flexShrink: 1 },
  photoWrap: { width: 68, height: 68 },
  photo: { width: 68, height: 68, borderRadius: 12, backgroundColor: THEME.bgCardAlt },
  photoNumber: { position: "absolute", top: 5, left: 5, borderWidth: 2, borderColor: THEME.bg },
  mapNumber: { minWidth: 24, height: 24, paddingHorizontal: 5, borderRadius: 12, backgroundColor: THEME.goldFill, alignItems: "center", justifyContent: "center", marginTop: 0 },
  mapNumberText: { fontFamily: FONTS.monoSemi, fontSize: 13, lineHeight: 16, color: THEME.onGold },
  partRow: { flexDirection: "row", gap: 10, minHeight: 34 },
  partTime: { width: 54 },
  partLine: { top: 0, bottom: 0 },
  partLabel: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 10 },
  partText: { fontFamily: FONTS.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, color: THEME.inkMuted },
  dayMapBlock: { gap: space.sm, marginBottom: space.lg },
  dayMap: { height: 210, overflow: "hidden", backgroundColor: THEME.surfaceSunk },
  dayMapOpen: { position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: THEME.veil },
  photoCredit: { marginTop: space.md, color: THEME.inkFaint },
  time: { width: 54, fontFamily: FONTS.monoMed, fontSize: 17, lineHeight: 34, letterSpacing: -0.35, textAlign: "right", color: THEME.ink },
  nodeCol: { width: 34, alignItems: "center" },
  swipe: { flex: 1, minWidth: 0 },
  stepBody: { flex: 1, minWidth: 0, paddingBottom: 18, gap: 6, backgroundColor: THEME.bg },
  ttl: { fontFamily: FONTS.headSemi, fontSize: 18, lineHeight: 24, letterSpacing: -0.1, color: THEME.ink },
  ttlDone: { color: THEME.inkFaint, textDecorationLine: "line-through" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 6 },
  metaLine: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  metaText: { flexShrink: 1 },
  leg: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  goPill: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, minHeight: 30, borderRadius: radius.full, backgroundColor: THEME.blueDim },
  deleteAction: { width: 72, marginLeft: space.sm, marginBottom: 18, borderRadius: radius.md, backgroundColor: THEME.stamp, alignItems: "center", justifyContent: "center" },
  strip: { marginHorizontal: -layout.gutter, flexGrow: 0 },
  stripContent: { flexGrow: 1, gap: 8, paddingHorizontal: layout.gutter, paddingTop: 4, paddingBottom: 12 },
  footer: { paddingHorizontal: layout.gutter, paddingTop: 12, borderTopWidth: 1, borderTopColor: THEME.hair, backgroundColor: THEME.bg },
  orderOffer: { marginTop: space.lg },
  journalCard: { gap: space.sm, backgroundColor: THEME.bgCard, ...paperEdge(), borderWidth: 1, borderColor: THEME.hairStrong, padding: space.md, marginTop: space.lg },
  journalHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  journalAdd: { marginTop: space.lg },

  sheetHelp: { marginBottom: space.lg },
  typeGroup: { marginBottom: space.md },
  sheetButtons: { flexDirection: "row", gap: space.md },
  sheetButton: { flex: 1 },
}));
