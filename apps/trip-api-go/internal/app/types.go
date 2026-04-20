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
	DataFile string
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
}

type SavedPlan struct {
	ID        string
	UserID    string
	Itinerary map[string]any
	SavedAt   time.Time
}
