package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHandleSavedPlanCommunityDraftBuildsSeed(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	itinerary := map[string]any{
		"destination": "杭州",
		"start_date":  "2026-04-18",
		"days": []map[string]any{
			{
				"day_index": 0,
				"date":      "2026-04-18",
				"blocks": []map[string]any{
					{
						"block_type": "sight",
						"poi":        "西湖",
					},
					{
						"block_type": "food",
						"poi":        "知味观",
					},
					{
						"block_type": "sight",
						"poi":        "中国丝绸博物馆",
					},
				},
			},
			{
				"day_index": 1,
				"date":      "2026-04-19",
				"blocks": []map[string]any{
					{
						"block_type": "sight",
						"poi":        "钱塘江",
					},
				},
			},
		},
		"poi_sequence": []string{"西湖", "知味观", "中国丝绸博物馆", "钱塘江"},
		"request_snapshot": map[string]any{
			"planning_brief": map[string]any{
				"destination": map[string]any{
					"destination_id":    "amap:adcode:330100",
					"destination_label": "杭州",
					"adcode":            "330100",
					"provider":          "amap",
				},
				"days":              2,
				"start_date":        "2026-04-18",
				"pace":              "relaxed",
				"travel_styles":     []string{"citywalk"},
				"ready_to_generate": true,
			},
		},
	}

	if _, err := store.SavePlan(SavedPlan{
		ID:        "p-community-draft",
		UserID:    "u-1",
		Itinerary: itinerary,
		SavedAt:   time.Date(2026, 4, 10, 9, 30, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("save plan: %v", err)
	}

	rr := httptest.NewRecorder()
	app.handleSavedPlanCommunityDraft(rr, &AuthUser{UserID: "u-1"}, "p-community-draft")

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var seed CommunityPostDraftSeed
	if err := json.Unmarshal(rr.Body.Bytes(), &seed); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if seed.DestinationLabel != "杭州" {
		t.Fatalf("expected 杭州 destination_label, got %q", seed.DestinationLabel)
	}
	if !strings.Contains(seed.Title, "杭州") || !strings.Contains(seed.Title, "2天") {
		t.Fatalf("expected title to include destination and days, got %q", seed.Title)
	}
	if !strings.Contains(seed.Content, "西湖") || !strings.Contains(seed.Content, "知味观") {
		t.Fatalf("expected content to include route highlights, got %q", seed.Content)
	}
	if !containsString(seed.Tags, "城市漫游") {
		t.Fatalf("expected draft tags to include 城市漫游, got %#v", seed.Tags)
	}
	if !containsString(seed.Tags, "美食") {
		t.Fatalf("expected draft tags to include 美食, got %#v", seed.Tags)
	}
	if len(seed.FavoriteRestaurants) != 1 || seed.FavoriteRestaurants[0] != "知味观" {
		t.Fatalf("expected favorite_restaurants [知味观], got %#v", seed.FavoriteRestaurants)
	}
	if !containsString(seed.FavoriteAttractions, "西湖") || !containsString(seed.FavoriteAttractions, "中国丝绸博物馆") {
		t.Fatalf("expected attractions to include route POIs, got %#v", seed.FavoriteAttractions)
	}
}
