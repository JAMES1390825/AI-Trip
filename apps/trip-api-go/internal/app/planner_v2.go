package app

import (
	"fmt"
	"math"
	"strings"
)

func planningBriefMap(brief PlanningBrief) map[string]any {
	return map[string]any{
		"origin_city":       brief.OriginCity,
		"destination":       destinationEntityMap(brief.Destination),
		"days":              brief.Days,
		"start_date":        brief.StartDate,
		"budget_level":      brief.BudgetLevel,
		"pace":              brief.Pace,
		"travel_styles":     brief.TravelStyles,
		"must_go":           brief.MustGo,
		"avoid":             brief.Avoid,
		"constraints":       planningConstraintsMap(brief.Constraints),
		"missing_fields":    brief.MissingFields,
		"ready_to_generate": brief.ReadyToGenerate,
	}
}

func planningConstraintsMap(constraints PlanningConstraints) map[string]any {
	return map[string]any{
		"weather_preference": constraints.WeatherPreference,
		"dining_preference":  constraints.DiningPreference,
		"lodging_anchor":     constraints.LodgingAnchor,
	}
}

func destinationEntityMap(entity *DestinationEntity) map[string]any {
	if entity == nil {
		return nil
	}
	return map[string]any{
		"destination_id":    entity.DestinationID,
		"destination_label": entity.DestinationLabel,
		"country":           entity.Country,
		"region":            entity.Region,
		"adcode":            entity.Adcode,
		"city_code":         entity.CityCode,
		"center_lat":        entity.CenterLat,
		"center_lng":        entity.CenterLng,
		"provider":          entity.Provider,
		"provider_place_id": entity.ProviderPlaceID,
		"match_type":        entity.MatchType,
	}
}

func destinationEntityFromMap(value any) *DestinationEntity {
	item := asMap(value)
	if len(item) == 0 {
		return nil
	}
	entity := &DestinationEntity{
		DestinationID:    strings.TrimSpace(asString(item["destination_id"])),
		DestinationLabel: strings.TrimSpace(asString(item["destination_label"])),
		Country:          strings.TrimSpace(asString(item["country"])),
		Region:           strings.TrimSpace(asString(item["region"])),
		Adcode:           strings.TrimSpace(asString(item["adcode"])),
		CityCode:         strings.TrimSpace(asString(item["city_code"])),
		CenterLat:        asFloat(item["center_lat"], 0),
		CenterLng:        asFloat(item["center_lng"], 0),
		Provider:         strings.TrimSpace(asString(item["provider"])),
		ProviderPlaceID:  strings.TrimSpace(asString(item["provider_place_id"])),
		MatchType:        strings.TrimSpace(asString(item["match_type"])),
	}
	if entity.DestinationID == "" || entity.DestinationLabel == "" {
		return nil
	}
	return entity
}

func planningBriefFromMap(value any) PlanningBrief {
	item := asMap(value)
	return PlanningBrief{
		OriginCity:      strings.TrimSpace(asString(item["origin_city"])),
		Destination:     destinationEntityFromMap(item["destination"]),
		Days:            asIntOrZero(item["days"]),
		StartDate:       strings.TrimSpace(asString(item["start_date"])),
		BudgetLevel:     strings.TrimSpace(asString(item["budget_level"])),
		Pace:            strings.TrimSpace(asString(item["pace"])),
		TravelStyles:    uniqueStrings(asStringSlice(item["travel_styles"])),
		MustGo:          uniqueStrings(asStringSlice(item["must_go"])),
		Avoid:           uniqueStrings(asStringSlice(item["avoid"])),
		Constraints:     planningConstraintsFromMap(item["constraints"]),
		MissingFields:   uniqueStrings(asStringSlice(item["missing_fields"])),
		ReadyToGenerate: asBool(item["ready_to_generate"]),
	}
}

func planningConstraintsFromMap(value any) PlanningConstraints {
	item := asMap(value)
	return PlanningConstraints{
		WeatherPreference: strings.TrimSpace(asString(item["weather_preference"])),
		DiningPreference:  strings.TrimSpace(asString(item["dining_preference"])),
		LodgingAnchor:     strings.TrimSpace(asString(item["lodging_anchor"])),
	}
}

func normalizePlanVariant(variant string) string {
	switch strings.ToLower(strings.TrimSpace(variant)) {
	case "experience":
		return "experience"
	default:
		return "balanced"
	}
}

func variantAdjustedBrief(brief PlanningBrief, variant string) PlanningBrief {
	next := brief
	next.TravelStyles = uniqueStrings(append([]string{}, brief.TravelStyles...))
	next.MustGo = uniqueStrings(append([]string{}, brief.MustGo...))
	next.Avoid = uniqueStrings(append([]string{}, brief.Avoid...))
	switch normalizePlanVariant(variant) {
	case "experience":
		next.BudgetLevel = "high"
		next.TravelStyles = uniqueStrings(append(next.TravelStyles, "高体验", "体验"))
	default:
	}
	return next
}

func buildPlanRequestFromBrief(brief PlanningBrief, userID string) PlanRequest {
	destinationLabel := ""
	if brief.Destination != nil {
		destinationLabel = brief.Destination.DestinationLabel
	}
	return PlanRequest{
		OriginCity:   brief.OriginCity,
		Destination:  destinationLabel,
		Days:         brief.Days,
		BudgetLevel:  brief.BudgetLevel,
		Companions:   []string{"朋友"},
		TravelStyles: brief.TravelStyles,
		MustGo:       brief.MustGo,
		Avoid:        brief.Avoid,
		StartDate:    brief.StartDate,
		Pace:         brief.Pace,
		UserID:       userID,
	}
}

func generateV2VariantItinerary(brief PlanningBrief, userID, variant string) map[string]any {
	variant = normalizePlanVariant(variant)
	adjusted := variantAdjustedBrief(brief, variant)
	itinerary := generateItinerary(buildPlanRequestFromBrief(adjusted, userID))
	itinerary["plan_variant"] = variant
	attachV2ItineraryMetadata(itinerary, adjusted, "fallback", "provider_coverage_low")
	return itinerary
}

func attachLegacyMetadata(itinerary map[string]any) {
	if itinerary == nil {
		return
	}
	itinerary["source_mode"] = "rules_legacy"
}

func refreshV2ItineraryMetadata(itinerary map[string]any) {
	if itinerary == nil {
		return
	}
	sourceMode := strings.TrimSpace(asString(itinerary["source_mode"]))
	if sourceMode == "" || sourceMode == "rules_legacy" {
		return
	}
	briefMap := asMap(itinerary["planning_brief"])
	if len(briefMap) == 0 {
		briefMap = asMap(asMap(itinerary["request_snapshot"])["planning_brief"])
	}
	brief := planningBriefFromMap(briefMap)
	requestSnapshot := asMap(itinerary["request_snapshot"])
	if brief.Destination == nil {
		brief.Destination = destinationEntityFromMap(firstNonNil(itinerary["destination_entity"], requestSnapshot["destination_entity"]))
	}
	if brief.OriginCity == "" {
		brief.OriginCity = strings.TrimSpace(asString(requestSnapshot["origin_city"]))
	}
	if brief.Days <= 0 {
		brief.Days = asIntOrZero(firstNonEmpty(requestSnapshot["days"], len(asSlice(itinerary["days"]))))
	}
	if brief.StartDate == "" {
		brief.StartDate = strings.TrimSpace(asString(firstNonEmpty(itinerary["start_date"], requestSnapshot["start_date"])))
	}
	if brief.BudgetLevel == "" {
		brief.BudgetLevel = strings.TrimSpace(asString(requestSnapshot["budget_level"]))
	}
	if brief.Pace == "" {
		brief.Pace = strings.TrimSpace(asString(requestSnapshot["pace"]))
	}
	if len(brief.TravelStyles) == 0 {
		brief.TravelStyles = uniqueStrings(asStringSlice(requestSnapshot["travel_styles"]))
	}
	if len(brief.MustGo) == 0 {
		brief.MustGo = uniqueStrings(asStringSlice(requestSnapshot["must_go"]))
	}
	if len(brief.Avoid) == 0 {
		brief.Avoid = uniqueStrings(asStringSlice(requestSnapshot["avoid"]))
	}
	if !brief.ReadyToGenerate {
		brief.ReadyToGenerate = brief.Destination != nil && brief.Days > 0 && strings.TrimSpace(brief.StartDate) != ""
	}
	degradedReason := strings.TrimSpace(asString(itinerary["degraded_reason"]))
	if degradedReason == "" && sourceMode != "provider" {
		degradedReason = mainlineDegradedReasonProviderCoverageLow
	}
	attachV2ItineraryMetadata(itinerary, brief, sourceMode, degradedReason)
}

func attachV2ItineraryMetadata(itinerary map[string]any, brief PlanningBrief, sourceMode, degradedReason string) {
	if itinerary == nil {
		return
	}
	if sourceMode == "" {
		sourceMode = "fallback"
	}
	now := nowISO()
	requestSnapshot := asMap(itinerary["request_snapshot"])
	requestSnapshot["planning_brief"] = planningBriefMap(brief)
	if brief.Destination != nil {
		requestSnapshot["destination_entity"] = destinationEntityMap(brief.Destination)
	}
	itinerary["request_snapshot"] = requestSnapshot
	itinerary["planning_brief"] = planningBriefMap(brief)
	itinerary["destination_entity"] = destinationEntityMap(brief.Destination)
	if brief.Destination != nil && strings.TrimSpace(brief.Destination.DestinationLabel) != "" {
		itinerary["destination"] = brief.Destination.DestinationLabel
	}
	if brief.Destination != nil && strings.TrimSpace(brief.Destination.Provider) != "" {
		itinerary["map_provider"] = brief.Destination.Provider
	}

	degraded := sourceMode != "provider"
	if degradedReason == "" && degraded {
		degradedReason = mainlineDegradedReasonProviderCoverageLow
	}
	if degradedReason == "" {
		degradedReason = ""
	}
	itinerary["source_mode"] = sourceMode
	itinerary["degraded"] = degraded
	itinerary["degraded_reason"] = degradedReason
	warnings := make([]string, 0, len(asStringSlice(itinerary["warnings"])))
	for _, warning := range asStringSlice(itinerary["warnings"]) {
		if warning == "当前为内置事实草案，尚未接入真实 provider 数据" || warning == "已接入部分高德真实数据，未覆盖部分仍使用内置事实草案" {
			continue
		}
		warnings = append(warnings, warning)
	}
	if degraded {
		partialGrounding := false
		for _, dayItem := range asSlice(itinerary["days"]) {
			for _, blockItem := range asSlice(asMap(dayItem)["blocks"]) {
				block := asMap(blockItem)
				if strings.EqualFold(strings.TrimSpace(asString(block["provider"])), "amap") && strings.TrimSpace(asString(block["provider_place_id"])) != "" {
					partialGrounding = true
					break
				}
			}
			if partialGrounding {
				break
			}
		}
		if partialGrounding {
			warnings = append(warnings, "已接入部分高德真实数据，未覆盖部分仍使用内置事实草案")
		} else {
			warnings = append(warnings, "当前为内置事实草案，尚未接入真实 provider 数据")
		}
	}
	itinerary["warnings"] = uniqueStrings(warnings)

	legsByDayPoi := map[string]map[string]any{}
	for _, legItem := range asSlice(itinerary["transit_legs"]) {
		leg := asMap(legItem)
		dayIndex := asIntOrZero(leg["day_index"])
		key := fmt.Sprintf("%d|%s", dayIndex, strings.TrimSpace(asString(leg["to_poi"])))
		legsByDayPoi[key] = leg
		if strings.TrimSpace(asString(leg["provider"])) == "" {
			leg["provider"] = "builtin"
		}
		if strings.TrimSpace(asString(leg["source_mode"])) == "" {
			leg["source_mode"] = sourceMode
		}
		if strings.TrimSpace(asString(leg["source_fetched_at"])) == "" {
			leg["source_fetched_at"] = now
		}
		evidence := asMap(leg["evidence"])
		if len(evidence) == 0 {
			evidence = map[string]any{}
		}
		if _, exists := evidence["minutes"]; !exists {
			evidence["minutes"] = asIntOrZero(leg["minutes"])
		}
		if _, exists := evidence["distance_meters"]; !exists {
			evidence["distance_meters"] = asIntOrZero(leg["distance_meters"])
		}
		if _, exists := evidence["mode"]; !exists {
			evidence["mode"] = firstNonEmpty(leg["mode"], "taxi")
		}
		if _, exists := evidence["provider_basis"]; !exists {
			evidence["provider_basis"] = firstNonEmpty(leg["source"], "builtin_estimate")
		}
		leg["evidence"] = evidence
	}

	for dayIdx, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		resolvedDayIndex := asIntOrZero(firstNonEmpty(day["day_index"], dayIdx))
		for blockIdx, blockItem := range asSlice(day["blocks"]) {
			block := asMap(blockItem)
			poi := strings.TrimSpace(asString(block["poi"]))
			provider := "builtin"
			if brief.Destination != nil && strings.TrimSpace(brief.Destination.Provider) != "" {
				provider = brief.Destination.Provider
			}
			if strings.TrimSpace(asString(block["provider"])) == "" {
				block["provider"] = provider
			}
			if strings.TrimSpace(asString(block["provider_place_id"])) == "" {
				block["provider_place_id"] = buildBuiltinPlaceID(brief.Destination, poi)
			}
			if strings.TrimSpace(asString(block["source_mode"])) == "" {
				block["source_mode"] = sourceMode
			}
			if strings.TrimSpace(asString(block["source_fetched_at"])) == "" {
				block["source_fetched_at"] = now
			}
			if strings.TrimSpace(asString(block["confidence_tier"])) == "" {
				block["confidence_tier"] = blockConfidenceTier(asString(block["risk_level"]), asString(block["source_mode"]))
			}

			routeMinutes := 0
			if blockIdx > 0 {
				if leg := legsByDayPoi[fmt.Sprintf("%d|%s", resolvedDayIndex, poi)]; len(leg) > 0 {
					routeMinutes = asIntOrZero(leg["minutes"])
				}
			}
			reason := asMap(block["reason"])
			evidence := asMap(block["evidence"])
			if len(evidence) == 0 {
				evidence = map[string]any{}
			}
			if _, exists := evidence["route_minutes_from_prev"]; !exists {
				evidence["route_minutes_from_prev"] = routeMinutes
			}
			if _, exists := evidence["weather_basis"]; !exists {
				evidence["weather_basis"] = firstNonEmpty(brief.Constraints.WeatherPreference, block["weather_risk"], "builtin_weather")
			}
			if _, exists := evidence["opening_basis"]; !exists {
				evidence["opening_basis"] = "builtin_rules"
			}
			scoreBreakdown := asMap(evidence["score_breakdown"])
			if len(scoreBreakdown) == 0 {
				scoreBreakdown = map[string]any{}
			}
			if _, exists := scoreBreakdown["distance_fit"]; !exists {
				scoreBreakdown["distance_fit"] = firstNonEmpty(reason["distance_fit"], 0.82)
			}
			if _, exists := scoreBreakdown["time_window_fit"]; !exists {
				scoreBreakdown["time_window_fit"] = firstNonEmpty(reason["time_window_fit"], 0.84)
			}
			if _, exists := scoreBreakdown["budget_fit"]; !exists {
				scoreBreakdown["budget_fit"] = firstNonEmpty(reason["budget_fit"], 0.8)
			}
			if _, exists := scoreBreakdown["weather_fit"]; !exists {
				scoreBreakdown["weather_fit"] = firstNonEmpty(reason["weather_fit"], 0.78)
			}
			evidence["score_breakdown"] = scoreBreakdown
			block["evidence"] = evidence
		}
	}

	validation := validateItineraryPayload(itinerary, false)
	itinerary["validation_result"] = validationResultMap(validation)
	itinerary["confidence"] = deriveItineraryConfidence(validation, degraded)
}

func buildBuiltinPlaceID(destination *DestinationEntity, poi string) string {
	cityKey := "default"
	if destination != nil {
		for _, candidate := range []string{destination.DestinationLabel, destination.Region, destination.DestinationID} {
			if normalized := normalizeCity(candidate); normalized != "" {
				cityKey = normalized
				break
			}
		}
	}
	return fmt.Sprintf("builtin:%s:%s", cityKey, sanitizePlaceIDToken(poi))
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			if record := asMap(value); len(record) == 0 {
				if slice := asSlice(value); len(slice) == 0 {
					if strings.TrimSpace(asString(value)) == "" {
						continue
					}
				}
			}
			return value
		}
	}
	return nil
}

func sanitizePlaceIDToken(value string) string {
	text := strings.TrimSpace(value)
	if text == "" {
		return "place"
	}
	replacer := strings.NewReplacer(" ", "-", "/", "-", ":", "-", "?", "", "&", "", "#", "")
	text = replacer.Replace(text)
	return text
}

func blockConfidenceTier(riskLevel, sourceMode string) string {
	if strings.EqualFold(strings.TrimSpace(sourceMode), "provider") {
		return "high"
	}
	switch strings.ToLower(strings.TrimSpace(riskLevel)) {
	case "high":
		return "needs_confirmation"
	default:
		return "medium"
	}
}

func validationResultMap(result ValidationResult) map[string]any {
	issues := make([]map[string]any, 0, len(result.Issues))
	for _, issue := range result.Issues {
		issues = append(issues, map[string]any{
			"code":    issue.Code,
			"message": issue.Message,
		})
	}
	return map[string]any{
		"passed":          result.Passed,
		"confidence_tier": result.ConfidenceTier,
		"issues":          issues,
		"coverage": map[string]any{
			"provider_grounded_blocks":  result.Coverage.ProviderGroundedBlocks,
			"route_evidence_coverage":   result.Coverage.RouteEvidenceCoverage,
			"weather_evidence_coverage": result.Coverage.WeatherEvidenceCoverage,
			"must_go_hit_rate":          result.Coverage.MustGoHitRate,
		},
	}
}

func deriveItineraryConfidence(result ValidationResult, degraded bool) float64 {
	coverage := result.Coverage
	mean := (coverage.ProviderGroundedBlocks + coverage.RouteEvidenceCoverage + coverage.WeatherEvidenceCoverage + coverage.MustGoHitRate) / 4
	if degraded {
		mean *= 0.92
	}
	switch result.ConfidenceTier {
	case "high":
		mean = math.Max(mean, 0.86)
	case "medium":
		mean = math.Max(mean, 0.7)
	default:
		mean = math.Min(mean, 0.62)
	}
	return math.Round(mean*100) / 100
}
