package app

import "time"

type Config struct {
	Port        int
	CORSOrigins []string
	Auth        AuthConfig
	Storage     StorageConfig
	AI          AIServiceConfig
	Amap        AmapConfig
}

type AuthConfig struct {
	JWTSecret             string
	ExpirationMinutes     int
	BootstrapClientSecret string
}

type StorageConfig struct {
	DataFile          string
	CommunityMediaDir string
}

type AIServiceConfig struct {
	BaseURL   string
	APIToken  string
	ModelName string
	TimeoutMs int
}

type AmapConfig struct {
	APIKey    string
	BaseURL   string
	TimeoutMs int
}

type AuthUser struct {
	UserID string
	Role   string
}

type AppError struct {
	Status  int
	Code    string
	Message string
}

func (e *AppError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type ChatTurn struct {
	Role    string `json:"role"`
	Message string `json:"message"`
}

type DestinationEntity struct {
	DestinationID    string  `json:"destination_id"`
	DestinationLabel string  `json:"destination_label"`
	Country          string  `json:"country"`
	Region           string  `json:"region"`
	Adcode           string  `json:"adcode"`
	CityCode         string  `json:"city_code"`
	CenterLat        float64 `json:"center_lat"`
	CenterLng        float64 `json:"center_lng"`
	Provider         string  `json:"provider"`
	ProviderPlaceID  string  `json:"provider_place_id"`
	MatchType        string  `json:"match_type"`
}

type DestinationResolveResponse struct {
	Items    []DestinationEntity `json:"items"`
	Degraded bool                `json:"degraded"`
}

type PlanningConstraints struct {
	WeatherPreference string `json:"weather_preference,omitempty"`
	DiningPreference  string `json:"dining_preference,omitempty"`
	LodgingAnchor     string `json:"lodging_anchor,omitempty"`
}

type PlanningBrief struct {
	OriginCity      string              `json:"origin_city"`
	Destination     *DestinationEntity  `json:"destination"`
	Days            int                 `json:"days"`
	StartDate       string              `json:"start_date"`
	BudgetLevel     string              `json:"budget_level"`
	Pace            string              `json:"pace"`
	TravelStyles    []string            `json:"travel_styles"`
	MustGo          []string            `json:"must_go"`
	Avoid           []string            `json:"avoid"`
	Constraints     PlanningConstraints `json:"constraints"`
	MissingFields   []string            `json:"missing_fields"`
	ReadyToGenerate bool                `json:"ready_to_generate"`
}

type PlanningBriefResponse struct {
	PlanningBrief         PlanningBrief `json:"planning_brief"`
	AssistantMessage      string        `json:"assistant_message"`
	NextAction            string        `json:"next_action,omitempty"`
	ClarificationQuestion string        `json:"clarification_question,omitempty"`
	SuggestedOptions      []string      `json:"suggested_options,omitempty"`
	SourceMode            string        `json:"source_mode,omitempty"`
	Degraded              bool          `json:"degraded"`
}

type ValidationIssue struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ValidationCoverage struct {
	ProviderGroundedBlocks  float64 `json:"provider_grounded_blocks"`
	RouteEvidenceCoverage   float64 `json:"route_evidence_coverage"`
	WeatherEvidenceCoverage float64 `json:"weather_evidence_coverage"`
	MustGoHitRate           float64 `json:"must_go_hit_rate"`
}

type ValidationResult struct {
	Passed         bool               `json:"passed"`
	ConfidenceTier string             `json:"confidence_tier"`
	Issues         []ValidationIssue  `json:"issues"`
	Coverage       ValidationCoverage `json:"coverage"`
}

type PlaceDetail struct {
	Provider         string   `json:"provider"`
	ProviderPlaceID  string   `json:"provider_place_id"`
	Name             string   `json:"name"`
	Address          string   `json:"address"`
	Lat              float64  `json:"lat"`
	Lng              float64  `json:"lng"`
	Rating           float64  `json:"rating"`
	PriceLevel       int      `json:"price_level"`
	OpeningHoursText string   `json:"opening_hours_text"`
	Phone            string   `json:"phone"`
	Images           []string `json:"images"`
	Tags             []string `json:"tags"`
	SourceFetchedAt  string   `json:"source_fetched_at"`
}

type PlanRequest struct {
	OriginCity   string
	Destination  string
	Days         int
	BudgetLevel  string
	Companions   []string
	TravelStyles []string
	MustGo       []string
	Avoid        []string
	StartDate    string
	Pace         string
	UserID       string
}

type PlanGenerateOptions struct {
	CommunityPostIDs []string `json:"community_post_ids,omitempty"`
}

type SavedPlan struct {
	ID        string
	UserID    string
	Itinerary map[string]any
	SavedAt   time.Time
}

type PreTripTaskReminder struct {
	Enabled     bool  `json:"enabled"`
	OffsetHours []int `json:"offset_hours"`
}

type PreTripTask struct {
	ID       string               `json:"id"`
	Category string               `json:"category"`
	Title    string               `json:"title"`
	DueAt    string               `json:"due_at,omitempty"`
	Status   string               `json:"status"`
	Reminder *PreTripTaskReminder `json:"reminder,omitempty"`
}

type ExecutionBlockState struct {
	DayIndex  int       `json:"day_index"`
	BlockID   string    `json:"block_id"`
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updated_at"`
}

type PlanExecutionState struct {
	SavedPlanID string                `json:"saved_plan_id"`
	UserID      string                `json:"user_id"`
	Date        string                `json:"date"`
	Blocks      []ExecutionBlockState `json:"blocks"`
	UpdatedAt   time.Time             `json:"updated_at"`
}

type ShareTokenRecord struct {
	Token     string    `json:"token"`
	PlanID    string    `json:"plan_id"`
	UserID    string    `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
	ClosedAt  time.Time `json:"closed_at,omitempty"`
}

type SavedPlanVersion struct {
	Version       int
	ParentVersion int
	Summary       string
	ChangeCount   int
	ChangeTypes   []string
	Itinerary     map[string]any
	CreatedAt     time.Time
}

type EventRecord struct {
	EventName string
	UserID    string
	Metadata  map[string]any
	CreatedAt time.Time
}

type UserExplicitPreferences struct {
	BudgetLevel       string   `json:"budget_level,omitempty"`
	Pace              string   `json:"pace,omitempty"`
	TravelStyles      []string `json:"travel_styles,omitempty"`
	DiningPreference  string   `json:"dining_preference,omitempty"`
	WeatherPreference string   `json:"weather_preference,omitempty"`
}

type UserBehavioralAffinity struct {
	Categories map[string]float64 `json:"categories"`
	Tags       map[string]float64 `json:"tags"`
	Districts  map[string]float64 `json:"districts"`
}

type UserTimingProfile struct {
	PreferredDailyBlocks float64 `json:"preferred_daily_blocks"`
	LunchOffsetMinutes   int     `json:"lunch_offset_minutes"`
	MaxTransitMinutes    int     `json:"max_transit_minutes"`
}

type UserRiskProfile struct {
	RainAvoidOutdoor float64 `json:"rain_avoid_outdoor"`
	WalkingTolerance float64 `json:"walking_tolerance"`
	QueueTolerance   float64 `json:"queue_tolerance"`
}

type UserProfileStats struct {
	Events30d           int `json:"events_30d"`
	EffectiveActions30d int `json:"effective_actions_30d"`
	SavedPlans30d       int `json:"saved_plans_30d"`
}

type UserProfileConfidence struct {
	BehavioralAffinity float64 `json:"behavioral_affinity"`
	TimingProfile      float64 `json:"timing_profile"`
	RiskProfile        float64 `json:"risk_profile"`
}

type UserPersonalizationSettings struct {
	Enabled   bool      `json:"enabled"`
	UpdatedAt time.Time `json:"updated_at"`
	ClearedAt time.Time `json:"cleared_at,omitempty"`
}

type UserPrivateProfile struct {
	UserID              string                  `json:"user_id"`
	Version             int                     `json:"version"`
	ExplicitPreferences UserExplicitPreferences `json:"explicit_preferences"`
	BehavioralAffinity  UserBehavioralAffinity  `json:"behavioral_affinity"`
	TimingProfile       UserTimingProfile       `json:"timing_profile"`
	RiskProfile         UserRiskProfile         `json:"risk_profile"`
	Stats               UserProfileStats        `json:"stats"`
	Confidence          UserProfileConfidence   `json:"confidence"`
	UpdatedAt           time.Time               `json:"updated_at"`
}

type CommunityVoteSummary struct {
	HelpfulCount  int `json:"helpful_count"`
	WantToGoCount int `json:"want_to_go_count"`
}

type CommunityPost struct {
	ID                  string               `json:"id"`
	UserID              string               `json:"user_id"`
	Title               string               `json:"title"`
	Content             string               `json:"content"`
	DestinationID       string               `json:"destination_id"`
	DestinationLabel    string               `json:"destination_label"`
	DestinationAdcode   string               `json:"destination_adcode,omitempty"`
	Tags                []string             `json:"tags"`
	ImageURLs           []string             `json:"image_urls"`
	FavoriteRestaurants []string             `json:"favorite_restaurants"`
	FavoriteAttractions []string             `json:"favorite_attractions"`
	MentionedPlaces     []string             `json:"mentioned_places"`
	Status              string               `json:"status"`
	QualityScore        float64              `json:"quality_score"`
	ProcessingNote      string               `json:"processing_note,omitempty"`
	VoteSummary         CommunityVoteSummary `json:"vote_summary"`
	ReferenceCount      int                  `json:"reference_count,omitempty"`
	ReferencedSaveCount int                  `json:"referenced_save_count,omitempty"`
	PublishedAt         time.Time            `json:"published_at,omitempty"`
	CreatedAt           time.Time            `json:"created_at"`
	UpdatedAt           time.Time            `json:"updated_at"`
}

type CommunityVote struct {
	PostID    string    `json:"post_id"`
	UserID    string    `json:"user_id"`
	VoteType  string    `json:"vote_type"`
	CreatedAt time.Time `json:"created_at"`
}

type CommunityReport struct {
	ID             string    `json:"id"`
	PostID         string    `json:"post_id"`
	ReporterUserID string    `json:"reporter_user_id"`
	Reason         string    `json:"reason"`
	Detail         string    `json:"detail,omitempty"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
	ResolvedAt     time.Time `json:"resolved_at,omitempty"`
}

type CommunityModerationLog struct {
	ID             string    `json:"id"`
	PostID         string    `json:"post_id"`
	OperatorUserID string    `json:"operator_user_id"`
	Action         string    `json:"action"`
	Reason         string    `json:"reason"`
	Note           string    `json:"note,omitempty"`
	PreviousStatus string    `json:"previous_status"`
	NextStatus     string    `json:"next_status"`
	CreatedAt      time.Time `json:"created_at"`
}

type CommunityReportAggregate struct {
	Post            CommunityPost            `json:"post"`
	OpenReportCount int                      `json:"open_report_count"`
	LatestReportAt  time.Time                `json:"latest_report_at"`
	Reasons         []string                 `json:"reasons"`
	Reports         []CommunityReport        `json:"reports"`
	ModerationLogs  []CommunityModerationLog `json:"moderation_logs,omitempty"`
}

type CommunityPostDraftSeed struct {
	Title               string   `json:"title"`
	Content             string   `json:"content"`
	DestinationLabel    string   `json:"destination_label"`
	Tags                []string `json:"tags"`
	ImageURLs           []string `json:"image_urls"`
	FavoriteRestaurants []string `json:"favorite_restaurants"`
	FavoriteAttractions []string `json:"favorite_attractions"`
}

type CommunityAuthorDestinationSummary struct {
	DestinationID    string `json:"destination_id"`
	DestinationLabel string `json:"destination_label"`
	PostCount        int    `json:"post_count"`
}

type CommunityAuthorPublicProfile struct {
	UserID              string                              `json:"user_id"`
	DisplayName         string                              `json:"display_name"`
	PublishedPostCount  int                                 `json:"published_post_count"`
	HelpfulCount        int                                 `json:"helpful_count"`
	ReferenceCount      int                                 `json:"reference_count"`
	ReferencedSaveCount int                                 `json:"referenced_save_count"`
	TopTags             []string                            `json:"top_tags"`
	Destinations        []CommunityAuthorDestinationSummary `json:"destinations"`
	RecentPosts         []CommunityPost                     `json:"recent_posts"`
	UpdatedAt           time.Time                           `json:"updated_at"`
}

type CommunityPostDetail struct {
	Post                CommunityPost                `json:"post"`
	Author              CommunityAuthorPublicProfile `json:"author"`
	RelatedPosts        []CommunityPost              `json:"related_posts"`
	ReferenceCount      int                          `json:"reference_count"`
	ReferencedSaveCount int                          `json:"referenced_save_count"`
}

type CommunityPostFilter struct {
	RequestUserID    string
	OwnerOnly        bool
	AdminView        bool
	DestinationID    string
	DestinationLabel string
	Status           string
	Limit            int
}

type CommunityPlaceSignal struct {
	Name          string   `json:"name"`
	Category      string   `json:"category"`
	Score         float64  `json:"score"`
	MentionCount  int      `json:"mention_count"`
	SourcePostIDs []string `json:"source_post_ids,omitempty"`
}

type CommunityTagSignal struct {
	Tag           string   `json:"tag"`
	Score         float64  `json:"score"`
	SourcePostIDs []string `json:"source_post_ids,omitempty"`
}

type CommunityPlanningSummary struct {
	DestinationID       string                 `json:"destination_id"`
	DestinationLabel    string                 `json:"destination_label"`
	PublishedPostCount  int                    `json:"published_post_count"`
	ReferencedPostIDs   []string               `json:"referenced_post_ids"`
	TopPlaces           []CommunityPlaceSignal `json:"top_places"`
	TopTags             []CommunityTagSignal   `json:"top_tags"`
	LastSignalUpdatedAt time.Time              `json:"last_signal_updated_at"`
}
