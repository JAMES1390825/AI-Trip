export type BudgetLevel = "low" | "medium" | "high";
export type PaceLevel = "relaxed" | "compact";
export type DestinationMatchType = "city" | "district" | "poi" | "custom";

export type DestinationEntity = {
  destination_id: string;
  destination_label: string;
  country: string;
  region: string;
  adcode: string;
  city_code: string;
  center_lat: number;
  center_lng: number;
  provider: string;
  provider_place_id: string;
  match_type: DestinationMatchType;
};

export type PlanDraft = {
  origin_city: string;
  destination: string;
  destination_entity?: DestinationEntity | null;
  days: number;
  budget_level: BudgetLevel;
  companions: string[];
  travel_styles: string[];
  must_go: string[];
  avoid: string[];
  start_date: string;
  pace: PaceLevel;
};

export type HealthResponse = {
  status?: string;
  service?: string;
  scope?: string;
};

export type AuthTokenResponse = {
  token_type?: string;
  access_token: string;
  expires_at?: string;
};

export type SavePlanResponse = {
  id?: string;
  saved_plan_id?: string;
  user_id?: string;
  itinerary?: Record<string, unknown>;
  saved_at?: string;
  updated_at?: string;
  deduped?: boolean;
};

export type SavedPlanListItem = {
  id: string;
  destination: string;
  start_date: string;
  granularity: string;
  confidence: number;
  saved_at: string;
  updated_at: string;
};

export type SavedPlanDetail = {
  id: string;
  user_id?: string;
  itinerary: Record<string, unknown>;
  saved_at?: string;
  updated_at?: string;
};

export type SharePlanResponse = {
  token?: string;
  share_path?: string;
  expires_at?: string;
};

export type DestinationResolveResponse = {
  items?: DestinationEntity[];
  degraded?: boolean;
};

export type PlanningConstraints = {
  weather_preference?: string;
  dining_preference?: string;
  lodging_anchor?: string;
};

export type PlanningBrief = {
  origin_city: string;
  destination: DestinationEntity | null;
  days: number;
  start_date: string;
  budget_level: BudgetLevel;
  pace: PaceLevel;
  travel_styles: string[];
  must_go: string[];
  avoid: string[];
  constraints: PlanningConstraints;
  missing_fields: string[];
  ready_to_generate: boolean;
};

export type PlanningBriefRequest = {
  origin_city: string;
  destination_text: string;
  selected_destination?: DestinationEntity | null;
  days: number;
  start_date: string;
  budget_level: BudgetLevel;
  pace: PaceLevel;
  travel_styles: string[];
  must_go: string[];
  avoid: string[];
  free_text: string;
};

export type PlanningBriefResponse = {
  planning_brief: PlanningBrief;
  assistant_message?: string;
  next_action?: string;
  clarification_question?: string;
  suggested_options?: string[];
  source_mode?: string;
  degraded?: boolean;
};

export type CommunityPostStatus = "draft" | "reviewing" | "published" | "limited" | "reported" | "removed";
export type CommunityVoteType = "helpful" | "want_to_go";
export type CommunityReportReason = "factually_incorrect" | "advertising" | "unsafe" | "spam" | "other";

export type CommunityVoteSummary = {
  helpful_count: number;
  want_to_go_count: number;
};

export type CommunityPost = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  destination_id: string;
  destination_label: string;
  destination_adcode?: string;
  tags: string[];
  image_urls: string[];
  favorite_restaurants: string[];
  favorite_attractions: string[];
  mentioned_places: string[];
  status: CommunityPostStatus;
  quality_score: number;
  processing_note?: string;
  vote_summary: CommunityVoteSummary;
  reference_count?: number;
  referenced_save_count?: number;
  published_at?: string;
  created_at: string;
  updated_at: string;
};

export type CommunityAuthorDestinationSummary = {
  destination_id: string;
  destination_label: string;
  post_count: number;
};

export type CommunityAuthorPublicProfile = {
  user_id: string;
  display_name: string;
  published_post_count: number;
  helpful_count: number;
  reference_count: number;
  referenced_save_count: number;
  top_tags: string[];
  destinations: CommunityAuthorDestinationSummary[];
  recent_posts: CommunityPost[];
  updated_at?: string;
};

export type CommunityPostDetail = {
  post: CommunityPost;
  author: CommunityAuthorPublicProfile;
  related_posts: CommunityPost[];
  reference_count: number;
  referenced_save_count: number;
};

export type UserExplicitPreferences = {
  budget_level?: string;
  pace?: string;
  travel_styles: string[];
  dining_preference?: string;
  weather_preference?: string;
};

export type UserBehavioralAffinity = {
  categories: Record<string, number>;
  tags: Record<string, number>;
  districts: Record<string, number>;
};

export type UserTimingProfile = {
  preferred_daily_blocks: number;
  lunch_offset_minutes: number;
  max_transit_minutes: number;
};

export type UserRiskProfile = {
  rain_avoid_outdoor: number;
  walking_tolerance: number;
  queue_tolerance: number;
};

export type UserProfileStats = {
  events_30d: number;
  effective_actions_30d: number;
  saved_plans_30d: number;
};

export type UserProfileConfidence = {
  behavioral_affinity: number;
  timing_profile: number;
  risk_profile: number;
};

export type UserPrivateProfile = {
  user_id: string;
  version: number;
  explicit_preferences: UserExplicitPreferences;
  behavioral_affinity: UserBehavioralAffinity;
  timing_profile: UserTimingProfile;
  risk_profile: UserRiskProfile;
  stats: UserProfileStats;
  confidence: UserProfileConfidence;
  updated_at?: string;
};

export type UserPersonalizationSettings = {
  enabled: boolean;
  updated_at?: string;
  cleared_at?: string;
};

export type PrivateProfileSummary = {
  ready: boolean;
  settings: UserPersonalizationSettings;
  profile: UserPrivateProfile;
};

export type CommunityPostDraftSeed = {
  title: string;
  content: string;
  destination_label: string;
  tags: string[];
  image_urls: string[];
  favorite_restaurants: string[];
  favorite_attractions: string[];
};

export type CommunityMediaUploadResult = {
  asset_id: string;
  public_url: string;
  public_path?: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
};

export type CommunityPostCreateRequest = {
  title: string;
  content: string;
  destination?: DestinationEntity | null;
  destination_label?: string;
  tags: string[];
  image_urls: string[];
  favorite_restaurants: string[];
  favorite_attractions: string[];
};

export type ChatTurnPayload = {
  role: "user" | "assistant";
  message: string;
};

export type ChatIntakeResponse = {
  assistant_message?: string;
  updated_draft?: Record<string, unknown>;
  missing_fields?: string[];
  suggested_options?: string[];
  ready_to_generate?: boolean;
  confidence?: number;
  next_action?: string;
  source_mode?: string;
};
