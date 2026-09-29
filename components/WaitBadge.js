import React from "react";
import { Text } from "react-native";

import { type } from "../lib/theme";
import { waitTone } from "../lib/queueTimes";
import { Badge } from "./ui";

// The queue of an attraction: live when Queue-Times knows it (or "Fermée"),
// else the usual one written by hand ("~30 min"), else nothing.
export default function WaitBadge({ ride, idea }) {
  if (ride && !ride.open) return <Badge label="Fermée" tone="stamp" />;
  if (ride && ride.wait != null) return <Badge label={`${ride.wait} min`} icon="time-outline" tone={waitTone(ride.wait)} />;
  if (idea && idea.waitMin != null && idea.categoryId !== "repas") return <Text style={type.numeralSmall}>{`~${idea.waitMin} min`}</Text>;
  return null;
}
