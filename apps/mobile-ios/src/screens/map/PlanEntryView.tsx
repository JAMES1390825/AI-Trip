import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { BudgetLevel, PaceLevel } from "../../types/plan";

const suggestedStyles = [
  "经典必玩",
  "吃吃喝喝",
  "小众探索",
  "拍照出片",
  "逛街购物",
  "citywalk",
  "自然风光",
  "文艺展览",
  "历史古建",
];

const suggestedDays = [2, 3, 4, 5];

const budgetOptions: Array<{ value: BudgetLevel; label: string }> = [
  { value: "low", label: "低预算" },
  { value: "medium", label: "中预算" },
  { value: "high", label: "高体验" },
];

const paceOptions: Array<{ value: PaceLevel; label: string }> = [
  { value: "relaxed", label: "轻松" },
  { value: "compact", label: "紧凑" },
];

type PlanEntryViewProps = {
  destination: string;
  destinationNote?: string;
  planningNote: string;
  startDate: string;
  days: number;
  flexibleDays: boolean;
  selectedStyles: string[];
  budget: BudgetLevel;
  pace: PaceLevel;
  status: string;
  clarificationQuestion?: string;
  suggestedOptions?: string[];
  onChangeDays: (value: number) => void;
  onToggleStyle: (value: string) => void;
  onSelectBudget: (value: BudgetLevel) => void;
  onSelectPace: (value: PaceLevel) => void;
  onOpenDestinationSearch: () => void;
  onOpenDatePicker: () => void;
  onChangePlanningNote: (value: string) => void;
  onApplySuggestedOption?: (value: string) => void;
  onPressSmartGenerate: () => void;
};

export function PlanEntryView({
  destination,
  destinationNote = "",
  planningNote,
  startDate,
  days,
  flexibleDays,
  selectedStyles,
  budget,
  pace,
  status,
  clarificationQuestion = "",
  suggestedOptions = [],
  onChangeDays,
  onToggleStyle,
  onSelectBudget,
  onSelectPace,
  onOpenDestinationSearch,
  onOpenDatePicker,
  onChangePlanningNote,
  onApplySuggestedOption,
  onPressSmartGenerate,
}: PlanEntryViewProps) {
  const selectedCount = selectedStyles.length;
  const helperText = useMemo(() => {
    if (selectedCount > 0) return `已选 ${selectedCount} 个偏好`;
    return "在这里直接告诉 AI 你偏好的玩法";
  }, [selectedCount]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.backText}>AI 规划</Text>
        <View style={styles.heroSpacer} />
        <Text style={styles.heroTitle}>发起你的 AI 行程</Text>
        <Text style={styles.heroSub}>目的地、日期和偏好都在这里一次填完，然后直接开始生成。</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>目的地</Text>
        <Pressable style={styles.inputButton} onPress={onOpenDestinationSearch}>
          <Text style={destination ? styles.inputValue : styles.inputPlaceholder}>
            {destination || "搜索目的地 / 城市 / 景点关键词"}
          </Text>
        </Pressable>
        {destinationNote ? <Text style={styles.inputNote}>{destinationNote}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>你想去多久？</Text>
        <Pressable style={styles.inputButton} onPress={onOpenDatePicker}>
          <Text style={startDate ? styles.inputValue : styles.inputPlaceholder}>
            {flexibleDays ? `${days} 天左右（灵活天数）` : startDate ? `${startDate} · ${days} 天` : "开始日期 - 结束日期"}
          </Text>
        </Pressable>
        <View style={styles.optionRow}>
          {suggestedDays.map((item) => {
            const active = item === days;
            return (
              <Pressable
                key={`days-${item}`}
                style={[styles.dayChip, active ? styles.dayChipActive : null]}
                onPress={() => onChangeDays(item)}
              >
                <Text style={[styles.dayChipText, active ? styles.dayChipTextActive : null]}>{item} 天</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>旅行偏好</Text>
        <Text style={styles.sectionSub}>{helperText}</Text>
        <View style={styles.styleWrap}>
          {suggestedStyles.map((item) => {
            const active = selectedStyles.includes(item);
            return (
              <Pressable
                key={item}
                style={[styles.styleChip, active ? styles.styleChipActive : null]}
                onPress={() => onToggleStyle(item)}
              >
                <Text style={[styles.styleChipText, active ? styles.styleChipTextActive : null]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>规划偏好</Text>
        <Text style={styles.sectionSub}>这些设置会直接影响路线节奏和消费水平。</Text>
        <Text style={styles.preferenceLabel}>预算</Text>
        <View style={styles.optionRow}>
          {budgetOptions.map((item) => {
            const active = item.value === budget;
            return (
              <Pressable
                key={item.value}
                style={[styles.dayChip, active ? styles.dayChipActive : null]}
                onPress={() => onSelectBudget(item.value)}
              >
                <Text style={[styles.dayChipText, active ? styles.dayChipTextActive : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.preferenceLabel, styles.preferenceLabelSpacing]}>节奏</Text>
        <View style={styles.optionRow}>
          {paceOptions.map((item) => {
            const active = item.value === pace;
            return (
              <Pressable
                key={item.value}
                style={[styles.dayChip, active ? styles.dayChipActive : null]}
                onPress={() => onSelectPace(item.value)}
              >
                <Text style={[styles.dayChipText, active ? styles.dayChipTextActive : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>补充要求</Text>
        <Text style={styles.sectionSub}>可以直接告诉 AI 雨天偏好、想吃什么，或者住在哪里附近。</Text>
        <TextInput
          style={styles.noteInput}
          value={planningNote}
          onChangeText={onChangePlanningNote}
          multiline
          placeholder="例如：雨天也能玩，多一点本地餐馆，住在地铁方便的位置"
          placeholderTextColor="#93a5b3"
          textAlignVertical="top"
        />
      </View>

      <Pressable style={styles.primaryButton} onPress={onPressSmartGenerate}>
        <Text style={styles.primaryButtonText}>发起 AI 行程</Text>
      </Pressable>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>AI 规划状态</Text>
        <Text style={styles.statusText}>{status}</Text>
        {clarificationQuestion ? <Text style={styles.clarificationText}>{clarificationQuestion}</Text> : null}
        {suggestedOptions.length > 0 && onApplySuggestedOption ? (
          <View style={styles.suggestionWrap}>
            {suggestedOptions.map((item) => (
              <Pressable key={item} style={styles.suggestionChip} onPress={() => onApplySuggestedOption(item)}>
                <Text style={styles.suggestionChipText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eef9ff",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 16,
  },
  hero: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  backText: {
    color: "#12273d",
    fontSize: 15,
    fontWeight: "700",
  },
  heroSpacer: {
    height: 48,
  },
  heroTitle: {
    color: "#08131f",
    fontSize: 26,
    fontWeight: "800",
  },
  heroSub: {
    marginTop: 8,
    color: "#52677a",
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    borderRadius: 28,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: "#9db3c8",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  sectionTitle: {
    color: "#08131f",
    fontSize: 16,
    fontWeight: "800",
  },
  sectionSub: {
    marginTop: 6,
    color: "#6c8193",
    fontSize: 13,
  },
  inputButton: {
    marginTop: 14,
    borderRadius: 22,
    backgroundColor: "#f7fbff",
    borderWidth: 1,
    borderColor: "#deebf4",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputNote: {
    marginTop: 10,
    color: "#607789",
    fontSize: 13,
    lineHeight: 20,
  },
  inputValue: {
    color: "#102033",
    fontSize: 17,
    fontWeight: "600",
  },
  inputPlaceholder: {
    color: "#93a5b3",
    fontSize: 17,
    fontWeight: "600",
  },
  optionRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dayChip: {
    minWidth: 68,
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "#f4f7fb",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dayChipActive: {
    backgroundColor: "#0d1218",
  },
  dayChipText: {
    color: "#43576a",
    fontSize: 14,
    fontWeight: "700",
  },
  dayChipTextActive: {
    color: "#ffffff",
  },
  styleWrap: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  styleChip: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0ebf4",
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: "#aab9c7",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  styleChipActive: {
    backgroundColor: "#0d1218",
    borderColor: "#0d1218",
  },
  styleChipText: {
    color: "#27394a",
    fontSize: 14,
    fontWeight: "700",
  },
  styleChipTextActive: {
    color: "#ffffff",
  },
  preferenceLabel: {
    marginTop: 16,
    color: "#0f1722",
    fontSize: 14,
    fontWeight: "800",
  },
  preferenceLabelSpacing: {
    marginTop: 18,
  },
  noteInput: {
    minHeight: 110,
    marginTop: 14,
    borderRadius: 22,
    backgroundColor: "#f7fbff",
    borderWidth: 1,
    borderColor: "#deebf4",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#102033",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  primaryButton: {
    borderRadius: 24,
    backgroundColor: "#0b0f14",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
  },
  statusCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  statusLabel: {
    color: "#6a7b89",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  statusText: {
    marginTop: 8,
    color: "#102033",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  clarificationText: {
    marginTop: 10,
    color: "#36536a",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  suggestionWrap: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    borderRadius: 16,
    backgroundColor: "#f2f8fd",
    borderWidth: 1,
    borderColor: "#d3e5f1",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionChipText: {
    color: "#16324a",
    fontSize: 13,
    fontWeight: "700",
  },
});
