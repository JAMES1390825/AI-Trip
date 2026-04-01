package app

import (
	"fmt"
	"strings"
)

func buildCommunityPostDraftSeed(saved SavedPlan) CommunityPostDraftSeed {
	itinerary := normalizeItineraryForStorage(saved.Itinerary)
	requestSnapshot := asMap(itinerary["request_snapshot"])
	brief := planningBriefFromMap(firstNonNil(itinerary["planning_brief"], requestSnapshot["planning_brief"]))

	destinationLabel := resolveCommunityDraftDestinationLabel(itinerary, requestSnapshot, brief)
	days := resolveCommunityDraftDays(itinerary, requestSnapshot, brief)
	startDate := strings.TrimSpace(asString(firstNonEmpty(itinerary["start_date"], requestSnapshot["start_date"], brief.StartDate)))
	poiSequence, restaurants, attractions := collectCommunityDraftPlaces(itinerary)
	tags := buildCommunityDraftTags(brief, restaurants, attractions)

	return CommunityPostDraftSeed{
		Title:               buildCommunityDraftTitle(destinationLabel, days, tags),
		Content:             buildCommunityDraftContent(destinationLabel, startDate, days, brief, poiSequence, restaurants, attractions),
		DestinationLabel:    destinationLabel,
		Tags:                tags,
		ImageURLs:           []string{},
		FavoriteRestaurants: restaurants,
		FavoriteAttractions: attractions,
	}
}

func resolveCommunityDraftDestinationLabel(itinerary, requestSnapshot map[string]any, brief PlanningBrief) string {
	destinationLabel := strings.TrimSpace(asString(firstNonEmpty(
		itinerary["destination"],
		requestSnapshot["destination"],
		func() string {
			if brief.Destination == nil {
				return ""
			}
			return brief.Destination.DestinationLabel
		}(),
	)))
	if destinationLabel != "" {
		return destinationLabel
	}
	return "未命名目的地"
}

func resolveCommunityDraftDays(itinerary, requestSnapshot map[string]any, brief PlanningBrief) int {
	if days := len(asSlice(itinerary["days"])); days > 0 {
		return days
	}
	if brief.Days > 0 {
		return brief.Days
	}
	if days, ok := asInt(requestSnapshot["days"]); ok && days > 0 {
		return days
	}
	return 0
}

func collectCommunityDraftPlaces(itinerary map[string]any) ([]string, []string, []string) {
	allPOIs := make([]string, 0, 12)
	restaurants := make([]string, 0, 6)
	attractions := make([]string, 0, 8)

	for _, dayItem := range asSlice(itinerary["days"]) {
		for _, blockItem := range asSlice(asMap(dayItem)["blocks"]) {
			block := asMap(blockItem)
			poi := normalizeCommunityText(asString(block["poi"]))
			if poi == "" {
				continue
			}
			allPOIs = append(allPOIs, poi)
			if strings.EqualFold(strings.TrimSpace(asString(block["block_type"])), "food") {
				restaurants = append(restaurants, poi)
				continue
			}
			attractions = append(attractions, poi)
		}
	}

	poiSequence := uniqueStrings(filterNonBlankStrings(append(asStringSlice(itinerary["poi_sequence"]), allPOIs...)))
	restaurants = uniqueStrings(filterNonBlankStrings(restaurants))
	attractions = uniqueStrings(filterNonBlankStrings(attractions))

	if len(attractions) == 0 {
		fallbackAttractions := make([]string, 0, len(poiSequence))
		restaurantSet := map[string]bool{}
		for _, restaurant := range restaurants {
			if key := normalizeGroundingText(restaurant); key != "" {
				restaurantSet[key] = true
			}
		}
		for _, poi := range poiSequence {
			if restaurantSet[normalizeGroundingText(poi)] {
				continue
			}
			fallbackAttractions = append(fallbackAttractions, poi)
		}
		attractions = uniqueStrings(filterNonBlankStrings(fallbackAttractions))
	}

	return poiSequence, firstNStrings(restaurants, 4), firstNStrings(attractions, 6)
}

func buildCommunityDraftTags(brief PlanningBrief, restaurants, attractions []string) []string {
	tags := make([]string, 0, 6)
	for _, style := range brief.TravelStyles {
		if label := communityDraftStyleLabel(style); label != "" {
			tags = append(tags, label)
		}
	}
	if label := communityDraftPaceLabel(brief.Pace); label != "" {
		tags = append(tags, label)
	}
	if len(restaurants) > 0 {
		tags = append(tags, "美食")
	}
	if len(attractions) > 0 {
		tags = append(tags, "路线分享")
	}
	return firstNStrings(uniqueStrings(filterNonBlankStrings(tags)), 5)
}

func buildCommunityDraftTitle(destinationLabel string, days int, tags []string) string {
	primaryTag := ""
	for _, tag := range tags {
		if tag == "路线分享" || tag == "轻松" || tag == "紧凑" {
			continue
		}
		primaryTag = strings.TrimSpace(tag)
		if primaryTag != "" {
			break
		}
	}

	switch {
	case destinationLabel != "" && days > 0 && primaryTag != "":
		return fmt.Sprintf("%s%d天%s路线", destinationLabel, days, primaryTag)
	case destinationLabel != "" && days > 0:
		return fmt.Sprintf("%s%d天行程分享", destinationLabel, days)
	case destinationLabel != "" && primaryTag != "":
		return fmt.Sprintf("%s%s路线分享", destinationLabel, primaryTag)
	case destinationLabel != "":
		return fmt.Sprintf("%s行程分享", destinationLabel)
	default:
		return "旅行路线分享"
	}
}

func buildCommunityDraftContent(
	destinationLabel, startDate string,
	days int,
	brief PlanningBrief,
	poiSequence, restaurants, attractions []string,
) string {
	parts := make([]string, 0, 6)

	intro := "这次走了一条自己觉得比较省心的路线"
	switch {
	case destinationLabel != "" && days > 0 && startDate != "":
		intro = fmt.Sprintf("这次在%s安排了%d天行程，出发时间是%s", destinationLabel, days, startDate)
	case destinationLabel != "" && days > 0:
		intro = fmt.Sprintf("这次在%s安排了%d天行程", destinationLabel, days)
	case destinationLabel != "":
		intro = fmt.Sprintf("这次在%s走了一条自己觉得比较省心的路线", destinationLabel)
	}
	parts = append(parts, intro)

	if len(poiSequence) > 0 {
		parts = append(parts, fmt.Sprintf("主要路线是 %s", strings.Join(firstNStrings(poiSequence, 5), " → ")))
	}
	if len(attractions) > 0 {
		parts = append(parts, fmt.Sprintf("我比较推荐的去处有 %s", strings.Join(firstNStrings(attractions, 4), "、")))
	}
	if len(restaurants) > 0 {
		parts = append(parts, fmt.Sprintf("吃饭可以考虑 %s", strings.Join(firstNStrings(restaurants, 3), "、")))
	}

	styleHints := make([]string, 0, 3)
	if paceLabel := communityDraftPaceLabel(brief.Pace); paceLabel != "" {
		styleHints = append(styleHints, "整体节奏偏"+paceLabel)
	}
	styleLabels := make([]string, 0, len(brief.TravelStyles))
	for _, style := range brief.TravelStyles {
		if label := communityDraftStyleLabel(style); label != "" {
			styleLabels = append(styleLabels, label)
		}
	}
	if len(styleLabels) > 0 {
		styleHints = append(styleHints, "更适合"+strings.Join(firstNStrings(uniqueStrings(styleLabels), 2), "、")+"的玩法")
	}
	if len(styleHints) > 0 {
		parts = append(parts, strings.Join(styleHints, "，"))
	}

	return strings.Join(filterNonBlankStrings(parts), "。") + "。"
}

func communityDraftStyleLabel(value string) string {
	switch normalizedSignalKey(value) {
	case "":
		return ""
	case "citywalk":
		return "城市漫游"
	case "food":
		return "美食"
	case "coffee":
		return "咖啡"
	case "night":
		return "夜游"
	case "photo":
		return "拍照"
	default:
		return strings.TrimSpace(value)
	}
}

func communityDraftPaceLabel(value string) string {
	switch normalizedSignalKey(value) {
	case "relaxed":
		return "轻松"
	case "compact":
		return "紧凑"
	default:
		return ""
	}
}
