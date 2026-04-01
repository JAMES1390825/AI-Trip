package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHandlePrivateProfileSummaryReturnsReadyFalseWhenEmpty(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}
	app := &App{store: store}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/profile/private-summary", nil)
	rr := httptest.NewRecorder()

	app.handlePrivateProfileSummary(rr, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if asBool(resp["ready"]) {
		t.Fatalf("expected ready=false")
	}
	profile := asMap(resp["profile"])
	if asString(profile["user_id"]) != "u-1" {
		t.Fatalf("expected profile user_id u-1, got %#v", profile["user_id"])
	}
	_ = req
}

func TestHandlePrivateProfileSummaryReturnsProjectedProfile(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}
	if err := store.AddEvent(EventRecord{
		EventName: "block_replaced",
		UserID:    "u-1",
		CreatedAt: time.Now().UTC(),
		Metadata: map[string]any{
			"removed_category": "shopping",
			"added_category":   "sight",
			"added_tags":       []string{"river_view"},
		},
	}); err != nil {
		t.Fatalf("seed event failed: %v", err)
	}

	app := &App{store: store}
	rr := httptest.NewRecorder()

	app.handlePrivateProfileSummary(rr, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !asBool(resp["ready"]) {
		t.Fatalf("expected ready=true")
	}
	profile := asMap(resp["profile"])
	categories := asMap(asMap(profile["behavioral_affinity"])["categories"])
	if asFloat(categories["sight"], 0) <= 0 {
		t.Fatalf("expected sight affinity positive, got %#v", categories["sight"])
	}
	if asFloat(categories["shopping"], 0) >= 0 {
		t.Fatalf("expected shopping affinity negative, got %#v", categories["shopping"])
	}
}

func TestHandlePrivatePersonalizationSettingsLifecycle(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}
	if err := store.AddEvent(EventRecord{
		EventName: "block_replaced",
		UserID:    "u-1",
		CreatedAt: time.Now().UTC(),
		Metadata: map[string]any{
			"removed_category": "shopping",
			"added_category":   "sight",
			"added_tags":       []string{"river_view"},
		},
	}); err != nil {
		t.Fatalf("seed event failed: %v", err)
	}

	app := &App{store: store}

	disableBody, err := json.Marshal(map[string]any{"enabled": false})
	if err != nil {
		t.Fatalf("marshal disable body: %v", err)
	}
	disableReq := httptest.NewRequest(http.MethodPut, "/api/v1/profile/private-settings", bytes.NewReader(disableBody))
	disableReq.Header.Set("Content-Type", "application/json")
	disableRR := httptest.NewRecorder()
	app.handleUpdatePrivatePersonalizationSettings(disableRR, disableReq, &AuthUser{UserID: "u-1"})

	if disableRR.Code != http.StatusOK {
		t.Fatalf("expected disable 200, got %d", disableRR.Code)
	}

	var disableResp map[string]any
	if err := json.Unmarshal(disableRR.Body.Bytes(), &disableResp); err != nil {
		t.Fatalf("decode disable response: %v", err)
	}
	settings := asMap(disableResp["settings"])
	if asBool(settings["enabled"]) {
		t.Fatalf("expected settings enabled=false after disable")
	}
	if _, ok := store.GetPrivateProfile("u-1"); ok {
		t.Fatalf("expected projected profile removed when personalization disabled")
	}

	enableBody, err := json.Marshal(map[string]any{"enabled": true})
	if err != nil {
		t.Fatalf("marshal enable body: %v", err)
	}
	enableReq := httptest.NewRequest(http.MethodPut, "/api/v1/profile/private-settings", bytes.NewReader(enableBody))
	enableReq.Header.Set("Content-Type", "application/json")
	enableRR := httptest.NewRecorder()
	app.handleUpdatePrivatePersonalizationSettings(enableRR, enableReq, &AuthUser{UserID: "u-1"})

	if enableRR.Code != http.StatusOK {
		t.Fatalf("expected enable 200, got %d", enableRR.Code)
	}
	if _, ok := store.GetPrivateProfile("u-1"); !ok {
		t.Fatalf("expected projected profile restored when personalization re-enabled")
	}
}

func TestHandleClearPrivateSignalsRemovesProjectedProfileAndEvents(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}
	if err := store.AddEvent(EventRecord{
		EventName: "plan_saved",
		UserID:    "u-1",
		CreatedAt: time.Now().UTC(),
		Metadata:  map[string]any{"destination": "杭州"},
	}); err != nil {
		t.Fatalf("seed event failed: %v", err)
	}
	if _, ok := store.GetPrivateProfile("u-1"); !ok {
		t.Fatalf("expected seeded private profile")
	}

	app := &App{store: store}
	rr := httptest.NewRecorder()

	app.handleClearPrivateSignals(rr, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected clear 200, got %d", rr.Code)
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode clear response: %v", err)
	}
	if !asBool(resp["cleared"]) {
		t.Fatalf("expected cleared=true")
	}
	settings := asMap(resp["settings"])
	if asString(settings["cleared_at"]) == "" {
		t.Fatalf("expected cleared_at to be set")
	}
	if _, ok := store.GetPrivateProfile("u-1"); ok {
		t.Fatalf("expected private profile removed after clear")
	}
	if got := store.EventSummary()["plan_saved"]; got != 0 {
		t.Fatalf("expected user events cleared, got plan_saved=%d", got)
	}
}
