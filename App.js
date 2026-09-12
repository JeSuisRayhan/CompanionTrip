import React, { useState, useEffect } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";

import { THEME } from "./lib/theme";
import { hasPin } from "./lib/pin";
import HomeScreen from "./screens/HomeScreen";
import OnboardingScreen from "./screens/OnboardingScreen";
import TripScreen from "./screens/TripScreen";
import DayDetailScreen from "./screens/DayDetailScreen";
import ActivityEditorScreen from "./screens/ActivityEditorScreen";
import SettingsScreen from "./screens/SettingsScreen";
import TripSettingsScreen from "./screens/TripSettingsScreen";
import WeatherReorgScreen from "./screens/WeatherReorgScreen";
import LockScreen from "./screens/LockScreen";

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: THEME.bg,
    card: THEME.bgCard,
    text: THEME.ink,
    border: THEME.border,
    primary: THEME.teal,
  },
};

export default function App() {
  const [checking, setChecking] = useState(true);
  const [locked, setLocked] = useState(false);
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
      const pinSet = await hasPin();
      setLocked(pinSet);
      setChecking(false);
    })();
  }, []);

  if (checking || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: THEME.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={THEME.teal} />
      </View>
    );
  }

  if (locked) {
    return <LockScreen onUnlock={() => setLocked(false)} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: THEME.bgCard },
            headerTintColor: THEME.ink,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: THEME.bg },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Trip" component={TripScreen} options={{ title: "" }} />
          <Stack.Screen name="DayDetail" component={DayDetailScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="ActivityEditor"
            component={ActivityEditorScreen}
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Réglages" }} />
          <Stack.Screen
            name="TripSettings"
            component={TripSettingsScreen}
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen name="WeatherReorg" component={WeatherReorgScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
