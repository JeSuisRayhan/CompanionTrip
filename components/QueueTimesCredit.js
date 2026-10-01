import React from "react";
import { Text, Pressable, Linking } from "react-native";

import { THEME, space, type, themedStyles } from "../lib/theme";
import { QUEUE_TIMES_CREDIT } from "../lib/queueTimes";

// The credit Queue-Times asks for next to its data: a link, kept small.
export default function QueueTimesCredit({ style }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(QUEUE_TIMES_CREDIT.url)}
      accessibilityRole="link"
      accessibilityLabel={`${QUEUE_TIMES_CREDIT.text}, ouvrir queue-times.com`}
      hitSlop={10}
      style={({ pressed }) => [styles.credit, pressed && { opacity: 0.7 }, style]}
    >
      <Text style={[type.caption, styles.text]}>{QUEUE_TIMES_CREDIT.text}</Text>
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  credit: { alignSelf: "center", paddingVertical: space.sm },
  text: { color: THEME.inkMuted, textDecorationLine: "underline" },
}));
