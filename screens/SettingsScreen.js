import React, { useState, useEffect, useCallback } from "react";
import { View, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { space, layout, radius, THEME, PALETTES, PALETTE_IDS, currentPalette, themedStyles } from "../lib/theme";
import { choosePalette } from "../lib/appearance";
import { getSetting, setSetting, removeSetting, loadTrips } from "../lib/storage";
import { lastBackupAt, backupLabel } from "../lib/backupReminder";
import { requestNotificationPermission, getNotificationPermission } from "../lib/notifications";
import { exportBackup, importBackupFromPicker } from "../lib/backup";
import { hasPin, setPin, clearPin } from "../lib/pin";
import { errorCount } from "../lib/errorLog";
import { getTileCache } from "../lib/tileStore";
import { formatBytes } from "../lib/tileCache";
import { hasBuildTimeUnsplashKey } from "../lib/unsplash";
import { updatesInfo, fetchUpdateNow, restartApp } from "../lib/appUpdates";
import { Txt, Button, Badge, Group, Row, SectionTitle, Field } from "../components/ui";

export default function SettingsScreen({ navigation }) {
  const [apiKey, setApiKey] = useState("");
  const [unsplashKey, setUnsplashKey] = useState("");
  const [unsplashSaved, setUnsplashSaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifPermission, setNotifPermission] = useState("default");
  const [tripCount, setTripCount] = useState(0);
  const [lastBackup, setLastBackup] = useState(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const updates = updatesInfo();
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupStatus, setBackupStatus] = useState("");
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinStatus, setPinStatus] = useState("");
  const [errors, setErrors] = useState(0);

  const [tiles, setTiles] = useState(null); // { count, bytes } of the saved map tiles

  useFocusEffect(
    useCallback(() => {
      errorCount().then(setErrors);
      getTileCache().stats().then(setTiles, () => setTiles({ count: 0, bytes: 0 }));
    }, [])
  );

  function confirmClearTiles() {
    Alert.alert("Vider les cartes enregistrées ?", "Les zones déjà consultées devront être rechargées avec du réseau.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Vider",
        style: "destructive",
        onPress: async () => {
          await getTileCache().clear().catch(() => {});
          setTiles(await getTileCache().stats().catch(() => ({ count: 0, bytes: 0 })));
        },
      },
    ]);
  }

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
      setLastBackup(await lastBackupAt());
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
      setLastBackup(await lastBackupAt());
      setBackupStatus("Sauvegarde créée.");
    } catch (e) {
      setBackupStatus("Échec de l'export.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function checkForUpdate() {
    setUpdateBusy(true);
    setUpdateStatus("");
    try {
      const result = await fetchUpdateNow();
      if (result === "downloaded") {
        Alert.alert("Mise à jour prête", "Redémarrer l'application pour l'appliquer ?", [
          { text: "Plus tard", style: "cancel" },
          { text: "Redémarrer", onPress: () => restartApp() },
        ]);
      } else {
        setUpdateStatus(result === "none" ? "Vous avez déjà la dernière version." : "Les mises à jour ne sont pas disponibles dans cette version.");
      }
    } catch (e) {
      setUpdateStatus("Échec de la recherche : vérifiez votre connexion.");
    } finally {
      setUpdateBusy(false);
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
        const keyNote = result.restoredSettings ? ` Clés restaurées : ${result.restoredSettings}.` : "";
        setBackupStatus(`${result.imported} voyage${result.imported !== 1 ? "s" : ""} importé${result.imported !== 1 ? "s" : ""}${result.skipped ? ` (${result.skipped} déjà présents ignorés)` : ""}.${keyNote}`);
        await refreshTripCount();
        const key = await getSetting("anthropicApiKey");
        if (key) setApiKey(key);
        const uKey = await getSetting("unsplashAccessKey");
        if (uKey) setUnsplashKey(uKey);
      }
    } catch (e) {
      setBackupStatus(e && e.code === "INVALID_BACKUP" ? "Ce fichier n'est pas une sauvegarde valide." : "Échec de l'import.");
    } finally {
      setBackupBusy(false);
    }
  }

  const notifGranted = notifPermission === "granted";
  // Status lines are plain strings set by the handlers; these pick out the failures.
  const pinFailed = /^Le code doit/.test(pinStatus);
  const backupFailed = /^(Échec|Ce fichier)/.test(backupStatus);

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Section title="Apparence" first>
          <Group>
            {PALETTE_IDS.map((id) => {
              const chosen = currentPalette() === id;
              return (
                <Row
                  key={id}
                  lead={<Swatch tokens={PALETTES[id].tokens} />}
                  title={PALETTES[id].label}
                  subtitle={PALETTES[id].hint}
                  selected={chosen}
                  accessibilityLabel={`Couleur ${PALETTES[id].label}, ${PALETTES[id].hint}${chosen ? ", choisie" : ""}`}
                  right={chosen ? <Badge label="Choisie" icon="checkmark" tone="teal" style={styles.badge} /> : null}
                  onPress={() => choosePalette(id)}
                />
              );
            })}
          </Group>
        </Section>

        <Section title="Notifications">
          <Group>
            <Row
              icon="notifications-outline"
              tone={notifGranted ? "teal" : "neutral"}
              title="Rappels de voyage"
              subtitle={notifGranted ? "Autorisés sur cet appareil." : "Autorisez-les pour être prévenu à temps."}
              right={<Badge label={notifGranted ? "Activées" : "Désactivées"} tone={notifGranted ? "teal" : "neutral"} style={styles.badge} />}
            />
          </Group>
          {!notifGranted && (
            <View style={styles.form}>
              <Button title="Activer les notifications" full onPress={enableNotifications} />
            </View>
          )}
        </Section>

        <Section title="Verrouillage par code">
          <Group>
            <Row
              icon="lock-closed-outline"
              tone={pinEnabled ? "teal" : "neutral"}
              title="Code à 4 chiffres"
              right={<Badge label={pinEnabled ? "Activé" : "Aucun code"} tone={pinEnabled ? "teal" : "neutral"} style={styles.badge} />}
            />
          </Group>
          <View style={styles.form}>
            <Txt variant="subhead">
              {pinEnabled
                ? "Un code à 4 chiffres est demandé à chaque ouverture de l'app."
                : "Demande un code à 4 chiffres à chaque ouverture de l'app. Le code reste uniquement sur cet appareil."}
            </Txt>
            {pinEnabled ? (
              <Button title="Désactiver le code" variant="secondary" full onPress={onDisablePin} />
            ) : (
              <>
                <Field
                  value={pinInput}
                  onChangeText={(t) => setPinInput(t.replace(/\D/g, "").slice(0, 4))}
                  placeholder="4 chiffres"
                  keyboardType="number-pad"
                  secureTextEntry
                  accessibilityLabel="Code à 4 chiffres"
                  style={styles.fieldTight}
                />
                <Button title="Activer le code" variant="secondary" full onPress={onSavePin} />
              </>
            )}
            {pinStatus ? <StatusNote text={pinStatus} failed={pinFailed} /> : null}
          </View>
        </Section>

        <Section title="Clé API (recommandé)">
          <View style={styles.formFirst}>
            <Txt variant="subhead">
              Utilisée uniquement en dernier recours pour « Corriger le format » quand le texte est vraiment en vrac — le reste du temps, la correction se fait sans aucune IA. Reste sur cet appareil, envoyée uniquement à l'API Anthropic. Créez-en une sur console.anthropic.com.
            </Txt>
            <Field
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="sk-ant-..."
              autoCapitalize="none"
              secureTextEntry
              accessibilityLabel="Clé API Anthropic"
              style={styles.fieldTight}
            />
            <Button
              title={saved ? "Enregistrée" : "Enregistrer la clé"}
              icon={saved ? "checkmark" : undefined}
              tone={saved ? "teal" : undefined}
              variant="secondary"
              full
              onPress={saveKey}
            />
          </View>
        </Section>

        <Section title="Photos de couverture (Unsplash)">
          <View style={styles.formFirst}>
            <Txt variant="subhead">
              {hasBuildTimeUnsplashKey()
                ? "Déjà activé pour cette version de l'app — rien à faire ici. Le champ ci-dessous ne sert que si cette clé intégrée venait à manquer."
                : "Ajoute automatiquement une photo de destination à chaque nouveau voyage. Créez une clé gratuite sur unsplash.com/developers (compte « Demo », aucune carte bancaire requise)."}
            </Txt>
            <Field
              value={unsplashKey}
              onChangeText={setUnsplashKey}
              placeholder="Access Key Unsplash"
              autoCapitalize="none"
              secureTextEntry
              accessibilityLabel="Clé d'accès Unsplash"
              style={styles.fieldTight}
            />
            <Button
              title={unsplashSaved ? "Enregistrée" : "Enregistrer la clé"}
              icon={unsplashSaved ? "checkmark" : undefined}
              tone={unsplashSaved ? "teal" : undefined}
              variant="secondary"
              full
              onPress={saveUnsplashKey}
            />
          </View>
        </Section>

        <Section title="Sauvegarde">
          <Group>
            <Row
              icon="cloud-download-outline"
              title={`${tripCount} voyage${tripCount !== 1 ? "s" : ""} enregistré${tripCount !== 1 ? "s" : ""}`}
              subtitle={`Uniquement sur cet appareil. Dernière sauvegarde : ${backupLabel(lastBackup)}.`}
            />
          </Group>
          <View style={styles.form}>
            <Txt variant="subhead">
              Exportez régulièrement une sauvegarde pour ne rien perdre — vos clés API ci-dessus sont incluses, donc pas besoin de les retaper après une réinstallation.
            </Txt>
            <View style={styles.buttonRow}>
              <Button title="Exporter" icon="share-outline" variant="secondary" disabled={backupBusy} onPress={onExportBackup} style={styles.flex} />
              <Button title="Importer" icon="download-outline" variant="secondary" disabled={backupBusy} onPress={onImportBackup} style={styles.flex} />
            </View>
            {backupStatus ? <StatusNote text={backupStatus} failed={backupFailed} /> : null}
          </View>
        </Section>

        <Section title="Cartes enregistrées">
          <Group>
            <Row
              icon="map-outline"
              tone={tiles && tiles.count > 0 ? "teal" : "neutral"}
              title={!tiles ? "Calcul…" : tiles.count === 0 ? "Aucune tuile enregistrée" : `${tiles.count} tuile${tiles.count > 1 ? "s" : ""}, ${formatBytes(tiles.bytes)}`}
              subtitle="Les zones que vous consultez restent disponibles sans réseau."
            />
          </Group>
          <View style={styles.form}>
            <Txt variant="subhead">
              Pour avoir une zone sans réseau, ouvrez-la une fois sur la carte quand vous êtes connecté. OpenStreetMap n'autorise pas le téléchargement à l'avance d'une région.
            </Txt>
            <Button title="Vider" icon="trash-outline" variant="secondary" full disabled={!tiles || tiles.count === 0} accessibilityLabel="Vider les cartes enregistrées" onPress={confirmClearTiles} />
          </View>
        </Section>

        <Section title="Mise à jour">
          <Group>
            <Row
              icon="sync-outline"
              tone={updates.enabled ? "teal" : "neutral"}
              title={updateBusy ? "Recherche…" : "Rechercher une mise à jour"}
              subtitle={
                updates.enabled
                  ? `Version ${updates.version || "?"}${updates.updateId ? `, mise à jour ${updates.updateId} installée` : ""}.`
                  : "Indisponible dans cette version de l'application."
              }
              chevron={updates.enabled}
              onPress={updates.enabled && !updateBusy ? checkForUpdate : undefined}
            />
          </Group>
          {updateStatus ? (
            <View style={styles.form}>
              <StatusNote text={updateStatus} failed={/^Échec/.test(updateStatus)} />
            </View>
          ) : null}
        </Section>

        <Section title="Assistance">
          <Group>
            <Row
              icon="bug-outline"
              tone={errors > 0 ? "stamp" : "neutral"}
              title="Journal d'erreurs"
              subtitle={errors === 0 ? "Aucune erreur enregistrée." : `${errors} erreur${errors > 1 ? "s" : ""} enregistrée${errors > 1 ? "s" : ""}, à partager si besoin.`}
              chevron
              onPress={() => navigation.navigate("ErrorLog")}
            />
          </Group>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// A small preview of a palette: its background, a card on it, and the gold accent.
function Swatch({ tokens }) {
  return (
    <View style={[styles.swatch, { backgroundColor: tokens.bg, borderColor: tokens.border }]}>
      <View style={[styles.swatchDot, { backgroundColor: THEME.gold }]} />
      <View style={[styles.swatchCard, { backgroundColor: tokens.bgCard }]} />
    </View>
  );
}

// A titled block: section title, then its group.
function Section({ title, first, children }) {
  return (
    <View style={first ? null : styles.section}>
      <SectionTitle title={title} />
      {children}
    </View>
  );
}

// Result of the last action: teal when it worked, stamp when it failed.
function StatusNote({ text, failed }) {
  return (
    <Txt variant="caption" color={failed ? "stamp" : "teal"} accessibilityLiveRegion="polite">
      {text}
    </Txt>
  );
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  scrollContent: { paddingHorizontal: layout.gutter, paddingTop: space.lg, paddingBottom: space.xxl },
  section: { marginTop: space.xxl },
  badge: { alignSelf: "center" },
  swatch: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1, overflow: "hidden" },
  swatchDot: { position: "absolute", top: 8, left: 8, width: 8, height: 8, borderRadius: 4 },
  swatchCard: { position: "absolute", left: 6, right: 6, bottom: 6, height: 16, borderRadius: 5 },
  // Explanation + controls under a section title (or under its status row).
  form: { gap: space.md, marginTop: space.md },
  formFirst: { gap: space.md },
  fieldTight: { marginBottom: 0 },
  buttonRow: { flexDirection: "row", gap: space.md },
  flex: { flex: 1 },
}));
