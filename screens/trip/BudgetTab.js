// "Budget": what is left on the departure board, what is booked and spent, by category, then the expenses.
import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { THEME, TONES, FONTS, space, type, themedStyles, paperEdge } from "../../lib/theme";
import { isoDate, formatWeekdayDay } from "../../lib/dates";
import { updateTripSettings } from "../../lib/trips";
import { budgetOverview, budgetSummary, expensesTotal, expensesByCategory, expenseCategory, EXPENSE_CATEGORIES, reservedItems, reservedTotal, reservedByCategory, plannedRest, formatMoney, currencySymbol, currencyName, convertAmount, parseBudgetInput } from "../../lib/budget";
import { useTripInk } from "../../lib/tripInk";
import { Button, Field, Sheet, Group, Row, round } from "../../components/ui";
import { Section, PageHead, Perforation, AmountCol, SplitBar, MAIN } from "../../components/mix";
import Flip, { Plate } from "../../components/Flip";
import { convertAmount as conv } from "../../lib/budget";

// The category rows, in the order of a trip: where the night is, how we get there, what we eat, the rest.
const CATEGORY_ORDER = ["hotel", "transport", "repas", "other"];

export default function BudgetTab({ trip, navigation, onChange }) {
  const ink = useTripInk();
  const today = isoDate(new Date());
  const [converterOpen, setConverterOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  const home = trip.homeCurrency || trip.currency || "EUR";
  const local = trip.currency || home;
  const rate = trip.rate || 1;
  const different = local !== home;
  const overview = budgetOverview(trip, today);
  const summary = overview ? budgetSummary(overview, home) : null;
  const m = (n) => formatMoney(Math.round(n), home);
  const mx = (n) => formatMoney(n, home); // keeps the cents of a small amount

  const reserved = reservedByCategory(trip);
  const stays = reservedItems(trip).filter((i) => i.kind === "stay");
  const spentBy = expensesByCategory(trip);
  const expenses = [...(trip.expenses || [])].reverse().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const spentCount = (key) => (trip.expenses || []).filter((e) => expenseCategory(e) === key).length;
  const bookedHome = reservedTotal(trip) * rate;
  const spentHome = expensesTotal(trip) * rate;
  const restPlanned = plannedRest(trip) * rate;

  // The plate: what is left (or by how much the budget is passed); with no budget, what is committed so far.
  const hasBudget = !!overview;
  const over = hasBudget && overview.over;
  const figureValue = hasBudget ? Math.abs(Math.round(overview.left)) : Math.round(bookedHome + spentHome);
  const figure = String(figureValue);
  const rows = CATEGORY_ORDER.map((key) => {
    const cat = EXPENSE_CATEGORIES.find((c) => c.key === key);
    const amount = reserved[key] + spentBy[key]; // local currency
    return { key, cat, amount, reserved: reserved[key], spent: spentBy[key], target: trip.budgetTargets && trip.budgetTargets[key] };
  }).filter((r) => r.amount > 0 || (r.target != null && r.target > 0));
  const denominator = hasBudget ? overview.target : Math.max(bookedHome + spentHome, 1);

  function subtitleOf(r) {
    const parts = [];
    if (r.key === "hotel" && r.reserved > 0) parts.push(stays.length === 1 ? `${stays[0].title} · réservée` : `${stays.length} séjours réservés`);
    else if (r.reserved > 0) parts.push(`${m(r.reserved * rate)} réservés`);
    if (r.spent > 0) parts.push(r.reserved > 0 ? `${m(r.spent * rate)} dépensés` : `${spentCount(r.key)} dépense${spentCount(r.key) > 1 ? "s" : ""}`);
    if (r.target != null && r.target > 0) parts.push(`objectif ${m(r.target)}`);
    return parts.join(" · ");
  }

  return (
    <ScrollView contentContainerStyle={MAIN} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <PageHead
        title="Budget"
        sub={`En ${currencyName(home)}${different ? ` · 1 ${local} = ${formatRate(rate)} ${currencySymbol(home)}` : ""}`}
        right={different ? <Button title="Convertir" icon="swap-horizontal" size="sm" variant="secondary" onPress={() => setConverterOpen(true)} /> : null}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasBudget ? `${over ? "Dépassé de" : "Il reste"} ${figure} ${currencySymbol(home)} sur ${m(overview.target)}. Modifier le budget` : "Définir un budget total"}
        onPress={() => setGoalOpen(true)}
        style={({ pressed }) => [styles.card, round("xl"), pressed && { opacity: 0.92 }]}
      >
        <Plate cap={hasBudget ? (over ? "Dépassé de" : "Il reste") : "Réservé et dépensé"} capRight={hasBudget ? `Sur ${m(overview.target)}` : "Budget à fixer"} style={styles.plate}>
          <View style={styles.figureRow}>
            <Flip value={figure} size={figure.length > 4 ? "lg" : "xl"} tone={over ? "red" : "trip"} label={`${figure} ${currencySymbol(home)}`} />
            <Text style={styles.symbol}>{currencySymbol(home)}</Text>
          </View>
          <Text style={styles.plateLine}>
            {hasBudget ? (over ? "Le budget est dépassé" : summary.perDayLine || "Plus rien à répartir") : "Fixez un budget pour savoir ce qui reste"}
          </Text>
        </Plate>
        <View style={styles.paper}>
          <Perforation />
          <View style={styles.paperBody}>
            <SplitBar
              parts={[
                { ratio: Math.min(bookedHome / denominator, 1), color: ink.color },
                { ratio: Math.min(spentHome / denominator, Math.max(0, 1 - Math.min(bookedHome / denominator, 1))), color: THEME.goldFill },
              ]}
            />
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: ink.color }]} />
                <Text style={styles.legendText}>Réservé {m(bookedHome)}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: THEME.goldFill }]} />
                <Text style={styles.legendText}>Dépensé {m(spentHome)}</Text>
              </View>
            </View>
            {summary && summary.todayLine ? <Text style={styles.note}>{summary.todayLine}</Text> : null}
            {restPlanned > 0 ? (
              <Text style={[styles.note, hasBudget && restPlanned > Math.max(overview.left, 0) && { color: THEME.stamp }]}>
                Au programme : encore ≈ {m(restPlanned)} de repas, trajets et visites
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>

      <Button title="Ajouter une dépense" icon="add" size="lg" full onPress={() => navigation.navigate("Expense", { tripId: trip.id })} />

      <Section title="Par catégorie">
        {rows.length === 0 ? (
          <Text style={type.subhead}>Rien de réservé ni de dépensé pour l'instant. Les vols, séjours et réservations du programme s'ajoutent ici tout seuls.</Text>
        ) : (
          <Group>
            {rows.map((r) => {
              const value = r.amount * rate;
              const base = r.target != null && r.target > 0 ? r.target : denominator;
              const overTarget = r.target != null && r.target > 0 && value > r.target;
              return (
                <Row
                  key={r.key}
                  icon={r.cat.icon}
                  tone={r.cat.tone}
                  title={r.cat.label}
                  subtitle={subtitleOf(r)}
                  right={<AmountCol main={m(value)} local={different ? formatMoney(r.amount, local) : null} />}
                >
                  <View style={styles.catBar}>
                    <View style={[styles.catFill, { width: `${Math.max(Math.min(value / base, 1), 0.02) * 100}%`, backgroundColor: overTarget ? THEME.stamp : TONES[r.cat.tone].fg }]} />
                  </View>
                </Row>
              );
            })}
          </Group>
        )}
      </Section>

      <Section title="Dépenses" count={expenses.length || null}>
        {expenses.length === 0 ? (
          <Text style={type.subhead}>Notez ce que vous dépensez sur place : le budget se met à jour tout de suite.</Text>
        ) : (
          <Group>
            {expenses.map((e) => {
              const cat = EXPENSE_CATEGORIES.find((c) => c.key === expenseCategory(e));
              return (
                <Row
                  key={e.id}
                  icon={cat.icon}
                  tone={cat.tone}
                  title={e.label}
                  subtitle={[cat.label, e.date ? formatWeekdayDay(e.date) : null].filter(Boolean).join(" · ")}
                  accessibilityLabel={`${e.label}, ${formatMoney(e.amount, local)}`}
                  onPress={() => navigation.navigate("Expense", { tripId: trip.id, expenseId: e.id })}
                  right={<AmountCol main={mx(convertAmount(e.amount, rate))} local={different ? formatMoney(e.amount, local) : null} />}
                />
              );
            })}
          </Group>
        )}
      </Section>

      <BudgetGoalSheet
        visible={goalOpen}
        current={hasBudget ? overview.target : null}
        code={home}
        onClose={() => setGoalOpen(false)}
        onSave={async (value) => {
          await updateTripSettings(trip.id, { budgetTotal: value });
          setGoalOpen(false);
          onChange();
        }}
      />
      <CurrencyConverterModal visible={converterOpen} onClose={() => setConverterOpen(false)} trip={trip} />
    </ScrollView>
  );
}

function formatRate(rate) {
  return (Math.round(rate * 10000) / 10000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// Set, change or remove the budget total (in the person's own currency).
function BudgetGoalSheet({ visible, current, code, onClose, onSave }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setAmount(current ? String(current).replace(".", ",") : "");
    setError("");
    setBusy(false);
  }, [visible, current]);

  async function save(value) {
    setBusy(true);
    try {
      await onSave(value);
    } catch (e) {
      setError("Échec de l'enregistrement.");
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Budget total">
      <Field
        label={`Pour tout le voyage (${code})`}
        value={amount}
        onChangeText={setAmount}
        placeholder="3000"
        keyboardType="decimal-pad"
        hint="Ce qui reste = ce budget, moins ce qui est réservé, moins ce que vous dépensez."
        error={error || undefined}
      />
      <View style={styles.sheetButtons}>
        {current ? <Button title="Supprimer" variant="secondary" tone="stamp" disabled={busy} style={{ flex: 1 }} onPress={() => save(null)} /> : <Button title="Annuler" variant="secondary" disabled={busy} style={{ flex: 1 }} onPress={onClose} />}
        <Button
          title="Enregistrer"
          loading={busy}
          style={{ flex: 1 }}
          onPress={() => {
            const value = parseBudgetInput(amount);
            if (!value) return setError("Indiquez un montant.");
            save(value);
          }}
        />
      </View>
    </Sheet>
  );
}

function CurrencyConverterModal({ visible, onClose, trip }) {
  const [localVal, setLocalVal] = useState("");
  const [homeVal, setHomeVal] = useState("");

  function onLocalChange(v) {
    setLocalVal(v);
    const n = parseFloat(v.replace(",", "."));
    setHomeVal(!isNaN(n) ? String(Math.round(conv(n, trip.rate) * 100) / 100) : "");
  }

  function onHomeChange(v) {
    setHomeVal(v);
    const n = parseFloat(v.replace(",", "."));
    setLocalVal(!isNaN(n) && trip.rate ? String(Math.round((n / trip.rate) * 100) / 100) : "");
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Convertisseur rapide">
      <Field label={`En ${trip.currency}`} value={localVal} onChangeText={onLocalChange} placeholder="0" keyboardType="decimal-pad" />
      <Field label={`En ${trip.homeCurrency}`} value={homeVal} onChangeText={onHomeChange} placeholder="0" keyboardType="decimal-pad" />
      <Button title="Fermer" variant="secondary" full onPress={onClose} />
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: THEME.bgCard, overflow: "hidden", ...paperEdge() },
  plate: { borderRadius: 0, boxShadow: "0 0 0 0 transparent", paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, gap: 12 },
  figureRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  symbol: { fontFamily: FONTS.head, fontSize: 30, lineHeight: 34, color: THEME.plateInk },
  plateLine: { ...type.subhead, fontSize: 15, color: THEME.plateDim },
  paper: { backgroundColor: THEME.bgCard },
  paperBody: { gap: 12, paddingHorizontal: 22, paddingTop: 2, paddingBottom: 20 },
  legend: { flexDirection: "row", alignItems: "center", gap: 18, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { ...type.subhead, color: THEME.ink },
  note: { ...type.subhead, color: THEME.inkMuted },
  catBar: { height: 6, borderRadius: 3, backgroundColor: THEME.bgCardAlt, overflow: "hidden", marginTop: 6, boxShadow: `inset 0 0 0 1px ${THEME.hair}` },
  catFill: { height: 6, borderRadius: 3 },
  sheetButtons: { flexDirection: "row", gap: space.md, marginTop: space.xs },
}));
