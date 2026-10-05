import React from "react";
import { View } from "react-native";
import Icon from "./Icon";

import { THEME, space, themedStyles } from "../lib/theme";
import { legAdvice } from "../lib/travelTime";
import { Txt, round } from "./ui";

const ICONS = { walk: "walk-outline", drive: "car-outline", far: "trail-sign-outline" };
const ADVICE_COLOR = { stamp: "stamp", gold: "gold", neutral: "inkMuted" };

// Between two steps: how far the next one is and when to leave. `now` only on the day being lived
// (it turns "Partir à 14:45" into "Il est temps de partir"); `compact` is the slim form between rows of a day.
export default function LegLine({ leg, arriveAt, now = null, compact = false, fromName }) {
  const advice = legAdvice(leg, arriveAt, now);
  const head = compact || !fromName ? leg.text : `Depuis ${fromName} : ${leg.text}`;
  const label = [head, advice ? advice.text : null].filter(Boolean).join(". ");
  return (
    <View accessible accessibilityLabel={label} style={compact ? styles.compact : [styles.box, round("md")]}>
      <Icon name={ICONS[leg.mode] || "walk-outline"} size={compact ? 14 : 18} color={THEME.inkFaint} style={styles.icon} />
      <View style={styles.texts}>
        <Txt variant="caption">{head}</Txt>
        {advice ? (
          <Txt variant={compact ? "caption" : "label"} color={ADVICE_COLOR[advice.tone]}>{advice.text}</Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  box: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, padding: space.md, backgroundColor: THEME.bgCardAlt },
  compact: { flexDirection: "row", alignItems: "flex-start", gap: space.xs + 2, paddingVertical: space.xs, paddingLeft: space.sm },
  icon: { marginTop: 2 },
  texts: { flex: 1, gap: 2 },
}));
