// "Pratique": documents, phrases, lists and the facts of the country: what you look up while travelling.
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import Icon from "../../components/Icon";
import { THEME, space, type, themedStyles, paperEdge, FONTS } from "../../lib/theme";
import { detectCountry, timeDifference, timeDifferenceDate, plugAdvice } from "../../lib/countries";
import { updateTripSettings } from "../../lib/trips";
import { currencySymbol } from "../../lib/budget";
import { useTripInk } from "../../lib/tripInk";
import { Group, Row, ProgressBar } from "../../components/ui";
import { Section, PageHead, MAIN } from "../../components/mix";
import CountrySheet from "../../components/CountrySheet";
import DocumentsSection from "./DocumentsSection";
import { PhraseRow } from "../PhrasesScreen";

const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// The four things people look up first: money, the clock, the plugs, the water.
export function factTiles(country, trip) {
  const home = trip.homeCurrency || "EUR";
  const tiles = [];
  tiles.push({
    key: "money",
    icon: "cash-outline",
    title: cap(country.money),
    sub: trip.currency === country.currency && trip.rate && trip.homeCurrency && trip.homeCurrency !== country.currency ? `1 ${country.currency} = ${(Math.round(trip.rate * 10000) / 10000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currencySymbol(home)}` : country.currency,
  });
  const diff = timeDifference(country, timeDifferenceDate(trip, new Date()));
  const m = Math.abs(diff.minutes);
  const amount = `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}`;
  tiles.push({
    key: "time",
    icon: "time-outline",
    title: m === 0 ? "Même heure" : `${diff.approx ? "≈ " : ""}${amount} ${diff.minutes > 0 ? "de plus" : "de moins"}`,
    sub: "qu'en France",
  });
  const types = country.plug.split(",").map((s) => s.trim());
  const plug = plugAdvice(country);
  tiles.push({
    key: "plug",
    icon: "flash-outline",
    title: `Prise${types.length > 1 ? "s" : ""} ${types.length > 1 ? types.slice(0, -1).join(", ") + " et " + types[types.length - 1] : types[0]}`,
    sub: types.includes("C") && types.includes("E") ? "comme en France" : plug.fits ? "vos fiches passent" : "adaptateur requis",
  });
  const drinkable = /^potable/i.test(country.water || "") && !/non potable/i.test(country.water || "");
  tiles.push({ key: "water", icon: "water-outline", title: drinkable ? "Eau du robinet" : "Eau en bouteille", sub: drinkable ? "potable" : "pas celle du robinet" });
  return tiles;
}

export default function PratiqueTab({ trip, navigation, onChange, onOpenTab, incomingScan, onConsumeIncomingScan, incomingAction, onConsumeIncomingAction }) {
  const ink = useTripInk();
  const [countryOpen, setCountryOpen] = useState(false);
  const phrases = trip.phrases || [];
  const country = detectCountry(trip);
  const lists = [
    { key: "departureChecklist", title: "Avant le départ", items: trip.departureChecklist || [] },
    { key: "packingList", title: "Bagages", items: trip.packingList || [] },
  ];

  return (
    <ScrollView contentContainerStyle={MAIN} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <PageHead title="Pratique" sub="Documents, phrases, listes et infos du pays" />

      <DocumentsSection
        trip={trip}
        onChange={onChange}
        navigation={navigation}
        incomingScan={incomingScan}
        onConsumeIncomingScan={onConsumeIncomingScan}
        incomingAction={incomingAction}
        onConsumeIncomingAction={onConsumeIncomingAction}
      />

      <Section title="Phrases" count={phrases.length || null}>
        <Group>
          {phrases.slice(0, 2).map((p, i) => (
            <PhraseRow key={p.id} phrase={p} onPress={() => navigation.navigate("ShowPhrase", { phrases: phrases.map((x) => ({ phrase: x.phrase, translation: x.translation, reading: x.reading || null })), index: i })} />
          ))}
          {phrases.length === 0 ? (
            <Row icon="chatbubbles-outline" title="Phrases de base" subtitle="Bonjour, merci, l'addition… dans la langue du voyage" onPress={() => navigation.navigate("Phrases", { tripId: trip.id })} chevron />
          ) : (
            <Row title={<Text style={[type.name, { color: ink.color }]}>{`Voir les ${phrases.length} phrases`}</Text>} onPress={() => navigation.navigate("Phrases", { tripId: trip.id })} chevron style={{ minHeight: 58 }} />
          )}
        </Group>
      </Section>

      <Section title="Listes" count={lists.length}>
        <Group>
          {lists.map((l) => {
            const done = l.items.filter((i) => i.checked).length;
            return (
              <Row
                key={l.key}
                title={l.title}
                subtitle={l.items.length ? `${done} sur ${l.items.length}` : "Rien ici pour l'instant"}
                onPress={() => navigation.navigate("Checklist", { tripId: trip.id, listKey: l.key })}
                chevron
                accessibilityLabel={`${l.title}, ${l.items.length ? `${done} sur ${l.items.length}` : "vide"}`}
              >
                {l.items.length ? <ProgressBar value={done / l.items.length} tone={ink.name} height={6} style={{ marginTop: 4 }} /> : null}
              </Row>
            );
          })}
        </Group>
      </Section>

      {country ? (
        <Section title={country.name} count="infos générales" action={{ label: "Fiche complète", onPress: () => setCountryOpen(true) }}>
          <View style={styles.facts}>
            {factTiles(country, trip).map((f) => (
              <View key={f.key} style={styles.fact} accessible accessibilityLabel={`${f.title}${f.sub ? ", " + f.sub : ""}`}>
                <Icon name={f.icon} size={22} color={ink.color} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.factTitle}>{f.title}</Text>
                  {f.sub ? <Text style={styles.factSub}>{f.sub}</Text> : null}
                </View>
              </View>
            ))}
          </View>
          <Text style={type.subhead}>Sans valeur officielle : vérifiez les formalités et les conseils avant de partir.</Text>
        </Section>
      ) : (
        <Section title="Pays">
          <Group>
            <Row icon="globe-outline" title="Choisir le pays" subtitle="Monnaie, prises, urgences, décalage horaire" onPress={() => setCountryOpen(true)} chevron />
          </Group>
        </Section>
      )}

      <CountrySheet
        visible={countryOpen}
        trip={trip}
        country={country}
        onClose={() => setCountryOpen(false)}
        onPick={async (key) => {
          await updateTripSettings(trip.id, { country: key });
          onChange();
        }}
        onOpenPhrases={() => {
          setCountryOpen(false);
          navigation.navigate("Phrases", { tripId: trip.id });
        }}
      />
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fact: { width: "48.5%", flexGrow: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: THEME.bgCard, ...paperEdge() },
  factTitle: { fontFamily: FONTS.headSemi, fontSize: 16, lineHeight: 20, color: THEME.ink },
  factSub: { fontFamily: FONTS.bodyMed, fontSize: 13, lineHeight: 17, color: THEME.inkMuted, marginTop: 1 },
}));
