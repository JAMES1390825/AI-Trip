package app

import (
	"math"
	"sort"
	"strings"
)

type providerPersonalizationResult struct {
	Boost int
	Basis map[string]any
}

func scorePrivateProfileCandidate(profile UserPrivateProfile, brief PlanningBrief, slotType string, poi amapPOI) providerPersonalizationResult {
	if strings.TrimSpace(profile.UserID) == "" {
		return providerPersonalizationResult{}
	}

	tags := amapTags(poi.Type)
	semantic := poiSemanticKind(poi.Name, tags)
	behaviorConfidence := clampFloat(profile.Confidence.BehavioralAffinity, 0, 1)
	riskConfidence := clampFloat(profile.Confidence.RiskProfile, 0, 1)
	if behaviorConfidence <= 0 && riskConfidence <= 0 {
		return providerPersonalizationResult{}
	}

	boost := 0.0
	matchedCategories := make([]string, 0, 3)
	matchedTags := make([]string, 0, 4)

	for _, category := range profileCandidateCategories(slotType, semantic) {
		score := profile.BehavioralAffinity.Categories[normalizedSignalKey(category)]
		if score == 0 {
			continue
		}
		boost += score * 52 * behaviorConfidence
		if score > 0.12 {
			matchedCategories = append(matchedCategories, normalizedSignalKey(category))
		}
	}

	for _, tag := range uniqueStrings(append(tags, semantic, slotType)) {
		normalized := normalizedSignalKey(tag)
		if normalized == "" {
			continue
		}
		score := profile.BehavioralAffinity.Tags[normalized]
		if score == 0 {
			continue
		}
		boost += score * 16 * behaviorConfidence
		if score > 0.12 {
			matchedTags = append(matchedTags, normalized)
		}
	}

	district := normalizedSignalKey(firstNonBlank(poi.Adcode, poi.CityCode))
	if district != "" {
		boost += profile.BehavioralAffinity.Districts[district] * 14 * behaviorConfidence
	}

	if riskConfidence > 0.2 && slotType != "food" {
		switch {
		case profile.RiskProfile.RainAvoidOutdoor >= 0.65:
			if semantic == "culture" || semantic == "street" {
				boost += 12 * riskConfidence
			}
			if semantic == "waterfront" || semantic == "nature" {
				boost -= 10 * riskConfidence
			}
		case profile.RiskProfile.RainAvoidOutdoor <= 0.35:
			if semantic == "waterfront" || semantic == "nature" || semantic == "street" {
				boost += 9 * riskConfidence
			}
		}
	}

	if strings.EqualFold(strings.TrimSpace(profile.ExplicitPreferences.BudgetLevel), strings.TrimSpace(brief.BudgetLevel)) && brief.BudgetLevel != "" {
		boost += 4
	}
	if strings.EqualFold(strings.TrimSpace(profile.ExplicitPreferences.Pace), strings.TrimSpace(brief.Pace)) && brief.Pace != "" {
		boost += 3
	}

	rounded := int(math.Round(boost))
	if rounded == 0 {
		return providerPersonalizationResult{}
	}

	return providerPersonalizationResult{
		Boost: rounded,
		Basis: map[string]any{
			"boost":              rounded,
			"matched_categories": uniqueStrings(matchedCategories),
			"matched_tags":       uniqueStrings(matchedTags),
			"district_adcode":    district,
			"confidence":         roundToTwoDecimals(maxFloat(behaviorConfidence, riskConfidence)),
		},
	}
}

func profileCandidateCategories(slotType, semantic string) []string {
	out := []string{normalizedSignalKey(slotType)}
	switch semantic {
	case "culture":
		out = append(out, "sight", "experience", "culture")
	case "street":
		out = append(out, "experience", "citywalk")
	case "waterfront":
		out = append(out, "sight", "night", "windscenery")
	case "nature":
		out = append(out, "sight", "nature")
	case "food":
		out = append(out, "food")
	}
	return uniqueStrings(out)
}

func attachPersonalizationSummary(itinerary map[string]any, settings UserPersonalizationSettings, profile UserPrivateProfile) {
	if itinerary == nil {
		return
	}

	summary := map[string]any{
		"enabled":  settings.Enabled,
		"ready":    false,
		"reasons":  []string{},
		"top_tags": []string{},
	}
	if !settings.Enabled {
		summary["note"] = "个性化学习已暂停，当前路线不会读取你的历史行为。"
		itinerary["personalization_summary"] = summary
		return
	}
	if strings.TrimSpace(profile.UserID) == "" {
		summary["note"] = "当前还没有足够的历史行为，系统会按默认逻辑规划。"
		itinerary["personalization_summary"] = summary
		return
	}

	reasons := buildPersonalizationReasonLines(itinerary, profile)
	summary["ready"] = len(reasons) > 0
	summary["reasons"] = reasons
	summary["top_tags"] = topPositiveSignalKeys(profile.BehavioralAffinity.Tags, 4)
	summary["top_categories"] = topPositiveSignalKeys(profile.BehavioralAffinity.Categories, 3)
	summary["confidence"] = map[string]any{
		"behavioral_affinity": roundToTwoDecimals(profile.Confidence.BehavioralAffinity),
		"timing_profile":      roundToTwoDecimals(profile.Confidence.TimingProfile),
		"risk_profile":        roundToTwoDecimals(profile.Confidence.RiskProfile),
	}
	itinerary["personalization_summary"] = summary
}

func buildPersonalizationReasonLines(itinerary map[string]any, profile UserPrivateProfile) []string {
	reasons := make([]string, 0, 3)
	matchedTags := map[string]bool{}
	matchedCategories := map[string]bool{}
	matchedBlocks := 0

	for _, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		for _, blockItem := range asSlice(day["blocks"]) {
			block := asMap(blockItem)
			basis := asMap(block["personalization_basis"])
			if len(basis) == 0 {
				continue
			}
			matchedBlocks++
			for _, tag := range asStringSlice(basis["matched_tags"]) {
				matchedTags[tag] = true
			}
			for _, category := range asStringSlice(basis["matched_categories"]) {
				matchedCategories[category] = true
			}
		}
	}

	if matchedBlocks > 0 {
		topTags := firstNStrings(sortedTrueKeys(matchedTags), 3)
		topCategories := firstNStrings(sortedTrueKeys(matchedCategories), 2)
		switch {
		case len(topTags) > 0:
			reasons = append(reasons, "这次更偏向 "+strings.Join(topTags, " / ")+"，因为你最近更常保留这类去处。")
		case len(topCategories) > 0:
			reasons = append(reasons, "这次在候选排序里更偏向 "+strings.Join(topCategories, " / ")+"，因为你最近对这类安排更稳定。")
		}
	}

	if profile.Confidence.TimingProfile >= 0.35 && profile.TimingProfile.MaxTransitMinutes > 0 && profile.TimingProfile.MaxTransitMinutes <= 24 {
		reasons = append(reasons, "已尽量减少跨区通勤，因为你最近更常调整长距离移动。")
	}
	if profile.Confidence.RiskProfile >= 0.35 {
		switch {
		case profile.RiskProfile.RainAvoidOutdoor >= 0.65:
			reasons = append(reasons, "这次会更偏向可躲雨或更稳妥的时段安排。")
		case profile.RiskProfile.RainAvoidOutdoor <= 0.35:
			reasons = append(reasons, "这次保留了更多可散步和看景的段落，因为你最近对户外路线接受度更高。")
		}
	}
	return uniqueStrings(firstNStrings(reasons, 3))
}

func buildPersonalizationRecommendReason(basis map[string]any) string {
	matchedTags := asStringSlice(basis["matched_tags"])
	matchedCategories := asStringSlice(basis["matched_categories"])
	switch {
	case len(matchedTags) > 0:
		return "这站更贴近你最近常保留的 " + strings.Join(firstNStrings(matchedTags, 2), " / ") + " 偏好"
	case len(matchedCategories) > 0:
		return "这站更贴近你最近更常选择的 " + strings.Join(firstNStrings(matchedCategories, 2), " / ") + " 类型"
	default:
		return ""
	}
}

func topPositiveSignalKeys(values map[string]float64, limit int) []string {
	type pair struct {
		Key   string
		Value float64
	}
	items := make([]pair, 0, len(values))
	for key, value := range values {
		if strings.TrimSpace(key) == "" || value <= 0.12 {
			continue
		}
		items = append(items, pair{Key: key, Value: value})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Value == items[j].Value {
			return items[i].Key < items[j].Key
		}
		return items[i].Value > items[j].Value
	})
	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.Key)
	}
	return out
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}
