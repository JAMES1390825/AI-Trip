package app

import (
	"testing"
	"time"
)

func TestProjectUserPrivateProfileBuildsStructuredSignals(t *testing.T) {
	now := time.Now().UTC()
	events := []EventRecord{
		{
			EventName: "preference_changed",
			UserID:    "u-1",
			CreatedAt: now.Add(-2 * time.Hour),
			Metadata: map[string]any{
				"budget_level":       "medium",
				"pace":               "relaxed",
				"travel_styles":      []string{"citywalk", "night_view"},
				"dining_preference":  "local_food",
				"weather_preference": "rain_friendly",
			},
		},
		{
			EventName: "block_removed",
			UserID:    "u-1",
			CreatedAt: now.Add(-90 * time.Minute),
			Metadata: map[string]any{
				"poi_category":            "shopping",
				"poi_tags":                []string{"mall", "indoor"},
				"route_minutes_from_prev": 31,
				"district_adcode":         "310101",
			},
		},
		{
			EventName: "block_replaced",
			UserID:    "u-1",
			CreatedAt: now.Add(-60 * time.Minute),
			Metadata: map[string]any{
				"removed_category":        "shopping",
				"removed_tags":            []string{"mall"},
				"added_category":          "sight",
				"added_tags":              []string{"river_view", "night_view"},
				"route_minutes_from_prev": 18,
				"district_adcode":         "310101",
			},
		},
		{
			EventName: "navigation_started",
			UserID:    "u-1",
			CreatedAt: now.Add(-30 * time.Minute),
			Metadata: map[string]any{
				"poi_category":            "sight",
				"poi_tags":                []string{"citywalk", "night_view"},
				"route_minutes_from_prev": 14,
				"walking_minutes":         12,
				"district_adcode":         "310101",
			},
		},
		{
			EventName: "plan_saved",
			UserID:    "u-1",
			CreatedAt: now.Add(-10 * time.Minute),
			Metadata: map[string]any{
				"poi_category":      "sight",
				"poi_tags":          []string{"citywalk"},
				"daily_block_count": 3,
			},
		},
	}

	profile := projectUserPrivateProfile("u-1", events)

	if profile.UserID != "u-1" {
		t.Fatalf("expected user id u-1, got %q", profile.UserID)
	}
	if profile.Version != userPrivateProfileVersion {
		t.Fatalf("expected profile version %d, got %d", userPrivateProfileVersion, profile.Version)
	}
	if profile.ExplicitPreferences.BudgetLevel != "medium" {
		t.Fatalf("expected explicit budget medium, got %q", profile.ExplicitPreferences.BudgetLevel)
	}
	if profile.ExplicitPreferences.WeatherPreference != "rain_friendly" {
		t.Fatalf("expected weather preference rain_friendly, got %q", profile.ExplicitPreferences.WeatherPreference)
	}
	if len(profile.ExplicitPreferences.TravelStyles) != 2 {
		t.Fatalf("expected 2 explicit travel styles, got %#v", profile.ExplicitPreferences.TravelStyles)
	}
	if got := profile.BehavioralAffinity.Categories["shopping"]; got >= 0 {
		t.Fatalf("expected shopping to be negative, got %v", got)
	}
	if got := profile.BehavioralAffinity.Categories["sight"]; got <= 0 {
		t.Fatalf("expected sight to be positive, got %v", got)
	}
	if got := profile.BehavioralAffinity.Tags["citywalk"]; got <= 0 {
		t.Fatalf("expected citywalk affinity positive, got %v", got)
	}
	if got := profile.BehavioralAffinity.Tags["mall"]; got >= 0 {
		t.Fatalf("expected mall affinity negative, got %v", got)
	}
	if got := profile.BehavioralAffinity.Districts["310101"]; got <= 0 {
		t.Fatalf("expected district affinity positive, got %v", got)
	}
	if profile.TimingProfile.PreferredDailyBlocks < 2.5 || profile.TimingProfile.PreferredDailyBlocks > 3.5 {
		t.Fatalf("expected preferred daily blocks around 3, got %v", profile.TimingProfile.PreferredDailyBlocks)
	}
	if profile.TimingProfile.MaxTransitMinutes < 12 || profile.TimingProfile.MaxTransitMinutes > 35 {
		t.Fatalf("unexpected max transit minutes: %d", profile.TimingProfile.MaxTransitMinutes)
	}
	if profile.RiskProfile.RainAvoidOutdoor >= 0.5 {
		t.Fatalf("expected rain avoid outdoor to decrease for rain_friendly, got %v", profile.RiskProfile.RainAvoidOutdoor)
	}
	if profile.Stats.Events30d != len(events) {
		t.Fatalf("expected events_30d=%d, got %d", len(events), profile.Stats.Events30d)
	}
	if profile.Stats.EffectiveActions30d < 4 {
		t.Fatalf("expected at least 4 effective actions, got %d", profile.Stats.EffectiveActions30d)
	}
	if profile.Confidence.BehavioralAffinity <= 0 {
		t.Fatalf("expected positive behavioral confidence, got %v", profile.Confidence.BehavioralAffinity)
	}
}

func TestStoreAddEventUpdatesPrivateProfilesByUser(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if err := store.AddEvent(EventRecord{
		EventName: "block_removed",
		UserID:    "u-1",
		CreatedAt: time.Now().UTC(),
		Metadata: map[string]any{
			"poi_category": "shopping",
			"poi_tags":     []string{"mall"},
		},
	}); err != nil {
		t.Fatalf("add event u-1 failed: %v", err)
	}

	if err := store.AddEvent(EventRecord{
		EventName: "navigation_started",
		UserID:    "u-2",
		CreatedAt: time.Now().UTC(),
		Metadata: map[string]any{
			"poi_category": "sight",
			"poi_tags":     []string{"night_view"},
		},
	}); err != nil {
		t.Fatalf("add event u-2 failed: %v", err)
	}

	u1, ok := store.GetPrivateProfile("u-1")
	if !ok {
		t.Fatalf("expected profile for u-1")
	}
	u2, ok := store.GetPrivateProfile("u-2")
	if !ok {
		t.Fatalf("expected profile for u-2")
	}

	if got := u1.BehavioralAffinity.Categories["shopping"]; got >= 0 {
		t.Fatalf("expected u-1 shopping to be negative, got %v", got)
	}
	if _, exists := u1.BehavioralAffinity.Categories["sight"]; exists {
		t.Fatalf("expected u-1 profile not to inherit u-2 sight affinity")
	}
	if got := u2.BehavioralAffinity.Categories["sight"]; got <= 0 {
		t.Fatalf("expected u-2 sight to be positive, got %v", got)
	}
}
