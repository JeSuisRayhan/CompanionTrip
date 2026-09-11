import React, { useState } from "react";
import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { THEME } from "../lib/theme";

// Press to dictate; stops automatically at the end of speech (or press again
// to stop early). Appends the final transcript via onResult — the caller
// decides how to merge it into their text (e.g. append with a newline).
export default function VoiceInputButton({ onResult }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    if (event.isFinal) {
      const transcript = event.results?.[0]?.transcript;
      if (transcript && transcript.trim()) onResult(transcript.trim());
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (event.error !== "no-speech") {
      setError("La dictée a échoué. Réessayez.");
    }
  });

  async function toggle() {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    setError("");
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Autorisation micro refusée. Activez-la dans les réglages du téléphone.");
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: "fr-FR",
        interimResults: false,
        continuous: false,
      });
    } catch (e) {
      setError("Reconnaissance vocale indisponible sur cet appareil.");
    }
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={toggle}
        style={[styles.button, listening && styles.buttonActive]}
        accessibilityLabel={listening ? "Arrêter la dictée" : "Dicter le programme"}
      >
        <Ionicons name="mic" size={16} color={listening ? THEME.stamp : THEME.inkMuted} />
      </TouchableOpacity>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: THEME.border,
    backgroundColor: THEME.bgCardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonActive: { borderColor: THEME.stamp, backgroundColor: THEME.stampDim },
  errorText: { color: THEME.stamp, fontSize: 10.5, flexShrink: 1 },
});
