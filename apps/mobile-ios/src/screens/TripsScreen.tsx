import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { TripApiClient } from "../api/client";
import { RUNTIME_CONFIG } from "../config/runtime";
import { CommunityAuthorSheet } from "./community/CommunityAuthorSheet";
import { CommunityPostDetailSheet } from "./community/CommunityPostDetailSheet";
import type {
  CommunityAuthorPublicProfile,
  CommunityPost,
  CommunityPostDetail,
  CommunityPostDraftSeed,
  CommunityReportReason,
  PrivateProfileSummary,
  SavedPlanListItem,
} from "../types/plan";

type TripsScreenProps = {
  onCreateTrip: () => void;
  onReferenceCommunityPost: (destination: string, postIds: string[]) => void;
  onOpenSavedPlan: (itinerary: Record<string, unknown>) => void;
  refreshToken?: number;
};

type TripsPanel = "community" | "plans";

const todoItems = [
  "出发前检查天气与营业状态",
  "餐馆高峰提前 20 分钟到店",
  "核心景点尽量提前预约",
];

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

function parseLineInput(value: string): string[] {
  return value
    .split(/[\n,，、]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferImageMimeType(fileName: string, uri: string): string {
  const lower = `${fileName} ${uri}`.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".gif")) return "image/gif";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".heic")) return "image/heic";
  if (lower.includes(".heif")) return "image/heif";
  return "image/jpeg";
}

function appendLineValue(current: string, next: string): string {
  const items = parseLineInput(current);
  if (next.trim()) items.push(next.trim());
  return Array.from(new Set(items)).join("\n");
}

function reportReasonText(reason: CommunityReportReason): string {
  switch (reason) {
    case "factually_incorrect":
      return "地点或内容不实";
    case "advertising":
      return "广告导流";
    case "unsafe":
      return "风险内容";
    case "spam":
      return "低质灌水";
    default:
      return "其他原因";
  }
}

function sortedPositiveEntries(values: Record<string, number>, limit = 3): Array<{ key: string; value: number }> {
  return Object.entries(values || {})
    .filter(([, value]) => Number(value) > 0.12)
    .sort((left, right) => {
      if (left[1] === right[1]) return left[0].localeCompare(right[0], "zh-Hans-CN");
      return right[1] - left[1];
    })
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

function formatTravelerLabel(userId: string): string {
  const value = String(userId || "").trim();
  if (!value) return "匿名旅行者";
  return `旅行者 ${value.slice(-4)}`;
}

export function TripsScreen({ onCreateTrip, onReferenceCommunityPost, onOpenSavedPlan, refreshToken = 0 }: TripsScreenProps) {
  const api = useMemo(() => new TripApiClient(() => RUNTIME_CONFIG), []);
  const scrollRef = useRef<ScrollView>(null);
  const [activePanel, setActivePanel] = useState<TripsPanel>("community");
  const [items, setItems] = useState<SavedPlanListItem[]>([]);
  const [status, setStatus] = useState("加载中...");
  const [isLoading, setIsLoading] = useState(false);
  const [openingPlanId, setOpeningPlanId] = useState("");
  const [sharingPlanId, setSharingPlanId] = useState("");
  const [deletingPlanId, setDeletingPlanId] = useState("");
  const [shareUrlByPlanId, setShareUrlByPlanId] = useState<Record<string, string>>({});

  const [communityItems, setCommunityItems] = useState<CommunityPost[]>([]);
  const [myCommunityItems, setMyCommunityItems] = useState<CommunityPost[]>([]);
  const [communityStatus, setCommunityStatus] = useState("加载社区分享中...");
  const [myCommunityStatus, setMyCommunityStatus] = useState("正在读取我的公开分享...");
  const [communityLoading, setCommunityLoading] = useState(false);
  const [myCommunityLoading, setMyCommunityLoading] = useState(false);
  const [publishingCommunity, setPublishingCommunity] = useState(false);
  const [votingPostId, setVotingPostId] = useState("");
  const [reportingPostId, setReportingPostId] = useState("");
  const [draftingPostPlanId, setDraftingPostPlanId] = useState("");
  const [uploadingCommunityImage, setUploadingCommunityImage] = useState(false);
  const [communityDetail, setCommunityDetail] = useState<CommunityPostDetail | null>(null);
  const [communityDetailVisible, setCommunityDetailVisible] = useState(false);
  const [communityDetailLoading, setCommunityDetailLoading] = useState(false);
  const [communityAuthor, setCommunityAuthor] = useState<CommunityAuthorPublicProfile | null>(null);
  const [communityAuthorVisible, setCommunityAuthorVisible] = useState(false);
  const [communityAuthorLoading, setCommunityAuthorLoading] = useState(false);

  const [privateProfileSummary, setPrivateProfileSummary] = useState<PrivateProfileSummary | null>(null);
  const [privateProfileLoading, setPrivateProfileLoading] = useState(false);
  const [updatingPrivateLearning, setUpdatingPrivateLearning] = useState(false);
  const [clearingPrivateLearning, setClearingPrivateLearning] = useState(false);

  const [communityTitle, setCommunityTitle] = useState("");
  const [communityDestination, setCommunityDestination] = useState("");
  const [communityContent, setCommunityContent] = useState("");
  const [communityTags, setCommunityTags] = useState("");
  const [communityRestaurants, setCommunityRestaurants] = useState("");
  const [communityAttractions, setCommunityAttractions] = useState("");
  const [communityImageUrls, setCommunityImageUrls] = useState("");
  const selectedCommunityImageUrls = parseLineInput(communityImageUrls);

  const loadSavedPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await api.listSavedPlans(30);
      setItems(list);
      setStatus(list.length ? `共 ${list.length} 条` : "暂无已保存行程");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const loadCommunityPosts = useCallback(async () => {
    setCommunityLoading(true);
    try {
      const list = await api.listCommunityPosts({ limit: 12 });
      setCommunityItems(list);
      setCommunityStatus(list.length ? `社区公开分享 ${list.length} 条` : "社区还没有公开分享，你可以先发第一条。");
    } catch (error) {
      setCommunityStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setCommunityLoading(false);
    }
  }, [api]);

  const loadMyCommunityPosts = useCallback(async () => {
    setMyCommunityLoading(true);
    try {
      const list = await api.listCommunityPosts({ mine: true, limit: 12 });
      setMyCommunityItems(list);
      setMyCommunityStatus(list.length ? `我已发布/保存 ${list.length} 条社区分享` : "你还没有自己的社区分享。");
    } catch (error) {
      setMyCommunityStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setMyCommunityLoading(false);
    }
  }, [api]);

  const loadPrivateProfileSummary = useCallback(async () => {
    setPrivateProfileLoading(true);
    try {
      const summary = await api.getPrivateProfileSummary();
      setPrivateProfileSummary(summary);
    } catch {
      setPrivateProfileSummary(null);
    } finally {
      setPrivateProfileLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadSavedPlans();
    void loadCommunityPosts();
    void loadMyCommunityPosts();
    void loadPrivateProfileSummary();
  }, [loadCommunityPosts, loadMyCommunityPosts, loadPrivateProfileSummary, loadSavedPlans, refreshToken]);

  async function onOpenSaved(item: SavedPlanListItem) {
    setOpeningPlanId(item.id);
    try {
      const detail = await api.getSavedPlan(item.id);
      onOpenSavedPlan(detail.itinerary || {});
      setStatus(`已打开「${item.destination || "未命名"}」`);
      await api.trackEvent("mobile_saved_plan_opened", {
        saved_plan_id: item.id,
        destination: item.destination || "",
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningPlanId("");
    }
  }

  async function onShareSaved(item: SavedPlanListItem) {
    setSharingPlanId(item.id);
    try {
      const shared = await api.createPlanShare(item.id, 168);
      const token = String(shared.token || "").trim();
      const sharePath = String(shared.share_path || "").trim();
      const base = String(RUNTIME_CONFIG.apiBase || "").replace(/\/+$/, "");
      const shareUrl = token
        ? `${base}/api/v1/share/${token}`
        : sharePath
          ? `${base}${sharePath}`
          : "";
      if (!shareUrl) {
        setStatus("已创建分享，但暂无链接");
        return;
      }
      setShareUrlByPlanId((prev) => ({ ...prev, [item.id]: shareUrl }));
      setStatus("分享链接已生成（7天有效）");
      await api.trackEvent("mobile_share_created", {
        saved_plan_id: item.id,
        destination: item.destination || "",
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setSharingPlanId("");
    }
  }

  async function onOpenShareUrl(planId: string) {
    const link = shareUrlByPlanId[planId];
    if (!link) return;
    try {
      const canOpen = await Linking.canOpenURL(link);
      if (!canOpen) {
        setStatus("当前设备无法打开链接，请手动复制");
        return;
      }
      await Linking.openURL(link);
    } catch {
      setStatus("打开分享链接失败");
    }
  }

  function onDeleteSaved(item: SavedPlanListItem) {
    const destination = item.destination || "未命名目的地";
    Alert.alert(
      "删除行程",
      `确认删除「${destination}」吗？`,
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
                  setStatus(next.length ? "已删除" : "暂无已保存行程");
                  return next;
                });
                setShareUrlByPlanId((prev) => {
                  const next = { ...prev };
                  delete next[item.id];
                  return next;
                });
                await api.trackEvent("mobile_saved_plan_deleted", {
                  saved_plan_id: item.id,
                  destination: item.destination || "",
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

  function hasCommunityFormDraft(): boolean {
    return [
      communityTitle,
      communityDestination,
      communityContent,
      communityTags,
      communityRestaurants,
      communityAttractions,
      communityImageUrls,
    ].some((value) => value.trim().length > 0);
  }

  function applyCommunityDraftSeed(seed: CommunityPostDraftSeed) {
    setActivePanel("community");
    setCommunityTitle(seed.title);
    setCommunityDestination(seed.destination_label);
    setCommunityContent(seed.content);
    setCommunityTags(seed.tags.join(", "));
    setCommunityRestaurants(seed.favorite_restaurants.join("\n"));
    setCommunityAttractions(seed.favorite_attractions.join("\n"));
    setCommunityImageUrls(seed.image_urls.join("\n"));
    setCommunityStatus("已根据已保存行程生成社区分享草稿，请补充真实体验后发布。");
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  async function generateCommunityDraftFromPlan(item: SavedPlanListItem) {
    setDraftingPostPlanId(item.id);
    try {
      const seed = await api.createCommunityDraftFromSavedPlan(item.id);
      applyCommunityDraftSeed(seed);
      await api.trackEvent("mobile_community_draft_seeded", {
        saved_plan_id: item.id,
        destination: item.destination || "",
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setDraftingPostPlanId("");
    }
  }

  function onDraftCommunityFromPlan(item: SavedPlanListItem) {
    if (!hasCommunityFormDraft()) {
      void generateCommunityDraftFromPlan(item);
      return;
    }

    Alert.alert(
      "覆盖当前分享草稿",
      "上方已经有未发布内容，是否用已保存行程重新生成社区分享草稿？",
      [
        { text: "取消", style: "cancel" },
        {
          text: "覆盖",
          onPress: () => {
            void generateCommunityDraftFromPlan(item);
          },
        },
      ],
      { cancelable: true },
    );
  }

  async function onPublishCommunity() {
    const destinationLabel = communityDestination.trim();
    const title = communityTitle.trim();
    const content = communityContent.trim();
    if (!destinationLabel) {
      setCommunityStatus("请先填写分享目的地。");
      return;
    }
    if (!title && !content) {
      setCommunityStatus("至少填写标题或正文。");
      return;
    }

    setPublishingCommunity(true);
    try {
      const post = await api.createCommunityPost({
        title,
        content,
        destination_label: destinationLabel,
        tags: parseLineInput(communityTags),
        image_urls: parseLineInput(communityImageUrls),
        favorite_restaurants: parseLineInput(communityRestaurants),
        favorite_attractions: parseLineInput(communityAttractions),
      });

      if (post.status === "published") {
        setCommunityItems((prev) => [post, ...prev.filter((item) => item.id !== post.id)].slice(0, 12));
      }
      setMyCommunityItems((prev) => [post, ...prev.filter((item) => item.id !== post.id)].slice(0, 12));
      setMyCommunityStatus("已更新我的社区分享");
      setCommunityStatus(post.processing_note || `已处理分享，当前状态：${post.status}`);
      setCommunityTitle("");
      setCommunityDestination("");
      setCommunityContent("");
      setCommunityTags("");
      setCommunityRestaurants("");
      setCommunityAttractions("");
      setCommunityImageUrls("");
      await api.trackEvent("mobile_community_post_created", {
        community_post_id: post.id,
        destination_id: post.destination_id,
        status: post.status,
      });
    } catch (error) {
      setCommunityStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setPublishingCommunity(false);
    }
  }

  async function onPickCommunityImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setCommunityStatus("请先允许访问相册后再上传图片。");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: false,
        selectionLimit: 1,
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {
        setCommunityStatus("未获取到图片文件，请重试。");
        return;
      }

      setUploadingCommunityImage(true);
      const uploaded = await api.uploadCommunityImage({
        uri: asset.uri,
        name: asset.fileName || `community-${Date.now()}.jpg`,
        type: asset.mimeType || inferImageMimeType(String(asset.fileName || ""), asset.uri),
        width: asset.width,
        height: asset.height,
      });
      setCommunityImageUrls((prev) => appendLineValue(prev, uploaded.public_url));
      setCommunityStatus("图片已上传并回填到分享表单。");
      await api.trackEvent("mobile_community_image_uploaded", {
        asset_id: uploaded.asset_id,
        mime_type: uploaded.mime_type,
        file_size: uploaded.file_size,
      });
    } catch (error) {
      setCommunityStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUploadingCommunityImage(false);
    }
  }

  function replaceCommunityPostAcrossCollections(post: CommunityPost) {
    setCommunityItems((prev) => prev.map((item) => (item.id === post.id ? post : item)));
    setMyCommunityItems((prev) => prev.map((item) => (item.id === post.id ? post : item)));
    setCommunityDetail((prev) => (prev && prev.post.id === post.id ? { ...prev, post } : prev));
    setCommunityAuthor((prev) =>
      prev
        ? {
            ...prev,
            recent_posts: prev.recent_posts.map((item) => (item.id === post.id ? post : item)),
          }
        : prev,
    );
  }

  async function onVoteCommunity(postId: string, voteType: "helpful" | "want_to_go" = "helpful") {
    setVotingPostId(postId);
    try {
      const post = await api.voteCommunityPost(postId, voteType);
      replaceCommunityPostAcrossCollections(post);
      setCommunityStatus(voteType === "helpful" ? `已为「${post.title}」标记有帮助` : `已为「${post.title}」标记想去`);
      await api.trackEvent("mobile_community_post_voted", {
        community_post_id: post.id,
        vote_type: voteType,
      });
    } catch (error) {
      setCommunityStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setVotingPostId("");
    }
  }

  async function onReportCommunity(postId: string, reason: CommunityReportReason) {
    setReportingPostId(postId);
    try {
      const post = await api.reportCommunityPost(postId, reason);
      setCommunityItems((prev) => {
        if (post.status !== "published") {
          return prev.filter((item) => item.id !== post.id);
        }
        return prev.map((item) => (item.id === post.id ? post : item));
      });
      setCommunityStatus(
        post.status === "published"
          ? `已提交举报：${reportReasonText(reason)}，系统会继续观察这条分享。`
          : post.processing_note || `已提交举报：${reportReasonText(reason)}，该分享已暂时退出公开社区。`,
      );
      setMyCommunityItems((prev) => prev.map((item) => (item.id === post.id ? post : item)));
      setCommunityDetail((prev) => (prev && prev.post.id === post.id ? { ...prev, post } : prev));
      await api.trackEvent("mobile_community_post_reported", {
        community_post_id: post.id,
        reason,
        post_status: post.status,
      });
    } catch (error) {
      setCommunityStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setReportingPostId("");
    }
  }

  function onPressReport(post: CommunityPost) {
    Alert.alert("举报这条分享", "请选择最接近的问题类型。", [
      {
        text: "地点不实",
        onPress: () => {
          void onReportCommunity(post.id, "factually_incorrect");
        },
      },
      {
        text: "广告导流",
        onPress: () => {
          void onReportCommunity(post.id, "advertising");
        },
      },
      {
        text: "取消",
        style: "cancel",
      },
    ]);
  }

  async function onOpenCommunityDetail(postId: string) {
    setCommunityDetailVisible(true);
    setCommunityDetailLoading(true);
    try {
      const detail = await api.getCommunityPostDetail(postId);
      setCommunityDetail(detail);
      await api.trackEvent("community_post_detail_opened", {
        community_post_id: detail.post.id,
        destination_id: detail.post.destination_id,
      });
    } catch (error) {
      setCommunityStatus(error instanceof Error ? error.message : String(error));
      setCommunityDetail(null);
    } finally {
      setCommunityDetailLoading(false);
    }
  }

  async function onOpenCommunityAuthor(userId: string) {
    setCommunityAuthorVisible(true);
    setCommunityAuthorLoading(true);
    try {
      const profile = await api.getCommunityAuthorProfile(userId);
      setCommunityAuthor(profile);
      await api.trackEvent("community_author_profile_opened", {
        author_user_id: userId,
        published_post_count: profile.published_post_count,
      });
    } catch (error) {
      setCommunityStatus(error instanceof Error ? error.message : String(error));
      setCommunityAuthor(null);
    } finally {
      setCommunityAuthorLoading(false);
    }
  }

  function onReferenceCommunity(detail: CommunityPostDetail) {
    onReferenceCommunityPost(detail.post.destination_label || detail.author.destinations[0]?.destination_label || "", [detail.post.id]);
    setCommunityDetailVisible(false);
    setCommunityStatus(`已带入「${detail.post.title}」作为 AI 规划参考。`);
  }

  async function onTogglePrivateLearning() {
    if (!privateProfileSummary) return;
    setUpdatingPrivateLearning(true);
    try {
      const settings = await api.updatePrivatePersonalization(!privateProfileSummary.settings.enabled);
      setPrivateProfileSummary((prev) => (prev ? { ...prev, ready: settings.enabled ? prev.ready : false, settings } : prev));
      setStatus(settings.enabled ? "已恢复个性化学习" : "已暂停个性化学习");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingPrivateLearning(false);
    }
  }

  function onClearPrivateLearning() {
    Alert.alert("清空个人学习记录", "这会删除当前账号沉淀的私有画像和历史学习信号。", [
      { text: "取消", style: "cancel" },
      {
        text: "清空",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setClearingPrivateLearning(true);
            try {
              const summary = await api.clearPrivatePersonalization();
              setPrivateProfileSummary(summary);
              setStatus("已清空个人学习记录");
            } catch (error) {
              setStatus(error instanceof Error ? error.message : String(error));
            } finally {
              setClearingPrivateLearning(false);
            }
          })();
        },
      },
    ]);
  }

  const topBehaviorTags = sortedPositiveEntries(privateProfileSummary?.profile.behavioral_affinity.tags || {}, 3);
  const topBehaviorCategories = sortedPositiveEntries(privateProfileSummary?.profile.behavioral_affinity.categories || {}, 2);
  const communityOverview = [
    `${communityItems.length} 条公开分享`,
    `${myCommunityItems.length} 条我的帖子`,
    `${items.length} 条已保存行程`,
  ].join(" · ");

  return (
    <View style={styles.screen}>
      <ScrollView ref={scrollRef} style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.headerEyebrow}>旅途记录与规划</Text>
          <Text style={styles.headerTitle}>行程</Text>
          <Text style={styles.headerSubtitle}>
            社区图文已经前置到手机端首页。你可以直接发图片和文案帖子，也可以继续管理自己的 AI 行程。
          </Text>
          <Text style={styles.headerFootnote}>{communityOverview}</Text>
        </View>

        <View style={styles.segmentRow}>
          <Pressable
            style={[styles.segmentButton, activePanel === "community" ? styles.segmentButtonActive : null]}
            onPress={() => {
              setActivePanel("community");
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
          >
            <Text style={[styles.segmentButtonText, activePanel === "community" ? styles.segmentButtonTextActive : null]}>
              社区图文
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segmentButton, activePanel === "plans" ? styles.segmentButtonActive : null]}
            onPress={() => {
              setActivePanel("plans");
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
          >
            <Text style={[styles.segmentButtonText, activePanel === "plans" ? styles.segmentButtonTextActive : null]}>
              我的行程
            </Text>
          </Pressable>
        </View>

        {activePanel === "community" ? (
          <>
            <View style={[styles.card, styles.heroActionCard]}>
              <Text style={styles.cardTitle}>发一条旅途图文</Text>
              <Text style={styles.formHint}>
                现在默认支持图片与文案分享，发布后会先做结构化处理，再进入公开社区和后台规划信号层。视频上传还没有接进来，所以这里先明确告诉你当前只支持图文。
              </Text>
              <View style={styles.formActions}>
                <Pressable style={styles.primaryButton} onPress={onCreateTrip}>
                  <Text style={styles.primaryButtonText}>去 AI 规划</Text>
                </Pressable>
                <Pressable style={styles.refreshButton} onPress={() => setActivePanel("plans")}>
                  <Text style={styles.refreshButtonText}>看已保存行程</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>发布图文分享</Text>
              <Text style={styles.formHint}>支持分享餐厅、景点，也可以直接从相册选图上传。发布后会先结构化处理，再决定是否进入公开社区和 AI 规划信号层。</Text>
              <TextInput
                style={styles.input}
                value={communityTitle}
                onChangeText={setCommunityTitle}
                placeholder="标题，例如：杭州雨天也好逛的一天"
                placeholderTextColor="#94a6b6"
              />
              <TextInput
                style={styles.input}
                value={communityDestination}
                onChangeText={setCommunityDestination}
                placeholder="目的地，例如：杭州"
                placeholderTextColor="#94a6b6"
              />
              <TextInput
                style={styles.textarea}
                value={communityContent}
                onChangeText={setCommunityContent}
                multiline
                textAlignVertical="top"
                placeholder="正文，例如：早上沿钱塘江散步，下午去中国丝绸博物馆，晚上在南宋御街吃饭。"
                placeholderTextColor="#94a6b6"
              />
              <TextInput
                style={styles.input}
                value={communityRestaurants}
                onChangeText={setCommunityRestaurants}
                placeholder="喜欢的餐厅，逗号或换行分隔"
                placeholderTextColor="#94a6b6"
              />
              <TextInput
                style={styles.input}
                value={communityAttractions}
                onChangeText={setCommunityAttractions}
                placeholder="喜欢的景点，逗号或换行分隔"
                placeholderTextColor="#94a6b6"
              />
              <TextInput
                style={styles.input}
                value={communityTags}
                onChangeText={setCommunityTags}
                placeholder="标签，例如：citywalk, 雨天, 咖啡"
                placeholderTextColor="#94a6b6"
              />
              <TextInput
                style={styles.input}
                value={communityImageUrls}
                onChangeText={setCommunityImageUrls}
                placeholder="图片链接，或先点下方按钮从相册上传"
                placeholderTextColor="#94a6b6"
              />
              <Pressable style={styles.secondaryButton} onPress={() => void onPickCommunityImage()} disabled={uploadingCommunityImage}>
                <Text style={styles.secondaryButtonText}>{uploadingCommunityImage ? "上传图片中..." : "从相册选择并上传图片"}</Text>
              </Pressable>
              <Text style={styles.formHint}>当前支持 `jpg/png/gif/webp/heic`，单张不超过 8MB。已上传图片会自动回填到上面的链接列表。</Text>
              {selectedCommunityImageUrls.length > 0 ? (
                <View style={styles.communityImagePreviewRow}>
                  {selectedCommunityImageUrls.slice(0, 3).map((uri) => (
                    <Image key={uri} source={{ uri }} style={styles.communityImagePreview} resizeMode="cover" />
                  ))}
                </View>
              ) : null}
              <View style={styles.formActions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => void onPublishCommunity()}
                  disabled={publishingCommunity || uploadingCommunityImage}
                >
                  <Text style={styles.primaryButtonText}>
                    {uploadingCommunityImage ? "等待图片上传完成..." : publishingCommunity ? "发布中..." : "发布分享"}
                  </Text>
                </Pressable>
                <Pressable style={styles.refreshButton} onPress={() => void loadCommunityPosts()}>
                  <Text style={styles.refreshButtonText}>刷新社区</Text>
                </Pressable>
              </View>
              <Text style={styles.statusText}>{communityStatus}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>我的公开分享</Text>
              {myCommunityLoading ? <ActivityIndicator size="small" color="#2f6ae5" /> : null}
              <Text style={styles.emptyText}>{myCommunityStatus}</Text>
              <View style={styles.communityList}>
                {myCommunityItems.map((post) => (
                  <Pressable key={`mine-${post.id}`} style={styles.communityItem} onPress={() => void onOpenCommunityDetail(post.id)}>
                    <Text style={styles.communityTitle}>{post.title}</Text>
                    <Text style={styles.communityMeta}>
                      {post.status === "published" ? "已公开" : post.status} · 被参考 {post.reference_count || 0} 次 · 关联保存{" "}
                      {post.referenced_save_count || 0} 次
                    </Text>
                    <Text numberOfLines={3} style={styles.communityContent}>
                      {post.content || "继续补充真实体验，会更容易进入公开社区。"}
                    </Text>
                  </Pressable>
                ))}
                {!myCommunityLoading && myCommunityItems.length === 0 ? <Text style={styles.emptyText}>现在还没有你自己的公开图文。</Text> : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>社区精选</Text>
              {communityLoading ? <ActivityIndicator size="small" color="#2f6ae5" /> : null}
              <Text style={styles.emptyText}>{communityStatus}</Text>
              <View style={styles.communityList}>
                {communityItems.map((post) => (
                  <Pressable key={post.id} style={styles.communityItem} onPress={() => void onOpenCommunityDetail(post.id)}>
                    {post.image_urls[0] ? <Image source={{ uri: post.image_urls[0] }} style={styles.communityImage} resizeMode="cover" /> : null}
                    <Text style={styles.communityTitle}>{post.title}</Text>
                    <Text style={styles.communityMeta}>
                      {post.destination_label || "未命名目的地"} · 质量分 {Math.round((post.quality_score || 0) * 100)} · 被参考 {post.reference_count || 0} 次
                    </Text>
                    <Text numberOfLines={4} style={styles.communityContent}>
                      {post.content || "这条分享主要通过地点和标签来影响社区信号。"}
                    </Text>
                    <Text style={styles.communityAuthorText}>作者：{formatTravelerLabel(post.user_id)}</Text>
                    {post.favorite_restaurants.length > 0 ? (
                      <Text style={styles.communityPlaces}>吃过：{post.favorite_restaurants.slice(0, 3).join("、")}</Text>
                    ) : null}
                    {post.favorite_attractions.length > 0 ? (
                      <Text style={styles.communityPlaces}>去过：{post.favorite_attractions.slice(0, 3).join("、")}</Text>
                    ) : null}
                    <View style={styles.tagWrap}>
                      {post.tags.slice(0, 5).map((tag) => (
                        <View key={`${post.id}-${tag}`} style={styles.tagChip}>
                          <Text style={styles.tagText}>#{tag}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.communityActionRow}>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={(event) => {
                          event.stopPropagation?.();
                          void onVoteCommunity(post.id);
                        }}
                        disabled={votingPostId === post.id}
                      >
                        <Text style={styles.secondaryButtonText}>
                          {votingPostId === post.id ? "提交中..." : `有帮助 ${post.vote_summary.helpful_count}`}
                        </Text>
                      </Pressable>
                      <View style={styles.communityMetaActions}>
                        <Pressable
                          style={styles.textActionButton}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            void onVoteCommunity(post.id, "want_to_go");
                          }}
                          disabled={votingPostId === post.id}
                        >
                          <Text style={styles.textActionText}>想去 {post.vote_summary.want_to_go_count}</Text>
                        </Pressable>
                        <Pressable
                          style={styles.textActionButton}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            onReferenceCommunityPost(post.destination_label || "", [post.id]);
                          }}
                        >
                          <Text style={styles.referenceActionText}>基于此贴规划</Text>
                        </Pressable>
                        <Pressable
                          style={styles.textActionButton}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            onPressReport(post);
                          }}
                          disabled={reportingPostId === post.id}
                        >
                          <Text style={styles.textActionText}>{reportingPostId === post.id ? "举报中..." : "举报"}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                ))}
                {!communityLoading && communityItems.length === 0 ? <Text style={styles.emptyText}>社区暂时还没有公开图文。</Text> : null}
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>你的私有学习</Text>
              {privateProfileLoading ? <ActivityIndicator size="small" color="#2f6ae5" /> : null}
              {privateProfileSummary ? (
                <>
                  <Text style={styles.formHint}>
                    {privateProfileSummary.settings.enabled
                      ? privateProfileSummary.ready
                        ? `最近 30 天已记录 ${privateProfileSummary.profile.stats.events_30d} 次行为，当前个性化学习已生效。`
                        : "个性化学习已开启，但当前还没有足够样本明显影响结果。"
                      : "个性化学习已暂停，后续规划不会使用你的历史行为。"}
                  </Text>
                  {topBehaviorTags.length > 0 ? (
                    <Text style={styles.profileSummaryText}>更偏好的标签：{topBehaviorTags.map((item) => item.key).join(" / ")}</Text>
                  ) : null}
                  {topBehaviorCategories.length > 0 ? (
                    <Text style={styles.profileSummaryText}>更常保留的类型：{topBehaviorCategories.map((item) => item.key).join(" / ")}</Text>
                  ) : null}
                  {privateProfileSummary.profile.timing_profile.max_transit_minutes > 0 ? (
                    <Text style={styles.profileSummaryText}>
                      当前通勤容忍度：单段约 {privateProfileSummary.profile.timing_profile.max_transit_minutes} 分钟
                    </Text>
                  ) : null}
                  <View style={styles.formActions}>
                    <Pressable style={styles.secondaryButton} onPress={() => void onTogglePrivateLearning()} disabled={updatingPrivateLearning}>
                      <Text style={styles.secondaryButtonText}>
                        {updatingPrivateLearning
                          ? "更新中..."
                          : privateProfileSummary.settings.enabled
                            ? "暂停学习"
                            : "恢复学习"}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.deleteButton} onPress={onClearPrivateLearning} disabled={clearingPrivateLearning}>
                      <Text style={styles.deleteButtonText}>{clearingPrivateLearning ? "清空中..." : "清空记录"}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Text style={styles.formHint}>当前还没拉到个人学习状态，稍后再试一次。</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>今日清单</Text>
              <View style={styles.todoList}>
                {todoItems.map((item) => (
                  <View key={item} style={styles.todoItem}>
                    <Text style={styles.todoText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>已保存行程</Text>
              {isLoading ? <ActivityIndicator size="small" color="#2f6ae5" /> : null}
              <Text style={styles.emptyText}>{status}</Text>
              <View style={styles.savedList}>
                {items.map((item) => (
                  <View key={item.id} style={styles.savedItem}>
                    <Text style={styles.savedTitle}>{item.destination || "未命名目的地"}</Text>
                    <Text style={styles.savedMeta}>
                      {item.start_date || "--"} · 保存于 {formatSavedDate(item.saved_at)}
                    </Text>
                    <View style={styles.savedActions}>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => void onOpenSaved(item)}
                        disabled={openingPlanId === item.id || deletingPlanId === item.id}
                      >
                        <Text style={styles.secondaryButtonText}>{openingPlanId === item.id ? "打开中..." : "打开行程"}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => void onShareSaved(item)}
                        disabled={sharingPlanId === item.id || deletingPlanId === item.id || draftingPostPlanId === item.id}
                      >
                        <Text style={styles.secondaryButtonText}>{sharingPlanId === item.id ? "生成中..." : "生成分享"}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => onDraftCommunityFromPlan(item)}
                        disabled={draftingPostPlanId === item.id || deletingPlanId === item.id}
                      >
                        <Text style={styles.secondaryButtonText}>{draftingPostPlanId === item.id ? "生成中..." : "转成帖子草稿"}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.deleteButton}
                        onPress={() => onDeleteSaved(item)}
                        disabled={deletingPlanId === item.id}
                      >
                        <Text style={styles.deleteButtonText}>{deletingPlanId === item.id ? "删除中..." : "删除行程"}</Text>
                      </Pressable>
                    </View>
                    {shareUrlByPlanId[item.id] ? (
                      <Pressable style={styles.shareLinkWrap} onPress={() => void onOpenShareUrl(item.id)}>
                        <Text numberOfLines={1} style={styles.shareLinkText}>
                          {shareUrlByPlanId[item.id]}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {!isLoading && items.length === 0 ? <Text style={styles.emptyText}>还没有保存过的行程，先去发起一条 AI 规划吧。</Text> : null}
              </View>
              <View style={styles.formActions}>
                <Pressable style={styles.primaryButton} onPress={onCreateTrip}>
                  <Text style={styles.primaryButtonText}>去 AI 规划</Text>
                </Pressable>
                <Pressable style={styles.refreshButton} onPress={() => void loadSavedPlans()}>
                  <Text style={styles.refreshButtonText}>刷新列表</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <CommunityPostDetailSheet
        visible={communityDetailVisible}
        loading={communityDetailLoading}
        detail={communityDetail}
        onClose={() => setCommunityDetailVisible(false)}
        onReference={onReferenceCommunity}
        onOpenAuthor={(userId) => void onOpenCommunityAuthor(userId)}
        onOpenRelated={(postId) => void onOpenCommunityDetail(postId)}
        onHelpful={(postId) => void onVoteCommunity(postId, "helpful")}
        onWantToGo={(postId) => void onVoteCommunity(postId, "want_to_go")}
        onReport={(postId) => {
          const target = communityDetail?.post.id === postId ? communityDetail.post : communityItems.find((item) => item.id === postId) || myCommunityItems.find((item) => item.id === postId);
          if (target) onPressReport(target);
        }}
      />

      <CommunityAuthorSheet
        visible={communityAuthorVisible}
        loading={communityAuthorLoading}
        profile={communityAuthor}
        onClose={() => setCommunityAuthorVisible(false)}
        onSelectPost={(postId) => {
          setCommunityAuthorVisible(false);
          void onOpenCommunityDetail(postId);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eef3fb",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
  },
  headerCard: {
    borderRadius: 16,
    backgroundColor: "#17305a",
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6,
  },
  headerEyebrow: {
    color: "#b8cdee",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  headerTitle: {
    color: "#f3f8ff",
    fontSize: 22,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "#c4d7f2",
    fontSize: 13,
    lineHeight: 19,
  },
  headerFootnote: {
    marginTop: 4,
    color: "#d7e6fb",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 10,
    padding: 4,
    borderRadius: 18,
    backgroundColor: "#dfe8f5",
  },
  segmentButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "#17305a",
  },
  segmentButtonText: {
    color: "#5a7288",
    fontSize: 14,
    fontWeight: "800",
  },
  segmentButtonTextActive: {
    color: "#ffffff",
  },
  card: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  heroActionCard: {
    backgroundColor: "#f8fbff",
    borderWidth: 1,
    borderColor: "#dce6f2",
  },
  cardTitle: {
    color: "#0d2036",
    fontSize: 18,
    fontWeight: "800",
  },
  todoList: {
    gap: 8,
  },
  todoItem: {
    borderRadius: 12,
    backgroundColor: "#f4f7fc",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  todoText: {
    color: "#344b63",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  formHint: {
    color: "#5a7187",
    fontSize: 13,
    lineHeight: 20,
  },
  profileSummaryText: {
    color: "#425a72",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "700",
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dce6ef",
    backgroundColor: "#f8fbfe",
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#102033",
    fontSize: 14,
    fontWeight: "600",
  },
  textarea: {
    minHeight: 96,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dce6ef",
    backgroundColor: "#f8fbfe",
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#102033",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
  },
  communityList: {
    gap: 12,
  },
  communityImagePreviewRow: {
    flexDirection: "row",
    gap: 10,
  },
  communityImagePreview: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: "#ecf2f8",
  },
  communityItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0e8f1",
    backgroundColor: "#fbfdff",
    padding: 12,
    gap: 8,
  },
  communityImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    backgroundColor: "#ecf2f8",
  },
  communityTitle: {
    color: "#112236",
    fontSize: 16,
    fontWeight: "800",
  },
  communityAuthorText: {
    color: "#6d8294",
    fontSize: 12,
    fontWeight: "700",
  },
  communityMeta: {
    color: "#688095",
    fontSize: 12,
    fontWeight: "700",
  },
  communityContent: {
    color: "#31485d",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  communityPlaces: {
    color: "#38566f",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagChip: {
    borderRadius: 14,
    backgroundColor: "#eef5ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: "#315b8f",
    fontSize: 12,
    fontWeight: "700",
  },
  communityActionRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  communityVoteNote: {
    color: "#667d92",
    fontSize: 12,
    fontWeight: "700",
  },
  communityMetaActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  textActionButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  textActionText: {
    color: "#a65045",
    fontSize: 12,
    fontWeight: "800",
  },
  referenceActionText: {
    color: "#2a5fa0",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyText: {
    color: "#6f8397",
    fontSize: 13,
    lineHeight: 19,
  },
  savedList: {
    gap: 12,
  },
  savedItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e3ebf4",
    backgroundColor: "#fbfdff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  savedTitle: {
    color: "#102033",
    fontSize: 16,
    fontWeight: "800",
  },
  savedMeta: {
    color: "#6f8397",
    fontSize: 13,
    fontWeight: "600",
  },
  savedActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: "#17305a",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: 12,
    backgroundColor: "#edf4ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#244f87",
    fontSize: 13,
    fontWeight: "800",
  },
  deleteButton: {
    borderRadius: 12,
    backgroundColor: "#fff1f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    color: "#bf3e35",
    fontSize: 13,
    fontWeight: "800",
  },
  refreshButton: {
    borderRadius: 12,
    backgroundColor: "#edf2f8",
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshButtonText: {
    color: "#425971",
    fontSize: 13,
    fontWeight: "800",
  },
  shareLinkWrap: {
    borderRadius: 12,
    backgroundColor: "#eef5ff",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shareLinkText: {
    color: "#2b5fa2",
    fontSize: 12,
    fontWeight: "700",
  },
  statusText: {
    color: "#5a7187",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
});
