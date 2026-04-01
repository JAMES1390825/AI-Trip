import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type QuickOptimizeOptions = {
  lessWalking: boolean;
  moreFood: boolean;
  rainFriendly: boolean;
  compressHalfDay: boolean;
  keepLocked: boolean;
};

type QuickOptimizeSheetProps = {
  visible: boolean;
  dayLabel: string;
  onClose: () => void;
  onSubmit: (options: QuickOptimizeOptions) => void;
};

const defaultOptions: QuickOptimizeOptions = {
  lessWalking: true,
  moreFood: false,
  rainFriendly: false,
  compressHalfDay: false,
  keepLocked: true,
};

type OptimizeOptionConfig = {
  key: keyof QuickOptimizeOptions;
  label: string;
};

const optionConfigs: OptimizeOptionConfig[] = [
  { key: "lessWalking", label: "尽量少走路" },
  { key: "moreFood", label: "多安排美食" },
  { key: "rainFriendly", label: "改成雨天也能走" },
  { key: "compressHalfDay", label: "压缩到半天" },
  { key: "keepLocked", label: "保留已锁定点位" },
];

export function QuickOptimizeSheet({ visible, dayLabel, onClose, onSubmit }: QuickOptimizeSheetProps) {
  const [options, setOptions] = useState<QuickOptimizeOptions>(defaultOptions);

  useEffect(() => {
    if (!visible) return;
    setOptions(defaultOptions);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>快速优化今天</Text>

        <View style={styles.optionList}>
          {optionConfigs.map((item) => {
            const active = options[item.key];
            return (
              <Pressable
                key={item.key}
                style={[styles.optionRow, active ? styles.optionRowActive : null]}
                onPress={() => setOptions((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
              >
                <View style={[styles.checkDot, active ? styles.checkDotActive : null]} />
                <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.scopeText}>影响范围：{dayLabel} 当前行程窗口，默认保护已锁定点位。</Text>

        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>取消</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => onSubmit(options)}>
            <Text style={styles.primaryButtonText}>开始优化</Text>
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
    zIndex: 28,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,15,24,0.24)",
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: "#ffffff",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 26,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d4dde5",
  },
  title: {
    marginTop: 20,
    color: "#0d1723",
    fontSize: 23,
    fontWeight: "800",
  },
  optionList: {
    marginTop: 22,
    gap: 10,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#f5f8fb",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionRowActive: {
    backgroundColor: "#eefcff",
  },
  checkDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#d1dae3",
  },
  checkDotActive: {
    backgroundColor: "#12c5dd",
  },
  optionText: {
    color: "#415567",
    fontSize: 15,
    fontWeight: "700",
  },
  optionTextActive: {
    color: "#0c1723",
  },
  scopeText: {
    marginTop: 20,
    color: "#718392",
    fontSize: 14,
    lineHeight: 21,
  },
  actionRow: {
    marginTop: 24,
    flexDirection: "row",
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "#eef4fb",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
  },
  secondaryButtonText: {
    color: "#102033",
    fontSize: 15,
    fontWeight: "800",
  },
  primaryButton: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "#0d1117",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
});
