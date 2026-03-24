package app

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

var requiredFields = []string{"origin_city", "destination", "days", "budget_level", "start_date", "pace"}

var cityAlias = map[string][]string{
	"beijing":   {"\u5317\u4eac", "beijing", "\u5317\u4eac\u5e02"},
	"tianjin":   {"\u5929\u6d25", "tianjin", "\u5929\u6d25\u5e02"},
	"shanghai":  {"\u4e0a\u6d77", "shanghai", "\u4e0a\u6d77\u5e02"},
	"hangzhou":  {"\u676d\u5dde", "hangzhou", "\u676d\u5dde\u5e02"},
	"chengdu":   {"\u6210\u90fd", "chengdu", "\u6210\u90fd\u5e02"},
	"guangzhou": {"\u5e7f\u5dde", "guangzhou", "\u5e7f\u5dde\u5e02"},
	"shenzhen":  {"\u6df1\u5733", "shenzhen", "\u6df1\u5733\u5e02"},
	"xi_an":     {"\u897f\u5b89", "xian", "xi'an", "xi an", "\u897f\u5b89\u5e02"},
	"shaoxing":  {"\u7ecd\u5174", "shaoxing", "\u7ecd\u5174\u5e02"},
	"suzhou":    {"\u82cf\u5dde", "suzhou", "\u82cf\u5dde\u5e02"},
	"wuhan":     {"\u6b66\u6c49", "wuhan", "\u6b66\u6c49\u5e02"},
	"nanjing":   {"\u5357\u4eac", "nanjing", "\u5357\u4eac\u5e02"},
}

var cityDisplay = map[string]string{
	"beijing":   "\u5317\u4eac",
	"tianjin":   "\u5929\u6d25",
	"shanghai":  "\u4e0a\u6d77",
	"hangzhou":  "\u676d\u5dde",
	"chengdu":   "\u6210\u90fd",
	"guangzhou": "\u5e7f\u5dde",
	"shenzhen":  "\u6df1\u5733",
	"xi_an":     "\u897f\u5b89",
	"shaoxing":  "\u7ecd\u5174",
	"suzhou":    "\u82cf\u5dde",
	"wuhan":     "\u6b66\u6c49",
	"nanjing":   "\u5357\u4eac",
}

var (
	originFromRe    = regexp.MustCompile("\u4ece\\s*([A-Za-z\\p{Han}]{2,20}?)(?:\\s*(?:\u51fa\u53d1|\u53bb|\u5230|\u73a9|\u901b|\u65c5\u6e38|\u65c5\u884c)|$|[\uFF0C,\u3002.!\uFF01?\uFF1F])")
	originRe        = regexp.MustCompile("([A-Za-z\\p{Han}]{2,20})\\s*\u51fa\u53d1")
	destinationGoRe = regexp.MustCompile("\u53bb\\s*([A-Za-z\\p{Han}]{2,20})")
	destinationToRe = regexp.MustCompile("\u5230\\s*([A-Za-z\\p{Han}]{2,20})")
	daysRe          = regexp.MustCompile("(\\d{1,2})\\s*\u5929")
	dateRe          = regexp.MustCompile("(20\\d{2})[-/\u5e74](\\d{1,2})[-/\u6708](\\d{1,2})")
	hanCityTokenRe  = regexp.MustCompile("^[\\p{Han}]{2,4}$")
	cityKeywordRe   = regexp.MustCompile("[\u4ece\u53bb\u5230\u73a9\u5929\u9884\u7b97\u8282\u594f\u51fa\u53d1\u65c5\u6e38\u65c5\u884c]")
)

var cityStopwordSet = map[string]bool{
	"\u4f60\u597d": true,
	"\u60a8\u597d": true,
	"\u54c8\u55bd": true,
	"\u8c22\u8c22": true,
	"\u597d\u7684": true,
	"\u53ef\u4ee5": true,
	"\u5b89\u6392": true,
	"\u884c\u7a0b": true,
	"\u65c5\u884c": true,
	"\u65c5\u6e38": true,
	"\u7ee7\u7eed": true,
	"\u51fa\u53d1": true,
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
		if match := daysRe.FindStringSubmatch(text); len(match) > 1 {
			if days, ok := asInt(match[1]); ok && days >= 1 && days <= 14 {
				next["days"] = days
			}
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

func hasValue(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case string:
		return strings.TrimSpace(v) != ""
	default:
		if _, ok := asInt(v); ok {
			return true
		}
		return strings.TrimSpace(asString(v)) != ""
	}
}

func fieldJustFilled(before, after any) bool {
	return !hasValue(before) && hasValue(after)
}

func fieldConfirmLabel(field string, value any) string {
	switch field {
	case "origin_city":
		return fmt.Sprintf("\u51fa\u53d1\u5730\u8bb0\u4e3a%s", cityLabel(value))
	case "destination":
		return fmt.Sprintf("\u76ee\u7684\u5730\u8bb0\u4e3a%s", cityLabel(value))
	case "days":
		if days, ok := asInt(value); ok && days > 0 {
			return fmt.Sprintf("%d\u5929", days)
		}
		return ""
	case "budget_level":
		return fmt.Sprintf("\u9884\u7b97\u504f\u597d\u4e3a%s", budgetLabel(value))
	case "start_date":
		t := strings.TrimSpace(asString(value))
		if t == "" {
			return ""
		}
		return fmt.Sprintf("\u51fa\u53d1\u65e5\u671f\u4e3a%s", t)
	case "pace":
		return fmt.Sprintf("\u8282\u594f\u504f\u597d\u4e3a%s", paceLabel(value))
	default:
		return ""
	}
}

func composeAssistantMessage(previous, updated map[string]any, missing []string) string {
	confirmations := make([]string, 0, len(requiredFields))
	for _, field := range requiredFields {
		if fieldJustFilled(previous[field], updated[field]) {
			label := fieldConfirmLabel(field, updated[field])
			if label != "" {
				confirmations = append(confirmations, label)
			}
		}
	}

	detail := strings.Join(confirmations, "\uff0c")
	style := (len(confirmations)*2 + len(missing)) % 3

	if len(missing) == 0 {
		if len(confirmations) > 0 {
			switch style {
			case 0:
				return "\u592a\u597d\u4e86\uff0c" + detail + "\u3002\u4fe1\u606f\u9f50\u5168\u4e86\uff0c\u4f60\u53ef\u4ee5\u5f00\u59cb\u751f\u6210\u884c\u7a0b\u3002"
			case 1:
				return "\u660e\u767d\u4e86\uff0c" + detail + "\u3002\u73b0\u5728\u4fe1\u606f\u90fd\u9f50\u4e86\uff0c\u53ef\u4ee5\u76f4\u63a5\u751f\u6210\u884c\u7a0b\u3002"
			default:
				return "\u6536\u5230\uff0c" + detail + "\u3002\u6761\u4ef6\u5df2\u7ecf\u5b8c\u6574\uff0c\u70b9\u4e00\u4e0b\u5c31\u80fd\u751f\u6210\u884c\u7a0b\u3002"
			}
		}
		return "\u4fe1\u606f\u9f50\u5168\u4e86\uff0c\u4f60\u53ef\u4ee5\u5f00\u59cb\u751f\u6210\u884c\u7a0b\u3002"
	}

	question := questionForField(missing[0])
	if len(confirmations) > 0 {
		switch style {
		case 0:
			return "\u6536\u5230\uff0c" + detail + "\u3002" + question
		case 1:
			return "\u597d\u561e\uff0c" + detail + "\u3002\u63a5\u4e0b\u6765\u60f3\u518d\u786e\u8ba4\u4e00\u4e0b\uff1a" + question
		default:
			return "\u660e\u767d\uff0c" + detail + "\u3002\u90a3\u6211\u4eec\u7ee7\u7eed\uff1a" + question
		}
	}
	switch style {
	case 0:
		return "\u597d\u7684\uff0c" + question
	case 1:
		return "\u6211\u4eec\u7ee7\u7eed\uff0c" + question
	default:
		return question
	}
}

func questionForField(field string) string {
	switch field {
	case "origin_city":
		return "\u4f60\u4ece\u54ea\u5ea7\u57ce\u5e02\u51fa\u53d1\uff1f"
	case "destination":
		return "\u8fd9\u6b21\u6700\u60f3\u53bb\u54ea\u5ea7\u57ce\u5e02\u73a9\uff1f"
	case "days":
		return "\u8ba1\u5212\u73a9\u51e0\u5929\uff1f"
	case "budget_level":
		return "\u9884\u7b97\u66f4\u504f\u7701\u94b1\u3001\u9002\u4e2d\u8fd8\u662f\u4f53\u9a8c\u4f18\u5148\uff1f"
	case "start_date":
		return "\u9884\u8ba1\u54ea\u5929\u51fa\u53d1\uff1f"
	case "pace":
		return "\u4f60\u5e0c\u671b\u8f7b\u677e\u6162\u6e38\u8fd8\u662f\u7d27\u51d1\u9ad8\u6548\uff1f"
	default:
		return "\u518d\u8865\u5145\u4e00\u70b9\u4fe1\u606f\uff0c\u6211\u5c31\u53ef\u4ee5\u7ee7\u7eed\u3002"
	}
}

func optionsForField(field string) []string {
	switch field {
	case "origin_city":
		return []string{"\u5317\u4eac", "\u4e0a\u6d77", "\u676d\u5dde"}
	case "destination":
		return []string{"\u5317\u4eac", "\u4e0a\u6d77", "\u6210\u90fd"}
	case "days":
		return []string{"2\u5929", "3\u5929", "4\u5929"}
	case "budget_level":
		return []string{"\u8282\u7701\u9884\u7b97", "\u9002\u4e2d\u9884\u7b97", "\u4f53\u9a8c\u4f18\u5148"}
	case "start_date":
		return []string{time.Now().AddDate(0, 0, 7).Format("2006-01-02"), time.Now().AddDate(0, 0, 14).Format("2006-01-02")}
	case "pace":
		return []string{"\u8f7b\u677e\u6162\u6e38", "\u7d27\u51d1\u9ad8\u6548"}
	default:
		return []string{"\u7ee7\u7eed"}
	}
}

func nextChatResponse(history []ChatTurn, draft map[string]any, userID string) map[string]any {
	normalized := normalizeDraft(draft, userID)
	updated := fillDraftFromMessage(normalized, firstUserMessage(history))
	missing := missingDraftFields(updated)
	ready := len(missing) == 0

	message := composeAssistantMessage(normalized, updated, missing)
	suggestions := []string{"\u7acb\u5373\u751f\u6210\u884c\u7a0b", "\u518d\u8865\u5145\u4e00\u70b9\u504f\u597d"}
	nextAction := "READY_TO_GENERATE"
	nextQuestion := any(nil)
	confidence := 0.86

	if !ready {
		suggestions = optionsForField(missing[0])
		nextAction = "ASK_ONE_QUESTION"
		nextQuestion = questionForField(missing[0])
		confidence = 0.62
	}

	return map[string]any{
		"assistant_message":    message,
		"updated_draft":        updated,
		"missing_fields":       missing,
		"suggested_options":    suggestions,
		"ready_to_generate":    ready,
		"confidence":           confidence,
		"fallback_mode":        "rules",
		"intent":               "task",
		"assistant_mode":       "planner",
		"next_action":          nextAction,
		"next_question":        nextQuestion,
		"soft_handoff_to_task": false,
	}
}
