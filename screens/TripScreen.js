import React, { useState, useCallback, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Modal, Alert, Image, ImageBackground, LayoutAnimation, Platform, UIManager } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { TYPES } from "../lib/constants";
import { getTrip, addChecklistItem, toggleChecklistItem, removeChecklistItem, addPhrase, removePhrase, shiftTripDatesBy, duplicateDay, moveDay } from "../lib/trips";
import { resolveDayDate, formatDateLabel, tripRange, tripStatus } from "../lib/dates";
import { tripActivityTotal, transportTotal, accommodationTotal, repasTotal, otherExpensesTotal, formatMoney, convertAmount } from "../lib/budget";
import { pickImage, addDocument, removeDocument } from "../lib/documents";
import { WeatherBadge } from "./DayDetailScreen";
import { shareTripAsText, shareTripAsICS } from "../lib/share";
import DonutChart from "../components/DonutChart";

const TABS = [
  { key: "days", label: "Jours" },
  { key: "budget", label: "Budget" },
  { key: "checklists", label: "Checklists" },
  { key: "documents", label: "Documents" },
  { key: "phrases", label: "Phrases" },
];

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TripScreen({ route, navigation }) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("days");
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [gridView, setGridView] = useState(false);
  const [incomingScan, setIncomingScan] = useState(null);

  useEffect(() => {
    if (route.params?.scannedUri) {
      setTab("documents");
      setIncomingScan({ uri: route.params.scannedUri, scannedCode: route.params.scannedCode || null });
      navigation.setParams({ scannedUri: undefined, scannedCode: undefined });
    }
  }, [route.params?.scannedUri]);

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
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  const { start, end } = tripRange(trip);
  const status = tripStatus(trip, isoToday());

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      {trip.coverImage?.url && (
        <ImageBackground source={{ uri: trip.coverImage.url }} style={styles.coverBanner}>
          <LinearGradient colors={["transparent", THEME.bg]} style={styles.coverBannerGradient} />
        </ImageBackground>
      )}
      <View style={styles.header}>
        {start && (
          <Text style={styles.dates} numberOfLines={1} ellipsizeMode="tail">
            {formatDateLabel(start)}
            {end && end !== start ? ` → ${formatDateLabel(end)}` : ""}
          </Text>
        )}
        {status === "current" && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>EN COURS</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 8 }} />
        <TouchableOpacity onPress={() => navigation.navigate("TripSettings", { tripId: trip.id })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexShrink: 0 }}>
          <Ionicons name="options-outline" size={20} color={THEME.inkMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBarScroll} contentContainerStyle={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {tab === "days" && (
        <DaysTab
          trip={trip}
          navigation={navigation}
          onShiftDates={() => setShiftModalOpen(true)}
          onDuplicateDay={async (dayId) => {
            await duplicateDay(trip.id, dayId);
            refresh();
          }}
          onMoveDay={async (dayId, direction) => {
            await moveDay(trip.id, dayId, direction);
            refresh();
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          gridView={gridView}
          onToggleGrid={() => setGridView((v) => !v)}
        />
      )}
      {tab === "budget" && <BudgetTab trip={trip} />}
      {tab === "checklists" && <ChecklistsTab trip={trip} onChange={refresh} />}
      {tab === "documents" && (
        <DocumentsTab
          trip={trip}
          onChange={refresh}
          navigation={navigation}
          incomingScan={incomingScan}
          onConsumeIncomingScan={() => setIncomingScan(null)}
        />
      )}
      {tab === "phrases" && <PhrasesTab trip={trip} onChange={refresh} />}

      <ShiftDatesModal
        visible={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        onConfirm={async (delta) => {
          await shiftTripDatesBy(trip.id, delta);
          setShiftModalOpen(false);
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

function DaysTab({ trip, navigation, onShiftDates, onDuplicateDay, onMoveDay, searchQuery, gridView, onSearchChange, onToggleGrid }) {
  const isPark = trip.tripType === "park";

  const flatEntries = [];
  trip.days.forEach((day, dayIndex) => {
    day.activities.forEach((a) => flatEntries.push({ day, dayIndex, activity: a }));
  });
  flatEntries.sort((x, y) => {
    if (x.dayIndex !== y.dayIndex) return x.dayIndex - y.dayIndex;
    if (!x.activity.time) return 1;
    if (!y.activity.time) return -1;
    return x.activity.time.localeCompare(y.activity.time);
  });

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.shiftDatesButton, { flex: 1 }]} onPress={onShiftDates}>
          <Ionicons name="calendar-outline" size={14} color={THEME.inkMuted} />
          <Text style={styles.shiftDatesButtonText}>Décaler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.shiftDatesButton, { flex: 1 }]} onPress={() => shareTripAsText(trip)}>
          <Ionicons name="share-outline" size={14} color={THEME.inkMuted} />
          <Text style={styles.shiftDatesButtonText}>Partager</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.shiftDatesButton, { flex: 1 }]} onPress={() => shareTripAsICS(trip)}>
          <Ionicons name="download-outline" size={14} color={THEME.inkMuted} />
          <Text style={styles.shiftDatesButtonText}>.ics</Text>
        </TouchableOpacity>
      </View>

      {!isPark && trip.days.length >= 6 && (
        <View style={styles.searchRow}>
          <Ionicons name="search" size={15} color={THEME.inkFaint} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Rechercher un jour, une étape…"
            placeholderTextColor={THEME.inkFaint}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => onSearchChange("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={THEME.inkFaint} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {!isPark && (
        <TouchableOpacity style={styles.viewToggle} onPress={onToggleGrid}>
          <Ionicons name={gridView ? "list-outline" : "grid-outline"} size={14} color={THEME.inkMuted} />
          <Text style={styles.shiftDatesButtonText}>{gridView ? "Vue liste" : "Vue grille"}</Text>
        </TouchableOpacity>
      )}

      {!isPark && (
        <TouchableOpacity style={styles.weatherReorgButton} onPress={() => navigation.navigate("WeatherReorg", { tripId: trip.id })}>
          <Ionicons name="partly-sunny-outline" size={15} color={THEME.gold} />
          <Text style={styles.weatherReorgButtonText}>Réorganiser selon la météo</Text>
        </TouchableOpacity>
      )}

      {isPark ? (
        flatEntries.map(({ day, activity }) => {
          const t = TYPES[activity.type] || TYPES.activite;
          return (
            <TouchableOpacity
              key={activity.id}
              style={styles.attractionRow}
              onPress={() => navigation.navigate("ActivityEditor", { tripId: trip.id, dayId: day.id, activity })}
              activeOpacity={0.85}
            >
              <View style={[styles.iconBadgeSmall, { backgroundColor: t.dim }]}>
                <Ionicons name={t.icon} size={16} color={t.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayTitle}>{activity.title}</Text>
                <Text style={styles.dayCount}>
                  {trip.days.length > 1 ? day.title + " · " : ""}
                  {activity.time || "Heure libre"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={THEME.inkFaint} />
            </TouchableOpacity>
          );
        })
      ) : (
        (() => {
          const q = (searchQuery || "").trim().toLowerCase();
          const today = isoToday();
          const filtered = trip.days
            .map((day, index) => ({ day, index }))
            .filter(({ day, index }) => {
              if (!q) return true;
              const date = resolveDayDate(trip, day, index);
              const dateLabel = date ? formatDateLabel(date) : "";
              const activityMatch = day.activities.some((a) => a.title.toLowerCase().includes(q));
              return day.title.toLowerCase().includes(q) || dateLabel.toLowerCase().includes(q) || activityMatch;
            });

          if (filtered.length === 0) {
            return <Text style={styles.helpText}>Aucun jour ne correspond à "{searchQuery}".</Text>;
          }

          function openDayMenu(day, index) {
            const options = [{ text: "Annuler", style: "cancel" }];
            if (index > 0) options.push({ text: "Monter", onPress: () => onMoveDay(day.id, "up") });
            if (index < trip.days.length - 1) options.push({ text: "Descendre", onPress: () => onMoveDay(day.id, "down") });
            options.push({ text: "Dupliquer", onPress: () => onDuplicateDay(day.id) });
            Alert.alert(day.title, "Que voulez-vous faire ?", options);
          }

          return (
            <View style={gridView ? styles.dayGrid : undefined}>
              {filtered.map(({ day, index }) => {
                const date = resolveDayDate(trip, day, index);
                const isToday = date === today;
                return (
                  <TouchableOpacity
                    key={day.id}
                    style={[gridView ? styles.dayCardGrid : styles.dayCard, isToday && styles.dayCardActive]}
                    onPress={() => navigation.navigate("DayDetail", { tripId: trip.id, dayId: day.id })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.dayCardHeader}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[styles.dayIndexLabel, isToday && styles.dayIndexLabelActive]}>J{index + 1}</Text>
                        {isToday && <Text style={styles.todayPill}>AUJOURD'HUI</Text>}
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                        {!q && !gridView && (
                          <TouchableOpacity
                            onPress={() => openDayMenu(day, index)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="ellipsis-horizontal" size={17} color={THEME.inkFaint} />
                          </TouchableOpacity>
                        )}
                        <Ionicons name="chevron-forward" size={16} color={THEME.inkFaint} />
                      </View>
                    </View>
                    <Text style={styles.dayTitle} numberOfLines={gridView ? 2 : undefined}>
                      {day.title}
                    </Text>
                    {date && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Text style={styles.dayDate}>{formatDateLabel(date)}</Text>
                        {!gridView && <WeatherBadge day={day} dateISO={date} compact fallbackLocation={trip.defaultLocation} />}
                      </View>
                    )}
                    <Text style={styles.dayCount}>
                      {day.activities.length} étape{day.activities.length !== 1 ? "s" : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })()
      )}
    </ScrollView>
  );
}

function BudgetTab({ trip }) {
  const [converterOpen, setConverterOpen] = useState(false);
  const total = tripActivityTotal(trip);
  const showConverter = trip.currency && trip.homeCurrency && trip.currency !== trip.homeCurrency;
  const categories = [
    { key: "transport", label: "Transport", icon: "airplane", value: transportTotal(trip), color: THEME.blue },
    { key: "hotel", label: "Hébergement", icon: "bed", value: accommodationTotal(trip), color: THEME.stamp },
    { key: "repas", label: "Repas", icon: "restaurant", value: repasTotal(trip), color: THEME.gold },
    { key: "other", label: "Autres dépenses", icon: "pricetag", value: otherExpensesTotal(trip), color: THEME.pink },
  ];

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {total > 0 && (
        <DonutChart
          segments={categories.map((c) => ({ value: c.value, color: c.color }))}
          centerValue={formatMoney(total, trip.currency).replace(/\s?[A-Z€$£¥]+$/, "")}
          centerLabel={trip.currency}
        />
      )}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>TOTAL ESTIMÉ</Text>
        <Text style={styles.totalValue}>{formatMoney(total, trip.currency)}</Text>
      </View>
      {showConverter && (
        <TouchableOpacity style={styles.shiftDatesButton} onPress={() => setConverterOpen(true)}>
          <Ionicons name="swap-horizontal" size={14} color={THEME.inkMuted} />
          <Text style={styles.shiftDatesButtonText}>Convertisseur rapide</Text>
        </TouchableOpacity>
      )}
      {categories.map((c) => {
        const target = trip.budgetTargets && trip.budgetTargets[c.key];
        const overTarget = target != null && c.value > target;
        return (
          <View key={c.key} style={styles.budgetRow}>
            <View style={[styles.budgetIcon, { backgroundColor: c.color + "22" }]}>
              <Ionicons name={c.icon} size={17} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.budgetLabel}>{c.label}</Text>
              {target != null && (
                <Text style={[styles.budgetTargetText, overTarget && { color: THEME.stamp }]}>
                  Objectif : {formatMoney(target, trip.currency)}
                </Text>
              )}
            </View>
            <Text style={[styles.budgetValue, overTarget && { color: THEME.stamp }]}>{formatMoney(c.value, trip.currency)}</Text>
          </View>
        );
      })}
      <CurrencyConverterModal visible={converterOpen} onClose={() => setConverterOpen(false)} trip={trip} />
    </ScrollView>
  );
}

function CurrencyConverterModal({ visible, onClose, trip }) {
  const [localVal, setLocalVal] = useState("");
  const [homeVal, setHomeVal] = useState("");

  function onLocalChange(v) {
    setLocalVal(v);
    const n = parseFloat(v.replace(",", "."));
    setHomeVal(!isNaN(n) ? String(Math.round(convertAmount(n, trip.rate) * 100) / 100) : "");
  }

  function onHomeChange(v) {
    setHomeVal(v);
    const n = parseFloat(v.replace(",", "."));
    setLocalVal(!isNaN(n) && trip.rate ? String(Math.round((n / trip.rate) * 100) / 100) : "");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.checklistTitle}>Convertisseur rapide</Text>
          <Text style={[styles.label, { marginTop: 14 }]}>En {trip.currency}</Text>
          <TextInput style={styles.input} value={localVal} onChangeText={onLocalChange} placeholder="0" placeholderTextColor={THEME.inkFaint} keyboardType="decimal-pad" />
          <Text style={[styles.label, { marginTop: 12 }]}>En {trip.homeCurrency}</Text>
          <TextInput style={styles.input} value={homeVal} onChangeText={onHomeChange} placeholder="0" placeholderTextColor={THEME.inkFaint} keyboardType="decimal-pad" />
          <TouchableOpacity onPress={onClose} style={{ marginTop: 18, alignItems: "center" }}>
            <Text style={{ color: THEME.inkFaint, fontSize: 13 }}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ChecklistsTab({ trip, onChange }) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <ChecklistSection title="Bagages" trip={trip} listKey="packingList" onChange={onChange} />
      <ChecklistSection title="Avant le départ" trip={trip} listKey="departureChecklist" onChange={onChange} />
    </ScrollView>
  );
}

function ChecklistSection({ title, trip, listKey, onChange }) {
  const [newLabel, setNewLabel] = useState("");
  const items = trip[listKey] || [];
  const doneCount = items.filter((i) => i.checked).length;

  function animateThenChange() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onChange();
  }

  async function addItem() {
    if (!newLabel.trim()) return;
    await addChecklistItem(trip.id, listKey, newLabel);
    setNewLabel("");
    animateThenChange();
  }

  return (
    <View style={styles.checklistSection}>
      <View style={styles.checklistHeader}>
        <Text style={styles.checklistTitle}>{title}</Text>
        {items.length > 0 && (
          <Text style={styles.checklistCount}>
            {doneCount}/{items.length}
          </Text>
        )}
      </View>
      {items.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={styles.checklistRow}
          onPress={async () => {
            await toggleChecklistItem(trip.id, listKey, item.id);
            animateThenChange();
          }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={item.checked ? "checkmark-circle" : "ellipse-outline"}
            size={20}
            color={item.checked ? THEME.teal : THEME.inkFaint}
          />
          <Text style={[styles.checklistLabel, item.checked && styles.checklistLabelDone]}>{item.label}</Text>
          <TouchableOpacity
            onPress={async () => {
              await removeChecklistItem(trip.id, listKey, item.id);
              animateThenChange();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={16} color={THEME.inkFaint} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
      <View style={styles.addItemRow}>
        <TextInput
          style={styles.addItemInput}
          value={newLabel}
          onChangeText={setNewLabel}
          placeholder="Ajouter un élément…"
          placeholderTextColor={THEME.inkFaint}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <TouchableOpacity onPress={addItem} style={styles.addItemButton}>
          <Ionicons name="add" size={18} color={THEME.gold} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DocumentsTab({ trip, onChange, navigation, incomingScan, onConsumeIncomingScan }) {
  const [pendingUri, setPendingUri] = useState(null);
  const [pendingScannedCode, setPendingScannedCode] = useState(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewingDoc, setViewingDoc] = useState(null);
  const docs = trip.documents || [];

  useEffect(() => {
    if (incomingScan) {
      setPendingUri(incomingScan.uri);
      setPendingScannedCode(incomingScan.scannedCode);
      setTitle(incomingScan.scannedCode ? "Billet scanné" : "Photo scannée");
      onConsumeIncomingScan();
    }
  }, [incomingScan]);

  function choosePhoto() {
    setError("");
    Alert.alert("Ajouter un document", "Comment voulez-vous l'ajouter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Scanner un billet / code-barres", onPress: () => navigation.navigate("TicketScanner", { tripId: trip.id }) },
      { text: "Prendre une photo", onPress: () => pick("camera") },
      { text: "Depuis la galerie", onPress: () => pick("library") },
    ]);
  }

  async function pick(source) {
    try {
      const uri = await pickImage(source);
      if (uri) setPendingUri(uri);
    } catch (e) {
      setError(e && e.code === "PERMISSION_DENIED" ? "Autorisation refusée. Activez l'accès à la caméra/aux photos dans les réglages du téléphone." : "Échec de la sélection.");
    }
  }

  async function confirmAdd() {
    setBusy(true);
    try {
      await addDocument(trip.id, { title, category: "autre", tempUri: pendingUri, scannedCode: pendingScannedCode });
      setPendingUri(null);
      setPendingScannedCode(null);
      setTitle("");
      onChange();
    } catch (e) {
      setError("Échec de l'enregistrement du document.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(docId) {
    await removeDocument(trip.id, docId);
    onChange();
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity style={styles.shiftDatesButton} onPress={choosePhoto}>
        <Ionicons name="camera-outline" size={14} color={THEME.inkMuted} />
        <Text style={styles.shiftDatesButtonText}>Ajouter un document</Text>
      </TouchableOpacity>
      {error && <Text style={{ color: THEME.stamp, fontSize: 12, marginBottom: 10 }}>{error}</Text>}

      {docs.length === 0 && <Text style={styles.helpText}>Billets, réservations, codes Wi-Fi de l'hôtel — tout ce qu'on cherche toujours au pire moment.</Text>}

      {docs.map((doc) => (
        <TouchableOpacity key={doc.id} style={styles.docRow} onPress={() => setViewingDoc(doc)} activeOpacity={0.8}>
          <Image source={{ uri: doc.uri }} style={styles.docThumb} />
          <Text style={styles.docTitle}>{doc.title}</Text>
          <TouchableOpacity onPress={() => onRemove(doc.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="trash-outline" size={16} color={THEME.inkFaint} />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}

      <Modal visible={!!viewingDoc} transparent animationType="fade" onRequestClose={() => setViewingDoc(null)}>
        <TouchableOpacity style={styles.viewerOverlay} activeOpacity={1} onPress={() => setViewingDoc(null)}>
          {viewingDoc && <Image source={{ uri: viewingDoc.uri }} style={styles.viewerImage} resizeMode="contain" />}
          {viewingDoc?.scannedCode && (
            <View style={[styles.scannedCodeBadge, { position: "absolute", bottom: 90, left: 20, right: 20 }]}>
              <Ionicons name="qr-code-outline" size={13} color={THEME.teal} />
              <Text style={styles.scannedCodeText} numberOfLines={1}>
                {viewingDoc.scannedCode}
              </Text>
            </View>
          )}
          <View style={styles.viewerTitleBar}>
            <Text style={styles.viewerTitleText}>{viewingDoc?.title}</Text>
            <TouchableOpacity onPress={() => setViewingDoc(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!pendingUri} transparent animationType="fade" onRequestClose={() => setPendingUri(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {pendingUri && <Image source={{ uri: pendingUri }} style={styles.previewImage} />}
            {pendingScannedCode && (
              <View style={styles.scannedCodeBadge}>
                <Ionicons name="qr-code-outline" size={13} color={THEME.teal} />
                <Text style={styles.scannedCodeText} numberOfLines={1}>
                  {pendingScannedCode}
                </Text>
              </View>
            )}
            <TextInput
              style={[styles.input, { marginTop: 14 }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Titre (ex : Voucher hôtel)"
              placeholderTextColor={THEME.inkFaint}
            />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.button, styles.buttonHalf]} onPress={() => { setPendingUri(null); setPendingScannedCode(null); }} disabled={busy}>
                <Text style={styles.buttonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.buttonHalf]} onPress={confirmAdd} disabled={busy}>
                <Text style={styles.buttonText}>{busy ? "…" : "Enregistrer"}</Text>
              </TouchableOpacity>
            </View>
            {error ? <Text style={{ color: THEME.stamp, fontSize: 12, marginTop: 12, textAlign: "center" }}>{error}</Text> : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function PhrasesTab({ trip, onChange }) {
  const [phrase, setPhrase] = useState("");
  const [translation, setTranslation] = useState("");
  const phrases = trip.phrases || [];

  async function add() {
    if (!phrase.trim() || !translation.trim()) return;
    await addPhrase(trip.id, phrase, translation);
    setPhrase("");
    setTranslation("");
    onChange();
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.helpText}>Les phrases qui sauvent — "où sont les toilettes", "c'est trop épicé", ce genre de choses.</Text>
      {phrases.map((p) => (
        <View key={p.id} style={styles.phraseRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.phraseText}>{p.phrase}</Text>
            <Text style={styles.phraseTranslation}>{p.translation}</Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              await removePhrase(trip.id, p.id);
              onChange();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={16} color={THEME.inkFaint} />
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.phraseForm}>
        <TextInput
          style={styles.input}
          value={phrase}
          onChangeText={setPhrase}
          placeholder="Où sont les toilettes ?"
          placeholderTextColor={THEME.inkFaint}
        />
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          value={translation}
          onChangeText={setTranslation}
          placeholder="Where is the toilet?"
          placeholderTextColor={THEME.inkFaint}
        />
        <TouchableOpacity style={[styles.button, { marginTop: 10 }]} onPress={add}>
          <Text style={styles.buttonText}>Ajouter</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.checklistTitle}>Décaler les dates</Text>
          <Text style={[styles.helpText, { marginTop: 8 }]}>
            Décale la date de départ et toutes les dates explicites du voyage.
          </Text>
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="Nombre de jours"
            placeholderTextColor={THEME.inkFaint}
            keyboardType="number-pad"
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.button, styles.buttonHalf]} onPress={() => confirm(-1)}>
              <Text style={styles.buttonText}>Avancer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonHalf]} onPress={() => confirm(1)}>
              <Text style={styles.buttonText}>Retarder</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onClose} style={{ marginTop: 14, alignItems: "center" }}>
            <Text style={{ color: THEME.inkFaint, fontSize: 13 }}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverBanner: { height: 130, width: "100%" },
  coverBannerGradient: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4, flexDirection: "row", alignItems: "center", gap: 10 },
  dates: { color: THEME.inkMuted, fontSize: 13, textTransform: "capitalize", fontFamily: FONTS.body, flexShrink: 1 },
  statusBadge: { backgroundColor: THEME.goldDim, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { color: THEME.gold, fontSize: 10, fontFamily: FONTS.bodySemiBold },
  tabBarScroll: { flexGrow: 0, marginTop: 12, marginBottom: 4 },
  tabBar: { flexDirection: "row", paddingHorizontal: 20, gap: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: THEME.bgCardAlt },
  tabActive: { backgroundColor: THEME.bgRaised },
  tabText: { color: THEME.inkMuted, fontSize: 13.5, fontFamily: FONTS.body },
  tabTextActive: { color: THEME.ink, fontFamily: FONTS.bodySemiBold },
  scrollContent: { padding: 20 },
  dayCard: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 15,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  dayCardActive: {
    borderColor: THEME.teal,
    borderWidth: 1.5,
    backgroundColor: THEME.tealDim,
  },
  dayCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dayIndexLabel: {
    backgroundColor: THEME.goldDim,
    color: THEME.gold,
    fontSize: 10,
    fontFamily: FONTS.bodySemiBold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  dayIndexLabelActive: { backgroundColor: THEME.teal, color: THEME.bg },
  todayPill: { color: THEME.teal, fontSize: 10, fontFamily: FONTS.bodySemiBold, letterSpacing: 0.4 },
  dayTitle: { fontSize: 16.5, color: THEME.ink, marginTop: 9, fontFamily: FONTS.headingSemiBold },
  dayDate: { fontSize: 12, color: THEME.inkMuted, marginTop: 2, textTransform: "capitalize", fontFamily: FONTS.body },
  dayCount: { fontSize: 11.5, color: THEME.inkFaint, marginTop: 6, fontFamily: FONTS.body },
  totalCard: { alignItems: "center", paddingVertical: 22, marginBottom: 10 },
  totalLabel: { fontSize: 11, color: THEME.inkFaint, letterSpacing: 1, fontFamily: FONTS.bodyMedium },
  totalValue: { fontSize: 32, color: THEME.gold, marginTop: 5, fontFamily: FONTS.headingBold },
  budgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    ...CARD_SHADOW,
  },
  budgetIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  budgetLabel: { flex: 1, fontSize: 14.5, color: THEME.ink, fontFamily: FONTS.body },
  budgetTargetText: { fontSize: 11, color: THEME.inkFaint, marginTop: 2, fontFamily: FONTS.body },
  budgetValue: { fontSize: 14, color: THEME.inkMuted, fontFamily: FONTS.mono },
  checklistSection: { marginBottom: 26 },
  checklistHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  checklistTitle: { fontSize: 15.5, color: THEME.ink, fontFamily: FONTS.headingSemiBold },
  checklistCount: { fontSize: 12.5, color: THEME.teal, fontFamily: FONTS.mono },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  checklistLabel: { flex: 1, fontSize: 14, color: THEME.ink, fontFamily: FONTS.body },
  checklistLabelDone: { color: THEME.inkFaint, textDecorationLine: "line-through" },
  addItemRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  addItemInput: {
    flex: 1,
    backgroundColor: THEME.bgCardAlt,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.ink,
    fontSize: 13.5,
    fontFamily: FONTS.body,
  },
  addItemButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: "center",
    justifyContent: "center",
  },
  shiftDatesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 16,
  },
  shiftDatesButtonText: { color: THEME.inkMuted, fontSize: 13, fontFamily: FONTS.body },
  helpText: { fontSize: 12, color: THEME.inkFaint, lineHeight: 17, marginBottom: 14, fontFamily: FONTS.body },
  label: { fontSize: 12.5, color: THEME.inkMuted, marginBottom: 6, fontFamily: FONTS.bodyMedium },
  phraseRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  phraseText: { fontSize: 14, color: THEME.ink, fontFamily: FONTS.body },
  phraseTranslation: { fontSize: 12.5, color: THEME.teal, marginTop: 3, fontFamily: FONTS.bodyMedium },
  phraseForm: { marginTop: 10 },
  input: {
    backgroundColor: THEME.bgCardAlt,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.ink,
    fontSize: 14,
    fontFamily: FONTS.body,
  },
  button: { borderWidth: 1, borderColor: THEME.teal, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  buttonText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  buttonHalf: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "#00000099", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: THEME.bgCard, borderRadius: 18, padding: 22, width: "100%", borderWidth: 1, borderColor: THEME.border, ...CARD_SHADOW },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  docThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: THEME.bgCardAlt },
  docTitle: { flex: 1, fontSize: 14, color: THEME.ink, fontFamily: FONTS.body },
  previewImage: { width: "100%", height: 220, borderRadius: 10, backgroundColor: THEME.bgCardAlt },
  viewerOverlay: { flex: 1, backgroundColor: "#000000EE", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "80%" },
  viewerTitleBar: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  viewerTitleText: { color: "#FFFFFF", fontSize: 15, fontFamily: FONTS.bodySemiBold, flex: 1 },
  scannedCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.tealDim,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  scannedCodeText: { color: THEME.teal, fontSize: 11.5, fontFamily: FONTS.mono, flex: 1 },
  attractionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  iconBadgeSmall: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: THEME.bgCardAlt,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  searchInput: { flex: 1, color: THEME.ink, fontSize: 13.5, fontFamily: FONTS.body },
  viewToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
  },
  dayGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  dayCardGrid: {
    width: "48%",
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 14,
    padding: 13,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  weatherReorgButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.gold,
    borderRadius: 10,
    paddingVertical: 11,
    marginBottom: 16,
  },
  weatherReorgButtonText: { color: THEME.gold, fontSize: 13, fontFamily: FONTS.bodyMedium },
});
