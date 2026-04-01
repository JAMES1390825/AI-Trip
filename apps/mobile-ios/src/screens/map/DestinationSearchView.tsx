import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { TripApiClient } from "../../api/client";
import { RUNTIME_CONFIG } from "../../config/runtime";
import type { DestinationEntity } from "../../types/plan";

type DestinationSearchViewProps = {
  initialQuery: string;
  onBack: () => void;
  onSelectDestination: (value: DestinationEntity) => void;
};

const destinationCandidates: DestinationEntity[] = [
  {
    destination_id: "builtin:cn-beijing",
    destination_label: "北京市",
    country: "中国",
    region: "北京",
    adcode: "110000",
    city_code: "010",
    center_lat: 39.9042,
    center_lng: 116.4074,
    provider: "builtin",
    provider_place_id: "cn-beijing",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-nanjing",
    destination_label: "南京市",
    country: "中国",
    region: "江苏",
    adcode: "320100",
    city_code: "025",
    center_lat: 32.0603,
    center_lng: 118.7969,
    provider: "builtin",
    provider_place_id: "cn-nanjing",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-hangzhou",
    destination_label: "杭州市",
    country: "中国",
    region: "浙江",
    adcode: "330100",
    city_code: "0571",
    center_lat: 30.2741,
    center_lng: 120.1551,
    provider: "builtin",
    provider_place_id: "cn-hangzhou",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-shanghai",
    destination_label: "上海市",
    country: "中国",
    region: "上海",
    adcode: "310000",
    city_code: "021",
    center_lat: 31.2304,
    center_lng: 121.4737,
    provider: "builtin",
    provider_place_id: "cn-shanghai",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-suzhou",
    destination_label: "苏州市",
    country: "中国",
    region: "江苏",
    adcode: "320500",
    city_code: "0512",
    center_lat: 31.2989,
    center_lng: 120.5853,
    provider: "builtin",
    provider_place_id: "cn-suzhou",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-chengdu",
    destination_label: "成都市",
    country: "中国",
    region: "四川",
    adcode: "510100",
    city_code: "028",
    center_lat: 30.5728,
    center_lng: 104.0668,
    provider: "builtin",
    provider_place_id: "cn-chengdu",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-chongqing",
    destination_label: "重庆市",
    country: "中国",
    region: "重庆",
    adcode: "500000",
    city_code: "023",
    center_lat: 29.563,
    center_lng: 106.5516,
    provider: "builtin",
    provider_place_id: "cn-chongqing",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-xian",
    destination_label: "西安市",
    country: "中国",
    region: "陕西",
    adcode: "610100",
    city_code: "029",
    center_lat: 34.3416,
    center_lng: 108.9398,
    provider: "builtin",
    provider_place_id: "cn-xian",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-guangzhou",
    destination_label: "广州市",
    country: "中国",
    region: "广东",
    adcode: "440100",
    city_code: "020",
    center_lat: 23.1291,
    center_lng: 113.2644,
    provider: "builtin",
    provider_place_id: "cn-guangzhou",
    match_type: "city",
  },
  {
    destination_id: "builtin:cn-shenzhen",
    destination_label: "深圳市",
    country: "中国",
    region: "广东",
    adcode: "440300",
    city_code: "0755",
    center_lat: 22.5431,
    center_lng: 114.0579,
    provider: "builtin",
    provider_place_id: "cn-shenzhen",
    match_type: "city",
  },
  {
    destination_id: "builtin:jp-tokyo",
    destination_label: "东京都",
    country: "日本",
    region: "东京都",
    adcode: "jp-13",
    city_code: "03",
    center_lat: 35.6762,
    center_lng: 139.6503,
    provider: "builtin",
    provider_place_id: "jp-tokyo",
    match_type: "city",
  },
  {
    destination_id: "builtin:jp-kyoto",
    destination_label: "京都市",
    country: "日本",
    region: "京都府",
    adcode: "jp-26",
    city_code: "075",
    center_lat: 35.0116,
    center_lng: 135.7681,
    provider: "builtin",
    provider_place_id: "jp-kyoto",
    match_type: "city",
  },
  {
    destination_id: "builtin:jp-osaka",
    destination_label: "大阪市",
    country: "日本",
    region: "大阪府",
    adcode: "jp-27",
    city_code: "06",
    center_lat: 34.6937,
    center_lng: 135.5023,
    provider: "builtin",
    provider_place_id: "jp-osaka",
    match_type: "city",
  },
  {
    destination_id: "builtin:kr-seoul",
    destination_label: "首尔",
    country: "韩国",
    region: "首尔",
    adcode: "kr-11",
    city_code: "02",
    center_lat: 37.5665,
    center_lng: 126.978,
    provider: "builtin",
    provider_place_id: "kr-seoul",
    match_type: "city",
  },
];

export function DestinationSearchView({ initialQuery, onBack, onSelectDestination }: DestinationSearchViewProps) {
  const api = useMemo(() => new TripApiClient(() => RUNTIME_CONFIG), []);
  const [query, setQuery] = useState(initialQuery);
  const [remoteResults, setRemoteResults] = useState<DestinationEntity[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    const trimmed = query.trim();

    if (!trimmed) {
      setRemoteResults(null);
      setIsLoading(false);
      setStatus("");
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      void (async () => {
        setIsLoading(true);
        try {
          const response = await api.resolveDestinations(trimmed, 10);
          if (cancelled) return;
          const items = response.items.filter((item) => Boolean(item.destination_label?.trim()));
          setRemoteResults(items.length ? items : null);
          if (response.degraded && items.length > 0) {
            setStatus("当前没有匹配到标准城市，已回退为自定义目的地，后续还需要继续确认。");
          } else {
            setStatus(items.length ? "" : "接口暂无更匹配的城市，已回退本地候选");
          }
        } catch {
          if (cancelled) return;
          setRemoteResults(null);
          setStatus("搜索接口暂不可用，当前展示本地候选");
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, query]);

  const localResults = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return destinationCandidates;
    return destinationCandidates.filter((item) => {
      const joined =
        `${item.destination_label} ${item.country} ${item.region} ${item.adcode} ${item.city_code} ${item.provider_place_id} ${item.destination_id}`.toLowerCase();
      return joined.includes(text);
    });
  }, [query]);

  const results = remoteResults && remoteResults.length ? remoteResults : localResults;

  const showFreeInput =
    query.trim().length >= 2 && !results.some((item) => item.destination_label.trim() === query.trim());

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}>
          <Text style={styles.backText}>返回</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>你想去哪里？</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="输入城市 / 景点关键词"
          placeholderTextColor="#8fa3b4"
          autoFocus
        />
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#14c3dc" />
            <Text style={styles.loadingText}>正在搜索更匹配的目的地...</Text>
          </View>
        ) : null}

        {status ? <Text style={styles.statusText}>{status}</Text> : null}

        {showFreeInput ? (
          <Pressable style={styles.item} onPress={() => onSelectDestination(buildCustomDestination(query.trim()))}>
            <Text style={styles.itemTitle}>使用 “{query.trim()}” 作为目的地</Text>
            <Text style={styles.itemSubtitle}>自定义输入，后续需要先确认具体城市或区域</Text>
          </Pressable>
        ) : null}

        {results.map((item) => (
          <Pressable key={item.destination_id} style={styles.item} onPress={() => onSelectDestination(item)}>
            <Text style={styles.itemTitle}>{item.destination_label}</Text>
            <Text style={styles.itemSubtitle}>{buildDestinationSubtitle(item)}</Text>
          </Pressable>
        ))}

        {!results.length && !showFreeInput ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>暂无匹配结果</Text>
            <Text style={styles.emptyText}>可以试试输入城市简称，或者直接用关键词作为目的地。</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function buildCustomDestination(label: string): DestinationEntity {
  const trimmed = label.trim();
  return {
    destination_id: `custom:${trimmed}`,
    destination_label: trimmed,
    country: "",
    region: "",
    adcode: "",
    city_code: "",
    center_lat: 0,
    center_lng: 0,
    provider: "custom",
    provider_place_id: "",
    match_type: "custom",
  };
}

function buildDestinationSubtitle(item: DestinationEntity): string {
  if (item.match_type === "custom") {
    return "自定义输入，后续需要先确认具体城市或区域";
  }

  const location = [item.country, item.region].filter(Boolean).join(" · ");
  const cityCodeText = item.city_code ? `区号 ${item.city_code}` : "";
  return [location, cityCodeText].filter(Boolean).join(" · ") || "标准目的地";
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eef9ff",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  backText: {
    color: "#14263b",
    fontSize: 15,
    fontWeight: "700",
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 18,
  },
  heroTitle: {
    color: "#08131f",
    fontSize: 26,
    fontWeight: "800",
  },
  searchInput: {
    marginTop: 18,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 15,
    fontSize: 18,
    fontWeight: "600",
    color: "#102033",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    color: "#5f7587",
    fontSize: 13,
    fontWeight: "700",
  },
  statusText: {
    paddingBottom: 6,
    color: "#6e8496",
    fontSize: 13,
    lineHeight: 20,
  },
  item: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,31,48,0.06)",
  },
  itemTitle: {
    color: "#101c28",
    fontSize: 20,
    fontWeight: "800",
  },
  itemSubtitle: {
    marginTop: 6,
    color: "#778b9b",
    fontSize: 14,
  },
  emptyCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 18,
    marginTop: 14,
  },
  emptyTitle: {
    color: "#0f1722",
    fontSize: 17,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 8,
    color: "#6d8193",
    fontSize: 14,
    lineHeight: 21,
  },
});
