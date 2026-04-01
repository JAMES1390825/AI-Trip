import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { TripApiClient } from "../api/client";
import { RUNTIME_CONFIG } from "../config/runtime";

type ProfileScreenProps = {
  onJumpToMap: () => void;
};

export function ProfileScreen({ onJumpToMap }: ProfileScreenProps) {
  const api = useMemo(() => new TripApiClient(() => RUNTIME_CONFIG), []);
  const [prefs, setPrefs] = useState<Array<{ label: string; value: string }>>([
    { label: "预算", value: "中预算" },
    { label: "节奏", value: "轻松" },
    { label: "偏好", value: "citywalk,美食" },
  ]);
  const [status, setStatus] = useState("加载中...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      try {
        const list = await api.listSavedPlans(1);
        if (!list.length) {
          if (!cancelled) setStatus("暂无历史记录，保存后会自动记忆偏好");
          return;
        }
        const detail = await api.getSavedPlan(list[0].id);
        const snapshot = (detail.itinerary?.request_snapshot || {}) as Record<string, unknown>;
        const budgetRaw = String(snapshot.budget_level || "").trim();
        const paceRaw = String(snapshot.pace || "").trim();
        const styleList = Array.isArray(snapshot.travel_styles)
          ? snapshot.travel_styles.map((item) => String(item || "").trim()).filter(Boolean)
          : [];
        const budget = budgetRaw === "high" ? "高体验" : budgetRaw === "low" ? "低预算" : "中预算";
        const pace = paceRaw === "compact" ? "紧凑" : "轻松";
        const style = styleList.length ? styleList.join(",") : "未设置";
        if (!cancelled) {
          setPrefs([
            { label: "预算", value: budget },
            { label: "节奏", value: pace },
            { label: "偏好", value: style },
          ]);
          setStatus("已同步最近偏好");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>我的偏好</Text>
        <Text style={styles.heroSub}>后续会按你的偏好自动推荐。</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>当前偏好</Text>
        <View style={styles.prefList}>
          {prefs.map((item) => (
            <View key={item.label} style={styles.prefItem}>
              <Text style={styles.prefLabel}>{item.label}</Text>
              <Text style={styles.prefValue}>{item.value}</Text>
            </View>
          ))}
        </View>
        {loading ? <ActivityIndicator size="small" color="#2f6ae5" /> : null}
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>下一步</Text>
        <Text style={styles.text}>先在地图页完成一次规划并保存。</Text>
        <Pressable style={styles.primaryButton} onPress={onJumpToMap}>
          <Text style={styles.primaryButtonText}>去地图页</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#edf3ff",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  hero: {
    borderRadius: 16,
    backgroundColor: "#132b4b",
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6,
  },
  heroTitle: {
    color: "#f1f7ff",
    fontSize: 22,
    fontWeight: "800",
  },
  heroSub: {
    color: "#bfd3ef",
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dce6f6",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10,
  },
  cardTitle: {
    color: "#1e3553",
    fontSize: 15,
    fontWeight: "700",
  },
  prefList: {
    gap: 8,
  },
  prefItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2eaf8",
    backgroundColor: "#f8fbff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  prefLabel: {
    color: "#4f6886",
    fontSize: 13,
  },
  prefValue: {
    color: "#1d3554",
    fontSize: 13,
    fontWeight: "700",
  },
  text: {
    color: "#587391",
    fontSize: 13,
    lineHeight: 19,
  },
  statusText: {
    color: "#5c7898",
    fontSize: 12,
    lineHeight: 17,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#2d67df",
    alignItems: "center",
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
