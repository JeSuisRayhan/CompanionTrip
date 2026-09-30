import React, { useState, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, requestCameraPermissionsAsync } from "expo-camera";
import * as Haptics from "expo-haptics";

import { THEME, space, layout, radius, type, themedStyles } from "../lib/theme";
import { IconButton, EmptyState, round } from "../components/ui";

// Live camera view that watches for a barcode/QR code. As soon as one is
// detected, it snaps a photo automatically (so the ticket itself is saved,
// not just the decoded text) and hands back both to the caller. A manual
// shutter button is also available for tickets with no scannable code.
export default function TicketScannerScreen({ navigation, route }) {
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [granted, setGranted] = useState(false);
  const [permissionError, setPermissionError] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [detectedCode, setDetectedCode] = useState(null);
  const cameraRef = useRef(null);
  const hasHandledScan = useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await requestCameraPermissionsAsync();
        if (cancelled) return;
        setGranted(perm.granted);
      } catch (e) {
        if (cancelled) return;
        setPermissionError(e?.message || "Impossible d'accéder à l'appareil photo.");
      } finally {
        if (!cancelled) setPermissionChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function capture(scannedCode) {
    if (hasHandledScan.current || capturing) return;
    hasHandledScan.current = true;
    setCapturing(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6, skipProcessing: true });
      navigation.navigate("Trip", { tripId: route.params?.tripId, scannedUri: photo?.uri, scannedCode: scannedCode || null });
    } catch (e) {
      hasHandledScan.current = false;
      setCapturing(false);
    }
  }

  function onBarcodeScanned(result) {
    if (hasHandledScan.current) return;
    setDetectedCode(result.data);
    capture(result.data);
  }

  if (!permissionChecked) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={THEME.teal} />
        </View>
      </SafeAreaView>
    );
  }

  if (!granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <EmptyState
            icon="camera-outline"
            title={permissionError ? "Caméra indisponible" : "Accès à la caméra refusé"}
            text={permissionError || "Activez-la dans les réglages du téléphone pour scanner vos billets."}
            action={{ label: "Retour", onPress: () => navigation.goBack() }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "pdf417", "aztec"] }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <IconButton icon="close" label="Fermer" filled onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.frameBox} pointerEvents="none">
          <View style={[styles.hint, round("md")]}>
            <Text style={styles.hintText}>
              {detectedCode ? "Code détecté — capture…" : "Visez le billet ou le code-barres"}
            </Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.manualShutter, (pressed || capturing) && { opacity: 0.6 }]}
          onPress={() => capture(null)}
          disabled={capturing}
          accessibilityRole="button"
          accessibilityLabel="Photographier le billet"
          accessibilityState={{ disabled: capturing }}
        >
          <View style={styles.manualShutterInner} />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

// Shutter button: ring + disc, sized from the spacing scale (48 + 24 = 72).
const SHUTTER = space.xxxl + space.xl;

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: layout.gutter },
  root: { flex: 1, backgroundColor: THEME.bg },
  camera: { flex: 1 },
  // Chrome sits on top of the camera preview.
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },
  topBar: { flexDirection: "row", justifyContent: "flex-end", padding: space.lg },
  frameBox: { alignItems: "center", paddingHorizontal: layout.gutter },
  hint: { backgroundColor: THEME.scrim, paddingHorizontal: space.lg, paddingVertical: space.sm },
  hintText: { ...type.subhead, color: THEME.ink, textAlign: "center" },
  manualShutter: {
    alignSelf: "center",
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: radius.full,
    borderWidth: space.xs,
    borderColor: THEME.ink,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.xl,
  },
  manualShutterInner: { width: SHUTTER - space.xs * 4, height: SHUTTER - space.xs * 4, borderRadius: radius.full, backgroundColor: THEME.ink },
}));
