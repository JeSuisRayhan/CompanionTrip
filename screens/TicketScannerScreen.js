import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, requestCameraPermissionsAsync } from "expo-camera";
import * as Haptics from "expo-haptics";

import { THEME } from "../lib/theme";
import { FONTS } from "../lib/fonts";

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
          <Ionicons name="camera-outline" size={30} color={THEME.inkFaint} />
          <Text style={styles.permissionText}>
            {permissionError || "Autorisation caméra refusée. Activez-la dans les réglages du téléphone pour scanner vos billets."}
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Text style={styles.closeButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "code128", "pdf417", "aztec"] }}
        onBarcodeScanned={onBarcodeScanned}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeCircle} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.frameBox} pointerEvents="none">
          <Text style={styles.hintText}>
            {detectedCode ? "Code détecté — capture…" : "Visez le billet ou le code-barres"}
          </Text>
        </View>
        <TouchableOpacity style={styles.manualShutter} onPress={() => capture(null)} disabled={capturing}>
          <View style={styles.manualShutterInner} />
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 14 },
  permissionText: { color: THEME.inkMuted, fontSize: 13.5, fontFamily: FONTS.body, textAlign: "center", lineHeight: 19 },
  closeButton: { borderWidth: 1, borderColor: THEME.teal, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 11 },
  closeButtonText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
  overlay: { flex: 1, justifyContent: "space-between" },
  topBar: { flexDirection: "row", justifyContent: "flex-end", padding: 16 },
  closeCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#00000077", alignItems: "center", justifyContent: "center" },
  frameBox: { alignItems: "center", paddingHorizontal: 30 },
  hintText: { color: "#FFFFFF", fontSize: 13.5, fontFamily: FONTS.bodyMedium, textAlign: "center", backgroundColor: "#00000088", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  manualShutter: {
    alignSelf: "center",
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
  },
  manualShutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#FFFFFF" },
});
