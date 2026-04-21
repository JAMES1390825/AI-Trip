package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestServeHTTPMainlineHappyPath(t *testing.T) {
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

	tokenResp := performJSONRequest(t, app, http.MethodPost, "/api/v1/auth/token", "", `{"user_id":"u-e2e","role":"USER","client_secret":"test-bootstrap-secret"}`)
	accessToken := asString(tokenResp["access_token"])
	if accessToken == "" {
		t.Fatalf("expected access token")
	}

	resolveResp := performJSONRequest(t, app, http.MethodGet, "/api/v1/destinations/resolve?q=上海&limit=5", accessToken, "")
	selected := asMap(asSlice(resolveResp["items"])[0])

	briefResp := performJSONRequest(t, app, http.MethodPost, "/api/v1/plans/brief", accessToken, `{"origin_city":"上海","destination_text":"上海","selected_destination":`+mustJSON(t, selected)+`,"days":2,"start_date":"2026-04-18","budget_level":"medium","pace":"relaxed","travel_styles":["citywalk"]}`)
	brief := asMap(briefResp["planning_brief"])

	generateResp := performJSONRequest(t, app, http.MethodPost, "/api/v1/plans/generate-v2", accessToken, `{"planning_brief":`+mustJSON(t, brief)+`,"options":{"variants":1,"allow_fallback":true}}`)
	itinerary := asMap(asMap(asSlice(generateResp["plans"])[0])["itinerary"])

	validateResp := performJSONRequest(t, app, http.MethodPost, "/api/v1/plans/validate", accessToken, `{"itinerary":`+mustJSON(t, itinerary)+`,"strict":false}`)
	if len(asMap(validateResp["validation_result"])) == 0 {
		t.Fatalf("expected validation_result")
	}

	saveResp := performJSONRequest(t, app, http.MethodPost, "/api/v1/plans/save", accessToken, `{"itinerary":`+mustJSON(t, itinerary)+`}`)
	savedPlanID := asString(saveResp["saved_plan_id"])
	if savedPlanID == "" {
		t.Fatalf("expected saved_plan_id")
	}

	savedListResp := performJSONListRequest(t, app, http.MethodGet, "/api/v1/plans/saved", accessToken)
	savedItems := asSlice(savedListResp)
	if len(savedItems) == 0 {
		t.Fatalf("expected saved plans list to include saved plan")
	}

	savedDetailResp := performJSONRequest(t, app, http.MethodGet, "/api/v1/plans/saved/"+savedPlanID, accessToken, "")
	if asString(savedDetailResp["id"]) != savedPlanID {
		t.Fatalf("expected saved plan detail id %s, got %s", savedPlanID, asString(savedDetailResp["id"]))
	}

	performStatusRequest(t, app, http.MethodDelete, "/api/v1/plans/saved/"+savedPlanID, accessToken, "", http.StatusNoContent)
}

func performJSONRequest(t *testing.T, app *App, method, path, token, body string) map[string]any {
	t.Helper()

	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rr := httptest.NewRecorder()
	app.ServeHTTP(rr, req)
	if rr.Code < 200 || rr.Code >= 300 {
		t.Fatalf("expected 2xx for %s %s, got %d with body %s", method, path, rr.Code, rr.Body.String())
	}

	out := map[string]any{}
	if strings.TrimSpace(rr.Body.String()) == "" {
		return out
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %s %s response: %v", method, path, err)
	}

	return out
}

func performJSONListRequest(t *testing.T, app *App, method, path, token string) []any {
	t.Helper()

	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rr := httptest.NewRecorder()
	app.ServeHTTP(rr, req)
	if rr.Code < 200 || rr.Code >= 300 {
		t.Fatalf("expected 2xx for %s %s, got %d with body %s", method, path, rr.Code, rr.Body.String())
	}

	out := []any{}
	if strings.TrimSpace(rr.Body.String()) == "" {
		return out
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %s %s response: %v", method, path, err)
	}

	return out
}

func performStatusRequest(t *testing.T, app *App, method, path, token, body string, wantStatus int) {
	t.Helper()

	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rr := httptest.NewRecorder()
	app.ServeHTTP(rr, req)
	if rr.Code != wantStatus {
		t.Fatalf("expected %d for %s %s, got %d with body %s", wantStatus, method, path, rr.Code, rr.Body.String())
	}
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()

	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal json: %v", err)
	}

	return string(data)
}
