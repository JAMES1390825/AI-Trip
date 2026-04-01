package app

import (
	"fmt"
	"strings"
	"time"
)

func attachMobileSummaryFields(itinerary map[string]any) {
	daySummaries := make([]map[string]any, 0)
	legsByDay := map[int]int{}
	for _, legItem := range asSlice(itinerary["transit_legs"]) {
		leg := asMap(legItem)
		dayIndex := asIntOrZero(leg["day_index"])
		legsByDay[dayIndex] += asIntOrZero(leg["minutes"])
	}

	var todayHint map[string]any
	todayKey := time.Now().UTC().Format("2006-01-02")
	for dayIdx, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		resolvedDayIndex := asIntOrZero(firstNonEmpty(day["day_index"], dayIdx))
		date := strings.TrimSpace(asString(day["date"]))
		blocks := asSlice(day["blocks"])
		poiNames := make([]string, 0, len(blocks))
		for _, blockItem := range blocks {
			block := asMap(blockItem)
			poi := strings.TrimSpace(asString(block["poi"]))
			if poi != "" {
				poiNames = append(poiNames, poi)
			}
		}

		title := fmt.Sprintf("第%d天 %s", resolvedDayIndex+1, strings.Join(firstNStrings(poiNames, 2), "与"))
		if len(poiNames) == 0 {
			title = fmt.Sprintf("第%d天 行程", resolvedDayIndex+1)
		}

		summary := map[string]any{
			"day_index":        resolvedDayIndex,
			"date":             date,
			"title":            title,
			"preview":          strings.Join(firstNStrings(poiNames, 4), " → "),
			"poi_count":        len(poiNames),
			"transit_minutes":  legsByDay[resolvedDayIndex],
			"recommended_mode": "all",
		}
		daySummaries = append(daySummaries, summary)

		if date == todayKey {
			nextPOI := ""
			if len(poiNames) > 0 {
				nextPOI = poiNames[0]
			}
			todayHint = map[string]any{
				"day_index": resolvedDayIndex,
				"date":      date,
				"title":     title,
				"next_poi":  nextPOI,
			}
		}
	}

	if todayHint == nil && len(daySummaries) > 0 {
		first := asMap(daySummaries[0])
		todayHint = map[string]any{
			"day_index": asIntOrZero(first["day_index"]),
			"date":      asString(first["date"]),
			"title":     asString(first["title"]),
			"next_poi":  "",
		}
	}

	itinerary["day_summaries"] = daySummaries
	if todayHint != nil {
		itinerary["today_hint"] = todayHint
	}
}

func firstNStrings(items []string, n int) []string {
	if n <= 0 || len(items) == 0 {
		return []string{}
	}
	if len(items) <= n {
		return items
	}
	return items[:n]
}
