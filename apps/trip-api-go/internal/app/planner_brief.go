package app

import "strings"

type planningBriefRequest struct {
	OriginCity          string             `json:"origin_city"`
	DestinationText     string             `json:"destination_text"`
	SelectedDestination *DestinationEntity `json:"selected_destination"`
	Days                int                `json:"days"`
	StartDate           string             `json:"start_date"`
	BudgetLevel         string             `json:"budget_level"`
	Pace                string             `json:"pace"`
	TravelStyles        []string           `json:"travel_styles"`
	MustGo              []string           `json:"must_go"`
	Avoid               []string           `json:"avoid"`
	FreeText            string             `json:"free_text"`
}

func buildPlanningBrief(input planningBriefRequest) PlanningBriefResponse {
	originCity := normalizeCity(input.OriginCity)
	destinationText := strings.TrimSpace(input.DestinationText)
	destination := canonicalizeBriefDestination(input.SelectedDestination, destinationText)
	days := 0
	if input.Days >= 1 && input.Days <= 14 {
		days = input.Days
	}

	budgetLevel := normalizeBudget(input.BudgetLevel)
	if budgetLevel == "" {
		budgetLevel = "medium"
	}
	pace := normalizePace(input.Pace)
	if pace == "" {
		pace = "relaxed"
	}

	freeText := strings.TrimSpace(input.FreeText)
	travelStyles := uniqueStrings(input.TravelStyles)
	mustGo := uniqueStrings(append(input.MustGo, inferMustGoFromText(freeText)...))
	avoid := uniqueStrings(append(input.Avoid, inferAvoidFromText(freeText)...))

	brief := PlanningBrief{
		OriginCity:   originCity,
		Destination:  destination,
		Days:         days,
		StartDate:    normalizeDate(input.StartDate),
		BudgetLevel:  budgetLevel,
		Pace:         pace,
		TravelStyles: travelStyles,
		MustGo:       mustGo,
		Avoid:        avoid,
		Constraints:  inferPlanningConstraints(freeText, travelStyles),
	}

	brief.MissingFields = missingBriefFields(brief)
	brief.ReadyToGenerate = len(brief.MissingFields) == 0

	assistantMessage, nextAction := briefAssistantState(brief)
	clarificationQuestion := briefClarificationQuestion(brief)
	suggestedOptions := briefSuggestedOptions(brief)
	return PlanningBriefResponse{
		PlanningBrief:         brief,
		AssistantMessage:      assistantMessage,
		NextAction:            nextAction,
		ClarificationQuestion: clarificationQuestion,
		SuggestedOptions:      suggestedOptions,
		SourceMode:            "rules",
		Degraded:              !brief.ReadyToGenerate,
	}
}

func canonicalizeBriefDestination(selected *DestinationEntity, destinationText string) *DestinationEntity {
	if sanitized := sanitizeDestinationEntity(selected); sanitized != nil {
		return sanitized
	}

	trimmedText := strings.TrimSpace(destinationText)
	if trimmedText == "" {
		return nil
	}

	resolved := resolveDestinations(trimmedText, 1)
	if resolved.Degraded || len(resolved.Items) == 0 {
		return nil
	}
	return sanitizeDestinationEntity(&resolved.Items[0])
}

func sanitizeDestinationEntity(input *DestinationEntity) *DestinationEntity {
	if input == nil {
		return nil
	}

	next := &DestinationEntity{
		DestinationID:    strings.TrimSpace(input.DestinationID),
		DestinationLabel: strings.TrimSpace(input.DestinationLabel),
		Country:          strings.TrimSpace(input.Country),
		Region:           strings.TrimSpace(input.Region),
		Adcode:           strings.TrimSpace(input.Adcode),
		CityCode:         strings.TrimSpace(input.CityCode),
		CenterLat:        input.CenterLat,
		CenterLng:        input.CenterLng,
		Provider:         strings.TrimSpace(input.Provider),
		ProviderPlaceID:  strings.TrimSpace(input.ProviderPlaceID),
		MatchType:        strings.TrimSpace(input.MatchType),
	}

	if next.DestinationLabel == "" || next.DestinationID == "" {
		return nil
	}
	if next.Provider == "" || next.Provider == "custom" || next.MatchType == "custom" {
		return nil
	}
	return next
}

func missingBriefFields(brief PlanningBrief) []string {
	missing := make([]string, 0, 4)
	if strings.TrimSpace(brief.OriginCity) == "" {
		missing = append(missing, "origin_city")
	}
	if brief.Destination == nil {
		missing = append(missing, "destination")
	}
	if brief.Days <= 0 {
		missing = append(missing, "days")
	}
	if strings.TrimSpace(brief.StartDate) == "" {
		missing = append(missing, "start_date")
	}
	return missing
}

func briefAssistantState(brief PlanningBrief) (string, string) {
	if brief.ReadyToGenerate {
		return "已理解你的核心偏好，可以开始生成真实路线。", "GENERATE"
	}
	if len(brief.MissingFields) == 0 {
		return "我还需要你补充一点信息。", "COMPLETE_FORM"
	}

	switch brief.MissingFields[0] {
	case "destination":
		return "我还需要你先确认目的地城市。", "CONFIRM_DESTINATION"
	case "days":
		return "我还需要你确认出行天数。", "CONFIRM_DAYS"
	case "start_date":
		return "我还需要你补一个开始日期。", "CONFIRM_START_DATE"
	case "origin_city":
		return "我还需要你补充出发城市。", "CONFIRM_ORIGIN"
	default:
		return "我还需要你补充一点信息。", "COMPLETE_FORM"
	}
}

func briefClarificationQuestion(brief PlanningBrief) string {
	if brief.ReadyToGenerate || len(brief.MissingFields) == 0 {
		return ""
	}
	return questionForField(brief.MissingFields[0])
}

func briefSuggestedOptions(brief PlanningBrief) []string {
	if brief.ReadyToGenerate || len(brief.MissingFields) == 0 {
		return nil
	}
	return uniqueStrings(optionsForField(brief.MissingFields[0]))
}

func inferPlanningConstraints(freeText string, travelStyles []string) PlanningConstraints {
	text := strings.ToLower(strings.TrimSpace(freeText))
	constraints := PlanningConstraints{}

	if strings.Contains(text, "雨") || strings.Contains(text, "下雨") || strings.Contains(text, "雨天") || strings.Contains(text, "室内") {
		constraints.WeatherPreference = "rain_friendly"
	}
	if strings.Contains(text, "本地餐馆") || strings.Contains(text, "本地小馆") || strings.Contains(text, "local food") || strings.Contains(text, "local") {
		constraints.DiningPreference = "local_food"
	}
	if constraints.DiningPreference == "" {
		for _, style := range travelStyles {
			normalized := strings.ToLower(strings.TrimSpace(style))
			if normalized == "美食" || normalized == "吃吃喝喝" || normalized == "food" {
				constraints.DiningPreference = "local_food"
				break
			}
		}
	}
	if match := lodgingAnchorFromText(freeText); match != "" {
		constraints.LodgingAnchor = match
	}

	return constraints
}

func lodgingAnchorFromText(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return ""
	}

	patterns := []string{
		"住在",
		"酒店在",
		"住宿在",
		"民宿在",
	}
	for _, pattern := range patterns {
		idx := strings.Index(trimmed, pattern)
		if idx < 0 {
			continue
		}
		remainder := strings.TrimSpace(trimmed[idx+len(pattern):])
		remainder = splitAtBriefPunctuation(remainder)
		if len([]rune(remainder)) >= 2 {
			return remainder
		}
	}
	return ""
}

func inferMustGoFromText(text string) []string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil
	}

	patterns := []string{
		"必须去",
		"一定去",
		"想去",
		"想打卡",
		"打卡",
		"安排",
	}
	out := make([]string, 0, 3)
	for _, pattern := range patterns {
		idx := strings.Index(trimmed, pattern)
		if idx < 0 {
			continue
		}
		remainder := strings.TrimSpace(trimmed[idx+len(pattern):])
		remainder = splitAtBriefPunctuation(remainder)
		if len([]rune(remainder)) >= 2 {
			out = append(out, remainder)
		}
	}
	return uniqueStrings(out)
}

func inferAvoidFromText(text string) []string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return nil
	}

	patterns := []string{
		"避开",
		"不要",
		"别去",
	}
	out := make([]string, 0, 3)
	for _, pattern := range patterns {
		idx := strings.Index(trimmed, pattern)
		if idx < 0 {
			continue
		}
		remainder := strings.TrimSpace(trimmed[idx+len(pattern):])
		remainder = splitAtBriefPunctuation(remainder)
		if len([]rune(remainder)) >= 2 {
			out = append(out, remainder)
		}
	}
	return uniqueStrings(out)
}

func splitAtBriefPunctuation(text string) string {
	if text == "" {
		return ""
	}
	separators := []string{"，", "。", "；", ",", ".", ";", "\n"}
	shortest := text
	for _, separator := range separators {
		if idx := strings.Index(shortest, separator); idx >= 0 {
			shortest = strings.TrimSpace(shortest[:idx])
		}
	}
	return strings.TrimSpace(shortest)
}
