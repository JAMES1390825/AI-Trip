package app

import "time"

type Config struct {
	Port        int
	CORSOrigins []string
	Auth        AuthConfig
	Storage     StorageConfig
}

type AuthConfig struct {
	JWTSecret             string
	ExpirationMinutes     int
	BootstrapClientSecret string
}

type StorageConfig struct {
	DataFile string
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
