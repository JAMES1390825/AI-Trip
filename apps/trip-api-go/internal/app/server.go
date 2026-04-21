package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type App struct {
	config Config
	store  *Store
	ai     *AIServiceClient
	amap   *AmapClient
}

func New() (*App, error) {
	cfg := LoadConfig()
	store, err := NewStore(cfg.Storage.DataFile)
	if err != nil {
		return nil, err
	}
	return &App{
		config: cfg,
		store:  store,
		ai:     NewAIServiceClient(cfg.AI),
		amap:   NewAmapClient(cfg.Amap),
	}, nil
}

func (a *App) Run() error {
	addr := ":" + asString(a.config.Port)
	if addr == ":" {
		addr = ":8080"
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           a,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("trip-api-go listening on %s", addr)
	return server.ListenAndServe()
}

func (a *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !a.handleCORS(w, r) {
		return
	}

	if r.Method == http.MethodGet && r.URL.Path == "/api/v1/health" {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"service": "trip-api-go",
			"scope":   "ai-planner-v1",
		})
		return
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/v1/auth/token" {
		a.handleIssueToken(w, r)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/api/v1/") && !isRetiredPublicAPIPath(r.URL.Path) {
		user, err := a.authenticate(r)
		if err != nil {
			writeAppError(w, err)
			return
		}
		a.handleAuthed(w, r, user)
		return
	}

	writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "route not found"))
}

func (a *App) handleCORS(w http.ResponseWriter, r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	allowOrigin := origin != "" && stringsContainsFold(a.config.CORSOrigins, origin)

	if allowOrigin {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
	}

	if r.Method == http.MethodOptions {
		if origin != "" && !allowOrigin {
			writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "CORS origin not allowed"))
			return false
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.WriteHeader(http.StatusNoContent)
		return false
	}

	if origin != "" && !allowOrigin {
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "CORS origin not allowed"))
		return false
	}
	return true
}

func (a *App) authenticate(r *http.Request) (*AuthUser, *AppError) {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return nil, appError(http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
	}
	token := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
	if token == "" {
		return nil, appError(http.StatusUnauthorized, "UNAUTHORIZED", "authentication required")
	}
	user, err := verifyToken(a.config.Auth.JWTSecret, token)
	if err != nil {
		return nil, appError(http.StatusUnauthorized, "UNAUTHORIZED", "invalid access token")
	}
	return user, nil
}

func (a *App) handleIssueToken(w http.ResponseWriter, r *http.Request) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}
	if err := mustFields(body, "user_id", "role", "client_secret"); err != nil {
		writeAppError(w, err)
		return
	}

	userID := strings.TrimSpace(asString(body["user_id"]))
	role := strings.TrimSpace(asString(body["role"]))
	clientSecret := strings.TrimSpace(asString(body["client_secret"]))

	if userID == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "user_id is required"))
		return
	}
	if clientSecret != a.config.Auth.BootstrapClientSecret {
		writeAppError(w, appError(http.StatusUnauthorized, "UNAUTHORIZED", "invalid bootstrap client secret"))
		return
	}

	token, expiresAt, issueErr := issueToken(a.config.Auth.JWTSecret, a.config.Auth.ExpirationMinutes, userID, role)
	if issueErr != nil {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", issueErr.Error()))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token_type":   "Bearer",
		"access_token": token,
		"expires_at":   expiresAt,
	})
}

func (a *App) handleAuthed(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	if a.handleMainlineAuthed(w, r, user) {
		return
	}

	path := r.URL.Path
	method := r.Method

	if id, ok := parseSavedPlanEntityRoute(path); ok {
		switch method {
		case http.MethodGet:
			a.handleGetSavedPlan(w, user, id)
			return
		case http.MethodDelete:
			a.handleDeleteSavedPlan(w, user, id)
			return
		}
	}

	writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "route not found"))
}

func (a *App) handleGetSavedPlan(w http.ResponseWriter, user *AuthUser, id string) {
	saved, ok := a.store.GetSavedPlan(user.UserID, id)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":         saved.ID,
		"user_id":    saved.UserID,
		"itinerary":  saved.Itinerary,
		"saved_at":   toRFC3339(saved.SavedAt),
		"updated_at": toRFC3339(saved.SavedAt),
	})
}

func (a *App) handleListSavedPlans(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	limit := clampLimit(r.URL.Query().Get("limit"), 1, 50, 20)
	items := a.store.ListSavedPlans(user.UserID, limit)

	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		itinerary := item.Itinerary
		snapshot := asMap(itinerary["request_snapshot"])
		out = append(out, map[string]any{
			"id":          item.ID,
			"destination": firstNonEmpty(itinerary["destination"], snapshot["destination"], ""),
			"start_date":  firstNonEmpty(itinerary["start_date"], snapshot["start_date"], ""),
			"granularity": firstNonEmpty(itinerary["granularity"], "hourly"),
			"confidence":  asFloat(itinerary["confidence"], 0),
			"saved_at":    toRFC3339(item.SavedAt),
			"updated_at":  toRFC3339(item.SavedAt),
		})
	}

	writeJSON(w, http.StatusOK, out)
}

func (a *App) handleDeleteSavedPlan(w http.ResponseWriter, user *AuthUser, id string) {
	ok, err := a.store.DeleteSavedPlan(user.UserID, id)
	if err != nil {
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to delete saved plan"))
		return
	}
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handlePlaceDetail(w http.ResponseWriter, user *AuthUser, provider, placeID string) {
	decodedPlaceID, err := url.PathUnescape(placeID)
	if err != nil {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "invalid place id"))
		return
	}
	detail, ok := a.lookupPlaceDetail(context.Background(), provider, decodedPlaceID)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "place detail not found"))
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func itinerarySignature(itinerary map[string]any) string {
	if len(itinerary) == 0 {
		return ""
	}
	normalized := normalizeItineraryForStorage(itinerary)
	raw, err := json.Marshal(normalized)
	if err != nil {
		return ""
	}
	return string(raw)
}

func randomID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "id-" + strings.ReplaceAll(nowISO(), ":", "-")
	}
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	hexStr := hex.EncodeToString(buf)
	return hexStr[0:8] + "-" + hexStr[8:12] + "-" + hexStr[12:16] + "-" + hexStr[16:20] + "-" + hexStr[20:32]
}
