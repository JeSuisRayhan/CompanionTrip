import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Linking, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { THEME, CARD_SHADOW } from "../lib/theme";
import { FONTS } from "../lib/fonts";
import { getSetting, setSetting, removeSetting, loadTrips } from "../lib/storage";
import { requestNotificationPermission, getNotificationPermission } from "../lib/notifications";
import { exportBackup, importBackupFromPicker } from "../lib/backup";
import { hasPin, setPin, clearPin } from "../lib/pin";

export default function SettingsScreen() {
  const [apiKey, setApiKey] = useState("");
  const [unsplashKey, setUnsplashKey] = useState("");
  const [unsplashSaved, setUnsplashSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifPermission, setNotifPermission] = useState("default");
  const [tripCount, setTripCount] = useState(0);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinStatus, setPinStatus] = useState("");

  useEffect(() => {
    (async () => {
      const key = await getSetting("anthropicApiKey");
      if (key) setApiKey(key);
      const uKey = await getSetting("unsplashAccessKey");
      if (uKey) setUnsplashKey(uKey);
      const perm = await getNotificationPermission();
      setNotifPermission(perm);
      const trips = await loadTrips();
      setTripCount(trips.length);
      setPinEnabled(await hasPin());
    })();
  }, []);

  async function saveKey() {
    if (apiKey.trim()) {
      await setSetting("anthropicApiKey", apiKey.trim());
    } else {
      await removeSetting("anthropicApiKey");
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function saveUnsplashKey() {
    if (unsplashKey.trim()) {
      await setSetting("unsplashAccessKey", unsplashKey.trim());
    } else {
      await removeSetting("unsplashAccessKey");
    }
    setUnsplashSaved(true);
    setTimeout(() => setUnsplashSaved(false), 1500);
  }

  async function enableNotifications() {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm !== "granted") {
      Alert.alert("Autorisation refusée", "Activez les notifications dans les réglages de votre téléphone pour ce type de rappel.");
    }
  }

  async function refreshTripCount() {
    const trips = await loadTrips();
    setTripCount(trips.length);
  }

  async function onSavePin() {
    if (!/^\d{4}$/.test(pinInput)) {
      setPinStatus("Le code doit contenir exactement 4 chiffres.");
      return;
    }
    await setPin(pinInput);
    setPinEnabled(true);
    setPinInput("");
    setPinStatus("Code activé.");
  }

  async function onDisablePin() {
    await clearPin();
    setPinEnabled(false);
    setPinStatus("Code désactivé.");
  }

  async function onExportBackup() {
    setBackupBusy(true);
    setBackupStatus("");
    try {
      await exportBackup();
      setBackupStatus("Sauvegarde créée.");
    } catch (e) {
      setBackupStatus("Échec de l'export.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function onImportBackup() {
    setBackupBusy(true);
    setBackupStatus("");
    try {
      const result = await importBackupFromPicker("merge");
      if (result.cancelled) {
        setBackupStatus("");
      } else {
        setBackupStatus(`${result.imported} voyage${result.imported !== 1 ? "s" : ""} importé${result.imported !== 1 ? "s" : ""}${result.skipped ? ` (${result.skipped} déjà présents ignorés)` : ""}.`);
        await refreshTripCount();
      }
    } catch (e) {
      setBackupStatus(e && e.code === "INVALID_BACKUP" ? "Ce fichier n'est pas une sauvegarde valide." : "Échec de l'import.");
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={18} color={THEME.pink} />
            <Text style={styles.cardTitle}>Clé API (recommandé)</Text>
          </View>
          <Text style={styles.cardText}>
            Utilisée uniquement en dernier recours pour "Corriger le format" quand le texte est vraiment en vrac —
            le reste du temps, la correction se fait sans aucune IA. Reste sur cet appareil, envoyée uniquement à
            l'API Anthropic. Créez-en une sur console.anthropic.com.
          </Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="sk-ant-..."
            placeholderTextColor={THEME.inkFaint}
            autoCapitalize="none"
            secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={saveKey}>
            <Text style={styles.buttonText}>{saved ? "Enregistrée" : "Enregistrer la clé"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="image-outline" size={18} color={THEME.blue} />
            <Text style={styles.cardTitle}>Photos de couverture (Unsplash)</Text>
          </View>
          <Text style={styles.cardText}>
            Ajoute automatiquement une photo de destination à chaque nouveau voyage. Créez une clé gratuite sur
            unsplash.com/developers (compte "Demo", aucune carte bancaire requise).
          </Text>
          <TextInput
            style={styles.input}
            value={unsplashKey}
            onChangeText={setUnsplashKey}
            placeholder="Access Key Unsplash"
            placeholderTextColor={THEME.inkFaint}
            autoCapitalize="none"
            secureTextEntry
          />
          <TouchableOpacity style={styles.button} onPress={saveUnsplashKey}>
            <Text style={styles.buttonText}>{unsplashSaved ? "Enregistrée" : "Enregistrer la clé"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="notifications" size={18} color={THEME.gold} />
            <Text style={styles.cardTitle}>Notifications</Text>
          </View>
          <Text style={styles.cardText}>
            {notifPermission === "granted"
              ? "Activées — vous recevrez les rappels de voyage."
              : "Autorisez les notifications pour recevoir les rappels de voyage."}
          </Text>
          {notifPermission !== "granted" && (
            <TouchableOpacity style={styles.button} onPress={enableNotifications}>
              <Text style={styles.buttonText}>Activer les notifications</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="lock-closed-outline" size={18} color={THEME.stamp} />
            <Text style={styles.cardTitle}>Verrouillage par code</Text>
          </View>
          <Text style={styles.cardText}>
            {pinEnabled
              ? "Un code à 4 chiffres est demandé à chaque ouverture de l'app."
              : "Demande un code à 4 chiffres à chaque ouverture de l'app. Le code reste uniquement sur cet appareil."}
          </Text>
          {pinEnabled ? (
            <TouchableOpacity style={styles.button} onPress={onDisablePin}>
              <Text style={styles.buttonText}>Désactiver</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={pinInput}
                onChangeText={(t) => setPinInput(t.replace(/\D/g, "").slice(0, 4))}
                placeholder="4 chiffres"
                placeholderTextColor={THEME.inkFaint}
                keyboardType="number-pad"
                secureTextEntry
              />
              <TouchableOpacity style={styles.button} onPress={onSavePin}>
                <Text style={styles.buttonText}>Activer</Text>
              </TouchableOpacity>
            </>
          )}
          {pinStatus && <Text style={styles.statusText}>{pinStatus}</Text>}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cloud-download-outline" size={18} color={THEME.teal} />
            <Text style={styles.cardTitle}>Sauvegarde</Text>
          </View>
          <Text style={styles.cardText}>
            {tripCount} voyage{tripCount !== 1 ? "s" : ""} enregistré{tripCount !== 1 ? "s" : ""} sur cet appareil,
            uniquement en local. Exportez régulièrement une sauvegarde pour ne rien perdre.
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.button, styles.buttonHalf]} onPress={onExportBackup} disabled={backupBusy}>
              <Text style={styles.buttonText}>Exporter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonHalf]} onPress={onImportBackup} disabled={backupBusy}>
              <Text style={styles.buttonText}>Importer</Text>
            </TouchableOpacity>
          </View>
          {backupStatus && <Text style={styles.statusText}>{backupStatus}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { padding: 20 },
  pageTitle: { fontSize: 24, color: THEME.ink, marginBottom: 22, fontFamily: FONTS.headingBold },
  card: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 16,
    padding: 17,
    marginBottom: 16,
    ...CARD_SHADOW,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  cardTitle: { fontSize: 15, color: THEME.ink, fontFamily: FONTS.headingSemiBold },
  cardText: { fontSize: 12.5, color: THEME.inkMuted, lineHeight: 18, marginBottom: 12, fontFamily: FONTS.body },
  input: {
    backgroundColor: THEME.bgCardAlt,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.ink,
    fontSize: 13.5,
    fontFamily: FONTS.mono,
    marginBottom: 12,
  },
  button: {
    borderWidth: 1,
    borderColor: THEME.teal,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  buttonText: { color: THEME.teal, fontSize: 13.5, fontFamily: FONTS.bodySemiBold },
  buttonRow: { flexDirection: "row", gap: 10 },
  buttonHalf: { flex: 1 },
  statusText: { color: THEME.inkMuted, fontSize: 12, marginTop: 10, textAlign: "center", fontFamily: FONTS.body },
});
