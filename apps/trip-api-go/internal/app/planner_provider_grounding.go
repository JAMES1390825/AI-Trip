package app

import (
	"context"
	"fmt"
	"strings"
	"time"
)

var chinaTimeZone = time.FixedZone("CST", 8*60*60)

type providerWeatherContext struct {
	live           amapLiveWeather
	liveOK         bool
	forecastByDate map[string]amapForecastDay
}

func (a *App) resolveDestinationsWithProvider(ctx context.Context, query string, limit int) DestinationResolveResponse {
	if a != nil && a.amap != nil && a.amap.Enabled() && strings.TrimSpace(query) != "" {
		items, err := a.amap.ResolveDestinations(ctx, query, limit)
		if err == nil && len(items) > 0 {
			return DestinationResolveResponse{
				Items:    items,
				Degraded: false,
			}
		}
	}
	return resolveDestinations(query, limit)
}

func (a *App) lookupPlaceDetail(ctx context.Context, provider, providerPlaceID string) (PlaceDetail, bool) {
	if strings.EqualFold(strings.TrimSpace(provider), "amap") && a != nil && a.amap != nil && a.amap.Enabled() {
		detail, err := a.amap.PlaceDetail(ctx, providerPlaceID)
		if err == nil {
			return detail, true
		}
	}
	return lookupPlaceDetail(provider, providerPlaceID)
}

func (a *App) enrichPlanningBriefDestination(ctx context.Context, input planningBriefRequest, response PlanningBriefResponse) PlanningBriefResponse {
	if response.PlanningBrief.Destination != nil && strings.EqualFold(strings.TrimSpace(response.PlanningBrief.Destination.Provider), "amap") {
		return response
	}

	query := strings.TrimSpace(input.DestinationText)
	if query == "" && response.PlanningBrief.Destination != nil {
		query = strings.TrimSpace(response.PlanningBrief.Destination.DestinationLabel)
	}
	if query == "" || a == nil || a.amap == nil || !a.amap.Enabled() {
		return response
	}

	resolved := a.resolveDestinationsWithProvider(ctx, query, 1)
	if resolved.Degraded || len(resolved.Items) == 0 {
		return response
	}

	destination := sanitizeDestinationEntity(&resolved.Items[0])
	if destination == nil {
		return response
	}

	response.PlanningBrief.Destination = destination
	response.PlanningBrief.MissingFields = missingBriefFields(response.PlanningBrief)
	response.PlanningBrief.ReadyToGenerate = len(response.PlanningBrief.MissingFields) == 0
	response.AssistantMessage, response.NextAction = briefAssistantState(response.PlanningBrief)
	response.ClarificationQuestion = briefClarificationQuestion(response.PlanningBrief)
	response.SuggestedOptions = briefSuggestedOptions(response.PlanningBrief)
	response.SourceMode = destination.Provider
	response.Degraded = !response.PlanningBrief.ReadyToGenerate
	return response
}

func (a *App) groundV2Itinerary(ctx context.Context, brief PlanningBrief, itinerary map[string]any) map[string]any {
	if itinerary == nil || a == nil || a.amap == nil || !a.amap.Enabled() || brief.Destination == nil {
		return itinerary
	}

	now := nowISO()
	weatherContext := a.providerWeatherContext(ctx, brief.Destination)
	poiCache := map[string][]amapPOI{}
	anyProviderGrounded := false

	for dayIdx, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		date := strings.TrimSpace(asString(firstNonEmpty(day["date"], addDays(brief.StartDate, dayIdx))))
		for _, blockItem := range asSlice(day["blocks"]) {
			block := asMap(blockItem)
			if blockAlreadyGroundedWithProvider(block) {
				refreshGroundedBlockReason(block, asMap(itinerary["request_snapshot"]))
				anyProviderGrounded = true
			} else {
				keyword := strings.TrimSpace(asString(block["poi"]))
				if keyword != "" {
					if poi, ok := a.resolveGroundingPOI(ctx, brief.Destination, keyword, asString(block["block_type"]), poiCache); ok {
						applyGroundedPOIToBlock(block, poi, now)
						refreshGroundedBlockReason(block, asMap(itinerary["request_snapshot"]))
						anyProviderGrounded = true
					}
				}
			}
			applyProviderWeatherToBlock(block, date, weatherContext)
		}
	}

	itinerary["poi_sequence"] = itineraryPOISequence(itinerary)
	transitLegs := a.buildProviderTransitLegs(ctx, itinerary, now)
	itinerary["transit_legs"] = transitLegs
	itinerary["weather_risks"] = itineraryWeatherRisks(itinerary)
	anyProviderRoute := false
	for _, legItem := range transitLegs {
		leg := asMap(legItem)
		if strings.EqualFold(strings.TrimSpace(asString(leg["provider"])), "amap") && strings.EqualFold(strings.TrimSpace(asString(leg["source_mode"])), "provider") {
			anyProviderRoute = true
			break
		}
	}
	if anyProviderGrounded || anyProviderRoute {
		itinerary["map_provider"] = "amap"
	}

	validation := validateItineraryPayload(itinerary, false)
	sourceMode, degradedReason := itineraryGroundingMode(validation)
	attachV2ItineraryMetadata(itinerary, brief, sourceMode, degradedReason)
	validation = validateItineraryPayload(itinerary, false)
	itinerary["validation_result"] = validationResultMap(validation)
	itinerary["confidence"] = deriveItineraryConfidence(validation, asBool(itinerary["degraded"]))
	return itinerary
}

func blockAlreadyGroundedWithProvider(block map[string]any) bool {
	return strings.EqualFold(strings.TrimSpace(asString(block["provider"])), "amap") &&
		strings.TrimSpace(asString(block["provider_place_id"])) != "" &&
		(strings.TrimSpace(asString(block["source_mode"])) == "" ||
			strings.EqualFold(strings.TrimSpace(asString(block["source_mode"])), "provider"))
}

func (a *App) providerWeatherContext(ctx context.Context, destination *DestinationEntity) providerWeatherContext {
	if destination == nil || a == nil || a.amap == nil || !a.amap.Enabled() {
		return providerWeatherContext{forecastByDate: map[string]amapForecastDay{}}
	}

	out := providerWeatherContext{
		forecastByDate: map[string]amapForecastDay{},
	}
	adcode := strings.TrimSpace(destination.Adcode)
	if adcode == "" {
		return out
	}

	if live, err := a.amap.LiveWeather(ctx, adcode); err == nil {
		out.live = live
		out.liveOK = true
	}
	if forecast, err := a.amap.ForecastWeather(ctx, adcode); err == nil {
		for _, item := range forecast.Days {
			if strings.TrimSpace(item.Date) == "" {
				continue
			}
			out.forecastByDate[item.Date] = item
		}
	}
	return out
}

func (a *App) resolveGroundingPOI(ctx context.Context, destination *DestinationEntity, keyword, slotType string, cache map[string][]amapPOI) (amapPOI, bool) {
	cacheKey := strings.ToLower(strings.TrimSpace(joinNonBlank("|", destination.Adcode, destination.DestinationLabel, keyword)))
	if cached, ok := cache[cacheKey]; ok {
		if len(cached) == 0 {
			return amapPOI{}, false
		}
		return pickBestGroundingPOI(keyword, slotType, cached), true
	}

	pois, err := a.amap.SearchPOIs(ctx, keyword, destination, 5)
	if err != nil || len(pois) == 0 {
		cache[cacheKey] = nil
		return amapPOI{}, false
	}
	cache[cacheKey] = pois
	return pickBestGroundingPOI(keyword, slotType, pois), true
}

func pickBestGroundingPOI(keyword, slotType string, pois []amapPOI) amapPOI {
	best := amapPOI{}
	bestScore := -1

	for _, poi := range pois {
		score := scoreGroundingPOI(keyword, slotType, poi)
		if score > bestScore {
			best = poi
			bestScore = score
		}
	}

	return best
}

func normalizeGroundingText(value string) string {
	replacer := strings.NewReplacer(" ", "", "·", "", "-", "", "_", "")
	return strings.ToLower(strings.TrimSpace(replacer.Replace(value)))
}

func refreshGroundedBlockReason(block map[string]any, requestSnapshot map[string]any) {
	if block == nil {
		return
	}
	reason := buildRecommendReason(
		asString(block["block_type"]),
		asString(block["poi"]),
		requestSnapshot,
		asIntOrZero(block["day_index"]),
		asIntOrZero(block["start_hour"]),
		asStringSlice(block["poi_tags"]),
	)
	if strings.TrimSpace(reason) == "" {
		return
	}
	block["recommend_reason"] = reason
	reasonMap := asMap(block["reason"])
	reasonMap["note"] = reason
	block["reason"] = reasonMap
}

func applyGroundedPOIToBlock(block map[string]any, poi amapPOI, now string) {
	if block == nil || strings.TrimSpace(poi.ID) == "" || strings.TrimSpace(poi.Name) == "" {
		return
	}

	block["poi"] = poi.Name
	block["poi_lat"] = poi.Lat
	block["poi_lon"] = poi.Lng
	block["poi_map_url"] = fmt.Sprintf("https://uri.amap.com/marker?position=%v,%v&name=%s", poi.Lng, poi.Lat, poi.Name)
	block["provider"] = "amap"
	block["provider_place_id"] = poi.ID
	block["source_mode"] = "provider"
	block["source_fetched_at"] = now
	block["confidence_tier"] = "high"
	if address := firstNonBlank(poi.Address, joinNonBlank(" ", poi.Province, poi.City, poi.District)); address != "" {
		block["poi_address"] = address
	}
	if poi.Rating > 0 {
		block["poi_rating"] = poi.Rating
	}
	if poi.BusinessHours != "" {
		block["opening_hours_text"] = poi.BusinessHours
	}
	if tags := amapTags(poi.Type); len(tags) > 0 {
		block["poi_tags"] = tags
	}

	evidence := asMap(block["evidence"])
	if len(evidence) == 0 {
		evidence = map[string]any{}
	}
	evidence["provider_basis"] = "amap_place_v5"
	if poi.BusinessHours != "" {
		evidence["opening_basis"] = "amap_place_v5"
	}
	block["evidence"] = evidence
}

func scoreGroundingPOI(keyword, slotType string, poi amapPOI) int {
	if shouldRejectGroundingPOI(keyword, slotType, poi) {
		return -1000
	}

	normalizedKeyword := normalizeGroundingText(keyword)
	name := normalizeGroundingText(poi.Name)
	address := normalizeGroundingText(poi.Address)
	score := 0

	switch {
	case name == normalizedKeyword:
		score += 220
	case strings.Contains(name, normalizedKeyword):
		score += 150
		score -= maxInt(0, runeLength(poi.Name)-runeLength(keyword)) * 3
	case strings.Contains(normalizedKeyword, name):
		score += 110
	default:
		score += 25
	}

	if address != "" && strings.Contains(address, normalizedKeyword) {
		score += 24
	}
	if poi.Rating > 0 {
		score += int(poi.Rating * 2)
	}
	if poi.Lat != 0 || poi.Lng != 0 {
		score += 4
	}

	typeText := strings.ToLower(strings.TrimSpace(poi.Type))
	switch strings.ToLower(strings.TrimSpace(slotType)) {
	case "food":
		if containsAnyText(typeText, "餐饮服务", "咖啡厅", "咖啡", "茶艺馆", "茶馆", "甜品", "小吃", "酒吧") {
			score += 90
		} else {
			score -= 60
		}
	default:
		if containsAnyText(typeText, "风景名胜", "景点", "公园广场", "地名地址信息", "特色街区", "步行街", "河流", "湖泊", "海滨", "博物馆", "寺庙道观", "文化场馆", "商圈") {
			score += 70
		}
		if keywordLooksWaterfront(keyword) && containsAnyText(typeText, "河流", "湖泊", "海滨", "风景名胜", "景点", "公园广场") {
			score += 95
		}
		if keywordLooksStreet(keyword) && containsAnyText(typeText, "特色街区", "步行街", "风景名胜", "地名地址信息", "商圈") {
			score += 88
		}
		if keywordLooksCulture(keyword) && containsAnyText(typeText, "博物馆", "文化场馆", "寺庙道观", "风景名胜") {
			score += 88
		}
		if containsAnyText(typeText, "生活服务", "公司企业", "房地产", "商务住宅", "购物服务", "住宿服务") {
			score -= 95
		}
	}

	return score
}

func shouldRejectGroundingPOI(keyword, slotType string, poi amapPOI) bool {
	lowerKeyword := strings.ToLower(strings.TrimSpace(keyword))
	lowerName := strings.ToLower(strings.TrimSpace(poi.Name))
	lowerType := strings.ToLower(strings.TrimSpace(poi.Type))

	if lowerName == "" {
		return true
	}

	if strings.ToLower(strings.TrimSpace(slotType)) != "food" {
		if !containsAnyText(lowerKeyword, "照相", "摄影", "相馆") && containsAnyText(lowerName, "照相馆", "证件照", "摄影工作室", "冲印") {
			return true
		}
		if !containsAnyText(lowerKeyword, "酒店", "民宿", "客栈", "住宿") && containsAnyText(lowerName, "酒店", "民宿", "客栈", "公寓") {
			return true
		}
		if !containsAnyText(lowerKeyword, "商场", "商城", "购物", "奥莱", "广场") && containsAnyText(lowerName, "购物中心", "商场", "商城", "百货", "广场") && !keywordLooksStreet(keyword) {
			return true
		}
		if !containsAnyText(lowerKeyword, "店", "馆", "餐") && containsAnyText(lowerName, "旗舰店", "专卖店", "直销", "门店") {
			return true
		}
		if keywordLooksStreet(keyword) && containsAnyText(lowerType, "生活服务", "购物服务", "住宿服务") {
			return true
		}
		if keywordLooksWaterfront(keyword) && containsAnyText(lowerType, "生活服务", "购物服务", "公司企业", "住宿服务") {
			return true
		}
	}

	return false
}

func keywordLooksWaterfront(keyword string) bool {
	lower := strings.ToLower(strings.TrimSpace(keyword))
	return containsAnyText(lower, "江", "河", "湖", "海", "滩", "沿岸", "滨江", "滨水", "码头")
}

func keywordLooksStreet(keyword string) bool {
	lower := strings.ToLower(strings.TrimSpace(keyword))
	return containsAnyText(lower, "街", "路", "巷", "坊", "里", "胡同", "步行街")
}

func keywordLooksCulture(keyword string) bool {
	lower := strings.ToLower(strings.TrimSpace(keyword))
	return containsAnyText(lower, "馆", "博物", "寺", "庙", "宫", "塔", "园", "遗址", "城")
}

func containsAnyText(value string, needles ...string) bool {
	for _, needle := range needles {
		if needle != "" && strings.Contains(value, strings.ToLower(strings.TrimSpace(needle))) {
			return true
		}
	}
	return false
}

func runeLength(value string) int {
	return len([]rune(strings.TrimSpace(value)))
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func applyProviderWeatherToBlock(block map[string]any, date string, weather providerWeatherContext) {
	if block == nil {
		return
	}

	basis := ""
	advisory := ""
	today := time.Now().In(chinaTimeZone).Format("2006-01-02")
	if weather.liveOK && date == today {
		basis = buildLiveWeatherBasis(weather.live)
		advisory = liveWeatherAdvisory(weather.live)
	} else if forecast, ok := weather.forecastByDate[date]; ok {
		basis = buildForecastWeatherBasis(forecast)
		advisory = forecastWeatherAdvisory(forecast)
	}
	if basis == "" {
		return
	}

	evidence := asMap(block["evidence"])
	if len(evidence) == 0 {
		evidence = map[string]any{}
	}
	evidence["weather_basis"] = basis
	scoreBreakdown := asMap(evidence["score_breakdown"])
	if len(scoreBreakdown) == 0 {
		scoreBreakdown = map[string]any{}
	}

	currentRisk := strings.TrimSpace(asString(block["weather_risk"]))
	block["weather_risk"] = combineRiskMessages(currentRisk, advisory)
	if strings.TrimSpace(asString(block["weather_risk"])) == "" {
		scoreBreakdown["weather_fit"] = 0.92
	} else {
		scoreBreakdown["weather_fit"] = 0.68
	}
	evidence["score_breakdown"] = scoreBreakdown
	block["evidence"] = evidence

	block["risk_level"] = deriveRiskLevel(
		asString(block["block_type"]),
		asBool(block["closed_on_date"]),
		asBool(firstNonEmpty(block["within_window"], true)),
		asString(block["weather_risk"]),
	)
}

func buildLiveWeatherBasis(live amapLiveWeather) string {
	parts := []string{
		"高德实时天气",
		strings.TrimSpace(live.Weather),
	}
	if strings.TrimSpace(live.Temperature) != "" {
		parts = append(parts, fmt.Sprintf("%s°C", strings.TrimSpace(live.Temperature)))
	}
	if strings.TrimSpace(live.WindPower) != "" {
		parts = append(parts, fmt.Sprintf("风力%s", strings.TrimSpace(live.WindPower)))
	}
	if strings.TrimSpace(live.ReportTime) != "" {
		parts = append(parts, strings.TrimSpace(live.ReportTime))
	}
	return joinNonBlank(" · ", parts...)
}

func buildForecastWeatherBasis(day amapForecastDay) string {
	parts := []string{"高德天气预报", strings.TrimSpace(day.Date)}
	if strings.TrimSpace(day.DayWeather) != "" || strings.TrimSpace(day.NightWeather) != "" {
		parts = append(parts, strings.TrimSpace(joinNonBlank("/", day.DayWeather, day.NightWeather)))
	}
	if day.DayTemp != 0 || day.NightTemp != 0 {
		parts = append(parts, fmt.Sprintf("%d~%d°C", day.NightTemp, day.DayTemp))
	}
	if strings.TrimSpace(day.DayPower) != "" {
		parts = append(parts, fmt.Sprintf("白天风力%s", strings.TrimSpace(day.DayPower)))
	}
	return joinNonBlank(" · ", parts...)
}

func liveWeatherAdvisory(live amapLiveWeather) string {
	lowerWeather := strings.ToLower(strings.TrimSpace(live.Weather))
	switch {
	case strings.Contains(lowerWeather, "雨"), strings.Contains(lowerWeather, "雪"), strings.Contains(lowerWeather, "雷"), strings.Contains(lowerWeather, "storm"):
		return fmt.Sprintf("实时天气为%s，建议备好雨具并优先选择可随时避雨的点位", strings.TrimSpace(live.Weather))
	}

	temp, ok := asInt(live.Temperature)
	if ok {
		switch {
		case temp >= 32:
			return "实时气温较高，建议午后减少长距离暴晒步行"
		case temp > 0 && temp <= 5:
			return "实时气温偏低，建议增加保暖和室内停留时段"
		}
	}
	return ""
}

func forecastWeatherAdvisory(day amapForecastDay) string {
	weatherText := strings.ToLower(strings.TrimSpace(joinNonBlank("/", day.DayWeather, day.NightWeather)))
	switch {
	case strings.Contains(weatherText, "雨"), strings.Contains(weatherText, "雪"), strings.Contains(weatherText, "雷"), strings.Contains(weatherText, "storm"):
		return fmt.Sprintf("预报显示%s，建议当天优先安排室内或可快速切换的行程", strings.TrimSpace(joinNonBlank("/", day.DayWeather, day.NightWeather)))
	case day.DayTemp >= 32:
		return "预报气温较高，建议避开午后长距离步行"
	case day.NightTemp > 0 && day.NightTemp <= 5:
		return "预报气温偏低，建议加强保暖并缩短夜间停留"
	default:
		return ""
	}
}

func combineRiskMessages(existing, next string) string {
	existing = strings.TrimSpace(existing)
	next = strings.TrimSpace(next)
	switch {
	case existing == "":
		return next
	case next == "":
		return existing
	case strings.Contains(existing, next):
		return existing
	default:
		return existing + "；" + next
	}
}

func (a *App) buildProviderTransitLegs(ctx context.Context, itinerary map[string]any, now string) []map[string]any {
	out := make([]map[string]any, 0)
	routeCache := map[string]amapRoute{}

	for dayIdx, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		resolvedDayIndex := asIntOrZero(firstNonEmpty(day["day_index"], dayIdx))
		blocks := asSlice(day["blocks"])
		for idx := 1; idx < len(blocks); idx++ {
			from := asMap(blocks[idx-1])
			to := asMap(blocks[idx])
			leg := buildFallbackTransitLeg(from, to, resolvedDayIndex, now)

			fromLat := asFloat(from["poi_lat"], 0)
			fromLng := asFloat(from["poi_lon"], 0)
			toLat := asFloat(to["poi_lat"], 0)
			toLng := asFloat(to["poi_lon"], 0)
			if a != nil && a.amap != nil && a.amap.Enabled() && (fromLat != 0 || fromLng != 0) && (toLat != 0 || toLng != 0) {
				cacheKey := fmt.Sprintf("%s|%s", formatLngLat(fromLng, fromLat), formatLngLat(toLng, toLat))
				route, ok := routeCache[cacheKey]
				if !ok {
					if resolved, err := a.amap.DrivingRoute(ctx, fromLat, fromLng, toLat, toLng); err == nil {
						route = resolved
						routeCache[cacheKey] = route
						ok = true
					}
				}
				if ok && route.DistanceMeters > 0 && route.DurationSec > 0 {
					leg["minutes"] = int((time.Duration(route.DurationSec) * time.Second).Minutes() + 0.5)
					if asIntOrZero(leg["minutes"]) <= 0 {
						leg["minutes"] = 1
					}
					leg["distance_meters"] = route.DistanceMeters
					leg["polyline"] = route.Polyline
					leg["provider"] = "amap"
					leg["source_mode"] = "provider"
					leg["source"] = "amap_driving"
					leg["source_fetched_at"] = now
					leg["evidence"] = map[string]any{
						"minutes":         asIntOrZero(leg["minutes"]),
						"distance_meters": route.DistanceMeters,
						"mode":            "taxi",
						"provider_basis":  "amap_driving_v3",
					}
				}
			}

			if evidence := asMap(to["evidence"]); len(evidence) > 0 {
				evidence["route_minutes_from_prev"] = asIntOrZero(leg["minutes"])
				to["evidence"] = evidence
			}

			out = append(out, leg)
		}
	}
	return out
}

func buildFallbackTransitLeg(from, to map[string]any, dayIndex int, now string) map[string]any {
	fromPOI := strings.TrimSpace(asString(from["poi"]))
	toPOI := strings.TrimSpace(asString(to["poi"]))
	fromLat := asFloat(from["poi_lat"], 0)
	fromLng := asFloat(from["poi_lon"], 0)
	toLat := asFloat(to["poi_lat"], 0)
	toLng := asFloat(to["poi_lon"], 0)

	return map[string]any{
		"day_index":         dayIndex,
		"from_poi":          fromPOI,
		"to_poi":            toPOI,
		"minutes":           18 + (hashCode(fmt.Sprintf("%s-%s-%d", fromPOI, toPOI, dayIndex)) % 28),
		"mode":              "taxi",
		"source":            "local_estimate",
		"provider":          firstNonBlank(asString(to["provider"]), asString(from["provider"]), "builtin"),
		"source_mode":       "fallback",
		"source_fetched_at": now,
		"distance_meters":   2500 + (hashCode(fmt.Sprintf("%s-%d", toPOI, dayIndex)) % 6000),
		"polyline":          "",
		"navigation_url":    fmt.Sprintf("https://uri.amap.com/navigation?from=%v,%v,%s&to=%v,%v,%s&mode=car&policy=1&src=trip-go", fromLng, fromLat, fromPOI, toLng, toLat, toPOI),
		"from_lat":          fromLat,
		"from_lon":          fromLng,
		"to_lat":            toLat,
		"to_lon":            toLng,
		"evidence": map[string]any{
			"minutes":         18 + (hashCode(fmt.Sprintf("%s-%s-%d", fromPOI, toPOI, dayIndex)) % 28),
			"distance_meters": 2500 + (hashCode(fmt.Sprintf("%s-%d", toPOI, dayIndex)) % 6000),
			"mode":            "taxi",
			"provider_basis":  "builtin_estimate",
		},
	}
}

func itineraryPOISequence(itinerary map[string]any) []string {
	out := make([]string, 0)
	for _, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		for _, blockItem := range asSlice(day["blocks"]) {
			block := asMap(blockItem)
			poi := strings.TrimSpace(asString(block["poi"]))
			if poi != "" {
				out = append(out, poi)
			}
		}
	}
	return out
}

func itineraryWeatherRisks(itinerary map[string]any) []string {
	out := make([]string, 0)
	for _, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		for _, blockItem := range asSlice(day["blocks"]) {
			block := asMap(blockItem)
			risk := strings.TrimSpace(asString(block["weather_risk"]))
			if risk != "" {
				out = append(out, risk)
			}
		}
	}
	return uniqueStrings(out)
}

func itineraryGroundingMode(result ValidationResult) (string, string) {
	coverage := result.Coverage
	if result.Passed &&
		coverage.ProviderGroundedBlocks >= 0.85 &&
		coverage.RouteEvidenceCoverage >= 0.8 &&
		coverage.WeatherEvidenceCoverage >= 0.85 {
		return "provider", ""
	}
	return "fallback", "provider_coverage_low"
}
