import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { DestinationEntity } from "../../types/plan";
import type { CalendarMonth } from "./planning-page-default-state";

const styleTags = ["citywalk", "美食", "轻松", "小众", "拍照", "历史"];
const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];

type PlanEntryViewProps = {
  destination: string;
  destinationSearchOpen: boolean;
  destinationResults: DestinationEntity[];
  destinationSearchStatus: string;
  destinationSearchLoading: boolean;
  dateRangeOpen: boolean;
  startDate: string;
  endDate: string;
  days: number;
  selectedStyles: string[];
  planningNote: string;
  noteOpen: boolean;
  topHint: string;
  focusField: "destination" | "date_range" | null;
  focusTrigger: number;
  calendarMonth: CalendarMonth;
  onChangeDestination: (value: string) => void;
  onToggleDestinationSearch: () => void;
  onSelectDestination: (value: DestinationEntity) => void;
  onToggleDateRange: () => void;
  onPressCalendarDate: (date: string) => void;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToggleStyle: (value: string) => void;
  onToggleNote: () => void;
  onChangePlanningNote: (value: string) => void;
  onPressGenerate: () => void;
};

function formatDateLabel(value: string): string {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return value || "";
  const date = new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}.${day}`;
}

function rangeSummary(startDate: string, endDate: string, days: number): string {
  if (!startDate || !endDate || days <= 0) return "日期";
  return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)} · ${days} 天`;
}

function inRange(date: string, startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return false;
  return date > startDate && date < endDate;
}

export function PlanEntryView({
  destination,
  destinationSearchOpen,
  destinationResults,
  destinationSearchStatus,
  destinationSearchLoading,
  dateRangeOpen,
  startDate,
  endDate,
  days,
  selectedStyles,
  planningNote,
  noteOpen,
  topHint,
  focusField,
  focusTrigger,
  calendarMonth,
  onChangeDestination,
  onToggleDestinationSearch,
  onSelectDestination,
  onToggleDateRange,
  onPressCalendarDate,
  onPreviousMonth,
  onNextMonth,
  onToggleStyle,
  onToggleNote,
  onChangePlanningNote,
  onPressGenerate,
}: PlanEntryViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [destinationY, setDestinationY] = useState(0);
  const [dateRangeY, setDateRangeY] = useState(0);
  const selectedCount = selectedStyles.length;

  useEffect(() => {
    if (!focusTrigger) return;
    const target = focusField === "destination" ? destinationY : focusField === "date_range" ? dateRangeY : 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, target - 24), animated: true });
  }, [dateRangeY, destinationY, focusField, focusTrigger]);

  const hintText = useMemo(() => {
    if (topHint.trim()) return topHint.trim();
    return "先确定目的地、日期和风格";
  }, [topHint]);

  return (
    <View style={styles.sheetShell}>
      <View style={styles.sheetCard}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.handle} />

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>开始规划</Text>
              <Text style={styles.subtitle}>先确定目的地、日期和风格</Text>
            </View>
            <Text style={styles.meta}>约 20 秒</Text>
          </View>

          <View style={styles.topHintWrap}>
            <Text style={styles.topHintText}>{hintText}</Text>
          </View>

          <View
            style={[styles.inputCard, focusField === "destination" ? styles.inputCardFocus : null]}
            onLayout={(event) => setDestinationY(event.nativeEvent.layout.y)}
          >
            <Pressable style={styles.rowButton} onPress={onToggleDestinationSearch}>
              <Text style={destination ? styles.rowValue : styles.rowPlaceholder}>{destination || "目的地"}</Text>
            </Pressable>
            {destinationSearchOpen ? (
              <View style={styles.inlinePanel}>
                <TextInput
                  style={styles.searchInput}
                  value={destination}
                  onChangeText={onChangeDestination}
                  placeholder="搜索城市、目的地或景点"
                  placeholderTextColor="#8ea1b5"
                  autoFocus
                />
                {destinationSearchLoading ? (
                  <View style={styles.searchStatusRow}>
                    <ActivityIndicator size="small" color="#165dff" />
                    <Text style={styles.searchStatusText}>正在搜索...</Text>
                  </View>
                ) : null}
                {destinationResults.map((item) => (
                  <Pressable
                    key={item.destination_id}
                    style={styles.searchResult}
                    onPress={() => onSelectDestination(item)}
                  >
                    <Text style={styles.searchResultTitle}>{item.destination_label}</Text>
                    <Text style={styles.searchResultMeta}>
                      {[item.country, item.region].filter(Boolean).join(" · ")}
                    </Text>
                  </Pressable>
                ))}
                {destinationSearchStatus ? <Text style={styles.searchStatusText}>{destinationSearchStatus}</Text> : null}
              </View>
            ) : null}
          </View>

          <View
            style={[styles.inputCard, focusField === "date_range" ? styles.inputCardFocus : null]}
            onLayout={(event) => setDateRangeY(event.nativeEvent.layout.y)}
          >
            <Pressable style={styles.rowButton} onPress={onToggleDateRange}>
              <Text style={startDate && endDate ? styles.rowValue : styles.rowPlaceholder}>
                {rangeSummary(startDate, endDate, days)}
              </Text>
            </Pressable>
            {dateRangeOpen ? (
              <View style={styles.inlinePanel}>
                <View style={styles.calendarHeader}>
                  <Pressable style={styles.calendarNavButton} onPress={onPreviousMonth}>
                    <Text style={styles.calendarNavText}>上月</Text>
                  </Pressable>
                  <Text style={styles.calendarTitle}>{calendarMonth.title}</Text>
                  <Pressable style={styles.calendarNavButton} onPress={onNextMonth}>
                    <Text style={styles.calendarNavText}>下月</Text>
                  </Pressable>
                </View>
                <View style={styles.weekdayRow}>
                  {weekdayLabels.map((item) => (
                    <Text key={item} style={styles.weekdayText}>
                      {item}
                    </Text>
                  ))}
                </View>
                <View style={styles.calendarGrid}>
                  {calendarMonth.days.map((day) => {
                    const selectedStart = day.date === startDate;
                    const selectedEnd = day.date === endDate;
                    const between = inRange(day.date, startDate, endDate);
                    return (
                      <Pressable
                        key={day.date}
                        style={[
                          styles.calendarDay,
                          !day.inCurrentMonth ? styles.calendarDayOutside : null,
                          between ? styles.calendarDayInRange : null,
                          selectedStart || selectedEnd ? styles.calendarDaySelected : null,
                        ]}
                        onPress={() => onPressCalendarDate(day.date)}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            !day.inCurrentMonth ? styles.calendarDayTextOutside : null,
                            selectedStart || selectedEnd ? styles.calendarDayTextSelected : null,
                          ]}
                        >
                          {day.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.tagsCard}>
            <View style={styles.tagHeader}>
              <Text style={styles.tagTitle}>旅行风格</Text>
              <Text style={styles.tagMeta}>{selectedCount > 0 ? `已选 ${selectedCount}` : "可直接点选"}</Text>
            </View>
            <View style={styles.tagWrap}>
              {styleTags.map((item) => {
                const active = selectedStyles.includes(item);
                return (
                  <Pressable
                    key={item}
                    style={[styles.tagChip, active ? styles.tagChipActive : null]}
                    onPress={() => onToggleStyle(item)}
                  >
                    <Text style={[styles.tagChipText, active ? styles.tagChipTextActive : null]}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.inputCard}>
            <Pressable style={styles.rowButton} onPress={onToggleNote}>
              <Text style={planningNote ? styles.rowValue : styles.rowPlaceholder}>
                {planningNote ? "补充要求已填写" : "补充要求（可选）"}
              </Text>
            </Pressable>
            {noteOpen ? (
              <View style={styles.inlinePanel}>
                <TextInput
                  style={styles.noteInput}
                  value={planningNote}
                  onChangeText={onChangePlanningNote}
                  multiline
                  placeholder="例如：雨天也能玩，多一点本地餐馆"
                  placeholderTextColor="#93a5b3"
                  textAlignVertical="top"
                />
              </View>
            ) : null}
          </View>

          <Pressable style={styles.primaryButton} onPress={onPressGenerate}>
            <Text style={styles.primaryButtonText}>开始生成</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetShell: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetCard: {
    maxHeight: "66%",
    minHeight: "50%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "rgba(250,252,255,0.97)",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.82)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -10 },
  },
  content: {
    gap: 10,
    paddingBottom: 10,
  },
  handle: {
    alignSelf: "center",
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d6dee8",
    marginBottom: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    color: "#122235",
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    color: "#76889a",
    fontSize: 12,
    lineHeight: 18,
  },
  meta: {
    color: "#7b8ca0",
    fontSize: 11,
    fontWeight: "700",
  },
  topHintWrap: {
    borderRadius: 16,
    backgroundColor: "#edf4fb",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  topHintText: {
    color: "#50657b",
    fontSize: 12,
    fontWeight: "700",
  },
  inputCard: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2ebf3",
    overflow: "hidden",
  },
  inputCardFocus: {
    borderColor: "#165dff",
  },
  rowButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowValue: {
    color: "#1c3348",
    fontSize: 14,
    fontWeight: "700",
  },
  rowPlaceholder: {
    color: "#93a4b6",
    fontSize: 14,
    fontWeight: "700",
  },
  inlinePanel: {
    borderTopWidth: 1,
    borderTopColor: "#e7edf4",
    padding: 12,
    gap: 10,
  },
  searchInput: {
    borderRadius: 14,
    backgroundColor: "#f4f8fd",
    borderWidth: 1,
    borderColor: "#dbe7f2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#173051",
    fontSize: 15,
    fontWeight: "600",
  },
  searchStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchStatusText: {
    color: "#6a7f95",
    fontSize: 12,
    lineHeight: 18,
  },
  searchResult: {
    borderRadius: 14,
    backgroundColor: "#f8fbff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e5edf5",
  },
  searchResultTitle: {
    color: "#173051",
    fontSize: 14,
    fontWeight: "800",
  },
  searchResultMeta: {
    marginTop: 4,
    color: "#72869a",
    fontSize: 12,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calendarNavButton: {
    borderRadius: 12,
    backgroundColor: "#eef4fb",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  calendarNavText: {
    color: "#51667b",
    fontSize: 12,
    fontWeight: "700",
  },
  calendarTitle: {
    color: "#152739",
    fontSize: 15,
    fontWeight: "800",
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: "center",
    color: "#8a9bad",
    fontSize: 12,
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarDay: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  calendarDayOutside: {
    opacity: 0.45,
  },
  calendarDayInRange: {
    backgroundColor: "#e8f0ff",
  },
  calendarDaySelected: {
    backgroundColor: "#111827",
  },
  calendarDayText: {
    color: "#203246",
    fontSize: 13,
    fontWeight: "700",
  },
  calendarDayTextOutside: {
    color: "#90a0b2",
  },
  calendarDayTextSelected: {
    color: "#ffffff",
  },
  tagsCard: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2ebf3",
    padding: 14,
    gap: 10,
  },
  tagHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tagTitle: {
    color: "#152739",
    fontSize: 14,
    fontWeight: "800",
  },
  tagMeta: {
    color: "#7a8c9f",
    fontSize: 11,
    fontWeight: "700",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderRadius: 999,
    backgroundColor: "#eef4fb",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagChipActive: {
    backgroundColor: "#111827",
  },
  tagChipText: {
    color: "#50657b",
    fontSize: 12,
    fontWeight: "700",
  },
  tagChipTextActive: {
    color: "#ffffff",
  },
  noteInput: {
    minHeight: 96,
    borderRadius: 14,
    backgroundColor: "#f4f8fd",
    borderWidth: 1,
    borderColor: "#dbe7f2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#173051",
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: "top",
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: "#111827",
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});
