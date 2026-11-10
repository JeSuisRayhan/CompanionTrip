// The lock of the app: the 4-digit code, or the phone's own lock (fingerprint, face, phone code) when the person allows
// it. Wrong codes are counted: after five in a row each new try has to wait (see lib/pin.js).
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, Pressable, Alert, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "../components/Icon";
import { THEME, space, radius, type, themedStyles, paperEdge } from "../lib/theme";
import { verifyPin, pinStatus, clearPinFails, deviceUnlockEnabled, waitLabel } from "../lib/pin";
import { deviceAuthAvailable, authenticateWithDevice } from "../lib/deviceAuth";
import { Txt } from "../components/ui";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export default function LockScreen({ onUnlock }) {
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [waitUntil, setWaitUntil] = useState(0); // no code is tried before this moment
  const [now, setNow] = useState(() => Date.now());
  const [deviceOk, setDeviceOk] = useState(false); // the phone's own lock may open the app
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const asking = useRef(false);

  const askDevice = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    const ok = await authenticateWithDevice("Ouvrir Compagnon de voyage");
    asking.current = false;
    if (!alive.current || !ok) return;
    await clearPinFails();
    onUnlock();
  }, [onUnlock]);

  useEffect(() => {
    alive.current = true;
    (async () => {
      const status = await pinStatus();
      if (!alive.current) return;
      if (status.waitMs > 0) setWaitUntil(Date.now() + status.waitMs);
      const can = (await deviceUnlockEnabled()) && (await deviceAuthAvailable());
      if (!alive.current) return;
      setDeviceOk(can);
      // asked once, by itself, when the screen comes up in front of the person
      if (can && AppState.currentState === "active") askDevice();
    })();
    return () => {
      alive.current = false;
    };
  }, []);

  // The wait counts down on screen.
  useEffect(() => {
    if (waitUntil <= Date.now()) return undefined;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= waitUntil) clearInterval(id); // the wait is over: nothing left to count
    }, 500);
    return () => clearInterval(id);
  }, [waitUntil]);
  const waitMs = Math.max(0, waitUntil - now);
  const waiting = waitMs > 0;

  async function press(d) {
    if (waiting || busy || digits.length >= 4) return;
    const next = digits + d;
    setDigits(next);
    setError("");
    if (next.length < 4) return;
    setBusy(true);
    const result = await verifyPin(next);
    if (!alive.current) return;
    setBusy(false);
    if (result.ok) {
      onUnlock();
      return;
    }
    if (result.waitMs > 0) {
      setNow(Date.now());
      setWaitUntil(Date.now() + result.waitMs);
    } else {
      setError(result.left === 1 ? "Code incorrect. Encore 1 essai avant une attente." : result.left > 1 ? `Code incorrect. Encore ${result.left} essais.` : "Code incorrect.");
    }
    setTimeout(() => alive.current && setDigits(""), 400);
  }

  function backspace() {
    if (waiting || busy) return;
    setDigits((d) => d.slice(0, -1));
  }

  function forgotten() {
    Alert.alert(
      "Code oublié ?",
      deviceOk
        ? "Ouvrez l'application avec le verrouillage du téléphone (empreinte, visage ou code du téléphone), puis changez le code dans Réglages."
        : "Le code ne peut pas être retrouvé : il n'est écrit nulle part. Sans lui, il faut désinstaller puis réinstaller l'application, ce qui efface les voyages. Une sauvegarde (Réglages > Sauvegarde) permet de les retrouver."
    );
  }

  const failed = !!error;
  const message = waiting ? `Trop d'essais. Réessayez dans ${waitLabel(waitMs)}.` : error || "Saisissez votre code à 4 chiffres.";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.head}>
          <Icon name="lock-closed" size={28} color={THEME.inkMuted} />
          <Txt variant="title" style={styles.title} accessibilityRole="header">
            Code de verrouillage
          </Txt>
          <Txt variant="subhead" color={failed || waiting ? "stamp" : "inkMuted"} style={styles.title} accessibilityLiveRegion="polite">
            {message}
          </Txt>
        </View>

        <View style={styles.dots} accessible accessibilityLabel={`${digits.length} chiffre${digits.length > 1 ? "s" : ""} saisi${digits.length > 1 ? "s" : ""} sur 4`}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.dot, digits.length > i && styles.dotFilled, failed && styles.dotError]} />
          ))}
        </View>

        <View style={[styles.keypad, waiting && { opacity: 0.35 }]}>
          {DIGITS.map((d) => (
            <Key key={d} label={d} disabled={waiting} onPress={() => press(d)} />
          ))}
          <View style={styles.key} />
          <Key label="0" disabled={waiting} onPress={() => press("0")} />
          <Key icon="backspace-outline" label="Effacer" disabled={waiting} onPress={backspace} bare />
        </View>

        <View style={styles.foot}>
          {deviceOk ? (
            <Pressable onPress={askDevice} accessibilityRole="button" accessibilityLabel="Ouvrir avec le verrouillage du téléphone : empreinte, visage ou code du téléphone" style={({ pressed }) => [styles.device, pressed && { backgroundColor: THEME.pressed }]}>
              <Icon name="finger-print" size={20} color={THEME.ink} />
              <Text style={styles.deviceText}>Utiliser le verrouillage du téléphone</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={forgotten} hitSlop={8} accessibilityRole="button" style={styles.forgot}>
            <Text style={styles.forgotText}>Code oublié ?</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// One round key of the pad: a digit, or an icon for the erase key (`bare` = no fill).
function Key({ label, icon, bare, disabled, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.key, !bare && styles.keyFilled, pressed && { backgroundColor: THEME.bgRaised }]}
    >
      {icon ? <Icon name={icon} size={24} color={THEME.inkMuted} /> : <Text style={type.title}>{label}</Text>}
    </Pressable>
  );
}

// Key diameter and pad width come from the spacing scale (48 + 24 = 72).
const KEY = space.xxxl + space.xl;

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  head: { alignItems: "center", gap: space.sm, marginBottom: space.xl },
  title: { textAlign: "center" },
  dots: { flexDirection: "row", gap: space.lg, marginBottom: space.xxl },
  dot: { width: space.lg, height: space.lg, borderRadius: radius.full, backgroundColor: THEME.light ? THEME.border : THEME.bgRaised },
  dotFilled: { backgroundColor: THEME.mark },
  dotError: { backgroundColor: THEME.stamp },
  keypad: { flexDirection: "row", flexWrap: "wrap", gap: space.lg, width: KEY * 3 + space.lg * 2 },
  key: { width: KEY, height: KEY, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  keyFilled: { backgroundColor: THEME.bgCard, ...paperEdge() },
  foot: { alignItems: "center", gap: space.md, marginTop: space.xl, minHeight: 96 },
  device: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.full, borderWidth: 1.5, borderColor: THEME.hairStrong },
  deviceText: { ...type.label, color: THEME.ink },
  forgot: { minHeight: 44, justifyContent: "center" },
  forgotText: { ...type.subhead, color: THEME.inkMuted, textDecorationLine: "underline" },
}));
