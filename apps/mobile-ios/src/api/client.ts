import type {
  AuthTokenResponse,
  ChatIntakeResponse,
  ChatTurnPayload,
  DestinationEntity,
  DestinationResolveResponse,
  HealthResponse,
  PlanDraft,
  PlanningBriefRequest,
  PlanningBriefResponse,
  SavePlanResponse,
  SavedPlanDetail,
  SavedPlanListItem,
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

    if (options.body !== undefined) {
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
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
    const tokenBody = await this.request<AuthTokenResponse>("/api/v1/auth/token", {
      method: "POST",
      auth: false,
      timeoutMs: 5_000,
      body: {
        user_id: config.userId.trim(),
        role: "USER",
        client_secret: config.bootstrapSecret.trim(),
      },
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
    options: { variants?: 1 | 2; allowFallback?: boolean; includeCandidateDebug?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/v1/plans/generate-v2", {
      method: "POST",
      body: {
        planning_brief: planningBrief,
        options: {
          variants: options.variants || 1,
          allow_fallback: options.allowFallback ?? true,
          include_candidate_debug: options.includeCandidateDebug ?? false,
        },
      },
    });
  }

  async validateItinerary(itinerary: Record<string, unknown>, strict = false): Promise<ValidationResult> {
    const response = await this.request<{ validation_result?: unknown }>("/api/v1/plans/validate", {
      method: "POST",
      body: { itinerary, strict },
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

  async deleteSavedPlan(savedPlanId: string): Promise<void> {
    await this.request<unknown>(`/api/v1/plans/saved/${encodeURIComponent(savedPlanId)}`, {
      method: "DELETE",
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
