import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { DiscoverDraftSeed } from "../types/discover";

type DiscoverScreenProps = {
  onStartPlanning: () => void;
  onApplyDraft?: (seed: DiscoverDraftSeed) => void;
};

const topics = [
  { id: "weekend", title: "周末轻旅行", subtitle: "2 天可执行路线", mustGo: ["城市地标"], travelStyles: ["周末"], destination: "" },
  { id: "citywalk", title: "城市漫游", subtitle: "步行优先，不赶路", mustGo: ["老街", "步行街"], travelStyles: ["citywalk"], destination: "" },
  { id: "food", title: "美食专线", subtitle: "餐馆+打卡点联动", mustGo: ["本地小馆"], travelStyles: ["美食"], destination: "" },
  { id: "night", title: "夜游氛围", subtitle: "晚间路线更出片", mustGo: ["夜景地标"], travelStyles: ["夜游"], destination: "" },
];

type NearbyIdea = {
  id: string;
  text: string;
  mustGo: string[];
  travelStyles: string[];
};

const defaultNearbyIdeas: NearbyIdea[] = [
  { id: "park", text: "地铁可达的自然公园", mustGo: ["城市公园"], travelStyles: ["自然"] },
  { id: "rain", text: "适合雨天的室内路线", mustGo: ["博物馆"], travelStyles: ["雨天"] },
  { id: "food", text: "低预算但评分高的餐馆", mustGo: ["本地餐馆"], travelStyles: ["美食"] },
  { id: "subcenter", text: "可当天往返的城市副中心", mustGo: ["城市副中心"], travelStyles: ["当天往返"] },
];

function inferDestinationFromKeyword(keyword: string): string {
  const text = String(keyword || "").trim();
  if (!text) return "";

  const knownCities = ["上海", "北京", "杭州", "苏州", "南京", "成都", "重庆", "广州", "深圳", "西安", "青岛", "厦门", "武汉", "长沙"];
  for (const city of knownCities) {
    if (text.includes(city)) return city;
  }

  const firstToken = text
    .split(/[\s,，/、]/g)
    .map((item) => item.trim())
    .find(Boolean);
  if (!firstToken) return "";

  const stripped = firstToken.replace(/(旅游|旅行|攻略|citywalk|周末|美食|夜游)$/i, "").trim();
  return stripped.length >= 2 && stripped.length <= 12 ? stripped : "";
}

function buildKeywordMustGo(keyword: string): string[] {
  const text = String(keyword || "").trim();
  if (!text) return [];
  const out = new Set<string>();
  const patterns = [/[\u4e00-\u9fa5A-Za-z0-9]{2,20}(?:公园|老街|博物馆|古镇|步行街|广场|寺|庙|塔|湖|山|岛|乐园|景区|景点|餐馆|夜市|书店)/g];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      const value = match.trim();
      if (value) out.add(value);
    }
  }
  return Array.from(out).slice(0, 5);
}

export function DiscoverScreen({ onStartPlanning, onApplyDraft }: DiscoverScreenProps) {
  const [keyword, setKeyword] = useState("");
  const [nearbyIdeas, setNearbyIdeas] = useState<NearbyIdea[]>(defaultNearbyIdeas);
  const [nearbyStatus, setNearbyStatus] = useState("正在生成附近建议...");
  const [isLocating, setIsLocating] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrateNearbyIdeas() {
      setIsLocating(true);
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          if (!cancelled) {
            setNearbyStatus("未开启定位，展示通用建议");
            setNearbyIdeas(defaultNearbyIdeas);
          }
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const geoList = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        const geo = geoList[0];

        const city = String(geo?.city || geo?.subregion || geo?.region || "附近").trim();
        const district = String(geo?.district || geo?.name || "").trim();
        const areaName = district ? `${city}${district}` : city;

        const dynamicNearby: NearbyIdea[] = [
          {
            id: "local-citywalk",
            text: `${areaName} 可直接出发的 citywalk 线路`,
            mustGo: [district ? `${district}步行街` : `${city}步行街`],
            travelStyles: ["citywalk"],
          },
          {
            id: "local-food",
            text: `${areaName} 口碑餐馆 + 打卡点联动`,
            mustGo: [district ? `${district}本地餐馆` : `${city}本地餐馆`],
            travelStyles: ["美食"],
          },
          {
            id: "local-rain",
            text: `${city} 雨天也可执行的室内路线`,
            mustGo: [`${city}博物馆`],
            travelStyles: ["雨天"],
          },
          {
            id: "local-night",
            text: `${city} 晚间可执行的夜游氛围线`,
            mustGo: [`${city}夜景地标`],
            travelStyles: ["夜游"],
          },
        ];

        if (!cancelled) {
          setNearbyIdeas(dynamicNearby);
          setNearbyStatus(`已按当前位置生成：${areaName}`);
        }
      } catch {
        if (!cancelled) {
          setNearbyIdeas(defaultNearbyIdeas);
          setNearbyStatus("定位失败，展示通用建议");
        }
      } finally {
        if (!cancelled) {
          setIsLocating(false);
        }
      }
    }

    void hydrateNearbyIdeas();
    return () => {
      cancelled = true;
    };
  }, []);

  function applySearchDraft() {
    const destination = inferDestinationFromKeyword(keyword);
    const mustGo = buildKeywordMustGo(keyword);
    onApplyDraft?.({
      source: "search",
      keyword: keyword.trim(),
      destination,
      mustGo,
      travelStyles: keyword.includes("美食") ? ["美食"] : [],
    });
  }

  function applyTopicDraft(topic: (typeof topics)[number]) {
    onApplyDraft?.({
      source: "topic",
      keyword: topic.title,
      destination: topic.destination,
      mustGo: topic.mustGo,
      travelStyles: topic.travelStyles,
    });
  }

  function applyNearbyDraft(item: NearbyIdea) {
    onApplyDraft?.({
      source: "nearby",
      keyword: item.text,
      mustGo: item.mustGo,
      travelStyles: item.travelStyles,
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTag}>发现</Text>
        <Text style={styles.heroTitle}>今天可出发的地图行程</Text>
        <Text style={styles.heroSub}>先找灵感，再一键去地图规划。</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>搜索</Text>
        <TextInput
          style={styles.input}
          value={keyword}
          onChangeText={setKeyword}
          placeholder="输入城市或关键词"
        />
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={onStartPlanning}>
            <Text style={styles.secondaryButtonText}>去地图规划</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.primaryButtonInline]}
            onPress={applySearchDraft}
            disabled={!keyword.trim()}
          >
            <Text style={styles.primaryButtonText}>加入草案</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>专题</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicRow}>
          {topics.map((topic) => (
            <Pressable key={topic.id} style={styles.topicCard} onPress={() => applyTopicDraft(topic)}>
              <Text style={styles.topicTitle}>{topic.title}</Text>
              <Text style={styles.topicSub}>{topic.subtitle}</Text>
              <Text style={styles.topicAction}>加入草案</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>附近建议</Text>
        <View style={styles.nearbyStatusRow}>
          {isLocating ? <ActivityIndicator size="small" color="#2f6ae5" /> : null}
          <Text style={styles.nearbyStatusText}>{nearbyStatus}</Text>
        </View>
        <View style={styles.nearbyList}>
          {nearbyIdeas.map((idea) => (
            <View key={idea.id} style={styles.nearbyItem}>
              <Text style={styles.nearbyText}>{idea.text}</Text>
              <Pressable style={styles.nearbyActionButton} onPress={() => applyNearbyDraft(idea)}>
                <Text style={styles.nearbyActionText}>加入草案</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#edf3ff",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  hero: {
    borderRadius: 20,
    backgroundColor: "#122846",
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6,
  },
  heroTag: {
    color: "#8fc1ff",
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    color: "#f4f8ff",
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 30,
  },
  heroSub: {
    color: "#c5d8f3",
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dde7f5",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10,
  },
  cardTitle: {
    color: "#1f3550",
    fontSize: 15,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d4dfef",
    backgroundColor: "#f9fbff",
    color: "#1f3550",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primaryButton: {
    borderRadius: 10,
    backgroundColor: "#2a66df",
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonInline: {
    flex: 1,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ccd9ee",
    backgroundColor: "#f1f6ff",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#2e527f",
    fontSize: 13,
    fontWeight: "700",
  },
  topicRow: {
    gap: 10,
    paddingRight: 8,
  },
  topicCard: {
    width: 144,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dce7f6",
    backgroundColor: "#f8fbff",
    paddingHorizontal: 10,
    paddingVertical: 11,
    gap: 4,
  },
  topicTitle: {
    color: "#1f3d63",
    fontSize: 14,
    fontWeight: "700",
  },
  topicSub: {
    color: "#5c7491",
    fontSize: 12,
    lineHeight: 16,
  },
  topicAction: {
    marginTop: 2,
    color: "#2e61d0",
    fontSize: 11,
    fontWeight: "700",
  },
  nearbyList: {
    gap: 8,
  },
  nearbyStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  nearbyStatusText: {
    flex: 1,
    color: "#597292",
    fontSize: 12,
    lineHeight: 17,
  },
  nearbyItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e4ebf8",
    backgroundColor: "#f8fbff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nearbyText: {
    flex: 1,
    color: "#355170",
    fontSize: 13,
  },
  nearbyActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cfdbf1",
    backgroundColor: "#f1f6ff",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  nearbyActionText: {
    color: "#2c5fcf",
    fontSize: 11,
    fontWeight: "700",
  },
});
