package app

import (
	"fmt"
	"strings"
)

var chineseDigitMap = map[rune]int{
	'零': 0,
	'〇': 0,
	'○': 0,
	'一': 1,
	'二': 2,
	'两': 2,
	'俩': 2,
	'三': 3,
	'四': 4,
	'五': 5,
	'六': 6,
	'七': 7,
	'八': 8,
	'九': 9,
}

func normalizeCity(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	lower := strings.ToLower(raw)
	for key, aliases := range cityAlias {
		for _, alias := range aliases {
			if strings.ToLower(alias) == lower {
				return key
			}
		}
	}
	return raw
}

func knownCityCode(value string) string {
	code := normalizeCity(value)
	if _, ok := cityDisplay[code]; ok {
		return code
	}
	return ""
}

func cityLabel(value any) string {
	code := normalizeCity(asString(value))
	if label, ok := cityDisplay[code]; ok {
		return label
	}
	raw := strings.TrimSpace(asString(value))
	if raw == "" {
		return "-"
	}
	return raw
}

func budgetLabel(value any) string {
	switch normalizeBudget(asString(value)) {
	case "low":
		return "\u8282\u7701\u9884\u7b97"
	case "medium":
		return "\u9002\u4e2d\u9884\u7b97"
	case "high":
		return "\u4f53\u9a8c\u4f18\u5148"
	default:
		return "\u672a\u8bbe\u7f6e"
	}
}

func paceLabel(value any) string {
	switch normalizePace(asString(value)) {
	case "relaxed":
		return "\u8f7b\u677e\u6162\u6e38"
	case "compact":
		return "\u7d27\u51d1\u9ad8\u6548"
	default:
		return "\u672a\u8bbe\u7f6e"
	}
}

func parseLooseCityInput(text string) string {
	raw := strings.TrimSpace(text)
	if raw == "" {
		return ""
	}

	compact := strings.NewReplacer(
		"\uFF0C", "", ",", "", "\u3002", "", ".", "", "\uFF01", "", "!", "",
		"\uFF1F", "", "?", "", "~", "", "\uFF5E", "", " ", "", "\t", "", "\n", "", "\r", "",
	).Replace(raw)
	if compact == "" {
		return ""
	}

	suffixes := []string{"\u554a", "\u5440", "\u5462", "\u5427", "\u54c8", "\u5566", "\u54e6", "\u5594", "\u561b"}
	for changed := true; changed; {
		changed = false
		for _, suffix := range suffixes {
			if strings.HasSuffix(compact, suffix) {
				compact = strings.TrimSuffix(compact, suffix)
				changed = true
			}
		}
	}

	if compact == "" {
		return ""
	}
	if known := knownCityCode(compact); known != "" {
		return known
	}

	city := strings.TrimSuffix(compact, "\u5e02")
	if !hanCityTokenRe.MatchString(city) {
		return ""
	}
	if cityStopwordSet[city] {
		return ""
	}
	if cityKeywordRe.MatchString(city) {
		return ""
	}
	return normalizeCity(city)
}

func normalizeBudget(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	if text == "" {
		return ""
	}
	if strings.Contains(text, "low") || strings.Contains(text, "\u7701") || strings.Contains(text, "\u8282\u7ea6") {
		return "low"
	}
	if strings.Contains(text, "high") || strings.Contains(text, "\u9ad8") || strings.Contains(text, "\u4f53\u9a8c") {
		return "high"
	}
	if strings.Contains(text, "medium") || strings.Contains(text, "\u4e2d") || strings.Contains(text, "\u9002\u4e2d") {
		return "medium"
	}
	return ""
}

func normalizePace(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	if text == "" {
		return ""
	}
	if strings.Contains(text, "relaxed") || strings.Contains(text, "\u8f7b\u677e") || strings.Contains(text, "\u6162") {
		return "relaxed"
	}
	if strings.Contains(text, "compact") || strings.Contains(text, "\u7d27\u51d1") || strings.Contains(text, "\u9ad8\u6548") {
		return "compact"
	}
	return ""
}

func normalizeDate(value string) string {
	text := strings.TrimSpace(value)
	if text == "" {
		return ""
	}
	replaced := strings.NewReplacer("\u5e74", "-", "\u6708", "-", "\u65e5", "", "/", "-").Replace(text)
	parts := strings.Split(replaced, "-")
	if len(parts) != 3 {
		return ""
	}
	y := strings.TrimSpace(parts[0])
	m := strings.TrimSpace(parts[1])
	d := strings.TrimSpace(parts[2])
	if len(y) != 4 || !strings.HasPrefix(y, "20") {
		return ""
	}
	if m == "" || d == "" {
		return ""
	}
	if len(m) == 1 {
		m = "0" + m
	}
	if len(d) == 1 {
		d = "0" + d
	}
	candidate := fmt.Sprintf("%s-%s-%s", y, m, d)
	if !isISODate(candidate) {
		return ""
	}
	return candidate
}

func parseDayCountToken(value string) (int, bool) {
	token := strings.TrimSpace(strings.ToLower(value))
	if token == "" {
		return 0, false
	}

	if days, ok := asInt(token); ok {
		return days, true
	}

	token = strings.NewReplacer("兩", "两", "個", "", "个", "").Replace(token)
	token = strings.TrimPrefix(token, "第")
	if token == "" {
		return 0, false
	}

	if token == "十" {
		return 10, true
	}

	if strings.Contains(token, "十") {
		parts := strings.Split(token, "十")
		if len(parts) != 2 {
			return 0, false
		}
		tens := 1
		if parts[0] != "" {
			n, ok := parseSingleChineseDigit(parts[0])
			if !ok {
				return 0, false
			}
			tens = n
		}

		ones := 0
		if parts[1] != "" {
			n, ok := parseSingleChineseDigit(parts[1])
			if !ok {
				return 0, false
			}
			ones = n
		}
		return tens*10 + ones, true
	}

	return parseSingleChineseDigit(token)
}

func parseSingleChineseDigit(value string) (int, bool) {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) != 1 {
		return 0, false
	}
	n, ok := chineseDigitMap[runes[0]]
	return n, ok
}
