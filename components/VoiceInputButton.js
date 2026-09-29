import React, { useState } from "react";
import { Text, View } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { THEME, space, type, themedStyles } from "../lib/theme";
import { IconButton } from "./ui";

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
      {error ? (
        <Text style={[type.caption, styles.errorText]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <IconButton
        icon={listening ? "stop" : "mic"}
        label={listening ? "Arrêter la dictée" : "Dicter le programme"}
        tone={listening ? "stamp" : "neutral"}
        filled
        onPress={toggle}
      />
    </View>
  );
}

// The error sits to the left of the button so the button keeps its place. The
// wrapper may shrink, so a long message wraps inside it (a parent with
// flexWrap moves it to its own line).
const styles = themedStyles(() => ({
  wrap: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  errorText: { color: THEME.stamp, flexShrink: 1, textAlign: "right" },
}));
