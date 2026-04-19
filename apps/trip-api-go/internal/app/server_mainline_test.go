package app

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleMainlineAuthedHandlesKnownRoutes(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/validate", bytes.NewReader([]byte(`{"itinerary":{"days":[]}}`)))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	handled := app.handleMainlineAuthed(rr, req, &AuthUser{UserID: "u-1"})
	if !handled {
		t.Fatalf("expected mainline route to be handled")
	}
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
}

func TestHandleMainlineAuthedSkipsCommunityRoutes(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/community/posts", nil)
	rr := httptest.NewRecorder()

	if app.handleMainlineAuthed(rr, req, &AuthUser{UserID: "u-1"}) {
		t.Fatalf("expected community route to be ignored by mainline dispatch")
	}
}
