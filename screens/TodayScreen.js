// "Aujourd'hui" is the first tab of a trip that is under way (see screens/trip/TodayTab.js). This route stays for the
// reminders scheduled by an earlier version of the app, which still open "Today": it hands over to the tab.
import React, { useEffect } from "react";
import { View } from "react-native";
import { StackActions } from "@react-navigation/native";
import { THEME } from "../lib/theme";

export default function TodayScreen({ route, navigation }) {
  const { tripId } = route.params;
  useEffect(() => {
    navigation.dispatch(StackActions.replace("Trip", { tripId, initialTab: "today" }));
  }, [navigation, tripId]);
  return <View style={{ flex: 1, backgroundColor: THEME.bg }} />;
}
