import React from "react";
import { View, Share, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { THEME, space, layout, themedStyles } from "../lib/theme";
import { logError, getErrorLog, formatErrorReport } from "../lib/errorLog";
import { Button, EmptyState } from "./ui";

export const deviceLabel = () => `${Platform.OS} ${Platform.Version}`;

export async function shareErrorReport() {
  const entries = await getErrorLog();
  await Share.share({ title: "Rapport d'erreurs", message: formatErrorReport(entries, { device: deviceLabel() }) });
}

// A screen that fails to draw would otherwise leave a blank or frozen app.
// This shows what happened in plain words, offers to try again, and keeps the
// error in the journal (Réglages > Journal d'erreurs).
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const stack = info && info.componentStack ? info.componentStack.split("\n").filter(Boolean).slice(0, 4).join("\n") : "";
    logError(error, { source: "render", where: stack ? `\n${stack}` : "" });
  }

  retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <EmptyState
            icon="warning-outline"
            tone="stamp"
            title="Un problème est survenu"
            text="Cet écran n'a pas pu s'afficher. Vos voyages sont intacts. Réessayez ; si ça recommence, envoyez le rapport."
            action={{ label: "Réessayer", icon: "refresh", onPress: this.retry }}
          />
          <Button title="Partager le rapport" icon="share-outline" variant="secondary" style={styles.share} onPress={() => shareErrorReport().catch(() => {})} />
        </View>
      </SafeAreaView>
    );
  }
}

const styles = themedStyles(() => ({
  safe: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: layout.gutter },
  share: { marginTop: space.md },
}));
