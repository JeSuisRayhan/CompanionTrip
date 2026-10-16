// A trip: its top bar, its four tabs (the first follows the trip: Aperçu, Aujourd'hui or Bilan) and the page of the one
// that is open. Each tab lives in screens/trip/.
import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { THEME, space, type, themedStyles } from "../lib/theme";
import { getTrip, shiftTripDatesBy } from "../lib/trips";
import { tripStatus } from "../lib/dates";
import { Button, IconButton, Field, EmptyState, Sheet } from "../components/ui";
import ApercuTab from "./trip/ApercuTab";
import ProgrammeTab from "./trip/ProgrammeTab";
import BudgetTab from "./trip/BudgetTab";
import PratiqueTab from "./trip/PratiqueTab";
import TodayTab from "./trip/TodayTab";
import BilanTab from "./trip/BilanTab";
import { TripTopBar, TripTabBar, TopButton } from "../components/mix";
import { TripInkContext, tripInk } from "../lib/tripInk";

// The four tabs of a trip. The first one follows the trip: "Aperçu" before it starts, "Aujourd'hui" while it is
// under way, "Bilan" once it is over.
const FIRST_TABS = {
  upcoming: { key: "apercu", label: "Aperçu", icon: "compass" },
  undated: { key: "apercu", label: "Aperçu", icon: "compass" },
  current: { key: "today", label: "Aujourd'hui", icon: "sunny" },
  past: { key: "bilan", label: "Bilan", icon: "flag" },
};
const OTHER_TABS = [
  { key: "programme", label: "Programme", icon: "calendar" },
  { key: "budget", label: "Budget", icon: "wallet" },
  { key: "pratique", label: "Pratique", icon: "briefcase" },
];
const FIRST_KEYS = ["apercu", "today", "bilan"];

// The tab a screen asks for (initialTab), in the names of the four tabs; the old names still work.
function tabFromParam(param) {
  if (!param) return null;
  if (FIRST_KEYS.includes(param) || param === "first") return "first";
  if (["days", "ideas", "attractions", "programme"].includes(param)) return "programme";
  if (param === "budget") return "budget";
  if (["checklists", "documents", "phrases", "pratique"].includes(param)) return "pratique";
  return null;
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TripScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState(tabFromParam(route.params?.initialTab)); // "first" | "programme" | "budget" | "pratique" | null
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [incomingScan, setIncomingScan] = useState(null);
  const [incomingAction, setIncomingAction] = useState(null);

  function goBack() {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate("Home");
  }

  // A screen asks for a tab again (a notification, a scan coming back): the new request wins.
  useEffect(() => {
    const wanted = tabFromParam(route.params?.initialTab);
    if (wanted) setPick(wanted);
  }, [route.params?.initialTab]);

  useEffect(() => {
    if (route.params?.scannedUri) {
      setPick("pratique");
      setIncomingScan({ uri: route.params.scannedUri, scannedCode: route.params.scannedCode || null, dayId: route.params.dayId || null });
      navigation.setParams({ scannedUri: undefined, scannedCode: undefined, dayId: undefined });
    }
  }, [route.params?.scannedUri]);

  // A day (flight or train) sends here to add a ticket from the gallery, or to look at one.
  useEffect(() => {
    const { addFrom, viewDocId, dayId } = route.params || {};
    if (addFrom || viewDocId) {
      setPick("pratique");
      setIncomingAction({ addFrom: addFrom || null, viewDocId: viewDocId || null, dayId: dayId || null });
      navigation.setParams({ addFrom: undefined, viewDocId: undefined, dayId: undefined });
    }
  }, [route.params?.addFrom, route.params?.viewDocId]);

  const refresh = useCallback(async () => {
    const t = await getTrip(tripId);
    setTrip(t);
    setLoading(false);
  }, [tripId]);

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

  React.useLayoutEffect(() => {
    if (trip) navigation.setOptions({ title: trip.name });
  }, [trip, navigation]);

  if (loading || !trip) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ paddingHorizontal: space.md }}>
          <IconButton icon="chevron-back" label="Retour" filled onPress={goBack} />
        </View>
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={THEME.teal} />
          ) : (
            <EmptyState icon="alert-circle-outline" title="Voyage introuvable" text="Ce voyage n'existe plus sur cet appareil." action={{ label: "Retour", onPress: goBack }} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const status = tripStatus(trip, isoToday());
  const first = FIRST_TABS[status] || FIRST_TABS.upcoming;
  const tabs = [first, ...OTHER_TABS];
  const tab = pick === "first" || !pick ? first.key : pick;
  const ink = tripInk(trip);
  const openTab = (key) => setPick(FIRST_KEYS.includes(key) ? "first" : key);
  const openList = (listKey) => navigation.navigate("Checklist", { tripId: trip.id, listKey });

  return (
    <TripInkContext.Provider value={ink}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <TripTopBar
          name={trip.name}
          onBack={goBack}
          right={<TopButton icon="options-outline" label="Réglages du voyage" onPress={() => navigation.navigate("TripSettings", { tripId: trip.id })} />}
        />
        <View style={styles.body}>
          {tab === "apercu" && <ApercuTab trip={trip} navigation={navigation} onChange={refresh} onOpenTab={openTab} onOpenList={openList} />}
          {tab === "today" && <TodayTab trip={trip} navigation={navigation} onChange={refresh} onOpenTab={openTab} />}
          {tab === "bilan" && <BilanTab trip={trip} navigation={navigation} onChange={refresh} />}
          {tab === "programme" && <ProgrammeTab trip={trip} navigation={navigation} onChange={refresh} onOpenTab={openTab} onShiftDates={() => setShiftModalOpen(true)} />}
          {tab === "budget" && <BudgetTab trip={trip} navigation={navigation} onChange={refresh} />}
          {tab === "pratique" && (
            <PratiqueTab
              trip={trip}
              navigation={navigation}
              onChange={refresh}
              onOpenTab={openTab}
              incomingScan={incomingScan}
              onConsumeIncomingScan={() => setIncomingScan(null)}
              incomingAction={incomingAction}
              onConsumeIncomingAction={() => setIncomingAction(null)}
            />
          )}
        </View>

        <ShiftDatesModal
          visible={shiftModalOpen}
          onClose={() => setShiftModalOpen(false)}
          onConfirm={async (delta) => {
            await shiftTripDatesBy(trip.id, delta);
            setShiftModalOpen(false);
            refresh();
          }}
        />

        <TripTabBar tabs={tabs} value={tab} onChange={openTab} />
      </SafeAreaView>
    </TripInkContext.Provider>
  );
}

function ShiftDatesModal({ visible, onClose, onConfirm }) {
  const [amount, setAmount] = useState("");

  function confirm(sign) {
    const n = parseInt(amount, 10);
    if (!n || isNaN(n)) return;
    onConfirm(sign * n);
    setAmount("");
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Décaler les dates">
      <Text style={[type.subhead, { marginBottom: space.lg }]}>Décale la date de départ et toutes les dates explicites du voyage.</Text>
      <Field label="Nombre de jours" value={amount} onChangeText={setAmount} placeholder="Ex : 3" keyboardType="number-pad" />
      <View style={styles.sheetButtons}>
        <Button title="Avancer" icon="arrow-back" variant="secondary" style={{ flex: 1 }} disabled={!parseInt(amount, 10)} onPress={() => confirm(-1)} />
        <Button title="Retarder" icon="arrow-forward" variant="secondary" style={{ flex: 1 }} disabled={!parseInt(amount, 10)} onPress={() => confirm(1)} />
      </View>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  body: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sheetButtons: { flexDirection: "row", gap: space.md, marginTop: space.xs },
}));
