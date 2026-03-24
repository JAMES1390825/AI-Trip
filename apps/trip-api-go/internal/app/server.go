package app

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

type App struct {
	config Config
	store  *Store
}

func New() (*App, error) {
	cfg := LoadConfig()
	store, err := NewStore(cfg.Storage.DataFile)
	if err != nil {
		return nil, err
	}
	return &App{config: cfg, store: store}, nil
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

	response := nextChatResponse(history, asMap(body["draft_plan_request"]), user.UserID)
	a.trackEvent("chat_turn_submitted", user.UserID, map[string]any{
		"history_size":  len(history),
		"locale":        firstNonEmpty(body["locale"], "zh-CN"),
		"fallback_mode": response["fallback_mode"],
		"intent":        response["intent"],
		"next_action":   response["next_action"],
	})

	writeJSON(w, http.StatusOK, response)
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

	a.trackEvent("plan_saved", user.UserID, map[string]any{"saved_plan_id": saved.ID})
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":            saved.ID,
		"saved_plan_id": saved.ID,
		"user_id":       saved.UserID,
		"itinerary":     saved.Itinerary,
		"saved_at":      toRFC3339(saved.SavedAt),
		"updated_at":    toRFC3339(saved.SavedAt),
	})
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

func (a *App) handleEventSummary(w http.ResponseWriter, user *AuthUser) {
	if user.Role != "ADMIN" {
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "admin role required"))
		return
	}
	summary := a.store.EventSummary()
	writeJSON(w, http.StatusOK, summary)
}

func (a *App) handleEventRecent(w http.ResponseWriter, user *AuthUser) {
	if user.Role != "ADMIN" {
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "admin role required"))
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
