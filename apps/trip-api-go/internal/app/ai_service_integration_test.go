package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandlePlanningBriefMergesAIEnhancement(t *testing.T) {
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/brief/enhance" {
			t.Fatalf("unexpected ai path %s", r.URL.Path)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"assistant_message":        "我已经结合你的补充要求整理好了，可以直接开始生成。",
			"must_go_additions":        []string{"豫园"},
			"travel_style_suggestions": []string{"美食"},
			"constraints": map[string]any{
				"dining_preference": "local_food",
			},
			"source_mode": "llm_bailian",
		})
	}))
	defer aiServer.Close()

	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{
		store: store,
		ai:    NewAIServiceClient(AIServiceConfig{BaseURL: aiServer.URL, TimeoutMs: 1000}),
	}

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
		"travel_styles": []string{"citywalk"},
		"must_go":       []string{"外滩"},
		"free_text":     "想多吃点本地餐馆",
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
	if resp.AssistantMessage != "我已经结合你的补充要求整理好了，可以直接开始生成。" {
		t.Fatalf("expected ai assistant message, got %q", resp.AssistantMessage)
	}
	if resp.SourceMode != "llm_bailian" {
		t.Fatalf("expected source_mode llm_bailian, got %q", resp.SourceMode)
	}
	if resp.PlanningBrief.Constraints.DiningPreference != "local_food" {
		t.Fatalf("expected local_food, got %q", resp.PlanningBrief.Constraints.DiningPreference)
	}
	if !hasStringValue(resp.PlanningBrief.MustGo, "豫园") {
		t.Fatalf("expected 豫园 in must_go, got %#v", resp.PlanningBrief.MustGo)
	}
	if !hasStringValue(resp.PlanningBrief.TravelStyles, "美食") {
		t.Fatalf("expected 美食 in travel_styles, got %#v", resp.PlanningBrief.TravelStyles)
	}
}

func TestBuildV2VariantItineraryAppliesAIExplainEnhancement(t *testing.T) {
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
	preview := generateV2VariantItinerary(brief, "u-1", "balanced")
	firstDay := asMap(asSlice(preview["days"])[0])
	firstBlock := asMap(asSlice(firstDay["blocks"])[0])
	blockID := asString(firstBlock["block_id"])

	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/itinerary/explain" {
			t.Fatalf("unexpected ai path %s", r.URL.Path)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"day_summaries": []map[string]any{
				{
					"day_index":        0,
					"date":             "2026-04-18",
					"title":            "第1天 外滩与南京路",
					"preview":          "先沿黄浦江展开，再回到商圈收束。",
					"poi_count":        4,
					"transit_minutes":  22,
					"recommended_mode": "all",
				},
			},
			"today_hint": map[string]any{
				"day_index": 0,
				"date":      "2026-04-18",
				"title":     "今天先从外滩开始",
				"next_poi":  asString(firstBlock["poi"]),
			},
			"block_explanations": []map[string]any{
				{
					"day_index":        0,
					"block_id":         blockID,
					"recommend_reason": "把这一站放在前段，方便先把核心地标和 citywalk 动线串起来。",
				},
			},
			"source_mode": "llm_bailian",
		})
	}))
	defer aiServer.Close()

	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{
		store: store,
		ai:    NewAIServiceClient(AIServiceConfig{BaseURL: aiServer.URL, TimeoutMs: 1000}),
	}

	itinerary := app.buildV2VariantItinerary(context.Background(), brief, "u-1", "balanced")
	daySummaries := asSlice(itinerary["day_summaries"])
	if len(daySummaries) == 0 {
		t.Fatalf("expected day_summaries")
	}
	if asString(asMap(daySummaries[0])["title"]) != "第1天 外滩与南京路" {
		t.Fatalf("expected ai summary title, got %q", asString(asMap(daySummaries[0])["title"]))
	}
	firstDay = asMap(asSlice(itinerary["days"])[0])
	firstBlock = asMap(asSlice(firstDay["blocks"])[0])
	if asString(firstBlock["recommend_reason"]) != "把这一站放在前段，方便先把核心地标和 citywalk 动线串起来。" {
		t.Fatalf("expected ai recommend_reason, got %q", asString(firstBlock["recommend_reason"]))
	}
	if asString(itinerary["explain_source_mode"]) != "llm_bailian" {
		t.Fatalf("expected explain_source_mode llm_bailian, got %q", asString(itinerary["explain_source_mode"]))
	}
}

func hasStringValue(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}
