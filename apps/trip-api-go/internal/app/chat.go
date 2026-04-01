package app

// nextChatResponse keeps the top-level chat flow orchestration.
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
		"source_mode":          "rules",
		"intent":               "task",
		"assistant_mode":       "planner",
		"next_action":          nextAction,
		"next_question":        nextQuestion,
		"soft_handoff_to_task": false,
	}
}
