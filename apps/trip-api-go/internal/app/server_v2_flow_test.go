package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBuildGenerateV2PlansResponseReturnsEnvelopeFields(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	brief := PlanningBrief{
		OriginCity: "上海",
		Destination: &DestinationEntity{
			DestinationID:    "builtin:cn-shanghai",
			DestinationLabel: "上海市",
			Provider:         "builtin",
		},
		Days:            2,
		StartDate:       "2026-04-18",
		BudgetLevel:     "medium",
		Pace:            "relaxed",
		TravelStyles:    []string{"citywalk"},
		ReadyToGenerate: true,
	}

	response, appErr := app.buildGenerateV2PlansResponse(context.Background(), brief, "u-1", 1, true, PlanGenerateOptions{})
	if appErr != nil {
		t.Fatalf("unexpected app error: %v", appErr)
	}

	plans := asSlice(response["plans"])
	if len(plans) != 1 {
		t.Fatalf("expected 1 plan, got %d", len(plans))
	}
	itinerary := asMap(asMap(plans[0])["itinerary"])
	if len(asMap(itinerary["validation_result"])) == 0 {
		t.Fatalf("expected validation_result on itinerary")
	}
	if asString(itinerary["degraded_reason"]) == "" {
		t.Fatalf("expected degraded_reason on itinerary")
	}
}

func TestBuildGenerateV2PlansResponseRejectsFallbackWhenDisabled(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	brief := PlanningBrief{
		OriginCity: "上海",
		Destination: &DestinationEntity{
			DestinationID:    "builtin:cn-shanghai",
			DestinationLabel: "上海市",
			Provider:         "builtin",
		},
		Days:            2,
		StartDate:       "2026-04-18",
		BudgetLevel:     "medium",
		Pace:            "relaxed",
		TravelStyles:    []string{"citywalk"},
		ReadyToGenerate: true,
	}

	_, appErr := app.buildGenerateV2PlansResponse(context.Background(), brief, "u-1", 1, false, PlanGenerateOptions{})
	if appErr == nil {
		t.Fatalf("expected app error when allow_fallback=false")
	}
	if appErr.Code != "PROVIDER_COVERAGE_LOW" {
		t.Fatalf("expected PROVIDER_COVERAGE_LOW, got %q", appErr.Code)
	}
}

func TestHandleGeneratePlanV2ReturnsDegradedValidatedPlan(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	body, err := json.Marshal(map[string]any{
		"planning_brief": map[string]any{
			"origin_city": "上海",
			"destination": map[string]any{
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
			"days":              3,
			"start_date":        "2026-04-16",
			"budget_level":      "medium",
			"pace":              "relaxed",
			"travel_styles":     []string{"citywalk"},
			"must_go":           []string{"外滩"},
			"avoid":             []string{},
			"constraints":       map[string]any{"weather_preference": "rain_friendly"},
			"missing_fields":    []string{},
			"ready_to_generate": true,
		},
		"options": map[string]any{
			"variants":       1,
			"allow_fallback": true,
		},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/generate-v2", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	app.handleGeneratePlanV2(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	resp := map[string]any{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !asBool(resp["degraded"]) {
		t.Fatalf("expected top-level degraded=true")
	}

	plans := asSlice(resp["plans"])
	if len(plans) != 1 {
		t.Fatalf("expected 1 plan, got %d", len(plans))
	}
	first := asMap(plans[0])
	itinerary := asMap(first["itinerary"])
	if strings.TrimSpace(asString(itinerary["source_mode"])) != "fallback" {
		t.Fatalf("expected source_mode fallback, got %q", asString(itinerary["source_mode"]))
	}
	if strings.TrimSpace(asString(itinerary["degraded_reason"])) != "provider_coverage_low" {
		t.Fatalf("expected degraded_reason provider_coverage_low, got %q", asString(itinerary["degraded_reason"]))
	}
	validation := asMap(itinerary["validation_result"])
	if len(validation) == 0 {
		t.Fatalf("expected validation_result")
	}
	if strings.TrimSpace(asString(validation["confidence_tier"])) == "" {
		t.Fatalf("expected confidence_tier")
	}
}

func TestHandleValidatePlanReturnsValidationResult(t *testing.T) {
	brief := PlanningBrief{
		OriginCity: "上海",
		Destination: &DestinationEntity{
			DestinationID:    "builtin:cn-shanghai",
			DestinationLabel: "上海市",
			Provider:         "builtin",
		},
		Days:            2,
		StartDate:       "2026-04-18",
		BudgetLevel:     "medium",
		Pace:            "relaxed",
		TravelStyles:    []string{"citywalk"},
		MustGo:          []string{"外滩"},
		Avoid:           []string{},
		MissingFields:   []string{},
		ReadyToGenerate: true,
	}
	itinerary := generateV2VariantItinerary(brief, "u-1", "balanced")

	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	body, err := json.Marshal(map[string]any{
		"itinerary": itinerary,
		"strict":    false,
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/validate", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	app.handleValidatePlan(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	resp := map[string]any{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	result := asMap(resp["validation_result"])
	if len(result) == 0 {
		t.Fatalf("expected validation_result payload")
	}
	if strings.TrimSpace(asString(result["confidence_tier"])) == "" {
		t.Fatalf("expected confidence_tier")
	}
}

func TestHandlePlaceDetailReturnsBuiltinPlace(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	rr := httptest.NewRecorder()

	app.handlePlaceDetail(rr, &AuthUser{UserID: "u-1"}, "builtin", "builtin:shanghai:外滩")

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp PlaceDetail
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Provider != "builtin" {
		t.Fatalf("expected provider builtin, got %q", resp.Provider)
	}
	if resp.Name != "外滩" {
		t.Fatalf("expected 外滩, got %q", resp.Name)
	}
}
