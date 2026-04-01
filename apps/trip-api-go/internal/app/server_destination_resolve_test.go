package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleDestinationResolveReturnsStructuredBuiltinCandidate(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/destinations/resolve?q=上海&limit=5", nil)
	rr := httptest.NewRecorder()

	app.handleDestinationResolve(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp DestinationResolveResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Degraded {
		t.Fatalf("expected degraded=false")
	}
	if len(resp.Items) == 0 {
		t.Fatalf("expected at least 1 item")
	}

	first := resp.Items[0]
	if first.DestinationID != "builtin:cn-shanghai" {
		t.Fatalf("expected builtin:cn-shanghai, got %q", first.DestinationID)
	}
	if first.DestinationLabel != "上海市" {
		t.Fatalf("expected 上海市, got %q", first.DestinationLabel)
	}
	if first.Provider != "builtin" {
		t.Fatalf("expected provider builtin, got %q", first.Provider)
	}
	if first.MatchType != "city" {
		t.Fatalf("expected match_type city, got %q", first.MatchType)
	}
}

func TestHandleDestinationResolveFallsBackToCustomCandidate(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/destinations/resolve?q=火星环形山酒店&limit=5", nil)
	rr := httptest.NewRecorder()

	app.handleDestinationResolve(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp DestinationResolveResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !resp.Degraded {
		t.Fatalf("expected degraded=true")
	}
	if len(resp.Items) != 1 {
		t.Fatalf("expected 1 fallback item, got %d", len(resp.Items))
	}

	first := resp.Items[0]
	if first.MatchType != "custom" {
		t.Fatalf("expected custom match_type, got %q", first.MatchType)
	}
	if first.Provider != "custom" {
		t.Fatalf("expected provider custom, got %q", first.Provider)
	}
	if first.DestinationLabel != "火星环形山酒店" {
		t.Fatalf("expected custom label preserved, got %q", first.DestinationLabel)
	}
}
