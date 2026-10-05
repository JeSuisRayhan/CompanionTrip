import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";

import { THEME, type, subscribeTheme, getThemeVersion } from "./lib/theme";
import { loadPalette } from "./lib/appearance";
import { installErrorHandlers } from "./lib/errorLog";
import ErrorBoundary from "./components/ErrorBoundary";
import { hasPin } from "./lib/pin";
import SplashOverlay, { SPLASH_BACKGROUND } from "./components/SplashOverlay";
// imported here so the park alert task is defined whenever the app starts, even in the background
import { syncParkAlertTask } from "./lib/parkAlertsTask";
import HomeScreen from "./screens/HomeScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import TripScreen from "./screens/TripScreen";
import DayDetailScreen from "./screens/DayDetailScreen";
import ActivityEditorScreen from "./screens/ActivityEditorScreen";
import SettingsScreen from "./screens/SettingsScreen";
import TripSettingsScreen from "./screens/TripSettingsScreen";
import WeatherReorgScreen from "./screens/WeatherReorgScreen";
import TicketScannerScreen from "./screens/TicketScannerScreen";
import HotelsScreen from "./screens/HotelsScreen";
import IdeaEditorScreen from "./screens/IdeaEditorScreen";
import TripMapScreen from "./screens/TripMapScreen";
import ParkPlanScreen from "./screens/ParkPlanScreen";
import DayAttractionsScreen from "./screens/DayAttractionsScreen";
import ParkLiveScreen from "./screens/ParkLiveScreen";
import PlanGeneratorScreen from "./screens/PlanGeneratorScreen";
import ImportIdeasScreen from "./screens/ImportIdeasScreen";
import ImportScriptScreen from "./screens/ImportScriptScreen";
import LockScreen from "./screens/LockScreen";
import ErrorLogScreen from "./screens/ErrorLogScreen";

installErrorHandlers();

const Stack = createNativeStackNavigator();

const buildNavTheme = () => ({
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: THEME.bg,
    card: THEME.bg,
    text: THEME.ink,
    border: THEME.hairStrong,
    primary: THEME.gold,
  },
});

// The native splash screen (the logo) stays up until the app has drawn its own copy of it (SplashOverlay), which
// spins while the fonts and the saved palette load. A build made before expo-splash-screen existed has no
// splash to control: the calls then do nothing.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [ready, setReady] = useState(false);
  const [overlay, setOverlay] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: SPLASH_BACKGROUND }}>
      <AppContent onReady={() => setReady(true)} />
      {overlay ? <SplashOverlay ready={ready} onDone={() => setOverlay(false)} /> : null}
    </View>
  );
}

function AppContent({ onReady }) {
  const [checking, setChecking] = useState(true);
  const [locked, setLocked] = useState(false);
  // A new palette rebuilds the navigator (fresh colours everywhere) and puts
  // the person back on the screen they were on.
  const themeVersion = useSyncExternalStore(subscribeTheme, getThemeVersion);
  const navState = useRef(undefined);
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    (async () => {
      await loadPalette();
      syncParkAlertTask(); // registers or removes the background check to match the trips' settings
      const pinSet = await hasPin();
      setLocked(pinSet);
      setChecking(false);
    })();
  }, []);

  const ready = !checking && fontsLoaded;
  useEffect(() => {
    if (ready) onReady();
  }, [ready]);

  if (!ready) return null; // the splash overlay is on screen meanwhile

  if (locked) {
    return <LockScreen onUnlock={() => setLocked(false)} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <NavigationContainer
          key={themeVersion}
          theme={buildNavTheme()}
          initialState={navState.current}
          onStateChange={(state) => {
            navState.current = state;
          }}
        >
          <StatusBar style="light" />
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerStyle: { backgroundColor: THEME.bg },
              headerTintColor: THEME.ink,
              headerTitleStyle: { fontFamily: type.heading.fontFamily, fontSize: type.heading.fontSize },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: THEME.bg },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Trip" component={TripScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DayDetail" component={DayDetailScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="ActivityEditor"
              component={ActivityEditorScreen}
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Réglages" }} />
            <Stack.Screen name="ErrorLog" component={ErrorLogScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="TripSettings"
              component={TripSettingsScreen}
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen name="WeatherReorg" component={WeatherReorgScreen} options={{ headerShown: false }} />
            <Stack.Screen name="TicketScanner" component={TicketScannerScreen} options={{ headerShown: false, animation: "none" }} />
            <Stack.Screen name="Hotels" component={HotelsScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="IdeaEditor"
              component={IdeaEditorScreen}
              options={{ headerShown: false, presentation: "modal" }}
            />
            <Stack.Screen name="TripMap" component={TripMapScreen} options={{ headerShown: false }} />
            <Stack.Screen name="DayAttractions" component={DayAttractionsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ParkPlan" component={ParkPlanScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ParkLive" component={ParkLiveScreen} options={{ headerShown: false }} />
            <Stack.Screen name="PlanGenerator" component={PlanGeneratorScreen} options={{ headerShown: false }} />
            <Stack.Screen name="ImportIdeas" component={ImportIdeasScreen} options={{ headerShown: false, presentation: "modal" }} />
            <Stack.Screen name="ImportScript" component={ImportScriptScreen} options={{ headerShown: false, presentation: "modal" }} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
