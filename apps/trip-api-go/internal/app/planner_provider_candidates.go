package app

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

const providerCandidatePoolWarning = "当前去处基于高德 POI 候选池打分生成，尚未接入小红书/美团/用户评论数据"

type providerPlanningSlot struct {
	Start int
	End   int
	Title string
	Type  string
}

type providerCandidate struct {
	Query                string
	POI                  amapPOI
	Score                int
	PersonalizationBoost int
	PersonalizationBasis map[string]any
}

var providerPlanningSlots = []providerPlanningSlot{
	{Start: 9, End: 11, Title: "上午主游", Type: "sight"},
	{Start: 11, End: 13, Title: "午餐安排", Type: "food"},
	{Start: 14, End: 17, Title: "下午体验", Type: "experience"},
	{Start: 19, End: 21, Title: "夜游收束", Type: "night"},
}

func (a *App) buildProviderV2VariantItinerary(ctx context.Context, brief PlanningBrief, userID, variant string) (map[string]any, bool) {
	return a.buildProviderV2VariantItineraryWithOptions(ctx, brief, userID, variant, PlanGenerateOptions{})
}

func (a *App) buildProviderV2VariantItineraryWithOptions(ctx context.Context, brief PlanningBrief, userID, variant string, options PlanGenerateOptions) (map[string]any, bool) {
	if a == nil || a.amap == nil || !a.amap.Enabled() || brief.Destination == nil || brief.Days <= 0 {
		return nil, false
	}

	adjusted := variantAdjustedBrief(brief, variant)
	requestSnapshot := buildProviderRequestSnapshot(adjusted, userID)
	personalizationSettings := defaultUserPersonalizationSettings()
	privateProfile := UserPrivateProfile{}
	if a.store != nil {
		personalizationSettings = a.store.GetPersonalizationSettings(userID)
		if profile, settings, ok := a.store.GetEffectivePrivateProfile(userID); ok {
			privateProfile = profile
			personalizationSettings = settings
		}
	}
	communitySummary := CommunityPlanningSummary{}
	if a.store != nil {
		communitySummary = a.store.BuildCommunityPlanningSummary(adjusted.Destination, adjusted.Destination.DestinationLabel, options.CommunityPostIDs, 8)
		if communitySummary.PublishedPostCount > 0 {
			requestSnapshot["community_reference_summary"] = communityPlanningSummaryMap(communitySummary)
		}
	}
	if len(options.CommunityPostIDs) > 0 {
		requestSnapshot["community_post_ids"] = uniqueStrings(append([]string{}, options.CommunityPostIDs...))
	}
	fallbackCatalog := selectCatalogByDestination(firstNonBlank(
		adjusted.Destination.DestinationLabel,
		adjusted.Destination.Region,
		adjusted.Destination.DestinationID,
	))
	if len(fallbackCatalog) == 0 {
		fallbackCatalog = catalogByCity["default"]
	}

	queryCache := map[string][]amapPOI{}
	selectedIDs := map[string]bool{}
	selectedNames := map[string]int{}
	days := make([]map[string]any, 0, adjusted.Days)
	openingChecks := make([]map[string]any, 0, adjusted.Days*len(providerPlanningSlots))
	providerBlocks := 0
	totalBlocks := adjusted.Days * len(providerPlanningSlots)

	for dayIndex := 0; dayIndex < adjusted.Days; dayIndex++ {
		date := addDays(adjusted.StartDate, dayIndex)
		blocks := make([]map[string]any, 0, len(providerPlanningSlots))

		for slotIndex, slot := range providerPlanningSlots {
			if selection, ok := a.pickProviderSlotCandidate(ctx, adjusted, slot.Type, dayIndex, selectedIDs, selectedNames, queryCache, communitySummary, privateProfile); ok {
				block := buildProviderBlockFromCandidate(slot, dayIndex, date, requestSnapshot, selection, communitySummary)
				blocks = append(blocks, block)
				openingChecks = append(openingChecks, buildOpeningCheckFromBlock(block, date, "provider_candidate_pool"))
				providerBlocks++
				if placeID := strings.TrimSpace(selection.POI.ID); placeID != "" {
					selectedIDs[placeID] = true
				}
				if key := normalizeGroundingText(selection.POI.Name); key != "" {
					selectedNames[key]++
				}
				continue
			}

			point := fallbackCatalog[(dayIndex*3+slotIndex)%len(fallbackCatalog)]
			block := buildProviderFallbackBlock(adjusted.Destination, slot, dayIndex, date, requestSnapshot, point)
			blocks = append(blocks, block)
			openingChecks = append(openingChecks, buildOpeningCheckFromBlock(block, date, "fallback_catalog"))
		}

		days = append(days, map[string]any{
			"day_index": dayIndex,
			"date":      date,
			"blocks":    blocks,
		})
	}

	if providerBlocks == 0 || providerBlocks < maxInt(2, totalBlocks/2) {
		return nil, false
	}

	itinerary := map[string]any{
		"request_id":                fmt.Sprintf("req-%d-%d", time.Now().UnixMilli(), hashCode(time.Now().String())%1_000_000),
		"destination":               adjusted.Destination.DestinationLabel,
		"start_date":                adjusted.StartDate,
		"plan_variant":              normalizePlanVariant(variant),
		"granularity":               "hourly",
		"days":                      days,
		"poi_sequence":              itineraryPOISequence(map[string]any{"days": days}),
		"transit_legs":              []map[string]any{},
		"estimated_cost":            int(math.Round(float64(adjusted.Days) * 380 * budgetMultiplier(adjusted.BudgetLevel))),
		"opening_checks":            openingChecks,
		"weather_risks":             []string{},
		"fallback_actions":          []any{},
		"confidence":                0.86,
		"warnings":                  []string{providerCandidatePoolWarning},
		"generated_at":              nowISO(),
		"request_snapshot":          requestSnapshot,
		"map_provider":              adjusted.Destination.Provider,
		"provider_generation_basis": "amap_candidate_pool_scored",
		"version":                   1,
		"parent_version":            nil,
		"changes":                   []map[string]any{},
		"conflicts":                 []map[string]any{},
	}
	if communitySummary.PublishedPostCount > 0 {
		itinerary["community_reference_summary"] = communityPlanningSummaryMap(communitySummary)
		itinerary["community_signal_mode"] = communitySignalMode(communitySummary)
	}
	attachPersonalizationSummary(itinerary, personalizationSettings, privateProfile)

	return itinerary, true
}

func buildProviderRequestSnapshot(brief PlanningBrief, userID string) map[string]any {
	req := buildPlanRequestFromBrief(brief, userID)
	return map[string]any{
		"origin_city":   req.OriginCity,
		"destination":   req.Destination,
		"days":          req.Days,
		"budget_level":  req.BudgetLevel,
		"companions":    req.Companions,
		"travel_styles": req.TravelStyles,
		"must_go":       req.MustGo,
		"avoid":         req.Avoid,
		"start_date":    req.StartDate,
		"pace":          req.Pace,
		"user_id":       req.UserID,
	}
}

func (a *App) pickProviderSlotCandidate(
	ctx context.Context,
	brief PlanningBrief,
	slotType string,
	dayIndex int,
	selectedIDs map[string]bool,
	selectedNames map[string]int,
	cache map[string][]amapPOI,
	communitySummary CommunityPlanningSummary,
	privateProfile UserPrivateProfile,
) (providerCandidate, bool) {
	if a == nil || a.amap == nil || brief.Destination == nil {
		return providerCandidate{}, false
	}

	queries := providerSlotQueries(brief, slotType, dayIndex, selectedNames, communitySummary)
	if len(queries) == 0 {
		return providerCandidate{}, false
	}

	bestByKey := map[string]providerCandidate{}
	for _, query := range queries {
		pois := a.searchProviderPOIsCached(ctx, brief.Destination, query, cache)
		for _, poi := range pois {
			score := scoreProviderCandidate(brief, slotType, query, poi, selectedIDs, selectedNames, communitySummary)
			if score < 0 {
				continue
			}
			personalization := scorePrivateProfileCandidate(privateProfile, brief, slotType, poi)

			key := firstNonBlank(strings.TrimSpace(poi.ID), normalizeGroundingText(poi.Name))
			if key == "" {
				continue
			}

			candidate := providerCandidate{
				Query:                query,
				POI:                  poi,
				Score:                score + personalization.Boost,
				PersonalizationBoost: personalization.Boost,
				PersonalizationBasis: deepCloneMap(personalization.Basis),
			}
			if existing, ok := bestByKey[key]; !ok || candidate.Score > existing.Score {
				bestByKey[key] = candidate
			}
		}
	}

	candidates := make([]providerCandidate, 0, len(bestByKey))
	for _, candidate := range bestByKey {
		candidates = append(candidates, candidate)
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].Score == candidates[j].Score {
			if candidates[i].POI.Rating == candidates[j].POI.Rating {
				return strings.TrimSpace(candidates[i].POI.Name) < strings.TrimSpace(candidates[j].POI.Name)
			}
			return candidates[i].POI.Rating > candidates[j].POI.Rating
		}
		return candidates[i].Score > candidates[j].Score
	})

	if len(candidates) == 0 {
		return providerCandidate{}, false
	}
	return candidates[0], true
}

func (a *App) searchProviderPOIsCached(ctx context.Context, destination *DestinationEntity, keyword string, cache map[string][]amapPOI) []amapPOI {
	cacheKey := strings.ToLower(strings.TrimSpace(joinNonBlank("|", destination.Adcode, destination.DestinationLabel, keyword)))
	if cached, ok := cache[cacheKey]; ok {
		return cached
	}

	pois, err := a.amap.SearchPOIs(ctx, keyword, destination, 8)
	if err != nil {
		cache[cacheKey] = nil
		return nil
	}
	cache[cacheKey] = pois
	return pois
}

func providerSlotQueries(brief PlanningBrief, slotType string, dayIndex int, selectedNames map[string]int, communitySummary CommunityPlanningSummary) []string {
	queries := make([]string, 0, 16)
	if slotType != "food" {
		if mustGo := nextUnusedMustGo(brief.MustGo, selectedNames); mustGo != "" {
			queries = append(queries, mustGo)
		}
	}
	queries = append(queries, communityQueriesForSlot(communitySummary, slotType)...)

	if slotType == "food" {
		queries = append(queries, providerDiningQueries(brief.Constraints.DiningPreference)...)
	}
	if providerRainPreference(brief) && (slotType == "sight" || slotType == "experience") {
		queries = append(queries, "博物馆", "美术馆")
	}

	queries = append(queries, providerStyleQueries(brief.TravelStyles, slotType)...)
	queries = append(queries, providerSlotBaseQueries(slotType)...)

	if dayIndex%2 == 1 {
		switch slotType {
		case "sight", "experience":
			queries = append(queries, "街区", "公园")
		case "night":
			queries = append(queries, "步行街", "滨江")
		}
	}
	return uniqueStrings(filterNonBlankStrings(queries))
}

func providerSlotBaseQueries(slotType string) []string {
	switch strings.ToLower(strings.TrimSpace(slotType)) {
	case "sight":
		return []string{"热门景点", "地标", "景点", "公园"}
	case "food":
		return []string{"本地菜", "特色餐厅", "小吃", "咖啡"}
	case "experience":
		return []string{"街区", "步行街", "博物馆", "观景"}
	case "night":
		return []string{"夜景", "滨江", "步行街", "观景"}
	default:
		return []string{"景点"}
	}
}

func providerStyleQueries(styles []string, slotType string) []string {
	out := make([]string, 0, len(styles)*3)
	for _, style := range styles {
		lower := strings.ToLower(strings.TrimSpace(style))
		if lower == "" {
			continue
		}

		if containsAnyText(lower, "citywalk", "city walk", "city_walk", "city-walk", "漫步", "逛街", "街区", "citywalks") {
			switch slotType {
			case "sight", "experience", "night":
				out = append(out, "街区", "步行街", "老街")
			}
		}
		if containsAnyText(lower, "culture", "文化", "人文", "历史", "博物", "寺庙", "展览", "museum") {
			switch slotType {
			case "sight", "experience":
				out = append(out, "博物馆", "古迹", "寺庙")
			}
		}
		if containsAnyText(lower, "nature", "自然", "山水", "户外", "公园", "徒步", "walk", "green") {
			switch slotType {
			case "sight", "experience", "night":
				out = append(out, "公园", "江边", "湖边")
			}
		}
		if containsAnyText(lower, "photo", "拍照", "出片", "摄影") {
			switch slotType {
			case "sight", "experience", "night":
				out = append(out, "观景", "滨江", "街区")
			}
		}
		if containsAnyText(lower, "night", "夜", "夜游", "夜景") && slotType == "night" {
			out = append(out, "夜景", "观景", "步行街")
		}
		if containsAnyText(lower, "food", "美食", "吃") && slotType == "food" {
			out = append(out, "本地菜", "特色餐厅", "小吃")
		}
	}
	return out
}

func providerDiningQueries(value string) []string {
	text := strings.TrimSpace(value)
	if text == "" {
		return []string{"本地菜"}
	}

	out := []string{text}
	lower := strings.ToLower(text)
	switch {
	case containsAnyText(lower, "咖啡", "coffee"):
		out = append(out, "咖啡", "甜品")
	case containsAnyText(lower, "茶", "tea"):
		out = append(out, "茶馆", "咖啡")
	case containsAnyText(lower, "火锅", "hotpot"):
		out = append(out, "火锅", "特色餐厅")
	case containsAnyText(lower, "小吃", "snack"):
		out = append(out, "小吃", "本地菜")
	default:
		out = append(out, "本地菜", "特色餐厅")
	}
	return out
}

func nextUnusedMustGo(values []string, selectedNames map[string]int) string {
	for _, value := range uniqueStrings(values) {
		key := normalizeGroundingText(value)
		if key == "" {
			continue
		}
		if selectedNames[key] == 0 {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func buildProviderBlockFromCandidate(
	slot providerPlanningSlot,
	dayIndex int,
	date string,
	requestSnapshot map[string]any,
	selection providerCandidate,
	communitySummary CommunityPlanningSummary,
) map[string]any {
	poi := selection.POI
	tags := amapTags(poi.Type)
	recommendReason := buildRecommendReason(slot.Type, poi.Name, requestSnapshot, dayIndex, slot.Start, tags)
	block := map[string]any{
		"block_id":          makeBlockID(dayIndex, slot.Start, slot.End, providerSlotIndex(slot.Type)),
		"day_index":         dayIndex,
		"start_hour":        slot.Start,
		"end_hour":          slot.End,
		"title":             slot.Title,
		"block_type":        slot.Type,
		"poi":               poi.Name,
		"poi_lat":           poi.Lat,
		"poi_lon":           poi.Lng,
		"poi_map_url":       fmt.Sprintf("https://uri.amap.com/marker?position=%v,%v&name=%s", poi.Lng, poi.Lat, poi.Name),
		"poi_tags":          tags,
		"provider":          "amap",
		"provider_place_id": strings.TrimSpace(poi.ID),
		"source_mode":       "provider",
		"source_fetched_at": nowISO(),
		"confidence_tier":   "high",
		"locked":            false,
		"lock_reason":       "",
		"recommend_reason":  recommendReason,
		"alternatives":      []map[string]any{},
		"reason": map[string]any{
			"distance_fit":    providerDistanceFitScore(poi),
			"time_window_fit": 0.88,
			"budget_fit":      providerBudgetFitScore(asString(requestSnapshot["budget_level"]), poi.Cost),
			"weather_fit":     0.82,
			"note":            recommendReason,
		},
		"evidence": map[string]any{
			"provider_basis":  "amap_candidate_pool",
			"candidate_query": selection.Query,
			"candidate_score": selection.Score,
			"score_breakdown": map[string]any{
				"distance_fit":    providerDistanceFitScore(poi),
				"time_window_fit": 0.88,
				"budget_fit":      providerBudgetFitScore(asString(requestSnapshot["budget_level"]), poi.Cost),
				"weather_fit":     0.82,
			},
		},
	}
	if basis := communityBlockBasisForPOI(communitySummary, slot.Type, poi); basis != nil {
		block["community_basis"] = map[string]any{
			"matched_place":   basis.MatchedPlace,
			"matched_tags":    append([]string{}, basis.MatchedTags...),
			"source_post_ids": append([]string{}, basis.SourcePostIDs...),
			"signal_score":    basis.SignalScore,
			"referenced":      basis.Referenced,
		}
		evidence := asMap(block["evidence"])
		scoreBreakdown := asMap(evidence["score_breakdown"])
		scoreBreakdown["community_fit"] = basis.SignalScore
		evidence["score_breakdown"] = scoreBreakdown
		evidence["community_signal_score"] = basis.SignalScore
		block["evidence"] = evidence
		if basis.MatchedPlace != "" {
			recommendReason = joinNonBlank("；", recommendReason, fmt.Sprintf("社区分享里多人提到 %s", basis.MatchedPlace))
			block["recommend_reason"] = recommendReason
			reason := asMap(block["reason"])
			reason["note"] = recommendReason
			block["reason"] = reason
		}
	}
	if selection.PersonalizationBoost != 0 && len(selection.PersonalizationBasis) > 0 {
		block["personalization_basis"] = deepCloneMap(selection.PersonalizationBasis)
		evidence := asMap(block["evidence"])
		scoreBreakdown := asMap(evidence["score_breakdown"])
		scoreBreakdown["user_profile_score"] = selection.PersonalizationBoost
		evidence["score_breakdown"] = scoreBreakdown
		evidence["user_profile_score"] = selection.PersonalizationBoost
		block["evidence"] = evidence
		if selection.PersonalizationBoost > 0 {
			if personalizationReason := buildPersonalizationRecommendReason(selection.PersonalizationBasis); personalizationReason != "" {
				recommendReason = joinNonBlank("；", recommendReason, personalizationReason)
				block["recommend_reason"] = recommendReason
				reason := asMap(block["reason"])
				reason["note"] = recommendReason
				block["reason"] = reason
			}
		}
	}

	if address := firstNonBlank(poi.Address, joinNonBlank(" ", poi.Province, poi.City, poi.District)); address != "" {
		block["poi_address"] = address
	}
	if poi.Rating > 0 {
		block["poi_rating"] = poi.Rating
	}
	if poi.BusinessHours != "" {
		block["opening_hours_text"] = poi.BusinessHours
		evidence := asMap(block["evidence"])
		evidence["opening_basis"] = "amap_place_v5"
		block["evidence"] = evidence
	}

	applyBlockTimingInsights(block, date)
	return block
}

func buildProviderFallbackBlock(
	destination *DestinationEntity,
	slot providerPlanningSlot,
	dayIndex int,
	date string,
	requestSnapshot map[string]any,
	point poiPoint,
) map[string]any {
	block := map[string]any{
		"block_id":          makeBlockID(dayIndex, slot.Start, slot.End, providerSlotIndex(slot.Type)),
		"day_index":         dayIndex,
		"start_hour":        slot.Start,
		"end_hour":          slot.End,
		"title":             slot.Title,
		"block_type":        slot.Type,
		"poi":               point.POI,
		"poi_lat":           point.Lat,
		"poi_lon":           point.Lon,
		"poi_map_url":       fmt.Sprintf("https://uri.amap.com/marker?position=%v,%v&name=%s", point.Lon, point.Lat, point.POI),
		"provider":          "builtin",
		"provider_place_id": buildBuiltinPlaceID(destination, point.POI),
		"source_mode":       "fallback",
		"source_fetched_at": nowISO(),
		"confidence_tier":   "medium",
		"locked":            false,
		"lock_reason":       "",
		"alternatives":      buildPOIAlternatives(firstNonBlank(asString(destinationEntityMap(destination)["destination_label"]), asString(requestSnapshot["destination"])), point.POI, dayIndex, slot.Start, 3),
		"reason": map[string]any{
			"distance_fit":    0.74,
			"time_window_fit": 0.84,
			"budget_fit":      0.78,
			"weather_fit":     0.76,
			"note":            "",
		},
		"evidence": map[string]any{
			"provider_basis": "builtin_catalog_fallback",
			"score_breakdown": map[string]any{
				"distance_fit":    0.74,
				"time_window_fit": 0.84,
				"budget_fit":      0.78,
				"weather_fit":     0.76,
			},
		},
	}
	applyBlockTimingInsights(block, date)
	evidence := asMap(block["evidence"])
	evidence["opening_basis"] = "builtin_rules"
	block["evidence"] = evidence
	return block
}

func applyBlockTimingInsights(block map[string]any, date string) {
	if block == nil {
		return
	}
	slotType := strings.TrimSpace(asString(block["block_type"]))
	poi := strings.TrimSpace(asString(block["poi"]))
	startHour := asIntOrZero(block["start_hour"])
	endHour := asIntOrZero(block["end_hour"])
	openHour, closeHour, closedOnDate := resolveOpeningWindow(slotType, poi, date)
	withinWindow := !closedOnDate && startHour >= openHour && endHour <= closeHour
	weatherRisk := buildWeatherRisk(closedOnDate, withinWindow, openHour, closeHour)

	block["weather_risk"] = weatherRisk
	block["risk_level"] = deriveRiskLevel(slotType, closedOnDate, withinWindow, weatherRisk)

	reason := asMap(block["reason"])
	if len(reason) == 0 {
		reason = map[string]any{}
	}
	if closedOnDate {
		reason["time_window_fit"] = 0.35
		reason["weather_fit"] = 0.45
	} else if !withinWindow {
		reason["time_window_fit"] = 0.62
		reason["weather_fit"] = 0.70
	}
	block["reason"] = reason

	evidence := asMap(block["evidence"])
	if len(evidence) == 0 {
		evidence = map[string]any{}
	}
	scoreBreakdown := asMap(evidence["score_breakdown"])
	if len(scoreBreakdown) == 0 {
		scoreBreakdown = map[string]any{}
	}
	if _, exists := scoreBreakdown["time_window_fit"]; !exists {
		scoreBreakdown["time_window_fit"] = firstNonEmpty(reason["time_window_fit"], 0.84)
	}
	if _, exists := scoreBreakdown["weather_fit"]; !exists {
		scoreBreakdown["weather_fit"] = firstNonEmpty(reason["weather_fit"], 0.78)
	}
	evidence["score_breakdown"] = scoreBreakdown
	block["evidence"] = evidence
}

func buildOpeningCheckFromBlock(block map[string]any, date, source string) map[string]any {
	openHour, closeHour, closedOnDate := resolveOpeningWindow(asString(block["block_type"]), asString(block["poi"]), date)
	startHour := asIntOrZero(block["start_hour"])
	endHour := asIntOrZero(block["end_hour"])
	withinWindow := !closedOnDate && startHour >= openHour && endHour <= closeHour
	return map[string]any{
		"day_index":         asIntOrZero(block["day_index"]),
		"date":              date,
		"block_id":          asString(block["block_id"]),
		"slot_type":         asString(block["block_type"]),
		"poi":               asString(block["poi"]),
		"start_hour":        startHour,
		"end_hour":          endHour,
		"open_hour":         openHour,
		"close_hour":        closeHour,
		"closed_on_date":    closedOnDate,
		"within_window":     withinWindow,
		"provider":          asString(block["provider"]),
		"provider_place_id": asString(block["provider_place_id"]),
		"source":            source,
	}
}

func providerSlotIndex(slotType string) int {
	for idx, slot := range providerPlanningSlots {
		if slot.Type == slotType {
			return idx
		}
	}
	return 0
}

func scoreProviderCandidate(
	brief PlanningBrief,
	slotType, query string,
	poi amapPOI,
	selectedIDs map[string]bool,
	selectedNames map[string]int,
	communitySummary CommunityPlanningSummary,
) int {
	if shouldRejectProviderCandidate(brief, slotType, query, poi, selectedIDs, selectedNames) {
		return -1000
	}

	score := scoreGroundingPOI(query, slotType, poi)
	text := strings.ToLower(joinNonBlank(" ", poi.Name, poi.Type, poi.Address, strings.Join(amapTags(poi.Type), " ")))
	semantic := poiSemanticKind(poi.Name, amapTags(poi.Type))

	if poi.Rating >= 4.7 {
		score += 22
	} else if poi.Rating >= 4.3 {
		score += 12
	}
	if poi.BusinessHours != "" {
		score += 8
	}
	if poi.Lat != 0 || poi.Lng != 0 {
		score += 6
	}

	for _, mustGo := range uniqueStrings(brief.MustGo) {
		if providerCandidateMatchesText(poi, mustGo) {
			score += 220
			if selectedNames[normalizeGroundingText(mustGo)] > 0 {
				score -= 280
			}
			break
		}
	}

	switch strings.ToLower(strings.TrimSpace(slotType)) {
	case "food":
		if semantic == "food" {
			score += 95
		}
		if containsAnyText(text, "本帮", "本地菜", "餐厅", "饭店", "小吃", "咖啡", "甜品", "酒吧", "茶馆") {
			score += 45
		}
	case "night":
		if semantic == "waterfront" || semantic == "street" {
			score += 70
		}
		if containsAnyText(text, "夜景", "观景", "滨江", "酒吧", "步行街") {
			score += 42
		}
	case "experience":
		if semantic == "street" || semantic == "culture" {
			score += 62
		}
	case "sight":
		if semantic == "culture" || semantic == "nature" || semantic == "waterfront" {
			score += 58
		}
	}

	if keywordLooksWaterfront(query) && semantic == "waterfront" {
		score += 90
	}
	if keywordLooksStreet(query) && semantic == "street" {
		score += 82
	}
	if keywordLooksCulture(query) && semantic == "culture" {
		score += 82
	}

	for _, style := range brief.TravelStyles {
		score += providerStyleAffinity(style, slotType, semantic, text)
	}
	if providerRainPreference(brief) && (semantic == "culture" || containsAnyText(text, "博物馆", "美术馆", "展览")) {
		score += 26
	}

	switch strings.ToLower(strings.TrimSpace(brief.BudgetLevel)) {
	case "low":
		if poi.Cost > 120 {
			score -= 36
		} else if poi.Cost == 0 || poi.Cost <= 60 {
			score += 16
		}
	case "high":
		if poi.Rating >= 4.6 {
			score += 10
		}
	default:
		if poi.Cost > 0 && poi.Cost <= 120 {
			score += 8
		}
	}

	score += communityScoreBoost(communitySummary, slotType, poi)

	return score
}

func shouldRejectProviderCandidate(
	brief PlanningBrief,
	slotType, query string,
	poi amapPOI,
	selectedIDs map[string]bool,
	selectedNames map[string]int,
) bool {
	if shouldRejectGroundingPOI(query, slotType, poi) {
		return true
	}

	if strings.TrimSpace(poi.Name) == "" {
		return true
	}
	if placeID := strings.TrimSpace(poi.ID); placeID != "" && selectedIDs[placeID] {
		return true
	}
	if nameKey := normalizeGroundingText(poi.Name); nameKey != "" && selectedNames[nameKey] > 0 {
		return true
	}

	text := strings.ToLower(joinNonBlank(" ", poi.Name, poi.Address, poi.Type))
	for _, avoid := range uniqueStrings(brief.Avoid) {
		if avoid == "" {
			continue
		}
		if providerCandidateTextContains(text, avoid) {
			return true
		}
	}

	lowerType := strings.ToLower(strings.TrimSpace(poi.Type))
	if strings.ToLower(strings.TrimSpace(slotType)) == "food" {
		if !containsAnyText(lowerType, "餐饮服务", "咖啡", "酒吧", "茶馆", "小吃") {
			return true
		}
		return false
	}

	if containsAnyText(lowerType, "餐饮服务") && !containsAnyText(strings.ToLower(query), "咖啡", "酒吧", "夜市") {
		return true
	}
	return false
}

func providerStyleAffinity(style, slotType, semantic, text string) int {
	lower := strings.ToLower(strings.TrimSpace(style))
	if lower == "" {
		return 0
	}

	score := 0
	if containsAnyText(lower, "citywalk", "city walk", "漫步", "逛街", "街区") && (semantic == "street" || semantic == "waterfront") {
		score += 28
	}
	if containsAnyText(lower, "culture", "文化", "人文", "历史", "博物", "museum") && semantic == "culture" {
		score += 32
	}
	if containsAnyText(lower, "nature", "自然", "户外", "公园", "山水") && (semantic == "nature" || semantic == "waterfront") {
		score += 30
	}
	if containsAnyText(lower, "night", "夜游", "夜景") && strings.EqualFold(strings.TrimSpace(slotType), "night") {
		score += 24
	}
	if containsAnyText(lower, "photo", "拍照", "出片", "摄影") && (semantic == "waterfront" || semantic == "street" || semantic == "culture") {
		score += 20
	}
	if containsAnyText(lower, "food", "美食") && strings.EqualFold(strings.TrimSpace(slotType), "food") {
		score += 18
	}
	if containsAnyText(text, "日落", "夜景", "观景") && containsAnyText(lower, "photo", "拍照", "出片") {
		score += 10
	}
	return score
}

func providerCandidateMatchesText(poi amapPOI, target string) bool {
	if target == "" {
		return false
	}
	targetKey := normalizeGroundingText(target)
	if targetKey == "" {
		return false
	}
	for _, value := range []string{poi.Name, poi.Address, poi.Type} {
		valueKey := normalizeGroundingText(value)
		if valueKey == "" {
			continue
		}
		if strings.Contains(valueKey, targetKey) || strings.Contains(targetKey, valueKey) {
			return true
		}
	}
	return false
}

func providerCandidateTextContains(text, target string) bool {
	targetKey := normalizeGroundingText(target)
	textKey := normalizeGroundingText(text)
	if targetKey == "" || textKey == "" {
		return false
	}
	return strings.Contains(textKey, targetKey)
}

func providerBudgetFitScore(level string, cost float64) float64 {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "low":
		switch {
		case cost <= 0 || cost <= 60:
			return 0.9
		case cost <= 120:
			return 0.8
		default:
			return 0.66
		}
	case "high":
		if cost > 0 {
			return 0.88
		}
		return 0.8
	default:
		switch {
		case cost <= 0 || cost <= 120:
			return 0.86
		default:
			return 0.74
		}
	}
}

func providerDistanceFitScore(poi amapPOI) float64 {
	if poi.Lat == 0 && poi.Lng == 0 {
		return 0.68
	}
	if poi.Rating >= 4.5 {
		return 0.9
	}
	return 0.84
}

func providerRainPreference(brief PlanningBrief) bool {
	value := strings.ToLower(strings.TrimSpace(brief.Constraints.WeatherPreference))
	return containsAnyText(value, "rain", "雨")
}

func filterNonBlankStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		out = append(out, value)
	}
	return out
}
