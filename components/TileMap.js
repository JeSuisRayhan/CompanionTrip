// A small slippy map on OpenStreetMap tiles, with no native map dependency:
// tiles are plain <Image>s placed by lib/map.js, the route is an SVG line,
// pins are Pressables. One finger drags, two fingers pinch (around the middle
// of the map), the buttons zoom.
//
// The component owns the camera. The screen gives it pins, an optional route
// and `fitKey`: whenever fitKey changes the camera frames all the pins again.
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { View, Text, Image, Pressable, PanResponder, Linking, StyleSheet } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";

import { THEME, space, radius, type, shadow, themedStyles, withAlpha } from "../lib/theme";
import { getTileCache } from "../lib/tileStore";
import { fitBounds, visibleTiles, toScreen, viewFromAnchor, zoomBy, centerOn, MIN_ZOOM, MAX_ZOOM, TILE_USER_AGENT } from "../lib/map";
import { IconButton } from "./ui";

const PIN = 32;
const PIN_SELECTED = 40;
const HIT = 44; // minimum touch target
const OFFSCREEN = 48; // pins this far outside the viewport are not drawn
const TILE_HEADERS = { "User-Agent": TILE_USER_AGENT };
const COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const WORLD = { lat: 25, lng: 10, zoom: MIN_ZOOM };
// OSM tiles are light; a veil in the background colour keeps the map from glaring in a dark app.
const tileVeil = () => withAlpha(THEME.bg, 0.2);

// One tile: from the phone when it has been seen before, else fetched once and
// kept (see lib/tileCache.js). If the cache itself cannot work, the tile comes
// straight from the web, exactly as it did before the cache existed.
function Tile({ tile, onGap }) {
  const cache = getTileCache();
  const [state, setState] = useState(() => ({ uri: cache.peek(tile.z, tile.x, tile.y), remote: false }));
  useEffect(() => {
    let alive = true;
    const fresh = cache.peek(tile.z, tile.x, tile.y);
    if (fresh) setState({ uri: fresh, remote: false });
    else {
      cache
        .resolve(tile.z, tile.x, tile.y, tile.url, { wanted: () => alive })
        .then(
          (path) => {
            if (!alive) return;
            if (path) setState({ uri: path, remote: false });
            else onGap(tile.key, true);
          },
          () => alive && setState({ uri: tile.url, remote: true })
        );
    }
    return () => {
      alive = false;
      onGap(tile.key, false);
    };
  }, [tile.key, tile.url]);
  if (!state.uri) return null;
  const source = state.remote ? { uri: state.uri, headers: TILE_HEADERS } : { uri: state.uri };
  return <Image source={source} style={{ position: "absolute", left: tile.left, top: tile.top, width: tile.size, height: tile.size }} />;
}

function touchesOf(e) {
  const t = e.nativeEvent.touches;
  return t && t.length ? t : [e.nativeEvent];
}

function midOf(ts) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < ts.length; i++) {
    x += ts[i].pageX;
    y += ts[i].pageY;
  }
  return { x: x / ts.length, y: y / ts.length };
}

function spreadOf(ts) {
  return ts.length < 2 ? 0 : Math.hypot(ts[0].pageX - ts[1].pageX, ts[0].pageY - ts[1].pageY);
}

export default function TileMap({ pins, route, selectedId, onSelect, fitKey, style }) {
  const [size, setSize] = useState(null);
  const [view, setView] = useState(WORLD);
  const viewRef = useRef(WORLD);
  const sizeRef = useRef(null);
  const gesture = useRef(null);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const commit = useCallback((next) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    if (!width || !height) return;
    sizeRef.current = { width, height };
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  // Frame all the pins when the screen asks (first layout, filter change…).
  const framedFor = useRef(null);
  useEffect(() => {
    if (!size || framedFor.current === fitKey) return;
    framedFor.current = fitKey;
    const next = fitBounds(pinsRef.current, size);
    if (next) commit(next);
  }, [size, fitKey, commit]);

  // Centre on a pin when it gets selected.
  const lastSelected = useRef(null);
  useEffect(() => {
    if (selectedId === lastSelected.current) return;
    lastSelected.current = selectedId;
    const s = sizeRef.current;
    const pin = selectedId && pinsRef.current.find((p) => p.id === selectedId);
    if (pin && s) commit(centerOn(viewRef.current, pin, s));
  }, [selectedId, commit]);

  const responder = useMemo(() => {
    const baseline = (ts) => ({ mode: ts.length >= 2 ? "pinch" : "pan", mid: midOf(ts), spread: spreadOf(ts), view: viewRef.current });
    const end = () => {
      gesture.current = null;
    };
    return PanResponder.create({
      // Taps stay with the pins and the background Pressable; a drag or a
      // second finger takes the gesture over.
      onMoveShouldSetPanResponder: (e, g) => touchesOf(e).length > 1 || Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderGrant: (e) => {
        gesture.current = baseline(touchesOf(e));
      },
      onPanResponderMove: (e) => {
        const s = sizeRef.current;
        if (!s) return;
        const ts = touchesOf(e);
        const mode = ts.length >= 2 ? "pinch" : "pan";
        const base = gesture.current;
        if (!base || base.mode !== mode) {
          gesture.current = baseline(ts); // finger added or lifted: restart from here
          return;
        }
        const m = midOf(ts);
        const zoom = mode === "pinch" && base.spread > 0 ? base.view.zoom + Math.log2(spreadOf(ts) / base.spread) : base.view.zoom;
        commit(viewFromAnchor(base.view, { x: s.width / 2 + (m.x - base.mid.x), y: s.height / 2 + (m.y - base.mid.y) }, zoom, s));
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
      onPanResponderTerminationRequest: () => false,
    });
  }, [commit]);

  const tiles = useMemo(() => visibleTiles(view, size), [view, size]);

  // Tiles with no copy on the phone and no network: the map shows holes there, and says why.
  const gapKeys = useRef(new Set());
  const [gapCount, setGapCount] = useState(0);
  const reportGap = useCallback((key, isGap) => {
    const set = gapKeys.current;
    const changed = isGap ? !set.has(key) && !!set.add(key) : set.delete(key);
    if (changed) setGapCount(set.size);
  }, []);

  const placed = useMemo(() => {
    if (!size) return [];
    return pins
      .map((pin) => ({ pin, ...toScreen(pin, view, size) }))
      .filter((p) => p.x > -OFFSCREEN && p.x < size.width + OFFSCREEN && p.y > -OFFSCREEN && p.y < size.height + OFFSCREEN)
      .sort((a, b) => (a.pin.id === selectedId ? 1 : 0) - (b.pin.id === selectedId ? 1 : 0));
  }, [pins, view, size, selectedId]);

  const line = useMemo(() => {
    if (!size || !route || route.length < 2) return null;
    return route.map((p) => {
      const s = toScreen(p, view, size);
      return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
    }).join(" ");
  }, [route, view, size]);

  const numbered = !!route && route.length > 0;

  return (
    <View style={[styles.wrap, style]} onLayout={onLayout} {...responder.panHandlers}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {tiles.map((t) => (
          <Tile key={t.key} tile={t} onGap={reportGap} />
        ))}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tileVeil() }]} />
      </View>

      <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect && onSelect(null)} accessible={false} />

      {line ? (
        <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polyline points={line} fill="none" stroke={THEME.bg} strokeOpacity={0.55} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />
          <Polyline points={line} fill="none" stroke={THEME.gold} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      ) : null}

      {placed.map(({ pin, x, y }) => (
        <Pin key={pin.id} pin={pin} x={x} y={y} numbered={numbered} selected={pin.id === selectedId} onPress={() => onSelect && onSelect(pin.id)} />
      ))}

      <View style={styles.controls}>
        <IconButton icon="add" label="Zoomer" filled size={22} disabled={view.zoom >= MAX_ZOOM - 0.01} style={styles.control} onPress={() => size && commit(zoomBy(viewRef.current, size, 1))} />
        <IconButton icon="remove" label="Dézoomer" filled size={22} disabled={view.zoom <= MIN_ZOOM + 0.01} style={styles.control} onPress={() => size && commit(zoomBy(viewRef.current, size, -1))} />
        <IconButton
          icon="expand-outline"
          label="Tout voir"
          filled
          size={20}
          disabled={!pins.length}
          style={styles.control}
          onPress={() => {
            const next = size && fitBounds(pins, size);
            if (next) commit(next);
          }}
        />
      </View>

      {gapCount > 0 ? (
        <View style={styles.gapNote} accessibilityLiveRegion="polite" pointerEvents="none">
          <Ionicons name="cloud-offline-outline" size={16} color={THEME.gold} />
          <Text style={styles.gapText}>Carte incomplète ici : pas de réseau, et cette zone n'a jamais été consultée.</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Données de la carte © contributeurs OpenStreetMap"
        onPress={() => Linking.openURL(COPYRIGHT_URL)}
        style={styles.attribution}
      >
        <Text style={styles.attributionText}>© contributeurs OpenStreetMap</Text>
      </Pressable>
    </View>
  );
}

// One pin. On a day route it is a numbered gold disc; otherwise it wears its
// category icon and colour, with a small day badge when it is on the programme.
function Pin({ pin, x, y, numbered, selected, onPress }) {
  const diameter = selected ? PIN_SELECTED : PIN;
  const day = pin.dayIndex != null ? `jour ${pin.dayIndex + 1}` : "à placer";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={numbered ? `Étape ${pin.order}, ${pin.name}` : `${pin.name}, ${pin.categoryLabel}, ${day}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.pinHit, { left: x - HIT / 2, top: y - HIT / 2 }]}
    >
      <View
        style={[
          styles.pin,
          { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: numbered ? THEME.gold : pin.color },
          selected && styles.pinSelected,
        ]}
      >
        {numbered ? <Text style={styles.pinNumber}>{pin.order}</Text> : <Ionicons name={pin.icon} size={selected ? 20 : 16} color={THEME.onGold} />}
      </View>
      {!numbered && pin.dayIndex != null ? (
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{`J${pin.dayIndex + 1}`}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themedStyles(() => ({
  wrap: { flex: 1, overflow: "hidden", backgroundColor: THEME.surfaceSunk },
  pinHit: { position: "absolute", width: HIT, height: HIT, alignItems: "center", justifyContent: "center" },
  pin: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: THEME.bg, boxShadow: shadow.raised },
  pinSelected: { borderColor: THEME.ink, borderWidth: 3 },
  pinNumber: { ...type.numeral, color: THEME.onGold, lineHeight: 18 },
  dayBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    paddingHorizontal: space.xs + 1,
    paddingVertical: 1,
    backgroundColor: THEME.bg,
    borderRadius: radius.full,
  },
  dayBadgeText: { ...type.numeralSmall, fontSize: 11, lineHeight: 14, color: THEME.ink },
  controls: { position: "absolute", top: space.md, right: space.md, gap: space.sm },
  control: { boxShadow: shadow.raised },
  gapNote: {
    position: "absolute",
    top: space.md,
    left: space.md,
    right: HIT + space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: THEME.scrim,
    borderRadius: radius.md,
  },
  gapText: { ...type.caption, flex: 1, color: THEME.ink },
  attribution: {
    position: "absolute",
    left: space.sm,
    bottom: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    backgroundColor: THEME.scrim,
    borderRadius: radius.full,
  },
  attributionText: { ...type.caption, fontSize: 11, lineHeight: 14, color: THEME.ink },
}));
