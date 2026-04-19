package app

import (
	"fmt"
	"math"
	"strings"
)

func validateItineraryPayload(itinerary map[string]any, strict bool) ValidationResult {
	issues := make([]ValidationIssue, 0)
	appendIssue := func(code, message string) {
		for _, issue := range issues {
			if issue.Code == code && issue.Message == message {
				return
			}
		}
		issues = append(issues, ValidationIssue{Code: code, Message: message})
	}

	totalBlocks := 0
	blockScore := 0.0
	weatherScore := 0.0
	for dayIdx, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		resolvedDayIndex := asIntOrZero(firstNonEmpty(day["day_index"], dayIdx))
		for blockIdx, blockItem := range asSlice(day["blocks"]) {
			block := asMap(blockItem)
			totalBlocks++
			provider := strings.TrimSpace(asString(block["provider"]))
			placeID := strings.TrimSpace(asString(block["provider_place_id"]))
			if placeID == "" {
				appendIssue("BLOCK_SOURCE_MISSING", fmt.Sprintf("day %d block %d 缺少 provider_place_id", resolvedDayIndex+1, blockIdx+1))
			} else {
				blockScore += coverageWeight(provider, asString(block["source_mode"]), 0.72)
			}

			evidence := asMap(block["evidence"])
			weatherBasis := strings.TrimSpace(asString(evidence["weather_basis"]))
			if weatherBasis == "" && strings.TrimSpace(asString(block["weather_risk"])) == "" {
				appendIssue("WEATHER_EVIDENCE_MISSING", fmt.Sprintf("day %d block %d 缺少天气依据", resolvedDayIndex+1, blockIdx+1))
			} else {
				weatherScore += coverageWeight(provider, asString(block["source_mode"]), 0.82)
			}
		}
	}

	totalLegs := 0
	routeScore := 0.0
	for _, legItem := range asSlice(itinerary["transit_legs"]) {
		leg := asMap(legItem)
		totalLegs++
		dayIndex := asIntOrZero(leg["day_index"])
		fromPoi := strings.TrimSpace(asString(leg["from_poi"]))
		toPoi := strings.TrimSpace(asString(leg["to_poi"]))
		provider := strings.TrimSpace(asString(leg["provider"]))
		if provider == "" && strings.TrimSpace(asString(leg["source"])) == "" {
			appendIssue("ROUTE_GAP", fmt.Sprintf("day %d %s -> %s 缺少路线证据", dayIndex+1, asString(firstNonEmpty(fromPoi, "上一站")), asString(firstNonEmpty(toPoi, "下一站"))))
			continue
		}
		routeScore += coverageWeight(provider, asString(leg["source_mode"]), 0.66)
	}

	mustGo := collectMustGoTargets(itinerary)
	mustGoHitRate := computeMustGoHitRate(mustGo, asStringSlice(itinerary["poi_sequence"]))

	providerCoverage := normalizedCoverage(blockScore, totalBlocks)
	routeCoverage := normalizedCoverage(routeScore, totalLegs)
	weatherCoverage := normalizedCoverage(weatherScore, totalBlocks)
	coverage := ValidationCoverage{
		ProviderGroundedBlocks:  providerCoverage,
		RouteEvidenceCoverage:   routeCoverage,
		WeatherEvidenceCoverage: weatherCoverage,
		MustGoHitRate:           mustGoHitRate,
	}

	degraded := asBool(itinerary["degraded"])
	degradedReason := strings.TrimSpace(asString(itinerary["degraded_reason"]))
	if degraded && degradedReason != "" {
		appendIssue(strings.ToUpper(degradedReason), degradedReasonLabel(degradedReason))
	}

	passed := providerCoverage >= 0.6 && routeCoverage >= 0.5 && weatherCoverage >= 0.6
	if strict {
		passed = passed && !degraded && providerCoverage >= 0.9 && routeCoverage >= 0.85 && weatherCoverage >= 0.8
	}
	if len(mustGo) > 0 {
		if strict {
			passed = passed && mustGoHitRate >= 0.8
		} else {
			passed = passed && mustGoHitRate >= 0.5
		}
	}

	confidenceTier := "needs_confirmation"
	if passed {
		if !degraded && providerCoverage >= 0.95 && routeCoverage >= 0.9 && weatherCoverage >= 0.9 {
			confidenceTier = "high"
		} else {
			confidenceTier = "medium"
		}
	}

	return ValidationResult{
		Passed:         passed,
		ConfidenceTier: confidenceTier,
		Issues:         issues,
		Coverage:       coverage,
	}
}

func coverageWeight(provider, sourceMode string, fallbackWeight float64) float64 {
	if strings.EqualFold(strings.TrimSpace(sourceMode), "provider") && !strings.EqualFold(strings.TrimSpace(provider), "builtin") {
		return 1.0
	}
	return fallbackWeight
}

func normalizedCoverage(score float64, total int) float64 {
	if total <= 0 {
		return 1
	}
	value := score / float64(total)
	return math.Round(value*100) / 100
}

func degradedReasonLabel(reason string) string {
	switch strings.TrimSpace(reason) {
	case mainlineDegradedReasonProviderCoverageLow:
		return "当前结果仍是内置事实草案，真实 provider 覆盖不足"
	case mainlineDegradedReasonValidationNotPassed:
		return "当前结果还没有通过最终校验"
	case mainlineDegradedReasonDestinationCustomUnresolved:
		return "目的地还没有完成标准化确认"
	default:
		return "当前结果处于降级模式，建议继续确认"
	}
}

func collectMustGoTargets(itinerary map[string]any) []string {
	requestSnapshot := asMap(itinerary["request_snapshot"])
	values := uniqueStrings(asStringSlice(requestSnapshot["must_go"]))
	if len(values) == 0 {
		values = uniqueStrings(asStringSlice(asMap(requestSnapshot["planning_brief"])["must_go"]))
	}
	if len(values) == 0 {
		values = uniqueStrings(asStringSlice(asMap(itinerary["planning_brief"])["must_go"]))
	}
	if len(values) > 0 {
		return values
	}
	return nil
}

func computeMustGoHitRate(targets, poiSequence []string) float64 {
	if len(targets) == 0 {
		return 1
	}
	if len(poiSequence) == 0 {
		return 0
	}
	hits := 0
	for _, target := range targets {
		if itineraryContainsText(poiSequence, target) {
			hits++
		}
	}
	return math.Round((float64(hits)/float64(len(targets)))*100) / 100
}

func itineraryContainsText(values []string, target string) bool {
	normalizedTarget := strings.ToLower(strings.TrimSpace(target))
	if normalizedTarget == "" {
		return false
	}
	for _, value := range values {
		normalizedValue := strings.ToLower(strings.TrimSpace(value))
		if normalizedValue == "" {
			continue
		}
		if normalizedValue == normalizedTarget || strings.Contains(normalizedValue, normalizedTarget) || strings.Contains(normalizedTarget, normalizedValue) {
			return true
		}
	}
	return false
}

func lookupPlaceDetail(provider, providerPlaceID string) (PlaceDetail, bool) {
	if !strings.EqualFold(strings.TrimSpace(provider), "builtin") {
		return PlaceDetail{}, false
	}
	normalizedID := strings.TrimSpace(providerPlaceID)
	normalizedID = strings.TrimPrefix(normalizedID, "builtin:")
	parts := strings.SplitN(normalizedID, ":", 2)
	if len(parts) != 2 {
		return PlaceDetail{}, false
	}
	cityKey := normalizeCity(parts[0])
	if cityKey == "" {
		cityKey = strings.TrimSpace(parts[0])
	}
	poiToken := strings.TrimSpace(parts[1])
	catalog := selectCatalogByDestination(cityKey)
	if len(catalog) == 0 {
		return PlaceDetail{}, false
	}

	for _, point := range catalog {
		if sanitizePlaceIDToken(point.POI) != poiToken {
			continue
		}
		return PlaceDetail{
			Provider:         "builtin",
			ProviderPlaceID:  fmt.Sprintf("builtin:%s:%s", cityKey, poiToken),
			Name:             point.POI,
			Address:          fmt.Sprintf("%s · %s", cityLabel(cityKey), point.POI),
			Lat:              point.Lat,
			Lng:              point.Lon,
			Rating:           builtinPlaceRating(point.POI),
			PriceLevel:       builtinPriceLevel(point.POI),
			OpeningHoursText: builtinOpeningHours(point.POI),
			Phone:            "",
			Images:           []string{},
			Tags:             builtinPlaceTags(point.POI),
			SourceFetchedAt:  nowISO(),
		}, true
	}
	return PlaceDetail{}, false
}

func builtinPlaceRating(poi string) float64 {
	base := 4.2 + float64(hashCode(strings.ToLower(strings.TrimSpace(poi)))%6)/10
	return math.Round(base*10) / 10
}

func builtinPriceLevel(poi string) int {
	lower := strings.ToLower(strings.TrimSpace(poi))
	switch {
	case strings.Contains(lower, "街"), strings.Contains(lower, "步道"), strings.Contains(lower, "外滩"), strings.Contains(lower, "路"):
		return 1
	case strings.Contains(lower, "寺"), strings.Contains(lower, "馆"), strings.Contains(lower, "园"), strings.Contains(lower, "宫"):
		return 2
	default:
		return 2
	}
}

func builtinOpeningHours(poi string) string {
	lower := strings.ToLower(strings.TrimSpace(poi))
	switch {
	case strings.Contains(lower, "夜"), strings.Contains(lower, "外滩"), strings.Contains(lower, "滨水"):
		return "全天开放"
	case strings.Contains(lower, "街"):
		return "10:00-22:00"
	default:
		return "09:00-18:00"
	}
}

func builtinPlaceTags(poi string) []string {
	lower := strings.ToLower(strings.TrimSpace(poi))
	tags := []string{"内置事实"}
	switch {
	case strings.Contains(lower, "湖"), strings.Contains(lower, "园"), strings.Contains(lower, "山"):
		tags = append(tags, "自然风光")
	case strings.Contains(lower, "寺"), strings.Contains(lower, "馆"), strings.Contains(lower, "宫"), strings.Contains(lower, "城"):
		tags = append(tags, "历史文化")
	case strings.Contains(lower, "街"), strings.Contains(lower, "路"), strings.Contains(lower, "滩"):
		tags = append(tags, "citywalk")
	default:
		tags = append(tags, "城市地标")
	}
	return uniqueStrings(tags)
}
