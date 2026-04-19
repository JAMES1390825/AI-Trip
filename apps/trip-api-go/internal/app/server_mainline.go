package app

import (
	"context"
	"net/http"
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

	generateOptions := PlanGenerateOptions{
		CommunityPostIDs: uniqueStrings(asStringSlice(options["community_post_ids"])),
	}

	response, appErr := a.buildGenerateV2PlansResponse(r.Context(), brief, user.UserID, variants, allowFallback, generateOptions)
	if appErr != nil {
		writeAppError(w, appErr)
		return
	}

	planItems := asSlice(response["plans"])
	normalizedPlans := make([]map[string]any, 0, len(planItems))
	for _, item := range planItems {
		normalizedPlans = append(normalizedPlans, asMap(item))
	}

	a.trackEvent("plan_generated_v2", user.UserID, map[string]any{
		"destination_id":                brief.Destination.DestinationID,
		"destination_label":             brief.Destination.DestinationLabel,
		"days":                          brief.Days,
		"variants":                      variants,
		"degraded":                      asBool(response["degraded"]),
		"community_reference_count":     len(generateOptions.CommunityPostIDs),
		"community_post_ids":            uniqueStrings(append([]string{}, generateOptions.CommunityPostIDs...)),
		"community_referenced_post_ids": extractCommunityReferencedPostIDsFromPlans(normalizedPlans),
	})

	writeJSON(w, http.StatusOK, response)
}
