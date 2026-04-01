import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CommunityAuthorPublicProfile } from "../../types/plan";

type CommunityAuthorSheetProps = {
  visible: boolean;
  loading?: boolean;
  profile: CommunityAuthorPublicProfile | null;
  onClose: () => void;
  onSelectPost: (postId: string) => void;
};

export function CommunityAuthorSheet({
  visible,
  loading = false,
  profile,
  onClose,
  onSelectPost,
}: CommunityAuthorSheetProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.headerRow}>
          <View style={styles.handle} />
          <Pressable hitSlop={10} onPress={onClose}>
            <Text style={styles.closeText}>关闭</Text>
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {loading || !profile ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>{loading ? "加载作者公开资料中..." : "暂时没有作者资料。"}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{profile.display_name || "旅行者"}</Text>
              <Text style={styles.meta}>
                已发布 {profile.published_post_count} 条 · 被参考 {profile.reference_count} 次 · 获得帮助 {profile.helpful_count}
              </Text>

              {profile.destinations.length > 0 ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>常分享目的地</Text>
                  {profile.destinations.map((item) => (
                    <Text key={`${item.destination_id}-${item.destination_label}`} style={styles.cardText}>
                      {item.destination_label || item.destination_id} · {item.post_count} 条
                    </Text>
                  ))}
                </View>
              ) : null}

              {profile.top_tags.length > 0 ? (
                <View style={styles.tagWrap}>
                  {profile.top_tags.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>最近公开分享</Text>
                <View style={styles.postWrap}>
                  {profile.recent_posts.map((item) => (
                    <Pressable key={item.id} style={styles.postCard} onPress={() => onSelectPost(item.id)}>
                      <Text style={styles.postTitle}>{item.title}</Text>
                      <Text style={styles.postMeta}>
                        {item.destination_label || "未命名目的地"} · 被参考 {item.reference_count || 0} 次
                      </Text>
                      <Text numberOfLines={2} style={styles.postText}>
                        {item.content || "作者的结构化旅行分享。"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 41,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 14, 24, 0.3)",
  },
  sheet: {
    maxHeight: "82%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 22,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#d5dee8",
  },
  closeText: {
    color: "#425870",
    fontSize: 14,
    fontWeight: "700",
  },
  content: {
    paddingTop: 14,
    gap: 12,
  },
  loadingCard: {
    borderRadius: 18,
    backgroundColor: "#f4f8fd",
    padding: 16,
  },
  loadingText: {
    color: "#5d748a",
    fontSize: 14,
    lineHeight: 21,
  },
  title: {
    color: "#10253b",
    fontSize: 23,
    fontWeight: "800",
  },
  meta: {
    color: "#667d92",
    fontSize: 13,
    fontWeight: "700",
  },
  card: {
    borderRadius: 18,
    backgroundColor: "#f7fbff",
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    color: "#10253b",
    fontSize: 16,
    fontWeight: "800",
  },
  cardText: {
    color: "#466078",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderRadius: 14,
    backgroundColor: "#edf4ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: "#2b5a91",
    fontSize: 12,
    fontWeight: "700",
  },
  postWrap: {
    gap: 10,
  },
  postCard: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 6,
  },
  postTitle: {
    color: "#112439",
    fontSize: 14,
    fontWeight: "800",
  },
  postMeta: {
    color: "#6b8298",
    fontSize: 12,
    fontWeight: "700",
  },
  postText: {
    color: "#556f85",
    fontSize: 13,
    lineHeight: 19,
  },
});
