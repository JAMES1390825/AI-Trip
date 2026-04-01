import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

type GeneratingViewProps = {
  destination: string;
  days: number;
  phases: string[];
  currentPhaseIndex: number;
  onCancel: () => void;
};

export function GeneratingView({
  destination,
  days,
  phases,
  currentPhaseIndex,
  onCancel,
}: GeneratingViewProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.mapMock}>
        <View style={[styles.routeSegment, styles.routeOne]} />
        <View style={[styles.routeSegment, styles.routeTwo]} />
        <View style={[styles.routeMarker, styles.markerOne]}>
          <Text style={styles.markerText}>1</Text>
        </View>
        <View style={[styles.routeMarker, styles.markerTwo]}>
          <Text style={styles.markerText}>2</Text>
        </View>
        <View style={[styles.routeMarker, styles.markerThree]}>
          <Text style={styles.markerText}>3</Text>
        </View>
        <View style={styles.dayPill}>
          <Text style={styles.dayPillText}>第{Math.min(days, currentPhaseIndex + 1)}天</Text>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.title}>{destination || "目的地"} 行程生成中</Text>
        <Text style={styles.subtitle}>正在先确认事实锚点，再拼装路线、节奏和可信度说明。</Text>

        <View style={styles.progressRow}>
          <ActivityIndicator size="small" color="#13c1de" />
          <Text style={styles.progressText}>{phases[currentPhaseIndex] || "正在规划路线"}</Text>
        </View>

        <View style={styles.phaseList}>
          {phases.map((item, idx) => {
            const active = idx === currentPhaseIndex;
            const completed = idx < currentPhaseIndex;
            return (
              <View key={item} style={styles.phaseItem}>
                <View
                  style={[
                    styles.phaseDot,
                    active ? styles.phaseDotActive : null,
                    completed ? styles.phaseDotDone : null,
                  ]}
                />
                <Text
                  style={[
                    styles.phaseText,
                    active ? styles.phaseTextActive : null,
                    completed ? styles.phaseTextDone : null,
                  ]}
                >
                  {item}
                </Text>
              </View>
            );
          })}
        </View>

        <Pressable style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eff8ff",
  },
  mapMock: {
    flex: 1,
    paddingTop: 88,
    paddingHorizontal: 26,
    backgroundColor: "#f6fbff",
  },
  routeSegment: {
    position: "absolute",
    backgroundColor: "#18c7de",
    borderRadius: 20,
  },
  routeOne: {
    top: 172,
    left: 88,
    width: 168,
    height: 8,
    transform: [{ rotate: "18deg" }],
  },
  routeTwo: {
    top: 258,
    left: 162,
    width: 126,
    height: 8,
    transform: [{ rotate: "-28deg" }],
  },
  routeMarker: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#17c6dd",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#ffffff",
  },
  markerOne: {
    top: 150,
    left: 74,
  },
  markerTwo: {
    top: 210,
    left: 210,
  },
  markerThree: {
    top: 298,
    left: 280,
  },
  markerText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  dayPill: {
    position: "absolute",
    top: 126,
    left: 146,
    borderRadius: 16,
    backgroundColor: "#17c6dd",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dayPillText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 34,
    shadowColor: "#90a9bf",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 6,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d4dde5",
  },
  title: {
    marginTop: 24,
    color: "#08131f",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 10,
    color: "#647988",
    fontSize: 14,
    lineHeight: 22,
  },
  progressRow: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressText: {
    color: "#0f1722",
    fontSize: 16,
    fontWeight: "700",
  },
  phaseList: {
    marginTop: 18,
    gap: 12,
  },
  phaseItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  phaseDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#d7e4ed",
  },
  phaseDotActive: {
    backgroundColor: "#17c6dd",
  },
  phaseDotDone: {
    backgroundColor: "#0a131d",
  },
  phaseText: {
    color: "#8b9dad",
    fontSize: 14,
    fontWeight: "600",
  },
  phaseTextActive: {
    color: "#0f1722",
  },
  phaseTextDone: {
    color: "#4a5e70",
  },
  cancelButton: {
    marginTop: 28,
    alignSelf: "center",
    borderRadius: 22,
    backgroundColor: "#0b1015",
    paddingHorizontal: 42,
    paddingVertical: 15,
  },
  cancelButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
});
