import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { defaultStartDate, formatISODate } from "../../utils/date";

type DatePickerSheetProps = {
  visible: boolean;
  startDate: string;
  days: number;
  flexibleDays: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSelectStartDate: (value: string) => void;
  onSelectDays: (value: number) => void;
  onToggleFlexibleDays: () => void;
};

function addDays(base: string, count: number): string {
  const parsed = Date.parse(base || "");
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date(defaultStartDate(15));
  date.setDate(date.getDate() + count);
  return formatISODate(date);
}

function displayDate(value: string): string {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return value || "--";
  const date = new Date(parsed);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
  return `${month}.${day} ${weekday}`;
}

export function DatePickerSheet({
  visible,
  startDate,
  days,
  flexibleDays,
  onClose,
  onConfirm,
  onSelectStartDate,
  onSelectDays,
  onToggleFlexibleDays,
}: DatePickerSheetProps) {
  const quickDates = useMemo(() => {
    const base = startDate || defaultStartDate(15);
    return Array.from({ length: 7 }, (_, idx) => addDays(base, idx));
  }, [startDate]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>你想去多久？</Text>
          <Pressable style={[styles.flexToggle, flexibleDays ? styles.flexToggleActive : null]} onPress={onToggleFlexibleDays}>
            <View style={[styles.flexKnob, flexibleDays ? styles.flexKnobActive : null]} />
            <Text style={[styles.flexText, flexibleDays ? styles.flexTextActive : null]}>灵活天数</Text>
          </Pressable>
        </View>

        <Text style={styles.zoneText}>时区：北京 GMT +8:00</Text>

        <Text style={styles.sectionLabel}>近 7 天快捷选择</Text>
        <View style={styles.quickDateWrap}>
          {quickDates.map((item) => {
            const active = item === startDate;
            return (
              <Pressable
                key={item}
                style={[styles.quickDateChip, active ? styles.quickDateChipActive : null]}
                onPress={() => onSelectStartDate(item)}
              >
                <Text style={[styles.quickDateText, active ? styles.quickDateTextActive : null]}>{displayDate(item)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>行程天数</Text>
        <View style={styles.daysRow}>
          {[2, 3, 4, 5, 6].map((item) => {
            const active = item === days;
            return (
              <Pressable
                key={`duration-${item}`}
                style={[styles.dayChip, active ? styles.dayChipActive : null]}
                onPress={() => onSelectDays(item)}
              >
                <Text style={[styles.dayChipText, active ? styles.dayChipTextActive : null]}>{item} 天</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.summaryText}>
          {flexibleDays ? `大约 ${days} 天，从 ${displayDate(startDate)} 开始` : `${displayDate(startDate)} 开始，共 ${days} 天`}
        </Text>

        <Pressable style={styles.confirmButton} onPress={onConfirm}>
          <Text style={styles.confirmButtonText}>确定</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,12,22,0.22)",
  },
  sheet: {
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d6dfe8",
  },
  headerRow: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  title: {
    color: "#0a1320",
    fontSize: 24,
    fontWeight: "800",
  },
  flexToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    backgroundColor: "#f1f4f7",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  flexToggleActive: {
    backgroundColor: "#e6fbff",
  },
  flexKnob: {
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "#d1d8df",
  },
  flexKnobActive: {
    backgroundColor: "#0fc2dd",
  },
  flexText: {
    color: "#758899",
    fontSize: 13,
    fontWeight: "700",
  },
  flexTextActive: {
    color: "#0c7181",
  },
  zoneText: {
    marginTop: 14,
    color: "#9aa9b6",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionLabel: {
    marginTop: 24,
    color: "#0f1722",
    fontSize: 14,
    fontWeight: "800",
  },
  quickDateWrap: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickDateChip: {
    borderRadius: 18,
    backgroundColor: "#f5f8fb",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickDateChipActive: {
    backgroundColor: "#0d1218",
  },
  quickDateText: {
    color: "#52667a",
    fontSize: 13,
    fontWeight: "700",
  },
  quickDateTextActive: {
    color: "#ffffff",
  },
  daysRow: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dayChip: {
    borderRadius: 18,
    backgroundColor: "#f4f7fb",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dayChipActive: {
    backgroundColor: "#0d1218",
  },
  dayChipText: {
    color: "#536678",
    fontSize: 14,
    fontWeight: "700",
  },
  dayChipTextActive: {
    color: "#ffffff",
  },
  summaryText: {
    marginTop: 18,
    color: "#65798a",
    fontSize: 14,
    lineHeight: 21,
  },
  confirmButton: {
    marginTop: 26,
    borderRadius: 24,
    backgroundColor: "#0b0f14",
    paddingVertical: 16,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
});
