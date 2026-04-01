import type {
  AuthTokenResponse,
  ChatIntakeResponse,
  ChatTurnPayload,
  CommunityPost,
  CommunityPostDraftSeed,
  CommunityPostCreateRequest,
  CommunityPostDetail,
  CommunityMediaUploadResult,
  CommunityReportReason,
  CommunityVoteType,
  CommunityAuthorPublicProfile,
  DestinationEntity,
  DestinationResolveResponse,
  HealthResponse,
  PrivateProfileSummary,
  PlanningBriefRequest,
  PlanningBriefResponse,
  PlanDraft,
  SavePlanResponse,
  SavedPlanDetail,
  SavedPlanListItem,
  SharePlanResponse,
} from "../types/plan";
import type { PlaceDetail, ValidationResult } from "../types/itinerary";

type RuntimeConfig = {
  apiBase: string;
  bootstrapSecret: string;
  userId: string;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
};

function trimTrailingSlash(input: string): string {
  return String(input || "").trim().replace(/\/+$/, "");
}

function parseJSONOrText(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getErrorDetail(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    const body = payload as { message?: unknown; error?: unknown };
    if (typeof body.message === "string" && body.message.trim()) return body.message;
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    return JSON.stringify(payload);
  }
  return String(payload);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseCommunityPost(payload: unknown): CommunityPost {
  const item = asRecord(payload);
  const summary = asRecord(item.vote_summary);
  return {
    id: String(item.id || ""),
    user_id: String(item.user_id || ""),
    title: String(item.title || ""),
    content: String(item.content || ""),
    destination_id: String(item.destination_id || ""),
    destination_label: String(item.destination_label || ""),
    destination_adcode: String(item.destination_adcode || ""),
    tags: asArray(item.tags).map((value) => String(value || "")).filter(Boolean),
    image_urls: asArray(item.image_urls).map((value) => String(value || "")).filter(Boolean),
    favorite_restaurants: asArray(item.favorite_restaurants).map((value) => String(value || "")).filter(Boolean),
    favorite_attractions: asArray(item.favorite_attractions).map((value) => String(value || "")).filter(Boolean),
    mentioned_places: asArray(item.mentioned_places).map((value) => String(value || "")).filter(Boolean),
    status: (String(item.status || "draft") || "draft") as CommunityPost["status"],
    quality_score: Number(item.quality_score || 0),
    processing_note: String(item.processing_note || ""),
    vote_summary: {
      helpful_count: Number(summary.helpful_count || 0),
      want_to_go_count: Number(summary.want_to_go_count || 0),
    },
    reference_count: Number(item.reference_count || 0),
    referenced_save_count: Number(item.referenced_save_count || 0),
    published_at: String(item.published_at || ""),
    created_at: String(item.created_at || ""),
    updated_at: String(item.updated_at || ""),
  };
}

function parseCommunityAuthorPublicProfile(payload: unknown): CommunityAuthorPublicProfile {
  const item = asRecord(payload);
  return {
    user_id: String(item.user_id || ""),
    display_name: String(item.display_name || ""),
    published_post_count: Number(item.published_post_count || 0),
    helpful_count: Number(item.helpful_count || 0),
    reference_count: Number(item.reference_count || 0),
    referenced_save_count: Number(item.referenced_save_count || 0),
    top_tags: asArray(item.top_tags).map((value) => String(value || "")).filter(Boolean),
    destinations: asArray(item.destinations)
      .map((value) => {
        const destination = asRecord(value);
        return {
          destination_id: String(destination.destination_id || ""),
          destination_label: String(destination.destination_label || ""),
          post_count: Number(destination.post_count || 0),
        };
      })
      .filter((item) => item.destination_id || item.destination_label),
    recent_posts: asArray(item.recent_posts).map((value) => parseCommunityPost(value)),
    updated_at: String(item.updated_at || ""),
  };
}

function parsePrivateProfileSummary(payload: unknown): PrivateProfileSummary {
  const item = asRecord(payload);
  const settings = asRecord(item.settings);
  const profile = asRecord(item.profile);
  const explicit = asRecord(profile.explicit_preferences);
  const behavioral = asRecord(profile.behavioral_affinity);
  const timing = asRecord(profile.timing_profile);
  const risk = asRecord(profile.risk_profile);
  const stats = asRecord(profile.stats);
  const confidence = asRecord(profile.confidence);
  return {
    ready: Boolean(item.ready),
    settings: {
      enabled: settings.enabled !== false,
      updated_at: String(settings.updated_at || ""),
      cleared_at: String(settings.cleared_at || ""),
    },
    profile: {
      user_id: String(profile.user_id || ""),
      version: Number(profile.version || 0),
      explicit_preferences: {
        budget_level: String(explicit.budget_level || ""),
        pace: String(explicit.pace || ""),
        travel_styles: asArray(explicit.travel_styles).map((value) => String(value || "")).filter(Boolean),
        dining_preference: String(explicit.dining_preference || ""),
        weather_preference: String(explicit.weather_preference || ""),
      },
      behavioral_affinity: {
        categories: asRecord(behavioral.categories) as Record<string, number>,
        tags: asRecord(behavioral.tags) as Record<string, number>,
        districts: asRecord(behavioral.districts) as Record<string, number>,
      },
      timing_profile: {
        preferred_daily_blocks: Number(timing.preferred_daily_blocks || 0),
        lunch_offset_minutes: Number(timing.lunch_offset_minutes || 0),
        max_transit_minutes: Number(timing.max_transit_minutes || 0),
      },
      risk_profile: {
        rain_avoid_outdoor: Number(risk.rain_avoid_outdoor || 0),
        walking_tolerance: Number(risk.walking_tolerance || 0),
        queue_tolerance: Number(risk.queue_tolerance || 0),
      },
      stats: {
        events_30d: Number(stats.events_30d || 0),
        effective_actions_30d: Number(stats.effective_actions_30d || 0),
        saved_plans_30d: Number(stats.saved_plans_30d || 0),
      },
      confidence: {
        behavioral_affinity: Number(confidence.behavioral_affinity || 0),
        timing_profile: Number(confidence.timing_profile || 0),
        risk_profile: Number(confidence.risk_profile || 0),
      },
      updated_at: String(profile.updated_at || ""),
    },
  };
}

function parseCommunityPostDetail(payload: unknown): CommunityPostDetail {
  const item = asRecord(payload);
  return {
    post: parseCommunityPost(item.post),
    author: parseCommunityAuthorPublicProfile(item.author),
    related_posts: asArray(item.related_posts).map((value) => parseCommunityPost(value)),
    reference_count: Number(item.reference_count || 0),
    referenced_save_count: Number(item.referenced_save_count || 0),
  };
}

function parseCommunityPostDraftSeed(payload: unknown): CommunityPostDraftSeed {
  const item = asRecord(payload);
  return {
    title: String(item.title || ""),
    content: String(item.content || ""),
    destination_label: String(item.destination_label || ""),
    tags: asArray(item.tags).map((value) => String(value || "")).filter(Boolean),
    image_urls: asArray(item.image_urls).map((value) => String(value || "")).filter(Boolean),
    favorite_restaurants: asArray(item.favorite_restaurants).map((value) => String(value || "")).filter(Boolean),
    favorite_attractions: asArray(item.favorite_attractions).map((value) => String(value || "")).filter(Boolean),
  };
}

function parseCommunityMediaUploadResult(payload: unknown): CommunityMediaUploadResult {
  const item = asRecord(payload);
  return {
    asset_id: String(item.asset_id || ""),
    public_url: String(item.public_url || ""),
    public_path: String(item.public_path || ""),
    mime_type: String(item.mime_type || ""),
    file_size: Number(item.file_size || 0),
    width: Number(item.width || 0),
    height: Number(item.height || 0),
  };
}

export class TripApiClient {
  private accessToken = "";
  private expiresAt = "";

  constructor(private readonly getConfig: () => RuntimeConfig) {}

  private isTokenValid(expiresAt: string): boolean {
    if (!expiresAt) return false;
    const expMs = Date.parse(expiresAt);
    if (!Number.isFinite(expMs)) return false;
    return expMs - Date.now() > 60_000;
  }

  private buildUrl(path: string): string {
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    const base = trimTrailingSlash(this.getConfig().apiBase);
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${normalizedPath}`;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method || "GET";
    const timeoutMs = options.timeoutMs || 15_000;
    const authRequired = options.auth !== false;
    const headers: Record<string, string> = {};
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

    if (options.body !== undefined && !isFormData) {
      headers["Content-Type"] = "application/json";
    }

    if (authRequired) {
      const token = await this.ensureToken();
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.buildUrl(path), {
        method,
        headers,
        body: options.body !== undefined ? (isFormData ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
        signal: controller.signal,
      });
      const payload = parseJSONOrText(await response.text());

      if (!response.ok) {
        if (response.status === 401 && authRequired) {
          this.accessToken = "";
          this.expiresAt = "";
        }
        const detail = getErrorDetail(payload);
        throw new Error(`${method} ${path} failed (${response.status})${detail ? `: ${detail}` : ""}`);
      }

      return payload as T;
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError") {
        throw new Error(`${method} ${path} timeout (${timeoutMs}ms)`);
      }
      if (error instanceof TypeError || String(error).toLowerCase().includes("network request failed")) {
        throw new Error("Cannot connect to trip-api. Check API base and backend status.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async issueToken(): Promise<string> {
    const config = this.getConfig();
    const payload = {
      user_id: config.userId.trim(),
      role: "USER",
      client_secret: config.bootstrapSecret.trim(),
    };
    const tokenBody = await this.request<AuthTokenResponse>("/api/v1/auth/token", {
      method: "POST",
      auth: false,
      body: payload,
      timeoutMs: 5_000,
    });

    if (!tokenBody.access_token) {
      throw new Error("Token response missing access_token");
    }

    this.accessToken = tokenBody.access_token;
    this.expiresAt = tokenBody.expires_at || "";
    return this.accessToken;
  }

  async ensureToken(force = false): Promise<string> {
    if (!force && this.accessToken && this.isTokenValid(this.expiresAt)) {
      return this.accessToken;
    }
    return this.issueToken();
  }

  async healthCheck(): Promise<HealthResponse> {
    return this.request<HealthResponse>("/api/v1/health", { auth: false });
  }

  async resolveDestinations(query: string, limit = 10): Promise<{ items: DestinationEntity[]; degraded: boolean }> {
    const text = String(query || "").trim();
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 10));
    const params = new URLSearchParams();
    if (text) params.set("q", text);
    params.set("limit", String(safeLimit));
    const response = await this.request<DestinationResolveResponse>(`/api/v1/destinations/resolve?${params.toString()}`);
    return {
      items: Array.isArray(response.items) ? response.items : [],
      degraded: Boolean(response.degraded),
    };
  }

  async createPlanningBrief(request: PlanningBriefRequest): Promise<PlanningBriefResponse> {
    return this.request<PlanningBriefResponse>("/api/v1/plans/brief", {
      method: "POST",
      body: {
        origin_city: request.origin_city.trim(),
        destination_text: request.destination_text.trim(),
        selected_destination: request.selected_destination || null,
        days: request.days,
        start_date: request.start_date.trim(),
        budget_level: request.budget_level,
        pace: request.pace,
        travel_styles: request.travel_styles,
        must_go: request.must_go,
        avoid: request.avoid,
        free_text: request.free_text.trim(),
      },
    });
  }

  async generatePlanV2(
    planningBrief: PlanningBriefResponse["planning_brief"],
    options: { variants?: 1 | 2; allowFallback?: boolean; includeCandidateDebug?: boolean; communityPostIds?: string[] } = {},
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/v1/plans/generate-v2", {
      method: "POST",
      body: {
        planning_brief: planningBrief,
        options: {
          variants: options.variants || 1,
          allow_fallback: options.allowFallback ?? true,
          include_candidate_debug: options.includeCandidateDebug ?? false,
          community_post_ids: Array.isArray(options.communityPostIds)
            ? options.communityPostIds.map((item) => String(item || "").trim()).filter(Boolean)
            : [],
        },
      },
    });
  }

  async validateItinerary(itinerary: Record<string, unknown>, strict = false): Promise<ValidationResult> {
    const response = await this.request<{ validation_result?: unknown }>("/api/v1/plans/validate", {
      method: "POST",
      body: {
        itinerary,
        strict,
      },
    });
    const validation = (response.validation_result || {}) as {
      passed?: unknown;
      confidence_tier?: unknown;
      issues?: unknown;
      coverage?: unknown;
    };
    const coverage = (validation.coverage || {}) as Record<string, unknown>;
    return {
      passed: Boolean(validation.passed),
      confidenceTier: String(validation.confidence_tier || ""),
      issues: Array.isArray(validation.issues)
        ? validation.issues
            .map((item) => {
              const issue = item as { code?: unknown; message?: unknown };
              return {
                code: String(issue.code || ""),
                message: String(issue.message || ""),
              };
            })
            .filter((item) => item.code || item.message)
        : [],
      coverage: {
        providerGroundedBlocks: Number(coverage.provider_grounded_blocks || 0),
        routeEvidenceCoverage: Number(coverage.route_evidence_coverage || 0),
        weatherEvidenceCoverage: Number(coverage.weather_evidence_coverage || 0),
        mustGoHitRate: Number(coverage.must_go_hit_rate || 0),
      },
    };
  }

  async getPlaceDetail(provider: string, providerPlaceId: string): Promise<PlaceDetail> {
    const response = (await this.request<Record<string, unknown>>(
      `/api/v1/places/${encodeURIComponent(provider)}/${encodeURIComponent(providerPlaceId)}`,
    )) as Record<string, unknown>;
    return {
      provider: String(response.provider || ""),
      providerPlaceId: String(response.provider_place_id || ""),
      name: String(response.name || ""),
      address: String(response.address || ""),
      lat: Number(response.lat || 0),
      lng: Number(response.lng || 0),
      rating: Number(response.rating || 0),
      priceLevel: Number(response.price_level || 0),
      openingHoursText: String(response.opening_hours_text || ""),
      phone: String(response.phone || ""),
      images: Array.isArray(response.images) ? response.images.map((item) => String(item || "")) : [],
      tags: Array.isArray(response.tags) ? response.tags.map((item) => String(item || "")) : [],
      sourceFetchedAt: String(response.source_fetched_at || ""),
    };
  }

  async generatePlan(draft: PlanDraft): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/v1/plans/generate", {
      method: "POST",
      body: {
        origin_city: draft.origin_city.trim(),
        destination: draft.destination.trim(),
        days: draft.days,
        budget_level: draft.budget_level,
        companions: draft.companions,
        travel_styles: draft.travel_styles,
        must_go: draft.must_go,
        avoid: draft.avoid,
        start_date: draft.start_date.trim(),
        pace: draft.pace,
      },
    });
  }

  async replanPlan(itinerary: Record<string, unknown>, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/v1/plans/replan", {
      method: "POST",
      body: { itinerary, patch },
    });
  }

  async savePlan(itinerary: Record<string, unknown>): Promise<SavePlanResponse> {
    return this.request<SavePlanResponse>("/api/v1/plans/save", {
      method: "POST",
      body: { itinerary },
    });
  }

  async listSavedPlans(limit = 20): Promise<SavedPlanListItem[]> {
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
    return this.request<SavedPlanListItem[]>(`/api/v1/plans/saved?limit=${safeLimit}`);
  }

  async getSavedPlan(savedPlanId: string): Promise<SavedPlanDetail> {
    return this.request<SavedPlanDetail>(`/api/v1/plans/saved/${encodeURIComponent(savedPlanId)}`);
  }

  async createCommunityDraftFromSavedPlan(savedPlanId: string): Promise<CommunityPostDraftSeed> {
    const response = await this.request<Record<string, unknown>>(
      `/api/v1/plans/saved/${encodeURIComponent(savedPlanId)}/community-draft`,
    );
    return parseCommunityPostDraftSeed(response);
  }

  async uploadCommunityImage(file: {
    uri: string;
    name?: string;
    type?: string;
    width?: number;
    height?: number;
  }): Promise<CommunityMediaUploadResult> {
    const form = new FormData();
    form.append("file", {
      uri: String(file.uri || ""),
      name: String(file.name || "community-image.jpg"),
      type: String(file.type || "image/jpeg"),
    } as never);
    if (Number(file.width) > 0) form.append("width", String(file.width));
    if (Number(file.height) > 0) form.append("height", String(file.height));
    if (String(file.type || "").trim()) form.append("mime_type", String(file.type || "").trim());

    const response = await this.request<Record<string, unknown>>("/api/v1/community/media", {
      method: "POST",
      body: form,
      timeoutMs: 30_000,
    });
    return parseCommunityMediaUploadResult(response);
  }

  async deleteSavedPlan(savedPlanId: string): Promise<void> {
    await this.request<unknown>(`/api/v1/plans/saved/${encodeURIComponent(savedPlanId)}`, {
      method: "DELETE",
    });
  }

  async createPlanShare(savedPlanId: string, expiresInHours = 168): Promise<SharePlanResponse> {
    const safeHours = Math.max(1, Math.min(720, Number(expiresInHours) || 168));
    return this.request<SharePlanResponse>(`/api/v1/plans/saved/${encodeURIComponent(savedPlanId)}/share`, {
      method: "POST",
      body: { expires_in_hours: safeHours },
    });
  }

  async listCommunityPosts(options: {
    destinationId?: string;
    destinationLabel?: string;
    mine?: boolean;
    status?: string;
    limit?: number;
  } = {}): Promise<CommunityPost[]> {
    const params = new URLSearchParams();
    const safeLimit = Math.max(1, Math.min(50, Number(options.limit) || 20));
    params.set("limit", String(safeLimit));
    if (options.destinationId?.trim()) params.set("destination_id", options.destinationId.trim());
    if (options.destinationLabel?.trim()) params.set("destination_label", options.destinationLabel.trim());
    if (options.mine) params.set("mine", "true");
    if (options.status?.trim()) params.set("status", options.status.trim());
    const response = await this.request<{ items?: unknown[] }>(`/api/v1/community/posts?${params.toString()}`);
    return asArray(response.items).map((item) => parseCommunityPost(item));
  }

  async createCommunityPost(payload: CommunityPostCreateRequest): Promise<CommunityPost> {
    const response = await this.request<Record<string, unknown>>("/api/v1/community/posts", {
      method: "POST",
      body: {
        title: payload.title.trim(),
        content: payload.content.trim(),
        destination: payload.destination || null,
        destination_label: String(payload.destination_label || "").trim(),
        tags: payload.tags,
        image_urls: payload.image_urls,
        favorite_restaurants: payload.favorite_restaurants,
        favorite_attractions: payload.favorite_attractions,
      },
    });
    return parseCommunityPost(response);
  }

  async getCommunityPostDetail(postId: string): Promise<CommunityPostDetail> {
    const response = await this.request<Record<string, unknown>>(`/api/v1/community/posts/${encodeURIComponent(postId)}/detail`);
    return parseCommunityPostDetail(response);
  }

  async getCommunityAuthorProfile(userId: string): Promise<CommunityAuthorPublicProfile> {
    const response = await this.request<Record<string, unknown>>(`/api/v1/community/authors/${encodeURIComponent(userId)}`);
    return parseCommunityAuthorPublicProfile(response);
  }

  async voteCommunityPost(postId: string, voteType: CommunityVoteType = "helpful"): Promise<CommunityPost> {
    const response = await this.request<{ post?: unknown }>(`/api/v1/community/posts/${encodeURIComponent(postId)}/vote`, {
      method: "POST",
      body: { vote_type: voteType },
    });
    return parseCommunityPost(response.post);
  }

  async reportCommunityPost(postId: string, reason: CommunityReportReason, detail = ""): Promise<CommunityPost> {
    const response = await this.request<{ post?: unknown }>(`/api/v1/community/posts/${encodeURIComponent(postId)}/report`, {
      method: "POST",
      body: {
        reason,
        detail: String(detail || "").trim(),
      },
    });
    return parseCommunityPost(response.post);
  }

  async getPrivateProfileSummary(): Promise<PrivateProfileSummary> {
    const response = await this.request<Record<string, unknown>>("/api/v1/profile/private-summary");
    return parsePrivateProfileSummary(response);
  }

  async updatePrivatePersonalization(enabled: boolean): Promise<PrivateProfileSummary["settings"]> {
    const response = await this.request<{ settings?: unknown }>("/api/v1/profile/private-settings", {
      method: "PUT",
      body: { enabled },
    });
    return parsePrivateProfileSummary({ ready: false, settings: response.settings || {}, profile: {} }).settings;
  }

  async clearPrivatePersonalization(): Promise<PrivateProfileSummary> {
    const response = await this.request<Record<string, unknown>>("/api/v1/profile/private-signals", {
      method: "DELETE",
    });
    return parsePrivateProfileSummary({
      ready: false,
      settings: response.settings || {},
      profile: response.profile || {},
    });
  }

  async trackEvent(eventName: string, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.request<unknown>("/api/v1/events", {
      method: "POST",
      body: {
        event_name: String(eventName || "").trim(),
        metadata,
      },
    });
  }

  async chatIntakeNext(history: ChatTurnPayload[], draftPlanRequest: Record<string, unknown>): Promise<ChatIntakeResponse> {
    return this.request<ChatIntakeResponse>("/api/v1/chat/intake/next", {
      method: "POST",
      body: {
        history,
        draft_plan_request: draftPlanRequest,
      },
    });
  }
}
