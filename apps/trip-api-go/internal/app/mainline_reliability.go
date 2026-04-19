package app

import "strings"

type MainlineItineraryEnvelope struct {
	Itinerary      map[string]any
	Degraded       bool
	DegradedReason string
}

func buildMainlineItineraryEnvelope(itinerary map[string]any, brief PlanningBrief, sourceMode, degradedReason string) MainlineItineraryEnvelope {
	attachV2ItineraryMetadata(itinerary, brief, sourceMode, degradedReason)

	validation := validationResultFromMap(itinerary["validation_result"])
	normalizedReason := normalizeMainlineDegradedReason(
		asBool(itinerary["degraded"]),
		validation,
		asString(itinerary["source_mode"]),
		asString(itinerary["degraded_reason"]),
	)

	degraded := asBool(itinerary["degraded"])
	if normalizedReason == mainlineDegradedReasonValidationNotPassed {
		degraded = true
	}

	itinerary["degraded"] = degraded
	itinerary["degraded_reason"] = normalizedReason
	itinerary["confidence"] = deriveItineraryConfidence(validation, degraded)

	return MainlineItineraryEnvelope{
		Itinerary:      itinerary,
		Degraded:       degraded,
		DegradedReason: normalizedReason,
	}
}

func buildMainlineGenerateV2Response(plans []map[string]any) map[string]any {
	degraded := false
	degradedReason := ""
	for _, item := range plans {
		itinerary := asMap(item["itinerary"])
		if !asBool(itinerary["degraded"]) {
			continue
		}
		degraded = true
		if degradedReason == "" {
			degradedReason = strings.TrimSpace(asString(itinerary["degraded_reason"]))
		}
	}

	return map[string]any{
		"plans":           plans,
		"degraded":        degraded,
		"degraded_reason": degradedReason,
	}
}

func normalizeMainlineDegradedReason(degraded bool, validation ValidationResult, sourceMode, degradedReason string) string {
	if reason := strings.TrimSpace(degradedReason); reason != "" {
		return reason
	}
	if degraded || strings.TrimSpace(sourceMode) != "provider" {
		return mainlineDegradedReasonProviderCoverageLow
	}
	if !validation.Passed {
		return mainlineDegradedReasonValidationNotPassed
	}
	return ""
}

func validationResultFromMap(value any) ValidationResult {
	item := asMap(value)
	coverage := asMap(item["coverage"])
	return ValidationResult{
		Passed:         asBool(item["passed"]),
		ConfidenceTier: strings.TrimSpace(asString(item["confidence_tier"])),
		Coverage: ValidationCoverage{
			ProviderGroundedBlocks:  asFloat(coverage["provider_grounded_blocks"], 0),
			RouteEvidenceCoverage:   asFloat(coverage["route_evidence_coverage"], 0),
			WeatherEvidenceCoverage: asFloat(coverage["weather_evidence_coverage"], 0),
			MustGoHitRate:           asFloat(coverage["must_go_hit_rate"], 0),
		},
	}
}

func normalizeMainlineItineraryForSave(itinerary map[string]any) map[string]any {
	next := deepCloneMap(itinerary)

	briefMap := asMap(firstNonNil(
		next["planning_brief"],
		asMap(next["request_snapshot"])["planning_brief"],
	))
	sourceMode := strings.TrimSpace(asString(next["source_mode"]))
	if sourceMode == "rules_legacy" {
		return next
	}
	if sourceMode == "" && len(briefMap) == 0 {
		return next
	}

	refreshV2ItineraryMetadata(next)

	brief := planningBriefFromMap(briefMap)
	if brief.Destination == nil {
		brief.Destination = destinationEntityFromMap(firstNonNil(
			next["destination_entity"],
			asMap(next["request_snapshot"])["destination_entity"],
		))
	}

	envelope := buildMainlineItineraryEnvelope(
		next,
		brief,
		asString(next["source_mode"]),
		asString(next["degraded_reason"]),
	)

	return envelope.Itinerary
}
