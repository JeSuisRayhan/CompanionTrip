import React, { useEffect, useState } from "react";
import { View, Text, Linking } from "react-native";

import { THEME, space, type, themedStyles } from "../lib/theme";
import { COUNTRIES, ADVICE_URL, countryFacts } from "../lib/countries";
import { languageLabel } from "../lib/phrases";
import { Txt, Group, Row, Sheet } from "./ui";

// La fiche pays: what to know before leaving, for the country of the trip. General information, said so.
// `country` is the one found (or chosen) for the trip; without one the sheet starts by asking for it.
export default function CountrySheet({ visible, trip, country, onClose, onPick, onOpenPhrases }) {
  const [choosing, setChoosing] = useState(!country);
  useEffect(() => {
    if (visible) setChoosing(!country);
  }, [visible, country]);

  if (choosing || !country) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Choisir le pays">
        <Txt variant="subhead" style={styles.help}>Pour afficher monnaie, prises, urgences et décalage horaire.</Txt>
        <Group style={styles.group}>
          {COUNTRIES.map((c) => (
            <Row key={c.key} icon="globe-outline" tone="neutral" title={c.name} subtitle={c.lang} chevron onPress={() => onPick(c.key)} accessibilityLabel={`Choisir ${c.name}`} />
          ))}
        </Group>
      </Sheet>
    );
  }

  const facts = countryFacts(country, trip, new Date());
  const phrasesLabel = country.phrases ? languageLabel(country.phrases) : null;
  return (
    <Sheet visible={visible} onClose={onClose} title={country.name}>
      <Txt variant="subhead" style={styles.help}>Infos générales pour un voyageur parti de France, à vérifier avant le départ.</Txt>
      <Group style={styles.group}>
        {facts.map((f) => (
          <Row key={f.key} icon={f.icon} tone="neutral" title={f.label} accessibilityLabel={`${f.label} : ${f.value}${f.note ? ". " + f.note : ""}`}>
            <Text style={type.subhead}>{f.value}</Text>
            {f.note ? <Text style={type.caption}>{f.note}</Text> : null}
          </Row>
        ))}
      </Group>
      <Group style={styles.group}>
        {phrasesLabel ? (
          <Row icon="chatbubbles-outline" tone="neutral" title="Phrases de base" subtitle={phrasesLabel} chevron onPress={onOpenPhrases} accessibilityLabel={`Voir les phrases de base en ${phrasesLabel.toLowerCase()}`} />
        ) : null}
        <Row icon="shield-checkmark-outline" tone="neutral" title="Conseils aux voyageurs" subtitle="Sécurité, santé, formalités : France Diplomatie" chevron onPress={() => Linking.openURL(ADVICE_URL).catch(() => {})} accessibilityLabel="Ouvrir les conseils aux voyageurs de France Diplomatie" />
        <Row icon="swap-horizontal-outline" tone="neutral" title="Ce n'est pas le bon pays ?" subtitle="Changer de pays" chevron onPress={() => setChoosing(true)} accessibilityLabel="Changer de pays" />
      </Group>
      <Txt variant="caption" style={styles.help}>Sans valeur officielle : les règles changent. Vérifiez les formalités et les conseils de sécurité avant de partir.</Txt>
    </Sheet>
  );
}

const styles = themedStyles(() => ({
  help: { marginBottom: space.md },
  group: { marginBottom: space.lg },
}));
