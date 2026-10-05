import React from "react";
import { Ionicons } from "@expo/vector-icons";

// The one icon component of the app. Everything is drawn as an outline, so the icons share one stroke (the
// object icons of Ionicons come in a filled and an outline version: the outline one is used). A few glyphs
// keep their solid form because the solid form is the point: a ticked circle or box, the play and stop
// shapes, the star and heart of a favourite, the dot of a radio button, the bold marks of the controls
// (plus, cross, arrows, chevrons, tick).
const KEEP_SOLID = new Set([
  "add", "remove", "close", "close-circle", "search", "refresh", "repeat", "ellipsis-horizontal",
  "arrow-back", "arrow-forward", "chevron-back", "chevron-forward", "chevron-up", "chevron-down",
  "swap-horizontal", "swap-vertical", "checkmark", "checkmark-done", "checkmark-circle", "checkbox",
  "radio-button-on", "radio-button-off", "play", "stop", "star", "heart", "alert", "alert-circle",
]);

// The name to draw: the outline twin when there is one and the icon is not kept solid.
export function outlineName(name, glyphs = Ionicons && Ionicons.glyphMap) {
  if (!name || name.endsWith("-outline") || name.endsWith("-sharp") || KEEP_SOLID.has(name)) return name;
  const twin = `${name}-outline`;
  return glyphs && glyphs[twin] != null ? twin : name;
}

export default function Icon({ name, ...props }) {
  return <Ionicons name={outlineName(name)} {...props} />;
}
