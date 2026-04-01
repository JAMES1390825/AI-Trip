package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlePlanningBriefReturnsReadyBrief(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	body, err := json.Marshal(map[string]any{
		"origin_city":      "上海",
		"destination_text": "上海",
		"selected_destination": map[string]any{
			"destination_id":    "builtin:cn-shanghai",
			"destination_label": "上海市",
			"country":           "中国",
			"region":            "上海",
			"adcode":            "310000",
			"city_code":         "021",
			"center_lat":        31.2304,
			"center_lng":        121.4737,
			"provider":          "builtin",
			"provider_place_id": "cn-shanghai",
			"match_type":        "city",
		},
		"days":          3,
		"start_date":    "2026-04-16",
		"budget_level":  "medium",
		"pace":          "relaxed",
		"travel_styles": []string{"citywalk", "美食"},
		"must_go":       []string{"外滩"},
		"free_text":     "雨天也能执行，尽量多一点本地餐馆，住在南京东路附近",
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/brief", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	app.handlePlanningBrief(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp PlanningBriefResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if resp.Degraded {
		t.Fatalf("expected degraded=false")
	}
	if !resp.PlanningBrief.ReadyToGenerate {
		t.Fatalf("expected ready_to_generate=true")
	}
	if resp.NextAction != "GENERATE" {
		t.Fatalf("expected next_action GENERATE, got %q", resp.NextAction)
	}
	if resp.PlanningBrief.Destination == nil {
		t.Fatalf("expected destination to be resolved")
	}
	if resp.PlanningBrief.Constraints.WeatherPreference != "rain_friendly" {
		t.Fatalf("expected rain_friendly, got %q", resp.PlanningBrief.Constraints.WeatherPreference)
	}
	if resp.PlanningBrief.Constraints.DiningPreference != "local_food" {
		t.Fatalf("expected local_food, got %q", resp.PlanningBrief.Constraints.DiningPreference)
	}
	if resp.PlanningBrief.Constraints.LodgingAnchor != "南京东路附近" {
		t.Fatalf("expected lodging anchor 南京东路附近, got %q", resp.PlanningBrief.Constraints.LodgingAnchor)
	}
}

func TestHandlePlanningBriefRequestsDestinationConfirmationForCustomInput(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	body, err := json.Marshal(map[string]any{
		"origin_city":      "上海",
		"destination_text": "火星环形山酒店",
		"selected_destination": map[string]any{
			"destination_id":    "custom:火星环形山酒店",
			"destination_label": "火星环形山酒店",
			"provider":          "custom",
			"provider_place_id": "",
			"match_type":        "custom",
		},
		"days":         3,
		"start_date":   "2026-04-16",
		"budget_level": "medium",
		"pace":         "relaxed",
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/brief", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	app.handlePlanningBrief(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp PlanningBriefResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if !resp.Degraded {
		t.Fatalf("expected degraded=true")
	}
	if resp.PlanningBrief.ReadyToGenerate {
		t.Fatalf("expected ready_to_generate=false")
	}
	if resp.NextAction != "CONFIRM_DESTINATION" {
		t.Fatalf("expected CONFIRM_DESTINATION, got %q", resp.NextAction)
	}
	if len(resp.PlanningBrief.MissingFields) == 0 || resp.PlanningBrief.MissingFields[0] != "destination" {
		t.Fatalf("expected destination missing, got %#v", resp.PlanningBrief.MissingFields)
	}
	if resp.PlanningBrief.Destination != nil {
		t.Fatalf("expected destination=nil for custom input")
	}
}

func TestBuildPlanningBriefAutoResolvesKnownDestinationText(t *testing.T) {
	resp := buildPlanningBrief(planningBriefRequest{
		OriginCity:      "上海",
		DestinationText: "杭州",
		Days:            2,
		StartDate:       "2026-04-20",
		BudgetLevel:     "medium",
		Pace:            "relaxed",
	})

	if !resp.PlanningBrief.ReadyToGenerate {
		t.Fatalf("expected ready_to_generate=true")
	}
	if resp.PlanningBrief.Destination == nil {
		t.Fatalf("expected auto-resolved destination")
	}
	if resp.PlanningBrief.Destination.DestinationID != "builtin:cn-hangzhou" {
		t.Fatalf("expected hangzhou destination, got %q", resp.PlanningBrief.Destination.DestinationID)
	}
}
