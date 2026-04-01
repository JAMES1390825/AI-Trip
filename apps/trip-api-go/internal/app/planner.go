package app

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

type poiPoint struct {
	POI string
	Lat float64
	Lon float64
}

var catalogByCity = map[string][]poiPoint{
	"beijing": {

		{POI: "故宫", Lat: 39.9163, Lon: 116.3972},

		{POI: "天坛", Lat: 39.8822, Lon: 116.4065},

		{POI: "什刹海", Lat: 39.9434, Lon: 116.3863},

		{POI: "颐和园", Lat: 39.9996, Lon: 116.2755},
	},
	"shanghai": {

		{POI: "外滩", Lat: 31.2400, Lon: 121.4900},

		{POI: "武康路", Lat: 31.2058, Lon: 121.4378},

		{POI: "豫园", Lat: 31.2272, Lon: 121.4921},

		{POI: "陆家嘴", Lat: 31.2354, Lon: 121.4998},
	},
	"hangzhou": {

		{POI: "西湖", Lat: 30.2589, Lon: 120.1303},

		{POI: "灵隐寺", Lat: 30.2428, Lon: 120.1049},

		{POI: "河坊街", Lat: 30.2468, Lon: 120.1688},

		{POI: "钱塘江沿岸", Lat: 30.2462, Lon: 120.2192},
	},
	"default": {

		{POI: "城市地标", Lat: 31.2304, Lon: 121.4737},

		{POI: "城市滨水步道", Lat: 31.2280, Lon: 121.4850},

		{POI: "本地美食街区", Lat: 31.2250, Lon: 121.4750},

		{POI: "夜景观景点", Lat: 31.2350, Lon: 121.4900},
	}}

func budgetMultiplier(level string) float64 {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "low":

		return 0.75
	case "high":

		return 1.35
	default:

		return 1.0
	}
}

func hashCode(input string) int {
	h := 0
	for _, c := range input {

		h = (h << 5) - h + int(c)
	}
	if h < 0 {

		h = -h
	}
	return h
}

func addDays(dateStr string, days int) string {
	base, err := time.Parse("2006-01-02", strings.TrimSpace(dateStr))
	if err != nil {

		base = time.Now().UTC()
	}
	return base.AddDate(0, 0, days).Format("2006-01-02")
}

func makeBlockID(dayIndex, startHour, endHour, blockIndex int) string {
	return fmt.Sprintf("d%d-%02d-%02d-%02d", dayIndex+1, startHour, endHour, blockIndex+1)
}

func resolveOpeningWindow(slotType, poi, date string) (openHour, closeHour int, closedOnDate bool) {
	normalizedSlotType := strings.ToLower(strings.TrimSpace(slotType))
	openHour = 9
	closeHour = 22
	switch normalizedSlotType {
	case "sight":

		openHour = 9

		closeHour = 17
	case "food":

		openHour = 10

		closeHour = 22
	case "experience":

		openHour = 10

		closeHour = 20
	case "night":

		openHour = 18

		closeHour = 23
	}
	seed := hashCode(strings.ToLower(strings.TrimSpace(poi)) + "|" + strings.TrimSpace(date))
	if normalizedSlotType == "experience" && seed%3 == 0 {

		closeHour -= 2
	}
	if normalizedSlotType == "sight" && seed%11 == 0 {

		closedOnDate = true
	}
	if closeHour <= openHour {

		closeHour = openHour + 1
	}
	return openHour, closeHour, closedOnDate
}

func selectCatalogByDestination(destination string) []poiPoint {
	key := strings.TrimSpace(destination)
	if key != "" {

		key = normalizeCity(key)
	}
	catalog := catalogByCity[key]
	if len(catalog) > 0 {

		return catalog
	}
	return catalogByCity["default"]
}

func pickReplacementPOI(destination, oldPOI string, dayIndex, startHour int) poiPoint {
	catalog := selectCatalogByDestination(destination)
	if len(catalog) == 0 {

		catalog = catalogByCity["default"]
	}
	seed := hashCode(fmt.Sprintf("%s-%s-%d-%d", destination, oldPOI, dayIndex, startHour))
	normalizedOld := strings.ToLower(strings.TrimSpace(oldPOI))
	for i := 0; i < len(catalog); i++ {

		candidate := catalog[(seed+i)%len(catalog)]

		candidatePOI := strings.TrimSpace(candidate.POI)
		if candidatePOI == "" {

			continue

		}

		if strings.ToLower(candidatePOI) != normalizedOld {

			return candidate

		}
	}
	for _, candidate := range catalog {

		if strings.TrimSpace(candidate.POI) != "" {

			return candidate

		}
	}
	return catalog[seed%len(catalog)]
}

func buildWeatherRisk(closedOnDate, withinWindow bool, openHour, closeHour int) string {
	if closedOnDate {

		return "当日营业状态不稳定，建议优先使用备选地点"
	}
	if !withinWindow {

		return fmt.Sprintf("时段与营业窗口不完全匹配（开放 %02d:00-%02d:00）", openHour, closeHour)
	}
	return ""
}

func deriveRiskLevel(slotType string, closedOnDate, withinWindow bool, weatherRisk string) string {
	if closedOnDate {

		return "high"
	}
	if strings.TrimSpace(weatherRisk) != "" || !withinWindow {

		return "medium"
	}
	if strings.EqualFold(strings.TrimSpace(slotType), "night") {

		return "medium"
	}
	return "low"
}

func buildPOIAlternatives(destination, currentPOI string, dayIndex, startHour, limit int) []map[string]any {
	if limit <= 0 {

		limit = 3
	}
	catalog := selectCatalogByDestination(destination)
	if len(catalog) == 0 {

		catalog = catalogByCity["default"]
	}
	seed := hashCode(fmt.Sprintf("%s|%s|%d|%d|alts", normalizeCity(destination), currentPOI, dayIndex, startHour))
	out := make([]map[string]any, 0, limit)
	seen := map[string]bool{
		strings.ToLower(strings.TrimSpace(currentPOI)): true,
	}
	for i := 0; i < len(catalog)*2 && len(out) < limit; i++ {

		candidate := catalog[(seed+i)%len(catalog)]

		poi := strings.TrimSpace(candidate.POI)
		if poi == "" {

			continue

		}

		key := strings.ToLower(poi)
		if seen[key] {

			continue

		}
		seen[key] = true

		out = append(out, map[string]any{

			"poi": poi,

			"poi_lat": candidate.Lat,

			"poi_lon": candidate.Lon,

			"poi_map_url": fmt.Sprintf("https://uri.amap.com/marker?position=%v,%v&name=%s", candidate.Lon, candidate.Lat, poi),

			"note": fmt.Sprintf("同区域备选，预计切换成本 %d 分钟", 8+(hashCode(fmt.Sprintf("%s-%d", poi, dayIndex))%18)),
		})
	}
	return out
}

func poiSemanticKind(poi string, tags []string) string {
	text := strings.ToLower(strings.TrimSpace(joinNonBlank(" ", append([]string{poi}, tags...)...)))
	switch {
	case strings.Contains(text, "江"), strings.Contains(text, "河"), strings.Contains(text, "湖"), strings.Contains(text, "海"), strings.Contains(text, "滩"), strings.Contains(text, "沿岸"), strings.Contains(text, "滨江"), strings.Contains(text, "滨水"), strings.Contains(text, "码头"), strings.Contains(text, "海滨"), strings.Contains(text, "河流"):
		return "waterfront"
	case strings.Contains(text, "街"), strings.Contains(text, "巷"), strings.Contains(text, "路"), strings.Contains(text, "里"), strings.Contains(text, "坊"), strings.Contains(text, "胡同"), strings.Contains(text, "步行街"), strings.Contains(text, "特色街区"):
		return "street"
	case strings.Contains(text, "寺"), strings.Contains(text, "庙"), strings.Contains(text, "宫"), strings.Contains(text, "馆"), strings.Contains(text, "博物"), strings.Contains(text, "美术"), strings.Contains(text, "艺术馆"), strings.Contains(text, "遗址"), strings.Contains(text, "塔"), strings.Contains(text, "城"), strings.Contains(text, "园林"):
		return "culture"
	case strings.Contains(text, "公园"), strings.Contains(text, "山"), strings.Contains(text, "岛"), strings.Contains(text, "森林"), strings.Contains(text, "植物园"), strings.Contains(text, "自然"), strings.Contains(text, "湿地"):
		return "nature"
	case strings.Contains(text, "餐饮服务"), strings.Contains(text, "美食"), strings.Contains(text, "餐厅"), strings.Contains(text, "咖啡"), strings.Contains(text, "茶馆"), strings.Contains(text, "小吃"), strings.Contains(text, "酒吧"):
		return "food"
	default:
		return "generic"
	}
}

func buildRecommendReason(slotType, poi string, requestSnapshot map[string]any, dayIndex, startHour int, poiTags []string) string {
	targetPOI := strings.TrimSpace(poi)
	if targetPOI == "" {

		targetPOI = "候选地点"
	}

	budgetHint := "兼顾体验与性价比"
	switch strings.ToLower(strings.TrimSpace(asString(requestSnapshot["budget_level"]))) {
	case "low":

		budgetHint = "优先控制预算"
	case "high":

		budgetHint = "优先保证体验"
	}

	paceHint := "建议按当前节奏推进"
	switch strings.ToLower(strings.TrimSpace(asString(requestSnapshot["pace"]))) {
	case "compact":

		paceHint = "路线更紧凑，建议准点出发"
	case "relaxed":

		paceHint = "节奏较宽松，可保留拍照与休息时间"
	}

	semantic := poiSemanticKind(targetPOI, poiTags)
	switch strings.ToLower(strings.TrimSpace(slotType)) {
	case "sight":
		switch semantic {
		case "waterfront":
			return fmt.Sprintf("将 %s 放在白天主游时段，适合沿线看景和慢走。%s。", targetPOI, paceHint)
		case "street":
			return fmt.Sprintf("将 %s 放在白天主游时段，更适合边走边逛，动线也更顺。%s。", targetPOI, paceHint)
		case "culture":
			return fmt.Sprintf("将 %s 放在白天主游时段，更适合完整参观和拍照。%s。", targetPOI, paceHint)
		default:
			return fmt.Sprintf("将 %s 放在白天主游时段，便于步行串联。%s。", targetPOI, paceHint)
		}
	case "food":
		return fmt.Sprintf("安排 %s 于就餐窗口，%s。", targetPOI, budgetHint)
	case "experience":
		switch semantic {
		case "waterfront":
			return fmt.Sprintf("把 %s 放在中段体验时段，适合留出沿线漫走和拍照时间。", targetPOI)
		case "street":
			return fmt.Sprintf("把 %s 放在中段体验时段，适合边走边逛，也方便穿插短暂停留。", targetPOI)
		case "culture":
			return fmt.Sprintf("把 %s 放在中段体验时段，便于集中安排参观与停留。", targetPOI)
		default:
			return fmt.Sprintf("把 %s 放在中段体验时段，避免全天节奏单一。", targetPOI)
		}
	case "night":
		switch semantic {
		case "waterfront":
			return fmt.Sprintf("将 %s 作为夜间收束点，更适合看夜景、吹风和慢慢收尾。", targetPOI)
		case "street":
			return fmt.Sprintf("将 %s 作为夜间收束点，夜间氛围和灯光更适合慢逛。", targetPOI)
		default:
			return fmt.Sprintf("将 %s 作为夜间收束点，适合晚间活动。", targetPOI)
		}
	default:

		return fmt.Sprintf("%s，建议第 %d 天 %02d:00 前后前往。", budgetHint, dayIndex+1, startHour)
	}
}

func enrichBlockInsights(block map[string]any, destination string, requestSnapshot map[string]any, dayIndex int, date string) {
	slotType := strings.ToLower(strings.TrimSpace(asString(block["block_type"])))
	poi := strings.TrimSpace(asString(block["poi"]))
	startHour := asIntOrZero(block["start_hour"])
	endHour := asIntOrZero(block["end_hour"])
	openHour, closeHour, closedOnDate := resolveOpeningWindow(slotType, poi, date)
	withinWindow := !closedOnDate && startHour >= openHour && endHour <= closeHour

	weatherRisk := buildWeatherRisk(closedOnDate, withinWindow, openHour, closeHour)
	recommendReason := buildRecommendReason(slotType, poi, requestSnapshot, dayIndex, startHour, asStringSlice(block["poi_tags"]))
	riskLevel := deriveRiskLevel(slotType, closedOnDate, withinWindow, weatherRisk)

	block["weather_risk"] = weatherRisk
	block["recommend_reason"] = recommendReason
	block["risk_level"] = riskLevel
	block["alternatives"] = buildPOIAlternatives(destination, poi, dayIndex, startHour, 3)

	reason := asMap(block["reason"])
	if len(reason) == 0 {

		reason = map[string]any{

			"distance_fit": 0.82,

			"time_window_fit": 0.88,

			"budget_fit": 0.80,

			"weather_fit": 0.85,
		}
	}

	reason["note"] = recommendReason
	if closedOnDate {

		reason["time_window_fit"] = 0.35

		reason["weather_fit"] = 0.45

	} else if !withinWindow {

		reason["time_window_fit"] = 0.62

		reason["weather_fit"] = 0.70
	}
	block["reason"] = reason

}

func ensureBlockIDs(itinerary map[string]any) {
	for dayIdx, dayItem := range asSlice(itinerary["days"]) {

		day := asMap(dayItem)

		resolvedDayIndex := dayIdx

		if parsed, ok := asInt(day["day_index"]); ok {

			resolvedDayIndex = parsed

		}

		for blockIdx, blockItem := range asSlice(day["blocks"]) {

			block := asMap(blockItem)

			if strings.TrimSpace(asString(block["block_id"])) != "" {

				continue

			}

			startHour, _ := asInt(block["start_hour"])

			endHour, _ := asInt(block["end_hour"])

			block["block_id"] = makeBlockID(resolvedDayIndex, startHour, endHour, blockIdx)

		}
	}
}

func extractAffectedDays(patch map[string]any) []int {
	affectedDays := make([]int, 0)
	for _, item := range asSlice(patch["affected_days"]) {

		if day, ok := asInt(item); ok && day >= 0 {

			affectedDays = append(affectedDays, day)

		}
	}
	return uniqueInts(affectedDays)
}

func uniqueInts(values []int) []int {
	seen := map[int]bool{}
	out := make([]int, 0, len(values))
	for _, value := range values {

		if seen[value] {

			continue

		}

		seen[value] = true

		out = append(out, value)
	}
	return out
}

func isDayInAffectedSet(dayIndex int, affectedDays []int) bool {
	if len(affectedDays) == 0 {

		return true
	}
	for _, affected := range affectedDays {

		if affected == dayIndex {

			return true

		}
	}
	return false
}

func isWindowOverlap(blockStart, blockEnd, windowStart, windowEnd int) bool {
	return blockStart < windowEnd && blockEnd > windowStart
}

func rebuildItineraryDerivedFields(itinerary map[string]any) {
	requestSnapshot := asMap(itinerary["request_snapshot"])
	destination := strings.TrimSpace(asString(firstNonEmpty(itinerary["destination"], requestSnapshot["destination"])))
	if destination == "" {

		destination = "default"
	}
	poiSequence := make([]string, 0)
	transitLegs := make([]map[string]any, 0)
	for dayIdx, dayItem := range asSlice(itinerary["days"]) {

		day := asMap(dayItem)

		resolvedDayIndex := dayIdx

		if parsed, ok := asInt(day["day_index"]); ok {

			resolvedDayIndex = parsed

		}
		date := strings.TrimSpace(asString(day["date"]))

		blocks := asSlice(day["blocks"])

		for _, blockItem := range blocks {

			block := asMap(blockItem)
			enrichBlockInsights(block, destination, requestSnapshot, resolvedDayIndex, date)

			poi := strings.TrimSpace(asString(block["poi"]))

			if poi != "" {

				poiSequence = append(poiSequence, poi)

			}

		}

		for i := 1; i < len(blocks); i++ {

			from := asMap(blocks[i-1])

			to := asMap(blocks[i])

			fromPOI := asString(from["poi"])

			toPOI := asString(to["poi"])

			fromLat := asFloat(from["poi_lat"], 0)

			fromLon := asFloat(from["poi_lon"], 0)

			toLat := asFloat(to["poi_lat"], 0)

			toLon := asFloat(to["poi_lon"], 0)

			transitLegs = append(transitLegs, map[string]any{

				"day_index": resolvedDayIndex,

				"from_poi": fromPOI,

				"to_poi": toPOI,

				"minutes": 18 + (hashCode(fmt.Sprintf("%s-%s-%d", fromPOI, toPOI, resolvedDayIndex)) % 28),

				"mode": "taxi",

				"source": "local_estimate",

				"distance_meters": 2500 + (hashCode(fmt.Sprintf("%s-%d", toPOI, resolvedDayIndex)) % 6000),

				"polyline": "",

				"navigation_url": fmt.Sprintf("https://uri.amap.com/navigation?from=%v,%v,%s&to=%v,%v,%s&mode=car&policy=1&src=trip-go", fromLon, fromLat, fromPOI, toLon, toLat, toPOI),

				"from_lat": fromLat,

				"from_lon": fromLon,

				"to_lat": toLat,

				"to_lon": toLon,
			})

		}
	}
	itinerary["poi_sequence"] = poiSequence
	itinerary["transit_legs"] = transitLegs
}

func generateItinerary(req PlanRequest) map[string]any {
	destination := strings.TrimSpace(req.Destination)
	if destination == "" {

		destination = "default"
	}
	catalog := selectCatalogByDestination(destination)
	slots := []struct {
		Start int

		End int

		Title string

		Type string
	}{

		{Start: 9, End: 11, Title: "上午主游", Type: "sight"},

		{Start: 11, End: 13, Title: "午餐安排", Type: "food"},

		{Start: 14, End: 17, Title: "下午体验", Type: "experience"},

		{Start: 19, End: 21, Title: "夜游收束", Type: "night"},
	}
	requestSnapshot := map[string]any{

		"origin_city": req.OriginCity,

		"destination": req.Destination,

		"days": req.Days,

		"budget_level": req.BudgetLevel,

		"companions": req.Companions,

		"travel_styles": req.TravelStyles,

		"must_go": req.MustGo,

		"avoid": req.Avoid,

		"start_date": req.StartDate,

		"pace": req.Pace,

		"user_id": req.UserID,
	}
	days := make([]map[string]any, 0, req.Days)
	poiSequence := make([]string, 0, req.Days*len(slots))
	transitLegs := make([]map[string]any, 0, req.Days*3)
	openingChecks := make([]map[string]any, 0, req.Days*len(slots))
	for dayIndex := 0; dayIndex < req.Days; dayIndex++ {

		date := addDays(req.StartDate, dayIndex)

		blocks := make([]map[string]any, 0, len(slots))

		for i, slot := range slots {

			point := catalog[(dayIndex*3+i)%len(catalog)]

			poiSequence = append(poiSequence, point.POI)

			blockID := makeBlockID(dayIndex, slot.Start, slot.End, i)

			openHour, closeHour, closedOnDate := resolveOpeningWindow(slot.Type, point.POI, date)

			withinWindow := !closedOnDate && slot.Start >= openHour && slot.End <= closeHour

			openingChecks = append(openingChecks, map[string]any{

				"day_index": dayIndex,

				"date": date,

				"block_id": blockID,

				"block_index": i,

				"slot_type": slot.Type,

				"poi": point.POI,

				"start_hour": slot.Start,

				"end_hour": slot.End,

				"open_hour": openHour,

				"close_hour": closeHour,

				"closed_on_date": closedOnDate,

				"within_window": withinWindow,

				"source": "local_catalog",
			})
			block := map[string]any{

				"block_id": blockID,

				"day_index": dayIndex,

				"start_hour": slot.Start,

				"end_hour": slot.End,

				"title": slot.Title,

				"block_type": slot.Type,

				"poi": point.POI,

				"reason": map[string]any{

					"distance_fit": 0.82,

					"time_window_fit": 0.88,

					"budget_fit": 0.80,

					"weather_fit": 0.85,

					"note": "",
				},

				"locked": false,

				"lock_reason": "",

				"poi_lat": point.Lat,

				"poi_lon": point.Lon,

				"poi_map_url": fmt.Sprintf("https://uri.amap.com/marker?position=%v,%v&name=%s", point.Lon, point.Lat, point.POI),
			}
			enrichBlockInsights(block, destination, requestSnapshot, dayIndex, date)
			blocks = append(blocks, block)

		}

		days = append(days, map[string]any{

			"day_index": dayIndex,

			"date": date,

			"blocks": blocks,
		})

		for i := 1; i < len(blocks); i++ {

			from := blocks[i-1]

			to := blocks[i]

			fromPOI := asString(from["poi"])

			toPOI := asString(to["poi"])

			fromLat := asFloat(from["poi_lat"], 0)

			fromLon := asFloat(from["poi_lon"], 0)

			toLat := asFloat(to["poi_lat"], 0)

			toLon := asFloat(to["poi_lon"], 0)

			transitLegs = append(transitLegs, map[string]any{

				"day_index": dayIndex,

				"from_poi": fromPOI,

				"to_poi": toPOI,

				"minutes": 18 + (hashCode(fmt.Sprintf("%s-%s-%d", fromPOI, toPOI, dayIndex)) % 28),

				"mode": "taxi",

				"source": "local_estimate",

				"distance_meters": 2500 + (hashCode(fmt.Sprintf("%s-%d", toPOI, dayIndex)) % 6000),

				"polyline": "",

				"navigation_url": fmt.Sprintf("https://uri.amap.com/navigation?from=%v,%v,%s&to=%v,%v,%s&mode=car&policy=1&src=trip-go", fromLon, fromLat, fromPOI, toLon, toLat, toPOI),

				"from_lat": fromLat,

				"from_lon": fromLon,

				"to_lat": toLat,

				"to_lon": toLon,
			})

		}
	}
	estimatedCost := int(math.Round(float64(req.Days) * 380 * budgetMultiplier(req.BudgetLevel)))
	itinerary := map[string]any{

		"request_id": fmt.Sprintf("req-%d-%d", time.Now().UnixMilli(), hashCode(time.Now().String())%1_000_000),

		"destination": req.Destination,

		"start_date": req.StartDate,

		"granularity": "hourly",

		"days": days,

		"poi_sequence": poiSequence,

		"transit_legs": transitLegs,

		"estimated_cost": estimatedCost,

		"opening_checks": openingChecks,

		"weather_risks": []string{},

		"fallback_actions": []any{},

		"confidence": 0.83,

		"warnings": []string{},

		"generated_at": nowISO(),

		"request_snapshot": requestSnapshot,

		"map_provider": "amap",

		"version": 1,

		"parent_version": nil,

		"changes": []map[string]any{},

		"conflicts": []map[string]any{},
	}
	attachDataDiagnostics(itinerary)
	attachMobileSummaryFields(itinerary)
	attachLegacyMetadata(itinerary)
	return itinerary
}

func replanItinerary(itinerary map[string]any, patch map[string]any) map[string]any {
	next := deepCloneMap(itinerary)
	ensureBlockIDs(next)
	requestSnapshot := asMap(next["request_snapshot"])
	changeType := strings.ToLower(strings.TrimSpace(asString(patch["change_type"])))
	affectedDays := extractAffectedDays(patch)
	keepLocked := true
	if _, exists := patch["keep_locked"]; exists {

		keepLocked = asBool(patch["keep_locked"])
	} else if _, exists := patch["preserve_locked"]; exists {

		keepLocked = asBool(patch["preserve_locked"])
	}
	destination := strings.TrimSpace(asString(firstNonEmpty(next["destination"], requestSnapshot["destination"])))
	if destination == "" {

		destination = "default"
	}
	changes := make([]map[string]any, 0)
	conflicts := make([]map[string]any, 0)
	switch changeType {
	case "budget":

		newBudget := strings.ToLower(strings.TrimSpace(asString(patch["new_budget_level"])))

		oldBudget := strings.ToLower(strings.TrimSpace(asString(requestSnapshot["budget_level"])))

		if newBudget != "" {

			requestSnapshot["budget_level"] = newBudget

			next["estimated_cost"] = int(math.Round(asFloat(next["estimated_cost"], 0) * budgetMultiplier(newBudget)))

			if oldBudget != newBudget {

				changes = append(changes, map[string]any{

					"change_type": "budget",

					"old_value": oldBudget,

					"new_value": newBudget,

					"reason": "budget_level_updated",
				})

			}

		}
	case "date":

		newStartDate := strings.TrimSpace(asString(patch["new_start_date"]))

		oldStartDate := strings.TrimSpace(asString(next["start_date"]))

		if newStartDate != "" {

			next["start_date"] = newStartDate

			for i, dayItem := range asSlice(next["days"]) {

				day := asMap(dayItem)

				day["date"] = addDays(newStartDate, i)

			}

			requestSnapshot["start_date"] = newStartDate

			if oldStartDate != newStartDate {

				changes = append(changes, map[string]any{

					"change_type": "date",

					"old_value": oldStartDate,

					"new_value": newStartDate,

					"reason": "start_date_shifted",
				})

			}

		}
	case "preferences":

		styles := uniqueStrings(asStringSlice(patch["new_travel_styles"]))

		if len(styles) > 0 {

			oldStyles := strings.Join(asStringSlice(requestSnapshot["travel_styles"]), ",")

			requestSnapshot["travel_styles"] = styles

			warnings := uniqueStrings(append(asStringSlice(next["warnings"]), "preferences adjusted by request"))

			next["warnings"] = warnings

			newStyles := strings.Join(styles, ",")

			if oldStyles != newStyles {

				changes = append(changes, map[string]any{

					"change_type": "preferences",

					"old_value": oldStyles,

					"new_value": newStyles,

					"reason": "travel_styles_updated",
				})

			}

		}
	case "poi":

		removePOI := strings.TrimSpace(asString(patch["remove_poi"]))

		replaced := 0

		if removePOI != "" {

			for dayIdx, dayItem := range asSlice(next["days"]) {

				day := asMap(dayItem)
				date := strings.TrimSpace(asString(day["date"]))

				resolvedDayIndex := dayIdx

				if parsed, ok := asInt(day["day_index"]); ok {

					resolvedDayIndex = parsed

				}

				if !isDayInAffectedSet(resolvedDayIndex, affectedDays) {

					continue

				}

				for _, blockItem := range asSlice(day["blocks"]) {

					block := asMap(blockItem)

					oldPOI := asString(block["poi"])

					if !strings.Contains(oldPOI, removePOI) {

						continue

					}

					replacement := pickReplacementPOI(destination, oldPOI, resolvedDayIndex, asIntOrZero(block["start_hour"]))

					block["poi"] = replacement.POI

					block["title"] = "Replanned slot"

					block["poi_lat"] = replacement.Lat

					block["poi_lon"] = replacement.Lon

					block["poi_map_url"] = fmt.Sprintf("https://uri.amap.com/marker?position=%v,%v&name=%s", replacement.Lon, replacement.Lat, replacement.POI)
					enrichBlockInsights(block, destination, requestSnapshot, resolvedDayIndex, date)

					replaced++

					changes = append(changes, map[string]any{

						"change_type": "poi",

						"day_index": resolvedDayIndex,

						"block_id": asString(block["block_id"]),

						"start_hour": asIntOrZero(block["start_hour"]),

						"end_hour": asIntOrZero(block["end_hour"]),

						"old_poi": oldPOI,

						"new_poi": replacement.POI,

						"reason": "poi_replaced_by_user_request",
					})

				}

			}

			fallbackActions := asSlice(next["fallback_actions"])

			dayIndex := 0

			if len(affectedDays) > 0 {

				dayIndex = affectedDays[0]

			}

			fallbackActions = append(fallbackActions, map[string]any{

				"day_index": dayIndex,

				"failed_poi": removePOI,

				"replacement_poi": "备选地点",

				"reason": "poi replaced by fallback",
			})

			next["fallback_actions"] = fallbackActions

		}

		if removePOI != "" && replaced == 0 {

			conflicts = append(conflicts, map[string]any{

				"code": "POI_NOT_FOUND",

				"message": "remove_poi not found in target scope",
			})

		}
	case "lock", "unlock":

		lockValue := changeType == "lock"

		targets := asSlice(patch["targets"])

		for targetIndex, targetItem := range targets {

			target := asMap(targetItem)

			targetID := strings.TrimSpace(asString(target["block_id"]))

			targetDay, hasDay := asInt(target["day_index"])

			targetStart, hasStart := asInt(target["start_hour"])

			targetEnd, hasEnd := asInt(target["end_hour"])

			matched := 0

			for dayIdx, dayItem := range asSlice(next["days"]) {

				day := asMap(dayItem)

				resolvedDayIndex := dayIdx

				if parsed, ok := asInt(day["day_index"]); ok {

					resolvedDayIndex = parsed

				}

				if hasDay && resolvedDayIndex != targetDay {

					continue

				}

				for _, blockItem := range asSlice(day["blocks"]) {

					block := asMap(blockItem)

					blockID := strings.TrimSpace(asString(block["block_id"]))

					blockStart, _ := asInt(block["start_hour"])

					blockEnd, _ := asInt(block["end_hour"])

					match := false

					switch {

					case targetID != "":

						match = blockID == targetID

					case hasDay && hasStart && hasEnd:

						match = blockStart == targetStart && blockEnd == targetEnd

					}

					if !match {

						continue

					}

					matched++

					oldLocked := asBool(block["locked"])

					block["locked"] = lockValue

					if lockValue {

						block["lock_reason"] = strings.TrimSpace(asString(firstNonEmpty(patch["lock_reason"], target["lock_reason"])))

					} else {

						block["lock_reason"] = ""

					}

					if oldLocked != lockValue {

						changes = append(changes, map[string]any{

							"change_type": changeType,

							"day_index": resolvedDayIndex,

							"block_id": blockID,

							"start_hour": blockStart,

							"end_hour": blockEnd,

							"old_locked": oldLocked,

							"new_locked": lockValue,

							"reason": "manual_lock_state_change",
						})

					}

				}

			}

			if matched == 0 {

				conflicts = append(conflicts, map[string]any{

					"code": "TARGET_NOT_FOUND",

					"message": fmt.Sprintf("targets[%d] not found", targetIndex),

					"target_index": targetIndex,
				})

			}

		}
	case "replan_window":

		targets := asSlice(patch["targets"])

		for targetIndex, targetItem := range targets {

			target := asMap(targetItem)

			targetDay, _ := asInt(target["day_index"])

			targetStart, _ := asInt(target["start_hour"])

			targetEnd, _ := asInt(target["end_hour"])

			if !isDayInAffectedSet(targetDay, affectedDays) {

				continue

			}

			windowMatched := 0

			windowChanged := 0

			for dayIdx, dayItem := range asSlice(next["days"]) {

				day := asMap(dayItem)
				date := strings.TrimSpace(asString(day["date"]))

				resolvedDayIndex := dayIdx

				if parsed, ok := asInt(day["day_index"]); ok {

					resolvedDayIndex = parsed

				}

				if resolvedDayIndex != targetDay {

					continue

				}

				for _, blockItem := range asSlice(day["blocks"]) {

					block := asMap(blockItem)

					blockStart, _ := asInt(block["start_hour"])

					blockEnd, _ := asInt(block["end_hour"])

					if !isWindowOverlap(blockStart, blockEnd, targetStart, targetEnd) {

						continue

					}

					windowMatched++

					if keepLocked && asBool(block["locked"]) {

						continue

					}

					oldPOI := asString(block["poi"])

					replacement := pickReplacementPOI(destination, oldPOI, resolvedDayIndex, blockStart)

					block["poi"] = replacement.POI

					block["title"] = "Window Replanned"

					block["poi_lat"] = replacement.Lat

					block["poi_lon"] = replacement.Lon

					block["poi_map_url"] = fmt.Sprintf("https://uri.amap.com/marker?position=%v,%v&name=%s", replacement.Lon, replacement.Lat, replacement.POI)
					enrichBlockInsights(block, destination, requestSnapshot, resolvedDayIndex, date)

					windowChanged++

					changes = append(changes, map[string]any{

						"change_type": "replan_window",

						"day_index": resolvedDayIndex,

						"block_id": asString(block["block_id"]),

						"start_hour": blockStart,

						"end_hour": blockEnd,

						"old_poi": oldPOI,

						"new_poi": replacement.POI,

						"reason": "window_rebalance",
					})

				}

			}

			if windowMatched == 0 {

				conflicts = append(conflicts, map[string]any{

					"code": "WINDOW_EMPTY",

					"message": "target window has no matching blocks",

					"day_index": targetDay,

					"target_index": targetIndex,
				})

				continue

			}

			if windowChanged == 0 {

				conflicts = append(conflicts, map[string]any{

					"code": "WINDOW_ALL_LOCKED",

					"message": "target window contains only locked blocks",

					"day_index": targetDay,

					"target_index": targetIndex,
				})

			}

		}
	}
	addMustGo := asStringSlice(patch["add_must_go"])
	if len(addMustGo) > 0 {

		mustGo := uniqueStrings(append(asStringSlice(requestSnapshot["must_go"]), addMustGo...))

		requestSnapshot["must_go"] = mustGo
	}
	next["request_snapshot"] = requestSnapshot
	next["generated_at"] = nowISO()
	next["confidence"] = math.Max(0.58, asFloat(next["confidence"], 0.8)-0.03)
	next["warnings"] = uniqueStrings(asStringSlice(next["warnings"]))
	if strings.TrimSpace(asString(next["map_provider"])) == "" {

		next["map_provider"] = "amap"
	}
	rebuildItineraryDerivedFields(next)
	ensureBlockIDs(next)
	currentVersion := 1
	if version, ok := asInt(next["version"]); ok && version > 0 {

		currentVersion = version
	}
	next["parent_version"] = currentVersion
	next["version"] = currentVersion + 1
	next["changes"] = changes
	next["conflicts"] = conflicts
	attachDataDiagnostics(next)
	attachMobileSummaryFields(next)
	return next
}

func asIntOrZero(value any) int {
	n, _ := asInt(value)
	return n
}

func summarizeItinerary(itinerary map[string]any) string {
	requestSnapshot := asMap(itinerary["request_snapshot"])
	destination := asString(firstNonEmpty(itinerary["destination"], requestSnapshot["destination"]))
	if strings.TrimSpace(destination) == "" {

		destination = "destination"
	}
	days := len(asSlice(itinerary["days"]))
	if days == 0 {

		if n, ok := asInt(requestSnapshot["days"]); ok {

			days = n

		}
	}
	budget := asString(requestSnapshot["budget_level"])
	if strings.TrimSpace(budget) == "" {

		budget = "medium"
	}
	pois := asStringSlice(itinerary["poi_sequence"])
	preview := "-"
	if len(pois) > 0 {

		if len(pois) > 4 {

			pois = pois[:4]

		}

		preview = strings.Join(pois, " / ")
	}
	daySuffix := ""
	if days > 0 {

		daySuffix = fmt.Sprintf("%d days", days)
	}
	return fmt.Sprintf("%s %s itinerary, budget %s. highlights: %s", destination, daySuffix, budget, preview)
}

func buildPlanDiff(fromItinerary, toItinerary map[string]any) map[string]any {
	fromIndex := indexBlocksForDiff(fromItinerary)
	toIndex := indexBlocksForDiff(toItinerary)
	allKeys := map[string]bool{}
	for key := range fromIndex {

		allKeys[key] = true
	}
	for key := range toIndex {

		allKeys[key] = true
	}
	keys := make([]string, 0, len(allKeys))
	for key := range allKeys {

		keys = append(keys, key)
	}
	sort.Strings(keys)
	items := make([]map[string]any, 0)
	changedDaySet := map[int]bool{}
	for _, key := range keys {

		oldBlock, oldExists := fromIndex[key]

		newBlock, newExists := toIndex[key]

		if !oldExists || !newExists {

			item := buildDiffItem(oldBlock, newBlock)

			items = append(items, item)

			changedDaySet[asIntOrZero(item["day_index"])] = true

			continue

		}

		if blocksEquivalentForDiff(oldBlock, newBlock) {

			continue

		}

		item := buildDiffItem(oldBlock, newBlock)

		items = append(items, item)

		changedDaySet[asIntOrZero(item["day_index"])] = true
	}
	changedDays := make([]int, 0, len(changedDaySet))
	for day := range changedDaySet {

		changedDays = append(changedDays, day)
	}
	sort.Ints(changedDays)
	changeTypes := extractChangeTypesForDiff(toItinerary)
	if len(changeTypes) == 0 && len(items) > 0 {

		changeTypes = []string{"content_change"}
	}
	return map[string]any{

		"summary": map[string]any{

			"changed_blocks": len(items),

			"changed_days": changedDays,

			"change_types": changeTypes,
		},

		"items": items,
	}
}

func indexBlocksForDiff(itinerary map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for dayIdx, dayItem := range asSlice(itinerary["days"]) {

		day := asMap(dayItem)

		resolvedDay := dayIdx

		if parsed, ok := asInt(day["day_index"]); ok {

			resolvedDay = parsed

		}

		for _, blockItem := range asSlice(day["blocks"]) {

			block := deepCloneMap(asMap(blockItem))

			startHour := asIntOrZero(block["start_hour"])

			endHour := asIntOrZero(block["end_hour"])

			blockID := strings.TrimSpace(asString(block["block_id"]))

			if blockID == "" {

				blockID = fmt.Sprintf("d:%d:%d:%d", resolvedDay, startHour, endHour)

			}

			block["_day_index"] = resolvedDay

			block["_start_hour"] = startHour

			block["_end_hour"] = endHour

			block["_block_id"] = strings.TrimSpace(asString(block["block_id"]))

			out[blockID] = block

		}
	}
	return out
}

func buildDiffItem(oldBlock, newBlock map[string]any) map[string]any {
	item := map[string]any{}
	dayIndex := asIntOrZero(firstNonEmpty(newBlock["_day_index"], oldBlock["_day_index"], 0))
	startHour := asIntOrZero(firstNonEmpty(newBlock["_start_hour"], oldBlock["_start_hour"], 0))
	endHour := asIntOrZero(firstNonEmpty(newBlock["_end_hour"], oldBlock["_end_hour"], 0))
	blockID := strings.TrimSpace(asString(firstNonEmpty(newBlock["_block_id"], oldBlock["_block_id"], "")))
	item["day_index"] = dayIndex
	item["start_hour"] = startHour
	item["end_hour"] = endHour
	if blockID != "" {

		item["block_id"] = blockID
	}
	item["old"] = map[string]any{

		"poi": strings.TrimSpace(asString(oldBlock["poi"])),

		"locked": asBool(oldBlock["locked"]),
	}
	item["new"] = map[string]any{

		"poi": strings.TrimSpace(asString(newBlock["poi"])),

		"locked": asBool(newBlock["locked"]),
	}
	return item
}

func blocksEquivalentForDiff(oldBlock, newBlock map[string]any) bool {
	if strings.TrimSpace(asString(oldBlock["poi"])) != strings.TrimSpace(asString(newBlock["poi"])) {

		return false
	}
	if asBool(oldBlock["locked"]) != asBool(newBlock["locked"]) {

		return false
	}
	if asIntOrZero(oldBlock["_start_hour"]) != asIntOrZero(newBlock["_start_hour"]) {

		return false
	}
	if asIntOrZero(oldBlock["_end_hour"]) != asIntOrZero(newBlock["_end_hour"]) {

		return false
	}
	if asIntOrZero(oldBlock["_day_index"]) != asIntOrZero(newBlock["_day_index"]) {

		return false
	}
	return true
}

func extractChangeTypesForDiff(itinerary map[string]any) []string {
	types := make([]string, 0)
	for _, item := range asSlice(itinerary["changes"]) {

		changeType := strings.TrimSpace(asString(asMap(item)["change_type"]))

		if changeType == "" {

			continue

		}

		types = append(types, changeType)
	}
	return uniqueStrings(types)
}

func attachDataDiagnostics(itinerary map[string]any) {
	diagnostics := make([]map[string]any, 0)
	seen := map[string]struct{}{}
	appendDiagnostic := func(item map[string]any) {

		code := strings.TrimSpace(asString(item["code"]))

		target := asMap(item["target"])

		dayIndex := asIntOrZero(target["day_index"])

		blockID := strings.TrimSpace(asString(target["block_id"]))

		key := fmt.Sprintf("%s|%d|%s", code, dayIndex, blockID)

		if _, exists := seen[key]; exists {

			return

		}

		seen[key] = struct{}{}

		diagnostics = append(diagnostics, item)
	}
	expectedCity := normalizeCity(asString(firstNonEmpty(itinerary["destination"], asMap(itinerary["request_snapshot"])["destination"])))
	coordCity := inferCityFromCoords(itinerary)
	if expectedCity != "" && coordCity != "" && expectedCity != coordCity {

		appendDiagnostic(map[string]any{

			"code": "DEST_COORD_MISMATCH",

			"level": "warn",

			"message": "destination and coordinate cluster may be inconsistent",

			"action": map[string]any{

				"type": "noop",

				"label": "",
			},
		})
	}
	minutesByDay := map[int]int{}
	for _, legItem := range asSlice(itinerary["transit_legs"]) {

		leg := asMap(legItem)

		day := asIntOrZero(leg["day_index"])

		minutes := asIntOrZero(leg["minutes"])

		minutesByDay[day] += minutes
	}
	for day, totalMinutes := range minutesByDay {

		if totalMinutes >= 120 {

			appendDiagnostic(map[string]any{

				"code": "LONG_TRANSIT_DAY",

				"level": "warn",

				"message": "daily transit duration is high",

				"action": map[string]any{

					"type": "replan_window",

					"label": "",

					"payload": map[string]any{

						"day_index": day,

						"start_hour": 11,

						"end_hour": 17,
					},
				},

				"target": map[string]any{

					"day_index": day,
				},
			})

		}
	}
	for _, conflictItem := range asSlice(itinerary["conflicts"]) {

		conflict := asMap(conflictItem)

		if strings.TrimSpace(asString(conflict["code"])) != "WINDOW_ALL_LOCKED" {

			continue

		}

		appendDiagnostic(map[string]any{

			"code": "WINDOW_ALL_LOCKED",

			"level": "info",

			"message": "target window contains only locked blocks",

			"action": map[string]any{

				"type": "noop",

				"label": "",
			},
		})

		break
	}
	for _, checkItem := range asSlice(itinerary["opening_checks"]) {

		check := asMap(checkItem)

		dayIndex := asIntOrZero(check["day_index"])

		blockID := strings.TrimSpace(asString(check["block_id"]))

		poi := strings.TrimSpace(asString(check["poi"]))

		startHour := asIntOrZero(check["start_hour"])

		endHour := asIntOrZero(check["end_hour"])

		openHour := asIntOrZero(firstNonEmpty(check["open_hour"], 9))

		closeHour := asIntOrZero(firstNonEmpty(check["close_hour"], 22))

		closedOnDate := asBool(check["closed_on_date"])

		withinWindow := asBool(firstNonEmpty(check["within_window"], true))

		if !closedOnDate && withinWindow {

			continue

		}

		target := map[string]any{"day_index": dayIndex}

		if blockID != "" {

			target["block_id"] = blockID

		}

		payload := map[string]any{"day_index": dayIndex}

		if startHour > 0 || endHour > 0 {

			payload["start_hour"] = startHour

			payload["end_hour"] = endHour

		}

		if closedOnDate {

			appendDiagnostic(map[string]any{

				"code": "POI_CLOSED_ON_DATE",

				"level": "warn",

				"message": fmt.Sprintf("%s ", firstNonEmpty(poi, "")),

				"action": map[string]any{

					"type": "replan_window",

					"label": "",

					"payload": payload,
				},

				"target": target,
			})

			continue

		}

		appendDiagnostic(map[string]any{

			"code": "POI_OPEN_HOURS_MISMATCH",

			"level": "warn",

			"message": fmt.Sprintf("%02d:00-%02d:00  %02d:00-%02d:00", startHour, endHour, openHour, closeHour),

			"action": map[string]any{

				"type": "replan_window",

				"label": "",

				"payload": payload,
			},

			"target": target,
		})
	}
	startDate := strings.TrimSpace(asString(firstNonEmpty(asMap(itinerary["request_snapshot"])["start_date"], itinerary["start_date"], "")))
	if parsedStartDate, err := time.Parse("2006-01-02", startDate); err == nil {

		hoursUntilStart := int(parsedStartDate.Sub(time.Now().UTC()).Hours())

		if hoursUntilStart >= 0 && hoursUntilStart <= 7*24 {

			for dayIdx, dayItem := range asSlice(itinerary["days"]) {

				day := asMap(dayItem)

				dayIndex := asIntOrZero(firstNonEmpty(day["day_index"], dayIdx))

				for blockIdx, blockItem := range asSlice(day["blocks"]) {

					block := asMap(blockItem)

					if strings.ToLower(strings.TrimSpace(asString(block["block_type"]))) != "sight" {

						continue

					}

					blockID := strings.TrimSpace(asString(block["block_id"]))

					if blockID == "" {

						blockID = makeBlockID(dayIndex, asIntOrZero(block["start_hour"]), asIntOrZero(block["end_hour"]), blockIdx)

					}

					poi := strings.TrimSpace(asString(block["poi"]))

					dueAt := parsedStartDate.Add(-24 * time.Hour).Format(time.RFC3339)

					appendDiagnostic(map[string]any{

						"code": "APPOINTMENT_DEADLINE_SOON",

						"level": "info",

						"message": fmt.Sprintf("%s ", firstNonEmpty(poi, "")),

						"action": map[string]any{

							"type": "add_pretrip_task",

							"label": "",

							"payload": map[string]any{

								"id": fmt.Sprintf("task-booking-%s", strings.ToLower(strings.ReplaceAll(blockID, "_", "-"))),

								"category": "booking",

								"title": fmt.Sprintf(" %s ", firstNonEmpty(poi, "")),

								"due_at": dueAt,

								"status": "todo",
							},
						},

						"target": map[string]any{

							"day_index": dayIndex,

							"block_id": blockID,
						},
					})

					break

				}

			}

		}
	}
	itinerary["diagnostics"] = diagnostics
}

func inferCityFromCoords(itinerary map[string]any) string {
	type cityCenter struct {
		Name string

		Lat float64

		Lon float64
	}
	centers := []cityCenter{

		{Name: "beijing", Lat: 39.9042, Lon: 116.4074},

		{Name: "shanghai", Lat: 31.2304, Lon: 121.4737},

		{Name: "hangzhou", Lat: 30.2741, Lon: 120.1551},

		{Name: "chengdu", Lat: 30.5728, Lon: 104.0668},

		{Name: "guangzhou", Lat: 23.1291, Lon: 113.2644},

		{Name: "shenzhen", Lat: 22.5431, Lon: 114.0579},

		{Name: "wuhan", Lat: 30.5928, Lon: 114.3055},

		{Name: "nanjing", Lat: 32.0603, Lon: 118.7969},
	}
	latSum := 0.0
	lonSum := 0.0
	count := 0.0
	for _, dayItem := range asSlice(itinerary["days"]) {

		day := asMap(dayItem)

		for _, blockItem := range asSlice(day["blocks"]) {

			block := asMap(blockItem)

			lat := asFloat(block["poi_lat"], 0)

			lon := asFloat(block["poi_lon"], 0)

			if lat == 0 && lon == 0 {

				continue

			}

			latSum += lat

			lonSum += lon

			count += 1

		}
	}
	if count == 0 {

		return ""
	}
	centroidLat := latSum / count
	centroidLon := lonSum / count
	bestName := ""
	bestDistance := 999999.0
	for _, center := range centers {

		dLat := centroidLat - center.Lat

		dLon := centroidLon - center.Lon

		distance := dLat*dLat + dLon*dLon

		if distance < bestDistance {

			bestDistance = distance

			bestName = center.Name

		}
	}
	return bestName
}

func prettyJSON(v any) string {
	blob, _ := json.Marshal(v)
	return string(blob)
}
