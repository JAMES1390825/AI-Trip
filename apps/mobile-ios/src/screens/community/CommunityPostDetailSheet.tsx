import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CommunityPostDetail } from "../../types/plan";

type CommunityPostDetailSheetProps = {
  visible: boolean;
  loading?: boolean;
  detail: CommunityPostDetail | null;
  onClose: () => void;
  onReference: (detail: CommunityPostDetail) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenRelated: (postId: string) => void;
  onHelpful: (postId: string) => void;
  onWantToGo: (postId: string) => void;
  onReport: (postId: string) => void;
};

export function CommunityPostDetailSheet({
  visible,
  loading = false,
  detail,
  onClose,
  onReference,
  onOpenAuthor,
  onOpenRelated,
  onHelpful,
  onWantToGo,
  onReport,
}: CommunityPostDetailSheetProps) {
  if (!visible) return null;

  const post = detail?.post || null;

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
          {loading || !post ? (
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>{loading ? "加载帖子详情中..." : "暂时没有帖子详情。"}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{post.title || "社区分享"}</Text>
              <Text style={styles.meta}>
                {post.destination_label || "未命名目的地"} · 被参考 {detail?.reference_count || 0} 次 · 帮助 {post.vote_summary.helpful_count}
              </Text>

              {post.image_urls[0] ? <Image source={{ uri: post.image_urls[0] }} style={styles.heroImage} resizeMode="cover" /> : null}

              <View style={styles.actionRow}>
                <Pressable style={styles.primaryButton} onPress={() => detail && onReference(detail)}>
                  <Text style={styles.primaryButtonText}>参考这条去 AI 规划</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => onHelpful(post.id)}>
                  <Text style={styles.secondaryButtonText}>有帮助</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => onWantToGo(post.id)}>
                  <Text style={styles.secondaryButtonText}>想去</Text>
                </Pressable>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>分享正文</Text>
                <Text style={styles.cardText}>{post.content || "作者主要通过地点、标签和图片分享这次路线经验。"}</Text>
              </View>

              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>作者公开资料</Text>
                  <Pressable onPress={() => onOpenAuthor(post.user_id)}>
                    <Text style={styles.linkText}>{detail?.author.display_name || "查看作者"}</Text>
                  </Pressable>
                </View>
                <Text style={styles.cardText}>
                  {detail?.author.display_name || "旅行者"} · 已发布 {detail?.author.published_post_count || 0} 条 · 被参考{" "}
                  {detail?.author.reference_count || 0} 次
                </Text>
                {detail?.author.top_tags?.length ? <Text style={styles.cardText}>常见标签：{detail.author.top_tags.join(" / ")}</Text> : null}
              </View>

              {post.favorite_restaurants.length > 0 || post.favorite_attractions.length > 0 ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>结构化经验</Text>
                  {post.favorite_restaurants.length > 0 ? (
                    <Text style={styles.cardText}>喜欢的餐厅：{post.favorite_restaurants.join("、")}</Text>
                  ) : null}
                  {post.favorite_attractions.length > 0 ? (
                    <Text style={styles.cardText}>喜欢的景点：{post.favorite_attractions.join("、")}</Text>
                  ) : null}
                </View>
              ) : null}

              {post.tags.length > 0 ? (
                <View style={styles.tagWrap}>
                  {post.tags.map((tag) => (
                    <View key={`${post.id}-${tag}`} style={styles.tagChip}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {detail?.related_posts?.length ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>相关分享</Text>
                  <View style={styles.relatedWrap}>
                    {detail.related_posts.map((item) => (
                      <Pressable key={item.id} style={styles.relatedCard} onPress={() => onOpenRelated(item.id)}>
                        <Text style={styles.relatedTitle}>{item.title}</Text>
                        <Text numberOfLines={2} style={styles.relatedText}>
                          {item.content || "同城公开分享"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              <Pressable style={styles.reportButton} onPress={() => onReport(post.id)}>
                <Text style={styles.reportButtonText}>举报这条分享</Text>
              </Pressable>
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
    zIndex: 40,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4, 14, 24, 0.3)",
  },
  sheet: {
    maxHeight: "88%",
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
    color: "#0e1f33",
    fontSize: 23,
    fontWeight: "800",
  },
  meta: {
    color: "#647d95",
    fontSize: 13,
    fontWeight: "700",
  },
  heroImage: {
    width: "100%",
    height: 188,
    borderRadius: 18,
    backgroundColor: "#edf4fb",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: "#163259",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: 14,
    backgroundColor: "#edf4ff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#28528a",
    fontSize: 13,
    fontWeight: "800",
  },
  card: {
    borderRadius: 18,
    backgroundColor: "#f7fbff",
    padding: 14,
    gap: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: {
    color: "#10253b",
    fontSize: 16,
    fontWeight: "800",
  },
  cardText: {
    color: "#435d75",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },
  linkText: {
    color: "#2a5ea0",
    fontSize: 13,
    fontWeight: "800",
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
    color: "#2a5a95",
    fontSize: 12,
    fontWeight: "700",
  },
  relatedWrap: {
    gap: 10,
  },
  relatedCard: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 6,
  },
  relatedTitle: {
    color: "#112439",
    fontSize: 14,
    fontWeight: "800",
  },
  relatedText: {
    color: "#5b7388",
    fontSize: 13,
    lineHeight: 19,
  },
  reportButton: {
    alignSelf: "flex-start",
    borderRadius: 14,
    backgroundColor: "#fff0ee",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reportButtonText: {
    color: "#b64a3f",
    fontSize: 13,
    fontWeight: "800",
  },
});
