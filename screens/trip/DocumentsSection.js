// "Documents": the tickets, bookings and plans of a trip: a flat list, the way to add one (photo, scan, PDF),
// and the viewer. Also takes the tickets that come back from the scanner or from a day.
import React, { useState, useEffect } from "react";
import { View, Text, Alert, Image } from "react-native";
import Icon from "../../components/Icon";
import { THEME, space, type, themedStyles } from "../../lib/theme";
import { setDayType } from "../../lib/trips";
import { resolveDayDate, formatDateLabel } from "../../lib/dates";
import { decodeBoardingPass, resolveJulianDate } from "../../lib/boardingPass";
import { pickImage, pickPdfFile, openDocumentFile, isPdfDoc, addDocument, removeDocument, setDocumentCategory, DOCUMENT_CATEGORIES, documentCategory, suggestDocumentCategory } from "../../lib/documents";
import { Button, Chip, Group, Row, Thumb, Field, Sheet, ActionSheet, round } from "../../components/ui";
import { Section } from "../../components/mix";
import PhotoViewer from "../../components/PhotoViewer";

export default function DocumentsSection({ trip, onChange, navigation, incomingScan, onConsumeIncomingScan, incomingAction, onConsumeIncomingAction }) {
  const [pendingUri, setPendingUri] = useState(null);
  const [pendingScannedCode, setPendingScannedCode] = useState(null);
  const [pendingKind, setPendingKind] = useState("image"); // "image" or "pdf"
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState(null); // { items, index } while a photo is open: the other photos are a swipe away
  const [forDayId, setForDayId] = useState(null); // the flight or train day a ticket is being added for
  const [chosenCategory, setChosenCategory] = useState(null); // set once the person picks a drawer; until then it follows the best guess
  const [openCats, setOpenCats] = useState({}); // drawer key → opened or closed by hand
  const [docMenu, setDocMenu] = useState(null);
  const docs = trip.documents || [];
  const byCategory = {};
  for (const c of DOCUMENT_CATEGORIES) byCategory[c.key] = [];
  for (const d of docs) byCategory[documentCategory(d)].push(d);
  // Every document in one list, the drawers' order (tickets first).
  const ordered = DOCUMENT_CATEGORIES.flatMap((c) => byCategory[c.key]);
  const category = chosenCategory || suggestDocumentCategory(trip, { title, scannedCode: pendingScannedCode, dayId: forDayId });
  // A drawer with documents is open; with none at all, the first one is, to say what goes there.
  const isOpen = (key) => (openCats[key] !== undefined ? openCats[key] : byCategory[key].length > 0 || (docs.length === 0 && key === DOCUMENT_CATEGORIES[0].key));
  const openCategory = (key) => setOpenCats((o) => ({ ...o, [key]: true }));

  useEffect(() => {
    if (incomingScan) {
      setPendingUri(incomingScan.uri);
      setPendingScannedCode(incomingScan.scannedCode);
      setForDayId(incomingScan.dayId || null);
      const boardingPass = incomingScan.scannedCode ? decodeBoardingPass(incomingScan.scannedCode) : null;
      const forDay = incomingScan.dayId ? trip.days.find((d) => d.id === incomingScan.dayId) : null;
      if (boardingPass && forDay) {
        // scanned from a day: no date to guess, it is that day's ticket
        setTitle(`Vol ${boardingPass.flightNumber} — ${boardingPass.origin} → ${boardingPass.destination}`);
        Alert.alert("Carte d'embarquement détectée", `Vol ${boardingPass.flightNumber} (${boardingPass.origin} → ${boardingPass.destination}). Remplir le trajet de « ${forDay.title} » avec ce billet ?`, [
          { text: "Non merci", style: "cancel" },
          {
            text: "Oui",
            onPress: async () => {
              await setDayType(trip.id, forDay.id, "flight", {
                origin: boardingPass.origin,
                destination: boardingPass.destination,
                flightNumber: boardingPass.flightNumber,
                seat: boardingPass.seat,
              });
              onChange();
            },
          },
        ]);
      } else if (boardingPass) {
        setTitle(`Vol ${boardingPass.flightNumber} — ${boardingPass.origin} → ${boardingPass.destination}`);
        const flightDateISO = resolveJulianDate(boardingPass.julianDay, trip.startDate);
        const matchIndex = trip.days.findIndex((d, i) => resolveDayDate(trip, d, i) === flightDateISO);
        if (matchIndex !== -1) {
          const matchDay = trip.days[matchIndex];
          Alert.alert(
            "Carte d'embarquement détectée",
            `Vol ${boardingPass.flightNumber} (${boardingPass.origin} → ${boardingPass.destination}) le ${formatDateLabel(flightDateISO)}. Marquer "${matchDay.title}" comme jour de vol ?`,
            [
              { text: "Non merci", style: "cancel" },
              {
                text: "Oui",
                onPress: async () => {
                  await setDayType(trip.id, matchDay.id, "flight", {
                    origin: boardingPass.origin,
                    destination: boardingPass.destination,
                    flightNumber: boardingPass.flightNumber,
                    seat: boardingPass.seat,
                  });
                  onChange();
                },
              },
            ]
          );
        }
      } else {
        setTitle(incomingScan.scannedCode ? "Billet scanné" : "Photo scannée");
      }
      onConsumeIncomingScan();
    }
  }, [incomingScan]);

  // Sent from a day: look at one of its tickets, or add one from the gallery.
  useEffect(() => {
    if (!incomingAction) return;
    if (incomingAction.viewDocId) {
      const doc = docs.find((d) => d.id === incomingAction.viewDocId);
      if (doc) openDoc(doc);
    } else if (incomingAction.addFrom) {
      setForDayId(incomingAction.dayId || null);
      setTimeout(() => pick(incomingAction.addFrom), 350); // let the screen finish opening
    }
    onConsumeIncomingAction();
  }, [incomingAction]);

  // A photo opens in the viewer, among the other photos of the list (a swipe goes to the next one); a PDF goes to the phone's own readers.
  function openDoc(doc) {
    if (!isPdfDoc(doc)) {
      const photos = ordered.filter((d) => !isPdfDoc(d));
      return setViewer({ items: photos, index: Math.max(0, photos.findIndex((d) => d.id === doc.id)) });
    }
    openDocumentFile(doc).catch(() => setError("Impossible d'ouvrir ce PDF depuis l'application."));
  }

  function closePending() {
    setPendingUri(null);
    setPendingKind("image");
    setPendingScannedCode(null);
    setForDayId(null);
    setChosenCategory(null);
  }

  const [addMenuOpen, setAddMenuOpen] = useState(false);

  function choosePhoto() {
    setError("");
    setAddMenuOpen(true);
  }

  async function pickPdf() {
    try {
      const file = await pickPdfFile();
      if (!file) return setForDayId(null);
      setPendingKind("pdf");
      setTitle(file.title);
      setPendingUri(file.uri);
    } catch (e) {
      setForDayId(null);
      setError("Échec de la sélection du PDF.");
    }
  }

  async function pick(source) {
    try {
      const uri = await pickImage(source);
      if (uri) {
        setPendingKind("image");
        setPendingUri(uri);
      } else setForDayId(null);
    } catch (e) {
      setForDayId(null);
      setError(e && e.code === "PERMISSION_DENIED" ? "Autorisation refusée. Activez l'accès à la caméra/aux photos dans les réglages du téléphone." : "Échec de la sélection.");
    }
  }

  async function confirmAdd() {
    setBusy(true);
    try {
      await addDocument(trip.id, { title, category, tempUri: pendingUri, scannedCode: pendingScannedCode, dayId: forDayId, kind: pendingKind });
      const backToDay = forDayId;
      openCategory(category);
      closePending();
      setTitle("");
      onChange();
      if (backToDay) navigation.navigate("DayDetail", { tripId: trip.id, dayId: backToDay });
    } catch (e) {
      setError("Échec de l'enregistrement du document.");
    } finally {
      setBusy(false);
    }
  }

  // A photo of a ticket cannot be brought back: ask first
  function onRemove(doc) {
    Alert.alert("Supprimer ce document ?", `« ${doc.title} » sera retiré du voyage. Cette action est définitive.`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await removeDocument(trip.id, doc.id);
          onChange();
        },
      },
    ]);
  }


  // A tint per kind.
  const catOf = (doc) => DOCUMENT_CATEGORIES.find((c) => c.key === documentCategory(doc)) || DOCUMENT_CATEGORIES[0];
  const dayTitleOf = (doc) => {
    const day = doc.dayId ? trip.days.find((d) => d.id === doc.dayId) : null;
    return day ? day.title : null;
  };

  return (
    <Section title="Documents" count={docs.length || null}>
      {error ? <Text style={[type.caption, { color: THEME.stamp }]}>{error}</Text> : null}
      {ordered.length > 0 ? (
        <Group>
          {ordered.map((doc) => {
            const cat = catOf(doc);
            const pdf = isPdfDoc(doc);
            return (
              <Row
                key={doc.id}
                lead={pdf ? <Thumb icon={cat.icon} tone={cat.tone} size={40} /> : <Thumb uri={doc.uri} icon="image" tone={cat.tone} size={40} />}
                title={doc.title}
                subtitle={[pdf ? "PDF" : "Photo", dayTitleOf(doc)].filter(Boolean).join(" · ")}
                accessibilityLabel={pdf ? `${doc.title}, PDF` : doc.title}
                onPress={() => openDoc(doc)}
                onLongPress={() => setDocMenu(doc)}
                chevron
              />
            );
          })}
        </Group>
      ) : (
        <Text style={type.subhead}>Billets, réservations, codes Wi-Fi… Gardez-les ici, hors ligne.</Text>
      )}
      <View style={styles.buttons}>
        <Button title="Ajouter" icon="add" size="sm" variant="secondary" accessibilityLabel="Ajouter un document" onPress={choosePhoto} style={styles.flex} />
        <Button title="Scanner un billet" icon="qr-code-outline" size="sm" variant="secondary" onPress={() => navigation.navigate("TicketScanner", { tripId: trip.id })} style={styles.flex} />
      </View>
      {ordered.length > 0 ? <Text style={type.caption}>Appui long sur un document : le classer ou le supprimer.</Text> : null}

      <ActionSheet
        visible={!!docMenu}
        onClose={() => setDocMenu(null)}
        title={docMenu ? docMenu.title : ""}
        actions={
          docMenu
            ? [
                ...DOCUMENT_CATEGORIES.filter((c) => c.key !== documentCategory(docMenu)).map((c) => ({
                  icon: c.icon,
                  title: `Classer dans « ${c.label} »`,
                  onPress: async () => {
                    await setDocumentCategory(trip.id, docMenu.id, c.key);
                    openCategory(c.key);
                    onChange();
                  },
                })),
                { icon: "trash-outline", tone: "stamp", title: "Supprimer", onPress: () => onRemove(docMenu) },
              ]
            : []
        }
      />

      <Sheet visible={addMenuOpen} onClose={() => setAddMenuOpen(false)} title="Ajouter un document">
        <Group style={{ marginBottom: space.md }}>
          <Row
            icon="qr-code-outline"
            tone="teal"
            title="Scanner un billet ou un code-barres"
            chevron
            onPress={() => {
              setAddMenuOpen(false);
              navigation.navigate("TicketScanner", { tripId: trip.id });
            }}
          />
          <Row
            icon="camera-outline"
            tone="teal"
            title="Prendre une photo"
            chevron
            onPress={() => {
              setAddMenuOpen(false);
              setTimeout(() => pick("camera"), 350); // let the sheet finish closing (iOS)
            }}
          />
          <Row
            icon="images-outline"
            tone="teal"
            title="Depuis la galerie"
            chevron
            onPress={() => {
              setAddMenuOpen(false);
              setTimeout(() => pick("library"), 350);
            }}
          />
          <Row
            icon="document-attach-outline"
            tone="teal"
            title="Importer un PDF"
            subtitle="Réservation, billet électronique…"
            chevron
            onPress={() => {
              setAddMenuOpen(false);
              setTimeout(pickPdf, 350);
            }}
          />
        </Group>
      </Sheet>

      <PhotoViewer
        viewer={viewer}
        onClose={() => setViewer(null)}
        renderTitle={(doc) => doc.title}
        renderFooter={(doc) =>
          doc.scannedCode ? (
            <View style={[styles.scannedCodeBadge, { flex: 1, marginTop: 0 }]}>
              <Icon name="qr-code-outline" size={14} color={THEME.teal} />
              <Text style={styles.scannedCodeText} numberOfLines={1}>
                {doc.scannedCode}
              </Text>
            </View>
          ) : null
        }
      />

      <Sheet visible={!!pendingUri} onClose={closePending} title="Nouveau document">
        {pendingUri && pendingKind === "pdf" ? (
          <View style={[styles.pdfPreview, round("md")]}>
            <Icon name="document-text" size={40} color={THEME.stamp} />
            <Text style={type.label}>PDF</Text>
          </View>
        ) : pendingUri ? (
          <Image source={{ uri: pendingUri }} style={[styles.previewImage, round("md")]} />
        ) : null}
        {pendingScannedCode && (
          <View style={styles.scannedCodeBadge}>
            <Icon name="qr-code-outline" size={14} color={THEME.teal} />
            <Text style={styles.scannedCodeText} numberOfLines={1}>
              {pendingScannedCode}
            </Text>
          </View>
        )}
        <Field label="Titre" value={title} onChangeText={setTitle} placeholder="Ex : voucher hôtel" style={{ marginTop: space.lg }} />
        <Text style={[type.caption, { marginBottom: space.sm }]}>Rubrique</Text>
        <View style={styles.categoryChips}>
          {DOCUMENT_CATEGORIES.map((c) => (
            <Chip key={c.key} label={c.label} icon={c.icon} tone={c.tone} selected={category === c.key} onPress={() => setChosenCategory(c.key)} />
          ))}
        </View>
        {error ? <Text style={[type.caption, { color: THEME.stamp, marginBottom: space.md }]}>{error}</Text> : null}
        <View style={styles.sheetButtons}>
          <Button
            title="Annuler"
            variant="secondary"
            disabled={busy}
            style={{ flex: 1 }}
            onPress={closePending}
          />
          <Button title="Enregistrer" loading={busy} style={{ flex: 1 }} onPress={confirmAdd} />
        </View>
      </Sheet>
    </Section>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1 },
  buttons: { flexDirection: "row", gap: 10 },
  categoryChips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg },
  sheetButtons: { flexDirection: "row", gap: space.md, marginTop: space.xs },
  previewImage: { width: "100%", height: 200, backgroundColor: THEME.bgCardAlt },
  pdfPreview: { width: "100%", height: 120, backgroundColor: THEME.bgCardAlt, alignItems: "center", justifyContent: "center", gap: space.sm },
  scannedCodeBadge: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: THEME.tealDim, borderRadius: 8, paddingHorizontal: space.md, paddingVertical: space.sm, marginTop: space.md },
  scannedCodeText: { ...type.numeralSmall, color: THEME.teal, flex: 1 },
}));
