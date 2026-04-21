import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ItineraryBlock } from "../../types/itinerary";

type PoiDetailSheetProps = {
  visible: boolean;
  block: ItineraryBlock | null;
  onClose: () => void;
  onNavigate: () => void;
};

function detailIntro(block: ItineraryBlock): string {
  if (block.blockType === "food") {
    return `${block.poi} 适合安排在 ${block.startHour}:00 前后，用餐和休息都比较顺手。`;
  }
  return `${block.poi} 适合安排在当前这段时间，和前后动线衔接更顺。`;
}

function detailDuration(block: ItineraryBlock): string {
  const duration = Math.max(0.5, block.endHour - block.startHour);
  return duration >= 1 ? `建议停留约 ${duration} 小时` : "建议停留约 30 分钟";
}

function sourceLabel(block: ItineraryBlock): string {
  if (block.sourceMode === "provider") return "真实地图数据";
  if (block.sourceMode === "fallback") return "内置事实草案";
  if (block.sourceMode === "rules_legacy") return "旧版规则生成";
  return "未标记";
}

function providerLabel(provider: string): string {
  switch (String(provider || "").trim().toLowerCase()) {
    case "builtin":
      return "内置数据源";
    case "amap":
    case "gaode":
      return "高德地图";
    case "google":
    case "google_maps":
      return "谷歌地图";
    default:
      return "地图数据源";
  }
}

function personalizationBasisText(block: ItineraryBlock): string {
  if (!block.personalizationBasis) return "";
  const tags = block.personalizationBasis.matchedTags.length
    ? `命中你的偏好标签：${block.personalizationBasis.matchedTags.join(" / ")}`
    : "";
  const categories = block.personalizationBasis.matchedCategories.length
    ? `更贴近你常保留的类型：${block.personalizationBasis.matchedCategories.join(" / ")}`
    : "";
  return [tags, categories].filter(Boolean).join("；");
}

export function PoiDetailSheet({
  visible,
  block,
  onClose,
  onNavigate,
}: PoiDetailSheetProps) {
  if (!visible || !block) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
          <Pressable hitSlop={10} onPress={onClose}>
            <Text style={styles.closeText}>关闭</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{block.poi || "待确认地点"}</Text>
          <Text style={styles.meta}>
            {providerLabel(block.provider)} · {sourceLabel(block)} · {detailDuration(block)}
          </Text>

          <View style={styles.imageRow}>
            <View style={[styles.imageCard, styles.imagePrimary]}>
              <Text style={styles.imageCardText}>主图</Text>
            </View>
            <View style={styles.imageColumn}>
              <View style={[styles.imageCard, styles.imageSecondary]}>
                <Text style={styles.imageCardText}>动线</Text>
              </View>
              <View style={[styles.imageCard, styles.imageTertiary]}>
                <Text style={styles.imageCardText}>氛围</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>地点介绍</Text>
            <Text style={styles.sectionText}>{block.poiAddress || detailIntro(block)}</Text>
            {block.poiTags.length ? <Text style={styles.sectionText}>标签：{block.poiTags.join(" / ")}</Text> : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>为什么推荐</Text>
            <Text style={styles.sectionText}>{block.recommendReason || "已按时间窗口与动线优先推荐。"}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>来源与依据</Text>
            <Text style={styles.sectionText}>
              {block.providerPlaceId ? "来源点位编码已记录，可用于后续回查。" : "当前还没有记录来源点位编码。"}
            </Text>
            <Text style={styles.sectionText}>
              {block.evidence?.routeMinutesFromPrev
                ? `上一段预计 ${block.evidence.routeMinutesFromPrev} 分钟到达。`
                : "当前没有上一段路线时长依据。"}
            </Text>
            <Text style={styles.sectionText}>
              {block.evidence?.weatherBasis
                ? `天气依据：${block.evidence.weatherBasis}`
                : "当前没有明确天气依据。"}
            </Text>
            {personalizationBasisText(block) ? (
              <Text style={styles.sectionText}>个性化依据：{personalizationBasisText(block)}</Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>风险提醒</Text>
            <Text style={styles.sectionText}>{block.weatherRisk || "当前没有明显风险，可按原计划前往。"}</Text>
          </View>
        </ScrollView>

        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>收起</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={onNavigate}>
            <Text style={styles.primaryButtonText}>导航</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,14,24,0.28)",
  },
  sheet: {
    maxHeight: "84%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  handleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d3dce4",
    alignSelf: "center",
  },
  closeText: {
    color: "#3f5567",
    fontSize: 14,
    fontWeight: "700",
  },
  title: {
    marginTop: 18,
    color: "#08131f",
    fontSize: 22,
    fontWeight: "800",
  },
  meta: {
    marginTop: 10,
    color: "#5b6f82",
    fontSize: 14,
    fontWeight: "700",
  },
  imageRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  imagePrimary: {
    backgroundColor: "#c55738",
  },
  imageSecondary: {
    backgroundColor: "#7d685c",
  },
  imageTertiary: {
    backgroundColor: "#84632d",
  },
  imageCard: {
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  imageCardText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  imageColumn: {
    flex: 1,
    gap: 10,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    color: "#0d1723",
    fontSize: 16,
    fontWeight: "800",
  },
  sectionText: {
    marginTop: 8,
    color: "#5d7182",
    fontSize: 14,
    lineHeight: 22,
  },
  actionRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#eef4fb",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: "#102033",
    fontSize: 14,
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#0d1117",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
});
