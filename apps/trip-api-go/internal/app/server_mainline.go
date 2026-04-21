package app

import (
	"context"
	"net/http"
	"strings"
	"time"
)

func (a *App) buildGenerateV2PlansResponse(ctx context.Context, brief PlanningBrief, userID string, variants int, allowFallback bool, options PlanGenerateOptions) (map[string]any, *AppError) {
	plans := make([]map[string]any, 0, variants)

	balancedItinerary := a.buildV2VariantItineraryWithOptions(ctx, brief, userID, "balanced", options)
	balancedEnvelope := buildMainlineItineraryEnvelope(
		balancedItinerary,
		brief,
		asString(balancedItinerary["source_mode"]),
		asString(balancedItinerary["degraded_reason"]),
	)
	plans = append(plans, map[string]any{
		"plan_variant": "balanced",
		"itinerary":    balancedEnvelope.Itinerary,
	})

	if variants == 2 {
		experienceBrief := variantAdjustedBrief(brief, "experience")
		experienceItinerary := a.buildV2VariantItineraryWithOptions(ctx, brief, userID, "experience", options)
		experienceEnvelope := buildMainlineItineraryEnvelope(
			experienceItinerary,
			experienceBrief,
			asString(experienceItinerary["source_mode"]),
			asString(experienceItinerary["degraded_reason"]),
		)
		plans = append(plans, map[string]any{
			"plan_variant": "experience",
			"itinerary":    experienceEnvelope.Itinerary,
		})
	}

	response := buildMainlineGenerateV2Response(plans)
	if !allowFallback && asBool(response["degraded"]) {
		return nil, appError(http.StatusBadRequest, "PROVIDER_COVERAGE_LOW", "provider grounding is still incomplete for this itinerary")
	}

	return response, nil
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

	response, appErr := a.buildGenerateV2PlansResponse(r.Context(), brief, user.UserID, variants, allowFallback, PlanGenerateOptions{})
	if appErr != nil {
		writeAppError(w, appErr)
		return
	}

	writeJSON(w, http.StatusOK, response)
}

func (a *App) handleMainlineAuthed(w http.ResponseWriter, r *http.Request, user *AuthUser) bool {
	path := r.URL.Path
	method := r.Method

	switch {
	case method == http.MethodGet && path == "/api/v1/destinations/resolve":
		a.handleDestinationResolve(w, r, user)
		return true
	case method == http.MethodPost && path == "/api/v1/plans/brief":
		a.handlePlanningBrief(w, r, user)
		return true
	case method == http.MethodPost && path == "/api/v1/plans/generate-v2":
		a.handleGeneratePlanV2(w, r, user)
		return true
	case method == http.MethodPost && path == "/api/v1/plans/validate":
		a.handleValidatePlan(w, r, user)
		return true
	case method == http.MethodPost && path == "/api/v1/plans/save":
		a.handleSavePlan(w, r, user)
		return true
	case method == http.MethodGet && path == "/api/v1/plans/saved":
		a.handleListSavedPlans(w, r, user)
		return true
	default:
		return false
	}
}

func (a *App) handleDestinationResolve(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := asIntOrZero(firstNonEmpty(r.URL.Query().Get("limit"), "10"))
	if limit <= 0 || limit > 20 {
		limit = 10
	}

	writeJSON(w, http.StatusOK, a.resolveDestinationsWithProvider(r.Context(), query, limit))
}

func (a *App) handlePlanningBrief(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	input := planningBriefRequest{}
	if err := decodeJSONBody(r, &input); err != nil {
		writeAppError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, a.buildPlanningBriefResponse(r.Context(), input, user.UserID))
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

	itinerary = normalizeMainlineItineraryForSave(itinerary)

	owner := asString(asMap(itinerary["request_snapshot"])["user_id"])
	if strings.TrimSpace(owner) != strings.TrimSpace(user.UserID) {
		writeAppError(w, appError(http.StatusForbidden, "FORBIDDEN", "cannot save other user itinerary"))
		return
	}

	latestPlans := a.store.ListSavedPlans(user.UserID, 1)
	if len(latestPlans) > 0 && itinerarySignature(latestPlans[0].Itinerary) == itinerarySignature(itinerary) {
		latest := latestPlans[0]
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
