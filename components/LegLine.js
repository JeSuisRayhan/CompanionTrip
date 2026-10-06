import React from "react";
import { View, Pressable } from "react-native";
import Icon from "./Icon";

import { THEME, space, themedStyles } from "../lib/theme";
import { legAdvice, legIcon } from "../lib/travelTime";
import { formatMoney } from "../lib/budget";
import { Txt, round } from "./ui";

const ADVICE_COLOR = { stamp: "stamp", gold: "gold", neutral: "inkMuted" };

// Between two steps: how far the next one is, when to leave, and what the way cost. `now` only on the day being lived
// (it turns "Partir à 14:45" into "Il est temps de partir"); `compact` is the slim form between rows of a day.
// With `onPress` the line is a button: it opens the price of the way (price and label of the leg).
export default function LegLine({ leg, arriveAt, now = null, compact = false, fromName, currency = "EUR", onPress }) {
  const advice = legAdvice(leg, arriveAt, now);
  const hasPrice = leg.price != null;
  const estimate = leg.estimated ? leg.text : null;
  const named = [leg.label, estimate].filter(Boolean).join(" · ");
  const body = named || leg.text || "Trajet";
  const head = compact || !fromName ? body : `Depuis ${fromName} : ${body}`;
  const when = leg.at && !leg.estimated ? `Départ ${leg.at}` : null;
  const price = hasPrice ? formatMoney(leg.price, currency) : null;
  const spoken = [head, when, advice ? advice.text : null, leg.note, price ? `Prix : ${price}` : null].filter(Boolean).join(". ");
  const label = onPress ? `${spoken}. ${hasPrice ? "Modifier le prix du trajet" : "Ajouter le prix du trajet"}` : spoken;

  const content = (
    <>
      <Icon name={legIcon(leg)} size={compact ? 14 : 18} color={THEME.inkFaint} style={styles.icon} />
      <View style={styles.texts}>
        <Txt variant="caption">{head}</Txt>
        {when ? <Txt variant="caption" color="inkMuted">{when}</Txt> : null}
        {advice ? <Txt variant={compact ? "caption" : "label"} color={ADVICE_COLOR[advice.tone]}>{advice.text}</Txt> : null}
        {leg.note ? <Txt variant="caption" color="inkMuted">{leg.note}</Txt> : null}
      </View>
      {price ? (
        <Txt variant="numeralSmall" style={styles.price}>{price}</Txt>
      ) : onPress ? (
        <View style={styles.add}>
          <Icon name="add" size={13} color={THEME.blue} />
          <Txt variant="caption" color="blue">Prix</Txt>
        </View>
      ) : null}
    </>
  );

  const box = compact ? styles.compact : [styles.box, round("md")];
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={spoken} style={box}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={space.xs}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [box, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  box: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: space.md, backgroundColor: THEME.bgCardAlt },
  compact: { flexDirection: "row", alignItems: "flex-start", gap: space.xs + 2, paddingVertical: space.xs, paddingLeft: space.sm, paddingRight: space.sm },
  icon: { marginTop: 2 },
  texts: { flex: 1, gap: 2 },
  price: { marginTop: 1, flexShrink: 0 },
  add: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 1 },
}));
