package app

import "strings"

func normalizeDraft(input map[string]any, userID string) map[string]any {
	source := input
	if source == nil {
		source = map[string]any{}
	}

	days, ok := asInt(source["days"])
	if !ok || days < 1 || days > 14 {
		days = 0
	}

	draft := map[string]any{
		"origin_city":   normalizeCity(asString(firstNonEmpty(source["origin_city"], source["originCity"]))),
		"destination":   normalizeCity(asString(source["destination"])),
		"days":          nil,
		"budget_level":  normalizeBudget(asString(firstNonEmpty(source["budget_level"], source["budgetLevel"]))),
		"companions":    uniqueStrings(asStringSlice(source["companions"])),
		"travel_styles": uniqueStrings(asStringSlice(firstNonEmpty(source["travel_styles"], source["travelStyles"]))),
		"must_go":       uniqueStrings(asStringSlice(firstNonEmpty(source["must_go"], source["mustGo"]))),
		"avoid":         uniqueStrings(asStringSlice(source["avoid"])),
		"start_date":    normalizeDate(asString(firstNonEmpty(source["start_date"], source["startDate"]))),
		"pace":          normalizePace(asString(source["pace"])),
		"user_id":       userID,
	}

	if days > 0 {
		draft["days"] = days
	}
	return draft
}

func firstNonEmpty(values ...any) any {
	for _, value := range values {
		if strings.TrimSpace(asString(value)) != "" {
			return value
		}
	}
	return ""
}

func missingDraftFields(draft map[string]any) []string {
	missing := make([]string, 0, len(requiredFields))
	for _, field := range requiredFields {
		value := draft[field]
		switch v := value.(type) {
		case nil:
			missing = append(missing, field)
		case string:
			if strings.TrimSpace(v) == "" {
				missing = append(missing, field)
			}
		default:
			if asString(v) == "" {
				if _, ok := asInt(v); !ok {
					missing = append(missing, field)
				}
			}
		}
	}
	return missing
}

func firstUserMessage(history []ChatTurn) string {
	for i := len(history) - 1; i >= 0; i-- {
		if strings.ToLower(strings.TrimSpace(history[i].Role)) != "user" {
			continue
		}
		text := strings.TrimSpace(history[i].Message)
		if text != "" {
			return text
		}
	}
	return ""
}

func fillDraftFromMessage(draft map[string]any, message string) map[string]any {
	text := strings.TrimSpace(message)
	if text == "" {
		return draft
	}
	lower := strings.ToLower(text)
	next := deepCloneMap(draft)

	if strings.TrimSpace(asString(next["origin_city"])) == "" {
		if match := originFromRe.FindStringSubmatch(text); len(match) > 1 {
			next["origin_city"] = normalizeCity(match[1])
		} else if match := originRe.FindStringSubmatch(text); len(match) > 1 {
			next["origin_city"] = normalizeCity(match[1])
		}
	}

	if strings.TrimSpace(asString(next["destination"])) == "" {
		if match := destinationGoRe.FindStringSubmatch(text); len(match) > 1 {
			next["destination"] = normalizeCity(match[1])
		} else if match := destinationToRe.FindStringSubmatch(text); len(match) > 1 {
			next["destination"] = normalizeCity(match[1])
		}
	}

	if cityOnly := parseLooseCityInput(text); cityOnly != "" {
		if strings.TrimSpace(asString(next["origin_city"])) == "" {
			next["origin_city"] = cityOnly
		} else if strings.TrimSpace(asString(next["destination"])) == "" {
			next["destination"] = cityOnly
		}
	}

	if _, ok := asInt(next["days"]); !ok {
		if days, ok := extractTripDays(text); ok {
			next["days"] = days
		}
	}

	if strings.TrimSpace(asString(next["budget_level"])) == "" {
		next["budget_level"] = normalizeBudget(text)
	}

	if strings.TrimSpace(asString(next["pace"])) == "" {
		next["pace"] = normalizePace(text)
	}

	if strings.TrimSpace(asString(next["start_date"])) == "" {
		if match := dateRe.FindStringSubmatch(text); len(match) == 4 {
			next["start_date"] = normalizeDate(match[1] + "-" + match[2] + "-" + match[3])
		}
	}

	styles := asStringSlice(next["travel_styles"])
	if len(styles) == 0 {
		inferred := make([]string, 0, 4)
		if strings.Contains(lower, "\u7f8e\u98df") || strings.Contains(lower, "food") {
			inferred = append(inferred, "food")
		}
		if strings.Contains(lower, "\u5386\u53f2") || strings.Contains(lower, "\u535a\u7269\u9986") || strings.Contains(lower, "history") {
			inferred = append(inferred, "history")
		}
		if strings.Contains(lower, "\u591c") || strings.Contains(lower, "night") {
			inferred = append(inferred, "night")
		}
		if strings.Contains(lower, "\u81ea\u7136") || strings.Contains(lower, "citywalk") || strings.Contains(lower, "nature") {
			inferred = append(inferred, "nature")
		}
		if len(inferred) > 0 {
			next["travel_styles"] = uniqueStrings(inferred)
		}
	}

	return next
}

func extractTripDays(text string) (int, bool) {
	matches := daysRe.FindAllStringSubmatch(text, -1)
	for _, match := range matches {
		if len(match) <= 1 {
			continue
		}
		days, ok := parseDayCountToken(match[1])
		if !ok {
			continue
		}
		if days < 1 || days > 14 {
			continue
		}
		return days, true
	}
	return 0, false
}
