package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServeHTTPRetiredRoutesReturnNotFound(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	app := &App{
		store: store,
		config: Config{
			Auth: AuthConfig{
				JWTSecret:             "test-secret",
				ExpirationMinutes:     60,
				BootstrapClientSecret: "test-bootstrap-secret",
			},
		},
	}

	tokenResp := performJSONRequest(t, app, http.MethodPost, "/api/v1/auth/token", "", `{"user_id":"u-retired","role":"USER","client_secret":"test-bootstrap-secret"}`)
	accessToken := asString(tokenResp["access_token"])
	if accessToken == "" {
		t.Fatalf("expected access token")
	}

	tests := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodPost, path: "/api/v1/chat/intake/next", body: `{"history":[]}`},
		{method: http.MethodGet, path: "/api/v1/destinations/search?q=上海"},
		{method: http.MethodGet, path: "/api/v1/places/amap/mock-place"},
		{method: http.MethodPost, path: "/api/v1/plans/generate", body: `{"days":2}`},
		{method: http.MethodPost, path: "/api/v1/plans/replan", body: `{"saved_plan_id":"p-1"}`},
		{method: http.MethodPost, path: "/api/v1/plans/revert", body: `{"saved_plan_id":"p-1","version":1}`},
		{method: http.MethodGet, path: "/api/v1/plans/saved/p-1/summary"},
		{method: http.MethodGet, path: "/api/v1/plans/saved/p-1/community-draft"},
		{method: http.MethodGet, path: "/api/v1/plans/saved/p-1/versions"},
		{method: http.MethodGet, path: "/api/v1/plans/saved/p-1/tasks"},
		{method: http.MethodGet, path: "/api/v1/plans/saved/p-1/execution"},
		{method: http.MethodGet, path: "/api/v1/plans/saved/p-1/diff?from_version=1&to_version=2"},
		{method: http.MethodPost, path: "/api/v1/plans/saved/p-1/share", body: `{}`},
		{method: http.MethodDelete, path: "/api/v1/plans/saved/p-1/share/token-1"},
		{method: http.MethodGet, path: "/api/v1/community/posts"},
		{method: http.MethodGet, path: "/api/v1/profile/private-summary"},
		{method: http.MethodGet, path: "/api/v1/admin/community/posts"},
		{method: http.MethodPost, path: "/api/v1/events", body: `{"event_name":"retired"}`},
		{method: http.MethodGet, path: "/api/v1/share/token-1"},
	}

	for _, tc := range tests {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			req.Header.Set("Authorization", "Bearer "+accessToken)

			rr := httptest.NewRecorder()
			app.ServeHTTP(rr, req)
			if rr.Code != http.StatusNotFound {
				t.Fatalf("expected 404, got %d with body %s", rr.Code, rr.Body.String())
			}

			payload := map[string]any{}
			if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if asString(payload["error"]) != "NOT_FOUND" {
				t.Fatalf("expected NOT_FOUND error, got %v", payload["error"])
			}
		})
	}

	unauthenticatedTests := []struct {
		method string
		path   string
	}{
		{method: http.MethodGet, path: "/api/v1/community/media/ghost.jpg"},
		{method: http.MethodGet, path: "/api/v1/share/token-1"},
	}

	for _, tc := range unauthenticatedTests {
		t.Run("unauthenticated "+tc.method+" "+tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			rr := httptest.NewRecorder()
			app.ServeHTTP(rr, req)
			if rr.Code != http.StatusNotFound {
				t.Fatalf("expected 404, got %d with body %s", rr.Code, rr.Body.String())
			}

			payload := map[string]any{}
			if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if asString(payload["error"]) != "NOT_FOUND" {
				t.Fatalf("expected NOT_FOUND error, got %v", payload["error"])
			}
		})
	}
}
