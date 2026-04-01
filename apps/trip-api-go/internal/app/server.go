package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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

	if r.Method == http.MethodGet {
		if fileName, ok := parseCommunityMediaEntityRoute(r.URL.Path); ok {
			a.handlePublicCommunityMediaRead(w, r, fileName)
			return
		}
	}

	if r.Method == http.MethodPost && r.URL.Path == "/api/v1/auth/token" {
		a.handleIssueToken(w, r)
		return
	}

	if r.Method == http.MethodGet {
		if token, ok := parsePublicShareRoute(r.URL.Path); ok {
			a.handlePublicShareRead(w, token)
			return
		}
	}

	if strings.HasPrefix(r.URL.Path, "/api/v1/") {
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
	path := r.URL.Path
	method := r.Method

	switch {
	case method == http.MethodPost && path == "/api/v1/chat/intake/next":
		a.handleChatIntakeNext(w, r, user)
	case method == http.MethodGet && path == "/api/v1/destinations/resolve":
		a.handleDestinationResolve(w, r, user)
	case method == http.MethodGet && path == "/api/v1/destinations/search":
		a.handleDestinationSearch(w, r, user)
	case method == http.MethodPost && path == "/api/v1/plans/brief":
		a.handlePlanningBrief(w, r, user)
	case method == http.MethodPost && path == "/api/v1/plans/generate-v2":
		a.handleGeneratePlanV2(w, r, user)
	case method == http.MethodPost && path == "/api/v1/community/posts":
		a.handleCreateCommunityPost(w, r, user)
	case method == http.MethodGet && path == "/api/v1/community/posts":
		a.handleListCommunityPosts(w, r, user)
	case method == http.MethodPost && path == "/api/v1/community/media":
		a.handleUploadCommunityMedia(w, r, user)
	case method == http.MethodGet && path == "/api/v1/admin/community/posts":
		a.handleAdminListCommunityPosts(w, r, user)
	case method == http.MethodGet && path == "/api/v1/admin/community/reports":
		a.handleAdminListCommunityReports(w, r, user)
	case method == http.MethodPost && path == "/api/v1/plans/validate":
		a.handleValidatePlan(w, r, user)
	case method == http.MethodPost && path == "/api/v1/plans/generate":
		a.handleGeneratePlan(w, r, user)
	case method == http.MethodPost && path == "/api/v1/plans/replan":
		a.handleReplanPlan(w, r, user)
	case method == http.MethodPost && path == "/api/v1/plans/revert":
		a.handleRevertPlan(w, r, user)
	case method == http.MethodPost && path == "/api/v1/plans/save":
		a.handleSavePlan(w, r, user)
	case method == http.MethodGet && path == "/api/v1/plans/saved":
		a.handleListSavedPlans(w, r, user)
	case method == http.MethodPost && path == "/api/v1/events":
		a.handleTrackEvent(w, r, user)
	case method == http.MethodGet && path == "/api/v1/profile/private-summary":
		a.handlePrivateProfileSummary(w, user)
	case method == http.MethodPut && path == "/api/v1/profile/private-settings":
		a.handleUpdatePrivatePersonalizationSettings(w, r, user)
	case method == http.MethodDelete && path == "/api/v1/profile/private-signals":
		a.handleClearPrivateSignals(w, user)
	case method == http.MethodGet && path == "/api/v1/events/summary":
		a.handleEventSummary(w, user)
	case method == http.MethodGet && path == "/api/v1/events/recent":
		a.handleEventRecent(w, user)
	default:
		if id, ok := parseSavedPlanVersionsRoute(path); ok && method == http.MethodGet {
			a.handleListSavedPlanVersions(w, r, user, id)
			return
		}
		if id, ok := parseSavedPlanTasksRoute(path); ok {
			switch method {
			case http.MethodGet:
				a.handleGetPlanTasks(w, user, id)
				return
			case http.MethodPut:
				a.handleReplacePlanTasks(w, r, user, id)
				return
			}
		}
		if id, ok := parseSavedPlanExecutionRoute(path); ok {
			switch method {
			case http.MethodGet:
				a.handleGetPlanExecution(w, r, user, id)
				return
			case http.MethodPut:
				a.handleReplacePlanExecution(w, r, user, id)
				return
			}
		}
		if id, ok := parseSavedPlanDiffRoute(path); ok && method == http.MethodGet {
			a.handlePlanDiff(w, r, user, id)
			return
		}
		if id, ok := parseSavedPlanShareRoute(path); ok && method == http.MethodPost {
			a.handleCreatePlanShare(w, r, user, id)
			return
		}
		if id, token, ok := parseSavedPlanShareTokenRoute(path); ok && method == http.MethodDelete {
			a.handleClosePlanShare(w, user, id, token)
			return
		}
		if id, ok := parseSavedPlanSummaryRoute(path); ok && method == http.MethodGet {
			a.handleSavedPlanSummary(w, user, id)
			return
		}
		if id, ok := parseSavedPlanCommunityDraftRoute(path); ok && method == http.MethodGet {
			a.handleSavedPlanCommunityDraft(w, user, id)
			return
		}
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
		if provider, placeID, ok := parsePlaceDetailRoute(path); ok && method == http.MethodGet {
			a.handlePlaceDetail(w, user, provider, placeID)
			return
		}
		if id, ok := parseCommunityPostDetailRoute(path); ok && method == http.MethodGet {
			a.handleGetCommunityPostDetail(w, user, id)
			return
		}
		if authorUserID, ok := parseCommunityAuthorEntityRoute(path); ok && method == http.MethodGet {
			a.handleGetCommunityAuthorProfile(w, user, authorUserID)
			return
		}
		if id, ok := parseCommunityPostEntityRoute(path); ok && method == http.MethodGet {
			a.handleGetCommunityPost(w, user, id)
			return
		}
		if id, ok := parseCommunityPostReportRoute(path); ok && method == http.MethodPost {
			a.handleReportCommunityPost(w, r, user, id)
			return
		}
		if id, ok := parseCommunityPostVoteRoute(path); ok && method == http.MethodPost {
			a.handleVoteCommunityPost(w, r, user, id)
			return
		}
		if id, ok := parseAdminCommunityPostModerateRoute(path); ok && method == http.MethodPost {
			a.handleAdminModerateCommunityPost(w, r, user, id)
			return
		}
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "route not found"))
	}
}

func parseSavedPlanEntityRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanSummaryRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "summary" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanCommunityDraftRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "community-draft" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanVersionsRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "versions" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanTasksRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "tasks" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanExecutionRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "execution" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanDiffRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "diff" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanShareRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "share" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityPostEntityRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "posts" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityPostDetailRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "posts" && parts[5] == "detail" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityAuthorEntityRoute(path string) (userID string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "authors" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityPostVoteRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "posts" && parts[5] == "vote" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityPostReportRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "posts" && parts[5] == "report" {
		return parts[4], true
	}
	return "", false
}

func parseAdminCommunityPostModerateRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 7 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "admin" && parts[3] == "community" && parts[4] == "posts" && parts[6] == "moderate" {
		return parts[5], true
	}
	return "", false
}

func parseSavedPlanShareTokenRoute(path string) (id, token string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 7 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "share" {
		return parts[4], parts[6], true
	}
	return "", "", false
}

func parsePublicShareRoute(path string) (token string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "share" {
		return parts[3], true
	}
	return "", false
}

func parsePlaceDetailRoute(path string) (provider, placeID string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "places" {
		return parts[3], parts[4], true
	}
	return "", "", false
}

func (a *App) handleChatIntakeNext(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	history := make([]ChatTurn, 0)
	for _, item := range asSlice(body["history"]) {
		turn := asMap(item)
		history = append(history, ChatTurn{Role: asString(turn["role"]), Message: asString(turn["message"])})
	}

	response := a.nextChatResponsePayload(r.Context(), history, asMap(body["draft_plan_request"]), user.UserID)
	a.trackEvent("chat_turn_submitted", user.UserID, map[string]any{
		"history_size":  len(history),
		"locale":        firstNonEmpty(body["locale"], "zh-CN"),
		"fallback_mode": response["fallback_mode"],
		"intent":        response["intent"],
		"next_action":   response["next_action"],
		"source_mode":   response["source_mode"],
	})

	writeJSON(w, http.StatusOK, response)
}

func (a *App) handleDestinationSearch(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := asIntOrZero(firstNonEmpty(r.URL.Query().Get("limit"), "10"))
	if limit <= 0 || limit > 20 {
		limit = 10
	}

	items := searchDestinations(query, limit)
	a.trackEvent("destination_search", user.UserID, map[string]any{
		"query": query,
		"count": len(items),
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
	})
}

func (a *App) handleDestinationResolve(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := asIntOrZero(firstNonEmpty(r.URL.Query().Get("limit"), "10"))
	if limit <= 0 || limit > 20 {
		limit = 10
	}

	response := a.resolveDestinationsWithProvider(r.Context(), query, limit)
	a.trackEvent("destination_resolve", user.UserID, map[string]any{
		"query":    query,
		"count":    len(response.Items),
		"degraded": response.Degraded,
	})

	writeJSON(w, http.StatusOK, response)
}

func (a *App) handlePlanningBrief(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	input := planningBriefRequest{}
	if err := decodeJSONBody(r, &input); err != nil {
		writeAppError(w, err)
		return
	}

	response := a.buildPlanningBriefResponse(r.Context(), input, user.UserID)
	a.trackEvent("planning_brief_created", user.UserID, map[string]any{
		"ready_to_generate": response.PlanningBrief.ReadyToGenerate,
		"missing_fields":    response.PlanningBrief.MissingFields,
		"degraded":          response.Degraded,
		"next_action":       response.NextAction,
		"source_mode":       response.SourceMode,
		"destination_id": func() string {
			if response.PlanningBrief.Destination == nil {
				return ""
			}
			return response.PlanningBrief.Destination.DestinationID
		}(),
	})

	writeJSON(w, http.StatusOK, response)
}

func (a *App) handleGeneratePlanV2(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	brief := planningBriefFromMap(body["planning_brief"])
	if brief.Destination == nil {
		writeAppError(w, appError(http.StatusBadRequest, "INVALID_DESTINATION", "planning_brief.destination is required"))
		return
	}
	if !brief.ReadyToGenerate {
		writeAppError(w, appError(http.StatusBadRequest, "BRIEF_INCOMPLETE", "planning_brief is not ready_to_generate"))
		return
	}

	options := asMap(body["options"])
	variants := asIntOrZero(firstNonEmpty(options["variants"], 1))
	if variants <= 0 {
		variants = 1
	}
	if variants != 1 && variants != 2 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "options.variants must be 1 or 2"))
		return
	}

	allowFallback := true
	if _, exists := options["allow_fallback"]; exists {
		allowFallback = asBool(options["allow_fallback"])
	}

	generateOptions := PlanGenerateOptions{
		CommunityPostIDs: uniqueStrings(asStringSlice(options["community_post_ids"])),
	}

	plans := make([]map[string]any, 0, variants)
	balanced := a.buildV2VariantItineraryWithOptions(r.Context(), brief, user.UserID, "balanced", generateOptions)
	plans = append(plans, map[string]any{
		"plan_variant": "balanced",
		"itinerary":    balanced,
	})
	if variants == 2 {
		experience := a.buildV2VariantItineraryWithOptions(r.Context(), brief, user.UserID, "experience", generateOptions)
		plans = append(plans, map[string]any{
			"plan_variant": "experience",
			"itinerary":    experience,
		})
	}

	degraded := false
	for _, item := range plans {
		if asBool(asMap(asMap(item)["itinerary"])["degraded"]) {
			degraded = true
			break
		}
	}

	if !allowFallback && degraded {
		writeAppError(w, appError(http.StatusBadRequest, "PROVIDER_COVERAGE_LOW", "provider grounding is still incomplete for this itinerary"))
		return
	}

	a.trackEvent("plan_generated_v2", user.UserID, map[string]any{
		"destination_id":                brief.Destination.DestinationID,
		"destination_label":             brief.Destination.DestinationLabel,
		"days":                          brief.Days,
		"variants":                      variants,
		"degraded":                      degraded,
		"community_reference_count":     len(generateOptions.CommunityPostIDs),
		"community_post_ids":            uniqueStrings(append([]string{}, generateOptions.CommunityPostIDs...)),
		"community_referenced_post_ids": extractCommunityReferencedPostIDsFromPlans(plans),
	})

	degradedReason := ""
	if degraded {
		degradedReason = "provider_coverage_low"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"plans":           plans,
		"degraded":        degraded,
		"degraded_reason": degradedReason,
	})
}

func (a *App) handleCreateCommunityPost(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	destination := destinationEntityFromMap(body["destination"])
	if destination == nil {
		destination = buildCommunityFallbackDestination(asString(body["destination_label"]))
	}
	if destination == nil {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "destination or destination_label is required"))
		return
	}

	title := normalizeCommunityText(asString(body["title"]))
	content := normalizeCommunityText(asString(body["content"]))
	if title == "" && content == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "title or content is required"))
		return
	}
	if title == "" {
		title = firstNonBlank(destination.DestinationLabel+"旅行分享", "旅行分享")
	}

	post, err := a.store.CreateCommunityPost(CommunityPost{
		UserID:              user.UserID,
		Title:               title,
		Content:             content,
		DestinationID:       destination.DestinationID,
		DestinationLabel:    destination.DestinationLabel,
		DestinationAdcode:   destination.Adcode,
		Tags:                asStringSlice(body["tags"]),
		ImageURLs:           asStringSlice(body["image_urls"]),
		FavoriteRestaurants: asStringSlice(body["favorite_restaurants"]),
		FavoriteAttractions: asStringSlice(body["favorite_attractions"]),
	})
	if err != nil {
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to create community post"))
		return
	}

	a.trackEvent("community_post_created", user.UserID, map[string]any{
		"community_post_id": post.ID,
		"destination_id":    post.DestinationID,
		"status":            post.Status,
		"quality_score":     post.QualityScore,
		"tag_count":         len(post.Tags),
		"image_count":       len(post.ImageURLs),
	})
	if post.Status == communityPostStatusPublished {
		a.trackEvent("community_route_published", user.UserID, map[string]any{
			"community_post_id": post.ID,
			"destination_id":    post.DestinationID,
			"tag_count":         len(post.Tags),
			"image_count":       len(post.ImageURLs),
		})
	}

	writeJSON(w, http.StatusOK, post)
}

func (a *App) handleListCommunityPosts(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	limit := clampLimit(r.URL.Query().Get("limit"), 1, 50, 20)
	mine := strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("mine")), "true") || strings.TrimSpace(r.URL.Query().Get("mine")) == "1"
	status := normalizeCommunityPostStatus(r.URL.Query().Get("status"))
	if rawStatus := strings.TrimSpace(r.URL.Query().Get("status")); rawStatus != "" && status == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "invalid community post status"))
		return
	}
	if !mine && status == "" {
		status = communityPostStatusPublished
	}
	items := a.store.ListCommunityPosts(CommunityPostFilter{
		RequestUserID:    user.UserID,
		OwnerOnly:        mine,
		DestinationID:    strings.TrimSpace(r.URL.Query().Get("destination_id")),
		DestinationLabel: strings.TrimSpace(r.URL.Query().Get("destination_label")),
		Status:           status,
		Limit:            limit,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"count": len(items),
	})
}

func (a *App) handleGetCommunityPost(w http.ResponseWriter, user *AuthUser, postID string) {
	post, ok := a.store.GetCommunityPost(postID)
	if !ok || (user.Role != "ADMIN" && !communityPostVisibleToUser(post, user.UserID)) {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community post not found"))
		return
	}
	writeJSON(w, http.StatusOK, post)
}

func (a *App) handleGetCommunityPostDetail(w http.ResponseWriter, user *AuthUser, postID string) {
	detail, ok := a.store.GetCommunityPostDetail(postID, user.UserID, 4)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community post not found"))
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (a *App) handleGetCommunityAuthorProfile(w http.ResponseWriter, user *AuthUser, authorUserID string) {
	profile, ok := a.store.GetCommunityAuthorPublicProfile(authorUserID, user.UserID, 8)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community author not found"))
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

func (a *App) handleReportCommunityPost(w http.ResponseWriter, r *http.Request, user *AuthUser, postID string) {
	post, ok := a.store.GetCommunityPost(postID)
	if !ok || !communityPostVisibleToUser(post, user.UserID) {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community post not found"))
		return
	}

	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	reason := normalizeCommunityReportReason(asString(body["reason"]))
	detail := normalizeCommunityText(asString(body["detail"]))
	if reason == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "reason must be factually_incorrect, advertising, unsafe, spam, or other"))
		return
	}

	reportedPost, report, err := a.store.ReportCommunityPost(postID, user.UserID, reason, detail)
	if err != nil {
		switch {
		case errors.Is(err, ErrCommunityPostNotFound):
			writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community post not found"))
		case errors.Is(err, ErrCommunityReportInvalid):
			writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "cannot report this community post"))
		default:
			writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to report community post"))
		}
		return
	}

	a.trackEvent("community_post_reported", user.UserID, map[string]any{
		"community_post_id": postID,
		"reason":            reason,
		"post_status":       reportedPost.Status,
		"destination_id":    reportedPost.DestinationID,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"post":   reportedPost,
		"report": report,
	})
}

func (a *App) handleVoteCommunityPost(w http.ResponseWriter, r *http.Request, user *AuthUser, postID string) {
	post, ok := a.store.GetCommunityPost(postID)
	if !ok || !communityPostVisibleToUser(post, user.UserID) {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community post not found"))
		return
	}

	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	voteType := normalizeCommunityVoteType(asString(firstNonEmpty(body["vote_type"], communityVoteTypeHelpful)))
	if voteType == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "vote_type must be helpful or want_to_go"))
		return
	}

	voted, err := a.store.VoteCommunityPost(postID, user.UserID, voteType)
	if err != nil {
		switch {
		case errors.Is(err, ErrCommunityPostNotFound):
			writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community post not found"))
		case errors.Is(err, ErrCommunityVoteInvalid):
			writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "vote_type must be helpful or want_to_go"))
		default:
			writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to vote community post"))
		}
		return
	}

	a.trackEvent("community_post_voted", user.UserID, map[string]any{
		"community_post_id": postID,
		"vote_type":         voteType,
		"destination_id":    voted.DestinationID,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"post": voted,
	})
}

func (a *App) handleAdminListCommunityPosts(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	if err := requireAdmin(user); err != nil {
		writeAppError(w, err)
		return
	}

	limit := clampLimit(r.URL.Query().Get("limit"), 1, 50, 20)
	status := normalizeCommunityPostStatus(r.URL.Query().Get("status"))
	if rawStatus := strings.TrimSpace(r.URL.Query().Get("status")); rawStatus != "" && status == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "invalid community post status"))
		return
	}

	items := a.store.ListCommunityPosts(CommunityPostFilter{
		AdminView:        true,
		DestinationID:    strings.TrimSpace(r.URL.Query().Get("destination_id")),
		DestinationLabel: strings.TrimSpace(r.URL.Query().Get("destination_label")),
		Status:           status,
		Limit:            limit,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"count": len(items),
	})
}

func (a *App) handleAdminListCommunityReports(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	if err := requireAdmin(user); err != nil {
		writeAppError(w, err)
		return
	}

	limit := clampLimit(r.URL.Query().Get("limit"), 1, 50, 20)
	status := normalizeCommunityReportStatus(firstNonBlank(r.URL.Query().Get("status"), communityReportStatusOpen))
	if rawStatus := strings.TrimSpace(r.URL.Query().Get("status")); rawStatus != "" && status == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "invalid community report status"))
		return
	}

	items := a.store.ListCommunityReports(limit, status)
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"count": len(items),
	})
}

func (a *App) handleAdminModerateCommunityPost(w http.ResponseWriter, r *http.Request, user *AuthUser, postID string) {
	if err := requireAdmin(user); err != nil {
		writeAppError(w, err)
		return
	}

	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	action := normalizeCommunityModerationAction(asString(body["action"]))
	reason := normalizedSignalKey(asString(firstNonEmpty(body["reason"], action)))
	note := normalizeCommunityText(asString(body["note"]))
	if action == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "action must be approve, limit, remove, or restore"))
		return
	}
	if reason == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "reason is required"))
		return
	}

	post, logEntry, err := a.store.ModerateCommunityPost(postID, user.UserID, action, reason, note)
	if err != nil {
		switch {
		case errors.Is(err, ErrCommunityPostNotFound):
			writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community post not found"))
		case errors.Is(err, ErrCommunityModerationInvalid):
			writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "invalid moderation action"))
		default:
			writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to moderate community post"))
		}
		return
	}

	a.trackEvent("community_post_moderated", user.UserID, map[string]any{
		"community_post_id": postID,
		"action":            action,
		"reason":            reason,
		"post_status":       post.Status,
		"destination_id":    post.DestinationID,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"post": post,
		"log":  logEntry,
	})
}

func (a *App) handleValidatePlan(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}
	itinerary := asMap(body["itinerary"])
	if len(itinerary) == 0 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "itinerary is required"))
		return
	}
	result := validateItineraryPayload(itinerary, asBool(body["strict"]))
	writeJSON(w, http.StatusOK, map[string]any{
		"validation_result": validationResultMap(result),
	})
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
	a.trackEvent("place_detail_viewed", user.UserID, map[string]any{
		"provider":          detail.Provider,
		"provider_place_id": detail.ProviderPlaceID,
	})
	writeJSON(w, http.StatusOK, detail)
}

func (a *App) handleGeneratePlan(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}
	if err := mustFields(body, "origin_city", "destination", "days", "budget_level", "start_date", "pace"); err != nil {
		writeAppError(w, err)
		return
	}

	days, ok := asInt(body["days"])
	if !ok || days < 1 || days > 14 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "days must be an integer between 1 and 14"))
		return
	}
	startDate := strings.TrimSpace(asString(body["start_date"]))
	if !isISODate(startDate) {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "start_date must be in YYYY-MM-DD format"))
		return
	}

	req := PlanRequest{
		OriginCity:   asString(body["origin_city"]),
		Destination:  asString(body["destination"]),
		Days:         days,
		BudgetLevel:  asString(body["budget_level"]),
		Companions:   asStringSlice(body["companions"]),
		TravelStyles: asStringSlice(body["travel_styles"]),
		MustGo:       asStringSlice(body["must_go"]),
		Avoid:        asStringSlice(body["avoid"]),
		StartDate:    startDate,
		Pace:         asString(body["pace"]),
		UserID:       user.UserID,
	}

	variantValue, hasVariants := body["variants"]
	if !hasVariants {
		itinerary := generateItinerary(req)
		a.trackEvent("plan_generated", user.UserID, map[string]any{
			"destination": req.Destination,
			"days":        req.Days,
			"confidence":  itinerary["confidence"],
			"variants":    0,
		})
		writeJSON(w, http.StatusOK, itinerary)
		return
	}

	variants, ok := asInt(variantValue)
	if !ok || (variants != 1 && variants != 2) {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "variants must be 1 or 2"))
		return
	}

	plans := make([]map[string]any, 0, variants)
	balanced := generateVariantItinerary(req, "balanced")
	plans = append(plans, map[string]any{
		"plan_variant": "balanced",
		"itinerary":    balanced,
	})
	if variants >= 2 {
		experience := generateVariantItinerary(req, "experience")
		plans = append(plans, map[string]any{
			"plan_variant": "experience",
			"itinerary":    experience,
		})
	}

	a.trackEvent("plan_generated", user.UserID, map[string]any{
		"destination": req.Destination,
		"days":        req.Days,
		"variants":    variants,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"plans":    plans,
		"degraded": false,
	})
}

func generateVariantItinerary(req PlanRequest, variant string) map[string]any {
	vReq := req
	if strings.EqualFold(strings.TrimSpace(variant), "experience") {
		if strings.ToLower(strings.TrimSpace(vReq.BudgetLevel)) != "high" {
			vReq.BudgetLevel = "high"
		}
		vReq.TravelStyles = uniqueStrings(append(vReq.TravelStyles, "experience"))
		variant = "experience"
	} else {
		variant = "balanced"
	}
	itinerary := generateItinerary(vReq)
	itinerary["plan_variant"] = variant
	return itinerary
}

func (a *App) handleReplanPlan(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	itinerary := asMap(body["itinerary"])
	patch := asMap(body["patch"])
	if len(itinerary) == 0 || len(patch) == 0 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "itinerary and patch are required"))
		return
	}

	owner := asString(asMap(itinerary["request_snapshot"])["user_id"])
	if strings.TrimSpace(owner) != strings.TrimSpace(user.UserID) {
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "cannot replan other user itinerary"))
		return
	}

	normalizeReplanPatch(patch)
	if err := validateReplanPatch(itinerary, patch); err != nil {
		writeAppError(w, err)
		return
	}

	next := replanItinerary(itinerary, patch)
	refreshV2ItineraryMetadata(next)
	a.trackEvent("plan_replanned", user.UserID, map[string]any{"change_type": firstNonEmpty(patch["change_type"], "unknown")})
	writeJSON(w, http.StatusOK, next)
}

var supportedReplanChangeTypes = map[string]bool{
	"lock":          true,
	"unlock":        true,
	"replan_window": true,
	"budget":        true,
	"preferences":   true,
	"poi":           true,
	"date":          true,
}

func normalizeReplanPatch(patch map[string]any) {
	if _, exists := patch["keep_locked"]; !exists {
		if legacy, ok := patch["preserve_locked"]; ok {
			patch["keep_locked"] = asBool(legacy)
		} else {
			patch["keep_locked"] = true
		}
	}
}

func validateReplanPatch(itinerary map[string]any, patch map[string]any) *AppError {
	changeType := strings.ToLower(strings.TrimSpace(asString(patch["change_type"])))
	if changeType == "" {
		return appError(http.StatusBadRequest, "BAD_REQUEST", "patch.change_type is required")
	}
	if !supportedReplanChangeTypes[changeType] {
		return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("unsupported patch.change_type: %s", changeType))
	}
	patch["change_type"] = changeType

	dayCount := len(asSlice(itinerary["days"]))

	for idx, item := range asSlice(patch["affected_days"]) {
		day, ok := asInt(item)
		if !ok || day < 0 || (dayCount > 0 && day >= dayCount) {
			return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("affected_days[%d] out of range", idx))
		}
	}

	switch changeType {
	case "lock", "unlock":
		targets := asSlice(patch["targets"])
		if len(targets) == 0 {
			return appError(http.StatusBadRequest, "BAD_REQUEST", "patch.targets is required for lock/unlock")
		}
		for idx, targetItem := range targets {
			target := asMap(targetItem)
			blockID := strings.TrimSpace(asString(target["block_id"]))
			day, dayOK := asInt(target["day_index"])
			startHour, startOK := asInt(target["start_hour"])
			endHour, endOK := asInt(target["end_hour"])

			if blockID == "" && (!dayOK || !startOK || !endOK) {
				return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("targets[%d] requires block_id or day_index/start_hour/end_hour", idx))
			}
			if dayOK && (day < 0 || (dayCount > 0 && day >= dayCount)) {
				return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("targets[%d].day_index out of range", idx))
			}
			if startOK != endOK {
				return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("targets[%d] must provide both start_hour and end_hour", idx))
			}
			if startOK && !isHourWindowValid(startHour, endHour) {
				return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("targets[%d] has invalid hour window", idx))
			}
		}

	case "replan_window":
		targets := asSlice(patch["targets"])
		if len(targets) == 0 {
			return appError(http.StatusBadRequest, "BAD_REQUEST", "patch.targets is required for replan_window")
		}
		for idx, targetItem := range targets {
			target := asMap(targetItem)
			day, dayOK := asInt(target["day_index"])
			startHour, startOK := asInt(target["start_hour"])
			endHour, endOK := asInt(target["end_hour"])
			if !dayOK || !startOK || !endOK {
				return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("targets[%d] requires day_index/start_hour/end_hour", idx))
			}
			if day < 0 || (dayCount > 0 && day >= dayCount) {
				return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("targets[%d].day_index out of range", idx))
			}
			if !isHourWindowValid(startHour, endHour) {
				return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("targets[%d] has invalid hour window", idx))
			}
		}

	case "budget":
		newBudgetLevel := strings.ToLower(strings.TrimSpace(asString(patch["new_budget_level"])))
		if newBudgetLevel != "low" && newBudgetLevel != "medium" && newBudgetLevel != "high" {
			return appError(http.StatusBadRequest, "BAD_REQUEST", "new_budget_level must be one of low|medium|high")
		}
		patch["new_budget_level"] = newBudgetLevel

	case "preferences":
		if len(uniqueStrings(asStringSlice(patch["new_travel_styles"]))) == 0 {
			return appError(http.StatusBadRequest, "BAD_REQUEST", "new_travel_styles is required")
		}

	case "poi":
		if strings.TrimSpace(asString(patch["remove_poi"])) == "" {
			return appError(http.StatusBadRequest, "BAD_REQUEST", "remove_poi is required")
		}

	case "date":
		newStartDate := strings.TrimSpace(asString(patch["new_start_date"]))
		if !isISODate(newStartDate) {
			return appError(http.StatusBadRequest, "BAD_REQUEST", "new_start_date must be in YYYY-MM-DD format")
		}
	}

	return nil
}

func isHourWindowValid(startHour, endHour int) bool {
	if startHour < 0 || startHour > 24 {
		return false
	}
	if endHour < 0 || endHour > 24 {
		return false
	}
	return startHour < endHour
}
func (a *App) handleRevertPlan(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}
	if err := mustFields(body, "saved_plan_id", "target_version"); err != nil {
		writeAppError(w, err)
		return
	}

	savedPlanID := strings.TrimSpace(asString(body["saved_plan_id"]))
	targetVersion, ok := asInt(body["target_version"])
	if !ok || targetVersion < 1 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "target_version must be a positive integer"))
		return
	}

	reverted, err := a.store.RevertSavedPlan(user.UserID, savedPlanID, targetVersion)
	if err != nil {
		switch {
		case errors.Is(err, ErrSavedPlanNotFound):
			writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		case errors.Is(err, ErrSavedPlanForbidden):
			writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "cannot revert other user plan"))
		case errors.Is(err, ErrTargetVersionNotFound):
			writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "target_version not found"))
		default:
			writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to revert saved plan"))
		}
		return
	}

	a.trackEvent("plan_reverted", user.UserID, map[string]any{
		"saved_plan_id":  savedPlanID,
		"target_version": targetVersion,
		"version":        asIntOrZero(reverted.Itinerary["version"]),
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"saved_plan_id":  savedPlanID,
		"version":        reverted.Itinerary["version"],
		"parent_version": reverted.Itinerary["parent_version"],
		"itinerary":      reverted.Itinerary,
		"updated_at":     toRFC3339(reverted.SavedAt),
	})
}

func (a *App) handleListSavedPlanVersions(w http.ResponseWriter, r *http.Request, user *AuthUser, id string) {
	limit := clampLimit(r.URL.Query().Get("limit"), 1, 20, 20)
	versions, ok := a.store.ListPlanVersions(user.UserID, id, limit)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		return
	}

	out := make([]map[string]any, 0, len(versions))
	for _, version := range versions {
		parentVersion := any(nil)
		if version.ParentVersion > 0 {
			parentVersion = version.ParentVersion
		}
		out = append(out, map[string]any{
			"version":        version.Version,
			"parent_version": parentVersion,
			"created_at":     toRFC3339(version.CreatedAt),
			"summary":        version.Summary,
			"change_count":   version.ChangeCount,
			"change_types":   version.ChangeTypes,
		})
	}

	writeJSON(w, http.StatusOK, out)
}

func (a *App) handleGetPlanTasks(w http.ResponseWriter, user *AuthUser, id string) {
	tasks, err := a.store.GetPlanTasks(user.UserID, id)
	if err != nil {
		a.writeStoreError(w, err)
		return
	}

	out := make([]map[string]any, 0, len(tasks))
	for _, task := range tasks {
		out = append(out, taskToResponseItem(task))
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *App) handleReplacePlanTasks(w http.ResponseWriter, r *http.Request, user *AuthUser, id string) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	rawTasks, exists := body["tasks"]
	if !exists {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "tasks is required"))
		return
	}
	tasks, parseErr := parseAndValidateTasks(rawTasks)
	if parseErr != nil {
		writeAppError(w, parseErr)
		return
	}

	updated, err := a.store.ReplacePlanTasks(user.UserID, id, tasks)
	if err != nil {
		a.writeStoreError(w, err)
		return
	}

	a.trackEvent("pretrip_task_updated", user.UserID, map[string]any{
		"plan_id":    id,
		"task_count": len(updated),
	})

	out := make([]map[string]any, 0, len(updated))
	for _, task := range updated {
		out = append(out, taskToResponseItem(task))
	}

	writeJSON(w, http.StatusOK, out)
}

func taskToResponseItem(task PreTripTask) map[string]any {
	item := map[string]any{
		"id":       task.ID,
		"category": task.Category,
		"title":    task.Title,
		"status":   task.Status,
		"reminder": reminderToResponse(task.Reminder),
	}
	if strings.TrimSpace(task.DueAt) != "" {
		item["due_at"] = task.DueAt
	}
	return item
}

func parseTaskReminder(raw any) (*PreTripTaskReminder, *AppError) {
	if raw == nil {
		return defaultPreTripTaskReminder(), nil
	}

	reminderMap, ok := raw.(map[string]any)
	if !ok {
		return nil, appError(http.StatusBadRequest, "BAD_REQUEST", "invalid reminder offset_hours")
	}

	enabled := true
	if rawEnabled, exists := reminderMap["enabled"]; exists {
		enabled = asBool(rawEnabled)
	}

	offsetHours := cloneReminderOffsetHours(defaultPreTripReminderOffsetHours)
	rawOffsets, exists := reminderMap["offset_hours"]
	if exists && rawOffsets != nil {
		offsetItems := asSlice(rawOffsets)
		if len(offsetItems) == 0 {
			switch rawOffsets.(type) {
			case []any, []map[string]any, []string:
				// valid but empty, fallback to default offsets
			default:
				return nil, appError(http.StatusBadRequest, "BAD_REQUEST", "invalid reminder offset_hours")
			}
		}

		parsed := make([]int, 0, len(offsetItems))
		for _, item := range offsetItems {
			hour, ok := asInt(item)
			if !ok || !isAllowedPreTripReminderOffsetHour(hour) {
				return nil, appError(http.StatusBadRequest, "BAD_REQUEST", "invalid reminder offset_hours")
			}
			parsed = append(parsed, hour)
		}
		normalized := normalizeReminderOffsetHours(parsed)
		if len(normalized) > 0 {
			offsetHours = normalized
		}
	}

	return &PreTripTaskReminder{
		Enabled:     enabled,
		OffsetHours: offsetHours,
	}, nil
}

func parseAndValidateTasks(raw any) ([]PreTripTask, *AppError) {
	items := asSlice(raw)
	if len(items) > 100 {
		return nil, appError(http.StatusBadRequest, "BAD_REQUEST", "tasks exceeds limit 100")
	}

	out := make([]PreTripTask, 0, len(items))
	for idx, item := range items {
		taskMap := asMap(item)
		id := strings.TrimSpace(asString(taskMap["id"]))
		title := strings.TrimSpace(asString(taskMap["title"]))
		category := strings.TrimSpace(asString(taskMap["category"]))
		status := strings.ToLower(strings.TrimSpace(asString(taskMap["status"])))
		dueAt := strings.TrimSpace(asString(taskMap["due_at"]))
		reminder, reminderErr := parseTaskReminder(taskMap["reminder"])
		if reminderErr != nil {
			return nil, reminderErr
		}

		if id == "" {
			return nil, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("tasks[%d].id is required", idx))
		}
		if title == "" {
			return nil, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("tasks[%d].title is required", idx))
		}
		if category == "" {
			category = "general"
		}
		switch status {
		case "todo", "done", "skipped":
		default:
			return nil, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("invalid task status: %s", status))
		}
		if dueAt != "" {
			if _, err := time.Parse(time.RFC3339, dueAt); err != nil {
				return nil, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("tasks[%d].due_at must be RFC3339", idx))
			}
		}

		out = append(out, PreTripTask{
			ID:       id,
			Category: category,
			Title:    title,
			DueAt:    dueAt,
			Status:   status,
			Reminder: reminder,
		})
	}

	return out, nil
}

func parseExecutionDateWithDefault(raw string) (string, *AppError) {
	date := strings.TrimSpace(raw)
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if !isISODate(date) {
		return "", appError(http.StatusBadRequest, "BAD_REQUEST", "date must be in YYYY-MM-DD format")
	}
	return date, nil
}

func parseRequiredExecutionDate(raw string) (string, *AppError) {
	date := strings.TrimSpace(raw)
	if date == "" {
		return "", appError(http.StatusBadRequest, "BAD_REQUEST", "date is required")
	}
	if !isISODate(date) {
		return "", appError(http.StatusBadRequest, "BAD_REQUEST", "date must be in YYYY-MM-DD format")
	}
	return date, nil
}

func parseAndValidateExecutionUpdates(raw any) ([]ExecutionBlockState, *AppError) {
	items := asSlice(raw)
	if len(items) == 0 {
		return nil, appError(http.StatusBadRequest, "BAD_REQUEST", "updates is required")
	}
	if len(items) > 100 {
		return nil, appError(http.StatusBadRequest, "BAD_REQUEST", "updates exceeds limit 100")
	}

	out := make([]ExecutionBlockState, 0, len(items))
	for idx, item := range items {
		update := asMap(item)
		dayIndex, ok := asInt(update["day_index"])
		if !ok || dayIndex < 0 {
			return nil, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("updates[%d].day_index must be a non-negative integer", idx))
		}
		blockID := strings.TrimSpace(asString(update["block_id"]))
		if blockID == "" {
			return nil, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("updates[%d].block_id is required", idx))
		}
		status := normalizeExecutionStatus(asString(update["status"]))
		if status == "" {
			return nil, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("invalid execution status: %s", strings.TrimSpace(asString(update["status"]))))
		}
		out = append(out, ExecutionBlockState{
			DayIndex: dayIndex,
			BlockID:  blockID,
			Status:   status,
		})
	}

	return out, nil
}

func resolveExecutionDayDate(day map[string]any, dayIndex int, fallbackStartDate string) string {
	dayDate := strings.TrimSpace(asString(day["date"]))
	if isISODate(dayDate) {
		return dayDate
	}
	if !isISODate(fallbackStartDate) || dayIndex < 0 {
		return ""
	}
	base, err := time.Parse("2006-01-02", fallbackStartDate)
	if err != nil {
		return ""
	}
	return base.AddDate(0, 0, dayIndex).Format("2006-01-02")
}

func resolveExecutionBlockID(dayIndex int, block map[string]any, blockIdx int) string {
	blockID := strings.TrimSpace(asString(block["block_id"]))
	if blockID != "" {
		return blockID
	}
	startHour, startOK := asInt(block["start_hour"])
	endHour, endOK := asInt(block["end_hour"])
	if startOK && endOK {
		return makeBlockID(dayIndex, startHour, endHour, blockIdx)
	}
	return fmt.Sprintf("d%d-b%d", dayIndex+1, blockIdx+1)
}

func collectExecutionBlockScope(itinerary map[string]any, date string) (map[int]map[string]struct{}, int) {
	scope := map[int]map[string]struct{}{}
	fallbackStartDate := strings.TrimSpace(asString(firstNonEmpty(asMap(itinerary["request_snapshot"])["start_date"], itinerary["start_date"], "")))

	for idx, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		dayIndex := idx
		if parsed, ok := asInt(day["day_index"]); ok && parsed >= 0 {
			dayIndex = parsed
		}
		if resolveExecutionDayDate(day, dayIndex, fallbackStartDate) != date {
			continue
		}
		if _, exists := scope[dayIndex]; !exists {
			scope[dayIndex] = map[string]struct{}{}
		}
		for blockIdx, blockItem := range asSlice(day["blocks"]) {
			blockID := resolveExecutionBlockID(dayIndex, asMap(blockItem), blockIdx)
			if blockID == "" {
				continue
			}
			scope[dayIndex][blockID] = struct{}{}
		}
	}

	total := 0
	for _, blockSet := range scope {
		total += len(blockSet)
	}
	return scope, total
}

func summarizeExecutionForScope(scope map[int]map[string]struct{}, blocks []ExecutionBlockState) map[string]int {
	summary := map[string]int{
		"total":   0,
		"done":    0,
		"skipped": 0,
		"pending": 0,
	}
	if len(scope) == 0 {
		return summary
	}

	statusByKey := map[string]string{}
	for _, item := range blocks {
		blockSet, exists := scope[item.DayIndex]
		if !exists {
			continue
		}
		blockID := strings.TrimSpace(item.BlockID)
		if blockID == "" {
			continue
		}
		if _, exists := blockSet[blockID]; !exists {
			continue
		}
		status := normalizeExecutionStatus(item.Status)
		if status == "" {
			status = "pending"
		}
		statusByKey[executionBlockStateMapKey(item.DayIndex, blockID)] = status
	}

	for dayIndex, blockSet := range scope {
		for blockID := range blockSet {
			summary["total"] += 1
			switch statusByKey[executionBlockStateMapKey(dayIndex, blockID)] {
			case "done":
				summary["done"] += 1
			case "skipped":
				summary["skipped"] += 1
			default:
				summary["pending"] += 1
			}
		}
	}

	return summary
}

func executionBlocksToPayload(blocks []ExecutionBlockState) []map[string]any {
	if len(blocks) == 0 {
		return []map[string]any{}
	}
	out := make([]map[string]any, 0, len(blocks))
	for _, item := range blocks {
		out = append(out, map[string]any{
			"day_index":  item.DayIndex,
			"block_id":   strings.TrimSpace(item.BlockID),
			"status":     normalizeExecutionStatus(item.Status),
			"updated_at": toRFC3339(item.UpdatedAt),
		})
	}
	return out
}

func (a *App) handleGetPlanExecution(w http.ResponseWriter, r *http.Request, user *AuthUser, id string) {
	date, dateErr := parseExecutionDateWithDefault(r.URL.Query().Get("date"))
	if dateErr != nil {
		writeAppError(w, dateErr)
		return
	}

	saved, ok := a.store.GetSavedPlan(user.UserID, id)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		return
	}

	state, err := a.store.GetPlanExecution(user.UserID, id, date)
	if err != nil {
		a.writeExecutionError(w, err)
		return
	}

	scope, _ := collectExecutionBlockScope(saved.Itinerary, date)
	summary := summarizeExecutionForScope(scope, state.Blocks)

	a.trackEvent("trip_execution_viewed", user.UserID, map[string]any{
		"plan_id":   id,
		"date":      date,
		"total":     summary["total"],
		"done":      summary["done"],
		"skipped":   summary["skipped"],
		"pending":   summary["pending"],
		"has_state": true,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"saved_plan_id": id,
		"date":          date,
		"summary":       summary,
		"blocks":        executionBlocksToPayload(state.Blocks),
	})
}

func (a *App) handleReplacePlanExecution(w http.ResponseWriter, r *http.Request, user *AuthUser, id string) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	date, dateErr := parseRequiredExecutionDate(asString(body["date"]))
	if dateErr != nil {
		writeAppError(w, dateErr)
		return
	}

	rawUpdates, exists := body["updates"]
	if !exists {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "updates is required"))
		return
	}
	updates, parseErr := parseAndValidateExecutionUpdates(rawUpdates)
	if parseErr != nil {
		writeAppError(w, parseErr)
		return
	}

	saved, ok := a.store.GetSavedPlan(user.UserID, id)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		return
	}
	validScope, total := collectExecutionBlockScope(saved.Itinerary, date)
	if total == 0 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "date is out of itinerary range"))
		return
	}

	for idx, update := range updates {
		dayBlocks, exists := validScope[update.DayIndex]
		if !exists {
			writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("updates[%d] day_index is out of date scope", idx)))
			return
		}
		if _, exists := dayBlocks[strings.TrimSpace(update.BlockID)]; !exists {
			writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("updates[%d] block_id not found for date", idx)))
			return
		}
	}

	updated, err := a.store.UpsertPlanExecution(user.UserID, id, date, updates)
	if err != nil {
		a.writeExecutionError(w, err)
		return
	}

	summary := summarizeExecutionForScope(validScope, updated.Blocks)
	a.trackEvent("trip_execution_updated", user.UserID, map[string]any{
		"plan_id":      id,
		"date":         date,
		"update_count": len(updates),
		"total":        summary["total"],
		"done":         summary["done"],
		"skipped":      summary["skipped"],
		"pending":      summary["pending"],
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"saved_plan_id": id,
		"date":          date,
		"summary":       summary,
		"blocks":        executionBlocksToPayload(updated.Blocks),
	})
}

func (a *App) handlePlanDiff(w http.ResponseWriter, r *http.Request, user *AuthUser, id string) {
	fromVersion, ok := asInt(r.URL.Query().Get("from_version"))
	if !ok || fromVersion < 1 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "from_version and to_version are required"))
		return
	}
	toVersion, ok := asInt(r.URL.Query().Get("to_version"))
	if !ok || toVersion < 1 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "from_version and to_version are required"))
		return
	}
	if fromVersion == toVersion {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "from_version and to_version must be different"))
		return
	}

	fromItem, err := a.store.GetPlanVersion(user.UserID, id, fromVersion)
	if err != nil {
		a.writeDiffError(w, err)
		return
	}
	toItem, err := a.store.GetPlanVersion(user.UserID, id, toVersion)
	if err != nil {
		a.writeDiffError(w, err)
		return
	}

	diff := buildPlanDiff(fromItem.Itinerary, toItem.Itinerary)
	diff["from_version"] = fromVersion
	diff["to_version"] = toVersion

	a.trackEvent("plan_diff_viewed", user.UserID, map[string]any{
		"plan_id":        id,
		"from_version":   fromVersion,
		"to_version":     toVersion,
		"changed_blocks": asIntOrZero(asMap(diff["summary"])["changed_blocks"]),
	})

	writeJSON(w, http.StatusOK, diff)
}

func (a *App) handleCreatePlanShare(w http.ResponseWriter, r *http.Request, user *AuthUser, id string) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	expiresInHours := 168
	if raw, exists := body["expires_in_hours"]; exists {
		parsed, ok := asInt(raw)
		if !ok {
			writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "expires_in_hours must be an integer"))
			return
		}
		expiresInHours = parsed
	}
	if expiresInHours < 1 || expiresInHours > 720 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "expires_in_hours must be between 1 and 720"))
		return
	}

	record, err := a.store.CreateShareToken(user.UserID, id, expiresInHours)
	if err != nil {
		a.writeStoreError(w, err)
		return
	}

	a.trackEvent("plan_share_created", user.UserID, map[string]any{
		"plan_id":          id,
		"token":            record.Token,
		"expires_in_hours": expiresInHours,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"token":      record.Token,
		"share_path": "/share/" + record.Token,
		"expires_at": toRFC3339(record.ExpiresAt),
	})
}

func (a *App) handleClosePlanShare(w http.ResponseWriter, user *AuthUser, id, token string) {
	err := a.store.CloseShareToken(user.UserID, id, token)
	if err != nil {
		switch {
		case errors.Is(err, ErrSavedPlanNotFound):
			writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		case errors.Is(err, ErrSavedPlanForbidden):
			writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "cannot access other user plan"))
		case errors.Is(err, ErrShareTokenNotFound):
			writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "share token not found"))
		default:
			writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to close share token"))
		}
		return
	}

	a.trackEvent("plan_share_closed", user.UserID, map[string]any{
		"plan_id": id,
		"token":   token,
	})

	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handlePublicShareRead(w http.ResponseWriter, token string) {
	plan, shareRecord, err := a.store.GetSharedPlanByToken(token)
	if err != nil {
		switch {
		case errors.Is(err, ErrShareTokenNotFound):
			writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "share token not found"))
		case errors.Is(err, ErrShareTokenExpired):
			writeAppError(w, appError(http.StatusGone, "GONE", "share token expired"))
		default:
			writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to load shared plan"))
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":        plan.ID,
		"itinerary": sanitizeSharedItinerary(plan.Itinerary),
		"readonly":  true,
		"shared_at": toRFC3339(shareRecord.CreatedAt),
	})
}

func sanitizeSharedItinerary(itinerary map[string]any) map[string]any {
	next := deepCloneMap(itinerary)
	snapshot := asMap(next["request_snapshot"])
	delete(snapshot, "user_id")
	next["request_snapshot"] = snapshot
	return next
}

func (a *App) writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrSavedPlanNotFound):
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
	case errors.Is(err, ErrSavedPlanForbidden):
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "cannot access other user plan"))
	default:
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to persist saved plan"))
	}
}

func (a *App) writeExecutionError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrSavedPlanNotFound):
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
	case errors.Is(err, ErrSavedPlanForbidden):
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "cannot update execution of other user plan"))
	case errors.Is(err, ErrExecutionStateNotFound):
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "execution state not found"))
	default:
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to persist execution state"))
	}
}

func (a *App) writeDiffError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrSavedPlanNotFound):
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
	case errors.Is(err, ErrSavedPlanForbidden):
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "cannot view diff of other user plan"))
	case errors.Is(err, ErrTargetVersionNotFound):
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "target_version not found"))
	default:
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to build diff"))
	}
}

func (a *App) handleSavePlan(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}

	itinerary := asMap(body["itinerary"])
	if len(itinerary) == 0 {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "itinerary is required"))
		return
	}

	owner := asString(asMap(itinerary["request_snapshot"])["user_id"])
	if strings.TrimSpace(owner) != strings.TrimSpace(user.UserID) {
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "cannot save other user itinerary"))
		return
	}

	latestPlans := a.store.ListSavedPlans(user.UserID, 1)
	if len(latestPlans) > 0 && itinerarySignature(latestPlans[0].Itinerary) == itinerarySignature(itinerary) {
		latest := latestPlans[0]
		a.trackEvent("plan_save_deduped", user.UserID, map[string]any{"saved_plan_id": latest.ID})
		writeJSON(w, http.StatusOK, map[string]any{
			"id":            latest.ID,
			"saved_plan_id": latest.ID,
			"user_id":       latest.UserID,
			"itinerary":     latest.Itinerary,
			"saved_at":      toRFC3339(latest.SavedAt),
			"updated_at":    toRFC3339(latest.SavedAt),
			"deduped":       true,
		})
		return
	}

	now := time.Now().UTC()
	id := randomID()
	saved, err := a.store.SavePlan(SavedPlan{
		ID:        id,
		UserID:    user.UserID,
		Itinerary: itinerary,
		SavedAt:   now,
	})
	if err != nil {
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to persist saved plan"))
		return
	}

	saveMetadata := buildPlanSavedEventMetadata(saved.Itinerary)
	saveMetadata["saved_plan_id"] = saved.ID
	a.trackEvent("plan_saved", user.UserID, saveMetadata)
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":            saved.ID,
		"saved_plan_id": saved.ID,
		"user_id":       saved.UserID,
		"itinerary":     saved.Itinerary,
		"saved_at":      toRFC3339(saved.SavedAt),
		"updated_at":    toRFC3339(saved.SavedAt),
		"deduped":       false,
	})
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

func extractCommunityReferencedPostIDsFromPlans(plans []map[string]any) []string {
	ids := make([]string, 0, 6)
	for _, item := range plans {
		ids = append(ids, extractCommunityReferencedPostIDsFromItinerary(asMap(item["itinerary"]))...)
	}
	return uniqueStrings(ids)
}

func extractCommunityReferencedPostIDsFromItinerary(itinerary map[string]any) []string {
	summary := asMap(itinerary["community_reference_summary"])
	return uniqueStrings(asStringSlice(summary["referenced_post_ids"]))
}

func buildPlanSavedEventMetadata(itinerary map[string]any) map[string]any {
	requestSnapshot := asMap(itinerary["request_snapshot"])
	destinationEntity := asMap(firstNonEmpty(itinerary["destination_entity"], requestSnapshot["destination_entity"]))
	days := asSlice(itinerary["days"])
	totalBlocks := 0
	blockTypeCount := map[string]int{}
	tagSeen := map[string]bool{}
	topTags := make([]string, 0, 8)

	for _, dayItem := range days {
		day := asMap(dayItem)
		blocks := asSlice(day["blocks"])
		totalBlocks += len(blocks)
		for _, blockItem := range blocks {
			block := asMap(blockItem)
			blockType := strings.TrimSpace(asString(block["block_type"]))
			if blockType != "" {
				blockTypeCount[blockType]++
			}
			for _, tag := range asStringSlice(block["poi_tags"]) {
				tag = strings.TrimSpace(tag)
				if tag == "" || tagSeen[tag] {
					continue
				}
				tagSeen[tag] = true
				topTags = append(topTags, tag)
				if len(topTags) >= 6 {
					break
				}
			}
		}
	}

	dailyBlockCount := 0.0
	if len(days) > 0 {
		dailyBlockCount = float64(totalBlocks) / float64(len(days))
	}
	dominantBlockType := firstSortedKeyByCount(blockTypeCount)

	return map[string]any{
		"destination":                   strings.TrimSpace(asString(firstNonEmpty(itinerary["destination"], requestSnapshot["destination"]))),
		"destination_adcode":            strings.TrimSpace(asString(destinationEntity["adcode"])),
		"daily_block_count":             roundToOneDecimal(dailyBlockCount),
		"poi_category":                  dominantBlockType,
		"poi_tags":                      topTags,
		"budget_level":                  strings.TrimSpace(asString(requestSnapshot["budget_level"])),
		"pace":                          strings.TrimSpace(asString(requestSnapshot["pace"])),
		"travel_styles":                 uniqueStrings(asStringSlice(requestSnapshot["travel_styles"])),
		"community_referenced_post_ids": extractCommunityReferencedPostIDsFromItinerary(itinerary),
	}
}

func firstSortedKeyByCount(values map[string]int) string {
	bestKey := ""
	bestCount := 0
	for key, count := range values {
		if strings.TrimSpace(key) == "" {
			continue
		}
		if count > bestCount || (count == bestCount && (bestKey == "" || key < bestKey)) {
			bestKey = key
			bestCount = count
		}
	}
	return bestKey
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

func (a *App) handleSavedPlanSummary(w http.ResponseWriter, user *AuthUser, id string) {
	saved, ok := a.store.GetSavedPlan(user.UserID, id)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"summary": summarizeItinerary(saved.Itinerary)})
}

func (a *App) handleSavedPlanCommunityDraft(w http.ResponseWriter, user *AuthUser, id string) {
	saved, ok := a.store.GetSavedPlan(user.UserID, id)
	if !ok {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "saved plan not found"))
		return
	}

	draft := buildCommunityPostDraftSeed(saved)
	a.trackEvent("community_draft_seeded_from_saved_plan", user.UserID, map[string]any{
		"saved_plan_id":     id,
		"destination_label": draft.DestinationLabel,
		"tag_count":         len(draft.Tags),
		"restaurant_count":  len(draft.FavoriteRestaurants),
		"attraction_count":  len(draft.FavoriteAttractions),
	})
	writeJSON(w, http.StatusOK, draft)
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
	a.trackEvent("plan_deleted", user.UserID, map[string]any{"saved_plan_id": id})
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleTrackEvent(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}
	eventName := strings.TrimSpace(asString(body["event_name"]))
	if eventName == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "event_name is required"))
		return
	}

	metadata := asMap(body["metadata"])
	if err := a.recordEvent(eventName, user.UserID, metadata); err != nil {
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to persist event"))
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

func requireAdmin(user *AuthUser) *AppError {
	if user == nil || user.Role != "ADMIN" {
		return appError(http.StatusForbidden, "FORBIDDEN", "admin role required")
	}
	return nil
}

func (a *App) handleEventSummary(w http.ResponseWriter, user *AuthUser) {
	if err := requireAdmin(user); err != nil {
		writeAppError(w, err)
		return
	}
	summary := a.store.EventSummary()
	writeJSON(w, http.StatusOK, summary)
}

func (a *App) handleEventRecent(w http.ResponseWriter, user *AuthUser) {
	if err := requireAdmin(user); err != nil {
		writeAppError(w, err)
		return
	}

	items := a.store.RecentEvents(30)
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"event_name": item.EventName,
			"user_id":    item.UserID,
			"metadata":   item.Metadata,
			"timestamp":  toRFC3339(item.CreatedAt),
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func (a *App) handlePrivateProfileSummary(w http.ResponseWriter, user *AuthUser) {
	settings := a.store.GetPersonalizationSettings(user.UserID)
	profile, ok := a.store.GetPrivateProfile(user.UserID)
	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{
			"ready":    false,
			"settings": settings,
			"profile":  defaultUserPrivateProfile(user.UserID),
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ready":    settings.Enabled,
		"settings": settings,
		"profile":  profile,
	})
}

func (a *App) handleUpdatePrivatePersonalizationSettings(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	body := map[string]any{}
	if err := decodeJSONBody(r, &body); err != nil {
		writeAppError(w, err)
		return
	}
	enabled, exists := body["enabled"]
	if !exists {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "enabled is required"))
		return
	}

	settings, err := a.store.UpdatePersonalizationSettings(user.UserID, asBool(enabled))
	if err != nil {
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to update personalization settings"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"settings": settings,
	})
}

func (a *App) handleClearPrivateSignals(w http.ResponseWriter, user *AuthUser) {
	settings, err := a.store.ClearPrivateSignals(user.UserID)
	if err != nil {
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to clear personalization history"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"cleared":  true,
		"settings": settings,
		"profile":  defaultUserPrivateProfile(user.UserID),
	})
}

func (a *App) recordEvent(eventName, userID string, metadata map[string]any) error {
	return a.store.AddEvent(EventRecord{
		EventName: strings.TrimSpace(eventName),
		UserID:    strings.TrimSpace(userID),
		Metadata:  metadata,
		CreatedAt: time.Now().UTC(),
	})
}

func (a *App) trackEvent(eventName, userID string, metadata map[string]any) {
	if err := a.recordEvent(eventName, userID, metadata); err != nil {
		log.Printf("failed to persist event %q: %v", eventName, err)
	}
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
