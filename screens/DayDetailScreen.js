import React, { useState, useCallback, useEffect, useContext } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView, SafeAreaInsetsContext } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, layout, radius, type, themedStyles } from "../lib/theme";
import { TYPES } from "../lib/constants";
import { scopedId } from "../lib/parkDay";
import { getTrip, toggleActivityDone, setDayLocation, addActivity, deleteActivity, setDayType } from "../lib/trips";
import { resolveDayDate, formatDayLabel } from "../lib/dates";
import { formatMoney } from "../lib/budget";
import { fetchDayWeather, weatherInfo, guessDayLocation } from "../lib/weather";
import { fetchFlightStatus, hasFlightStatusKey } from "../lib/flightStatus";
import UndoToast from "../components/UndoToast";
import { Txt, Button, IconButton, Chip, Badge, Surface, Field, Group, Row, Thumb, SectionTitle, ProgressBar, EmptyState, Sheet, round } from "../components/ui";

export function WeatherBadge({ day, dateISO, compact, fallbackLocation }) {
  const [weather, setWeather] = useState(undefined); // undefined = loading, null = no data
  const location = guessDayLocation(day, fallbackLocation);

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

  // weather === null. In the compact (list-card) context, silently show nothing —
  // explaining why on every single day card would be noisy. The full explanation
  // only shows in the day detail view, right next to the location-edit action.
  if (compact) return null;

  if (!location) {
    return <Text style={styles.weatherUnavailable}>Ajoutez un lieu pour la météo</Text>;
  }
  const daysAhead = dateISO ? Math.round((new Date(dateISO + "T00:00:00") - new Date()) / 86400000) : null;
  if (daysAhead != null && (daysAhead > 15 || daysAhead < -1)) {
    return <Text style={styles.weatherUnavailable}>Prévision indisponible (trop loin dans le temps)</Text>;
  }
  return <Text style={styles.weatherUnavailable}>Prévision indisponible pour « {location} »</Text>;
}

export default function DayDetailScreen({ route, navigation }) {
  const { tripId, dayId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [flightOpen, setFlightOpen] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", undoActivity: null });
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
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
  const hasMapPin = day.activities.some((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng));
  const doneCount = day.activities.filter((a) => a.done).length;
  const firstUndoneIndex = sorted.findIndex((a) => !a.done);
  const location = (day.location || "").trim();
  // A park day of a normal trip has its own park and attractions: the park screens open it through a view of the trip.
  const isParkTrip = trip.tripType === "park";
  const parkTripId = isParkTrip ? tripId : scopedId(tripId, dayId);

  async function onToggleDone(activityId) {
    await toggleActivityDone(tripId, dayId, activityId);
    refresh();
  }

  async function onDeleteWithUndo(activity) {
    await deleteActivity(tripId, dayId, activity.id);
    await refresh();
    setToast({ visible: true, message: `"${activity.title}" supprimée`, undoActivity: activity });
  }

  async function onUndoDelete() {
    const activity = toast.undoActivity;
    setToast({ visible: false, message: "", undoActivity: null });
    if (activity) {
      const { id, ...rest } = activity;
      await addActivity(tripId, dayId, rest);
      refresh();
    }
  }

  function onToastDismiss() {
    setToast({ visible: false, message: "", undoActivity: null });
  }

  // A bottom sheet, not Alert.alert: Android alerts show at most 3 buttons and we have 3 choices + cancel.
  function openDayTypeMenu() {
    setTypeMenuOpen(true);
  }

  function chooseDayType(next) {
    setTypeMenuOpen(false);
    setDayType(tripId, dayId, next).then(refresh);
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
        <IconButton icon="add" label="Ajouter une étape" tone="gold" filled onPress={addStep} />
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
              <ActivityRow
                key={a.id}
                activity={a}
                trip={trip}
                isFirst={i === 0}
                isLast={i === sorted.length - 1}
                prevDone={i > 0 && !!sorted[i - 1].done}
                isCurrent={i === firstUndoneIndex}
                onToggleDone={() => onToggleDone(a.id)}
                onPress={() => navigation.navigate("ActivityEditor", { tripId, dayId, activity: a })}
                onDeleteWithUndo={() => onDeleteWithUndo(a)}
              />
            ))}
          </View>
        )}

        {sorted.length > 0 ? <Button title="Ajouter une étape" icon="add" variant="secondary" full onPress={addStep} style={styles.addStep} /> : null}
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
          <Row icon="today-outline" title="Jour normal" selected={!day.dayType} right={!day.dayType ? <Ionicons name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType(null)} />
          <Row icon="airplane-outline" title="Jour de vol ou de train" selected={day.dayType === "flight"} right={day.dayType === "flight" ? <Ionicons name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType("flight")} />
          <Row icon="happy-outline" title="Jour parc d'attractions" selected={day.dayType === "park"} right={day.dayType === "park" ? <Ionicons name="checkmark" size={20} color={THEME.teal} /> : null} onPress={() => chooseDayType("park")} />
        </Group>
      </Sheet>

      <UndoToast visible={toast.visible} message={toast.message} onUndo={onUndoDelete} onDismiss={onToastDismiss} />
    </SafeAreaView>
  );
}

// One step of the day: time column, rail with a node, content without a box.
// Done = teal node with a check; next (first undone) = gold node and gold time.
function ActivityRow({ activity, trip, isFirst, isLast, prevDone, isCurrent, onToggleDone, onPress, onDeleteWithUndo }) {
  const t = TYPES[activity.type] || TYPES.activite;
  const done = !!activity.done;
  const hasPrice = activity.price != null;
  const nodeBg = done ? THEME.teal : isCurrent ? THEME.gold : t.dim;
  const timeColor = done ? THEME.inkFaint : isCurrent ? THEME.gold : THEME.ink;
  const label = `${activity.title}${activity.time ? ", " + activity.time : ""}${done ? ", fait" : isCurrent ? ", à suivre" : ""}`;

  return (
    <View style={styles.stepRow}>
      <Text style={[styles.stepTime, { color: timeColor }]} accessibilityLabel={activity.time || "Heure libre"}>
        {activity.time || "--:--"}
      </Text>

      <View style={styles.rail}>
        <View style={[styles.railLine, styles.railLineTop, prevDone && { backgroundColor: THEME.teal }, isFirst && styles.railLineHidden]} />
        <Pressable
          onPress={onToggleDone}
          hitSlop={space.sm}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`Fait : ${activity.title}`}
          style={({ pressed }) => [styles.node, { backgroundColor: nodeBg }, pressed && { opacity: 0.7 }]}
        >
          {done ? (
            <Ionicons name="checkmark" size={16} color={THEME.onGold} />
          ) : (
            <Ionicons name={t.icon} size={14} color={isCurrent ? THEME.onGold : t.color} />
          )}
        </Pressable>
        <View style={[styles.railLine, styles.railLineBottom, done && { backgroundColor: THEME.teal }, isLast && styles.railLineHidden]} />
      </View>

      <View style={styles.swipeWrap}>
        <Swipeable
          containerStyle={styles.swipeContainer}
          renderRightActions={() => (
            <Pressable style={styles.deleteAction} onPress={onDeleteWithUndo} accessibilityRole="button" accessibilityLabel={`Supprimer ${activity.title}`}>
              <Ionicons name="trash-outline" size={20} color={THEME.bg} />
            </Pressable>
          )}
          overshootRight={false}
        >
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.stepContent, { backgroundColor: pressed ? THEME.surfaceSunk : THEME.bg }]}
          >
            <View style={styles.stepTitleRow}>
              <Text style={[styles.stepTitle, done && { color: THEME.inkMuted }]}>{activity.title}</Text>
              {hasPrice ? <Text style={[styles.stepPrice, done && { color: THEME.inkFaint }]}>{formatMoney(activity.price, trip.currency)}</Text> : null}
            </View>
            {activity.note ? <Text style={[type.subhead, done && { color: THEME.inkFaint }]}>{activity.note}</Text> : null}
            {activity.address ? (
              <View style={styles.metaLine}>
                <Ionicons name="location-outline" size={14} color={THEME.inkFaint} />
                <Text style={[type.caption, styles.metaText, done && { color: THEME.inkFaint }]}>{activity.address}</Text>
              </View>
            ) : null}
            {activity.confirmationCode ? (
              <View style={styles.metaLine}>
                <Ionicons name="key-outline" size={14} color={THEME.inkFaint} />
                <Text style={[type.numeralSmall, styles.metaText, { color: done ? THEME.inkFaint : THEME.ink }]}>{activity.confirmationCode}</Text>
              </View>
            ) : null}
          </Pressable>
        </Swipeable>
      </View>
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
                <Ionicons name="airplane" size={18} color={THEME.blue} />
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
          <Ionicons name="airplane" size={22} color={THEME.blue} />
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
              lead={<Thumb uri={doc.uri} icon="document-text" size={44} />}
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
        <Ionicons name="sparkles" size={22} color={THEME.pink} />
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

// Local one-off: diameter of the rail node (a 28pt circle holds the type icon or the check).
const NODE = 28;

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

  stepRow: { flexDirection: "row", gap: space.sm },
  stepTime: { ...type.numeral, minWidth: 48, paddingTop: space.sm + (NODE - type.numeral.lineHeight) / 2 },
  rail: { width: NODE, alignItems: "center" },
  railLine: { width: 2, backgroundColor: THEME.hairStrong },
  railLineTop: { height: space.sm },
  railLineBottom: { flex: 1 },
  railLineHidden: { backgroundColor: "transparent" },
  node: { width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: "center", justifyContent: "center" },

  // The pressed / swiped area bleeds 8pt into the screen margin so the price lines up with the gutter.
  swipeWrap: { flex: 1, minWidth: 0, marginRight: -space.sm },
  swipeContainer: { flex: 1 },
  stepContent: {
    flex: 1,
    gap: space.xs,
    paddingTop: space.sm + (NODE - type.label.lineHeight) / 2,
    paddingBottom: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  stepTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  stepTitle: { ...type.name, flex: 1, minWidth: 0 },
  stepPrice: { ...type.numeral, color: THEME.inkMuted, flexShrink: 0 },
  metaLine: { flexDirection: "row", alignItems: "flex-start", gap: space.xs + 2 },
  metaText: { flex: 1, minWidth: 0 },
  deleteAction: {
    width: 72,
    marginLeft: space.sm,
    marginVertical: space.xs,
    borderRadius: radius.md,
    backgroundColor: THEME.stamp,
    alignItems: "center",
    justifyContent: "center",
  },
  addStep: { marginTop: space.xl },

  sheetHelp: { marginBottom: space.lg },
  typeGroup: { marginBottom: space.md },
  sheetButtons: { flexDirection: "row", gap: space.md },
  sheetButton: { flex: 1 },
}));
