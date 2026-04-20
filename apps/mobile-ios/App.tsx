import React, { useState } from "react";
import { Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { TripsScreen } from "./src/screens/TripsScreen";
import { MapFlowScreen } from "./src/screens/map/MapFlowScreen";

type TabKey = "trips" | "plan";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "trips", label: "行程" },
  { key: "plan", label: "规划" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("trips");
  const [preloadedItinerary, setPreloadedItinerary] = useState<Record<string, unknown> | null>(null);
  const [preloadedToken, setPreloadedToken] = useState(0);
  const [savedRefreshToken, setSavedRefreshToken] = useState(0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <View style={[styles.page, activeTab === "trips" ? styles.pageActive : styles.pageHidden]}>
          <TripsScreen
            refreshToken={savedRefreshToken}
            onCreateTrip={() => setActiveTab("plan")}
            onOpenSavedPlan={(nextItinerary) => {
              setPreloadedItinerary(nextItinerary);
              setPreloadedToken((prev) => prev + 1);
              setActiveTab("plan");
            }}
          />
        </View>
        <View style={[styles.page, activeTab === "plan" ? styles.pageActive : styles.pageHidden]}>
          <MapFlowScreen
            preloadedItinerary={preloadedItinerary}
            preloadedToken={preloadedToken}
            onPlanSaved={() => setSavedRefreshToken((prev) => prev + 1)}
          />
        </View>
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tabItem, active ? styles.tabItemActive : null]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#eaf1fb",
  },
  content: {
    flex: 1,
  },
  page: {
    ...StyleSheet.absoluteFillObject,
  },
  pageActive: {
    display: "flex",
  },
  pageHidden: {
    display: "none",
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#d5deec",
    backgroundColor: "#f8fbff",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
  },
  tabItem: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf3fe",
  },
  tabItemActive: {
    backgroundColor: "#2b66df",
  },
  tabText: {
    color: "#3f5775",
    fontSize: 13,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#ffffff",
  },
});
