package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHandleSavePlanDedupesLatestSameItinerary(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	itinerary := generateItinerary(PlanRequest{
		OriginCity:  "shanghai",
		Destination: "hangzhou",
		Days:        2,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	})

	if _, err := app.store.SavePlan(SavedPlan{
		ID:        "p-existing",
		UserID:    "u-1",
		Itinerary: itinerary,
		SavedAt:   time.Now().UTC(),
	}); err != nil {
		t.Fatalf("seed save failed: %v", err)
	}

	body, _ := json.Marshal(map[string]any{"itinerary": itinerary})
	decodedBody := map[string]any{}
	if err := json.Unmarshal(body, &decodedBody); err != nil {
		t.Fatalf("decode request body failed: %v", err)
	}
	incoming := asMap(decodedBody["itinerary"])
	latestBefore := app.store.ListSavedPlans("u-1", 1)
	if len(latestBefore) != 1 {
		t.Fatalf("expected seed list size 1, got %d", len(latestBefore))
	}
	if itinerarySignature(latestBefore[0].Itinerary) != itinerarySignature(incoming) {
		t.Fatalf("test precondition failed: signatures differ before handler")
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/save", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	app.handleSavePlan(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 for deduped save, got %d", rr.Code)
	}

	resp := map[string]any{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got := strings.TrimSpace(asString(resp["saved_plan_id"])); got != "p-existing" {
		t.Fatalf("expected saved_plan_id p-existing, got %q", got)
	}
	if !asBool(resp["deduped"]) {
		t.Fatalf("expected deduped=true")
	}

	items := app.store.ListSavedPlans("u-1", 10)
	if len(items) != 1 {
		t.Fatalf("expected 1 saved plan after dedupe request, got %d", len(items))
	}
}
