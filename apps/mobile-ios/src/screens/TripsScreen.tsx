import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { TripApiClient } from "../api/client";
import { RUNTIME_CONFIG } from "../config/runtime";
import type { SavedPlanListItem } from "../types/plan";

type TripsScreenProps = {
  onCreateTrip: () => void;
  onOpenSavedPlan: (itinerary: Record<string, unknown>) => void;
  refreshToken?: number;
};

function formatSavedDate(value: string): string {
  const ts = Date.parse(value || "");
  if (!Number.isFinite(ts)) return value || "--";
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${hh}:${mm}`;
}

function destinationLabel(item: SavedPlanListItem): string {
  return String(item.destination || "").trim() || "未命名行程";
}

export function TripsScreen({ onCreateTrip, onOpenSavedPlan, refreshToken = 0 }: TripsScreenProps) {
  const api = useMemo(() => new TripApiClient(() => RUNTIME_CONFIG), []);
  const [items, setItems] = useState<SavedPlanListItem[]>([]);
  const [status, setStatus] = useState("加载中...");
  const [isLoading, setIsLoading] = useState(false);
  const [openingPlanId, setOpeningPlanId] = useState("");
  const [deletingPlanId, setDeletingPlanId] = useState("");

  const loadSavedPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await api.listSavedPlans(30);
      setItems(list);
      setStatus(list.length ? `共 ${list.length} 条已保存行程` : "还没有已保存行程，先去规划一个。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadSavedPlans();
  }, [loadSavedPlans, refreshToken]);

  async function handleOpenSaved(item: SavedPlanListItem) {
    setOpeningPlanId(item.id);
    try {
      const detail = await api.getSavedPlan(item.id);
      onOpenSavedPlan(detail.itinerary || {});
      setStatus(`已打开「${destinationLabel(item)}」`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningPlanId("");
    }
  }

  function handleDeleteSaved(item: SavedPlanListItem) {
    Alert.alert(
      "删除行程",
      `确认删除「${destinationLabel(item)}」吗？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingPlanId(item.id);
              try {
                await api.deleteSavedPlan(item.id);
                setItems((prev) => {
                  const next = prev.filter((plan) => plan.id !== item.id);
                  setStatus(next.length ? "已删除行程" : "还没有已保存行程，先去规划一个。");
                  return next;
                });
              } catch (error) {
                setStatus(error instanceof Error ? error.message : String(error));
              } finally {
                setDeletingPlanId("");
              }
            })();
          },
        },
      ],
      { cancelable: true },
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Saved Trips</Text>
        <Text style={styles.heroTitle}>保存 / 回看</Text>
        <Text style={styles.heroText}>当前 iOS 端只保留规划与已保存行程回看，不再承载社区、发现或个人化入口。</Text>
        <View style={styles.heroActions}>
          <Pressable style={styles.primaryButton} onPress={onCreateTrip}>
            <Text style={styles.primaryButtonText}>新建规划</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => void loadSavedPlans()}>
            <Text style={styles.secondaryButtonText}>刷新列表</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>已保存行程</Text>
        {isLoading ? <ActivityIndicator size="small" color="#2f6ae5" /> : null}
      </View>
      <Text style={styles.statusText}>{status}</Text>

      {items.length ? (
        <View style={styles.list}>
          {items.map((item) => {
            const isOpening = openingPlanId === item.id;
            const isDeleting = deletingPlanId === item.id;
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{destinationLabel(item)}</Text>
                <Text style={styles.cardMeta}>
                  {item.start_date || "未设置日期"} · 保存于 {formatSavedDate(item.saved_at || item.updated_at)}
                </Text>
                <Text style={styles.cardMeta}>可信度 {Math.round((Number(item.confidence) || 0) * 100)}%</Text>
                <View style={styles.cardActions}>
                  <Pressable
                    style={[styles.cardButton, styles.cardButtonPrimary]}
                    onPress={() => void handleOpenSaved(item)}
                    disabled={isOpening}
                  >
                    <Text style={styles.cardButtonPrimaryText}>{isOpening ? "打开中..." : "打开回看"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.cardButton, styles.cardButtonGhost]}
                    onPress={() => handleDeleteSaved(item)}
                    disabled={isDeleting}
                  >
                    <Text style={styles.cardButtonGhostText}>{isDeleting ? "删除中..." : "删除"}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>还没有可回看的行程</Text>
          <Text style={styles.emptyText}>去“规划”页完成一次生成并保存后，这里会出现服务端保存的 itinerary。</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#eef3fb",
  },
  content: {
    padding: 18,
    gap: 16,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: "#16243b",
    gap: 10,
  },
  heroEyebrow: {
    color: "#8fb8ff",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "800",
  },
  heroText: {
    color: "#d7e4f7",
    fontSize: 14,
    lineHeight: 21,
  },
  heroActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#2f6ae5",
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#35527e",
    backgroundColor: "#22314f",
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#dce8fa",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#173051",
    fontSize: 18,
    fontWeight: "800",
  },
  statusText: {
    color: "#5b6f8f",
    fontSize: 13,
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 8,
    shadowColor: "#1d3557",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  cardTitle: {
    color: "#173051",
    fontSize: 18,
    fontWeight: "800",
  },
  cardMeta: {
    color: "#60728f",
    fontSize: 13,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cardButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  cardButtonPrimary: {
    backgroundColor: "#edf4ff",
  },
  cardButtonPrimaryText: {
    color: "#255dd0",
    fontSize: 14,
    fontWeight: "800",
  },
  cardButtonGhost: {
    backgroundColor: "#fff1ef",
  },
  cardButtonGhostText: {
    color: "#c34d3b",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyCard: {
    borderRadius: 18,
    padding: 20,
    backgroundColor: "#ffffff",
    gap: 8,
  },
  emptyTitle: {
    color: "#173051",
    fontSize: 17,
    fontWeight: "800",
  },
  emptyText: {
    color: "#60728f",
    fontSize: 14,
    lineHeight: 21,
  },
});
