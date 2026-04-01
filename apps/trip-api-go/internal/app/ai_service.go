package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type AIServiceClient struct {
	baseURL  string
	apiToken string
	client   *http.Client
}

type aiPlanningBriefEnhancementRequest struct {
	UserID           string                `json:"user_id,omitempty"`
	Input            planningBriefRequest  `json:"input"`
	FallbackResponse PlanningBriefResponse `json:"fallback_response"`
}

type aiPlanningBriefEnhancementResponse struct {
	AssistantMessage       string              `json:"assistant_message"`
	NextAction             string              `json:"next_action,omitempty"`
	ClarificationQuestion  string              `json:"clarification_question,omitempty"`
	SuggestedOptions       []string            `json:"suggested_options,omitempty"`
	Constraints            PlanningConstraints `json:"constraints"`
	MustGoAdditions        []string            `json:"must_go_additions,omitempty"`
	AvoidAdditions         []string            `json:"avoid_additions,omitempty"`
	TravelStyleSuggestions []string            `json:"travel_style_suggestions,omitempty"`
	SourceMode             string              `json:"source_mode,omitempty"`
}

type aiChatEnhancementRequest struct {
	UserID           string         `json:"user_id,omitempty"`
	History          []ChatTurn     `json:"history"`
	DraftPlanRequest map[string]any `json:"draft_plan_request"`
	FallbackResponse map[string]any `json:"fallback_response"`
}

type aiChatEnhancementResponse struct {
	AssistantMessage string   `json:"assistant_message"`
	SuggestedOptions []string `json:"suggested_options,omitempty"`
	NextAction       string   `json:"next_action,omitempty"`
	Confidence       float64  `json:"confidence,omitempty"`
	SourceMode       string   `json:"source_mode,omitempty"`
}

type aiItineraryExplainRequest struct {
	UserID        string         `json:"user_id,omitempty"`
	PlanningBrief PlanningBrief  `json:"planning_brief"`
	Itinerary     map[string]any `json:"itinerary"`
}

type aiBlockExplanation struct {
	DayIndex        int    `json:"day_index"`
	BlockID         string `json:"block_id"`
	RecommendReason string `json:"recommend_reason"`
}

type aiItineraryExplainResponse struct {
	DaySummaries      []map[string]any     `json:"day_summaries,omitempty"`
	TodayHint         map[string]any       `json:"today_hint,omitempty"`
	BlockExplanations []aiBlockExplanation `json:"block_explanations,omitempty"`
	SourceMode        string               `json:"source_mode,omitempty"`
}

func NewAIServiceClient(cfg AIServiceConfig) *AIServiceClient {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		return nil
	}
	timeout := time.Duration(cfg.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 4 * time.Second
	}
	return &AIServiceClient{
		baseURL:  baseURL,
		apiToken: strings.TrimSpace(cfg.APIToken),
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *AIServiceClient) postJSON(ctx context.Context, path string, body any, out any) error {
	if c == nil || strings.TrimSpace(c.baseURL) == "" {
		return fmt.Errorf("ai service disabled")
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiToken != "" {
		req.Header.Set("X-AI-Service-Key", c.apiToken)
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("ai service %s failed with %d", path, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return err
	}
	return nil
}

func (c *AIServiceClient) EnhancePlanningBrief(ctx context.Context, userID string, input planningBriefRequest, fallback PlanningBriefResponse) (aiPlanningBriefEnhancementResponse, error) {
	response := aiPlanningBriefEnhancementResponse{}
	err := c.postJSON(ctx, "/v1/brief/enhance", aiPlanningBriefEnhancementRequest{
		UserID:           userID,
		Input:            input,
		FallbackResponse: fallback,
	}, &response)
	return response, err
}

func (c *AIServiceClient) EnhanceChatIntake(ctx context.Context, userID string, history []ChatTurn, draft map[string]any, fallback map[string]any) (aiChatEnhancementResponse, error) {
	response := aiChatEnhancementResponse{}
	err := c.postJSON(ctx, "/v1/chat/enhance", aiChatEnhancementRequest{
		UserID:           userID,
		History:          history,
		DraftPlanRequest: draft,
		FallbackResponse: fallback,
	}, &response)
	return response, err
}

func (c *AIServiceClient) ExplainItinerary(ctx context.Context, userID string, brief PlanningBrief, itinerary map[string]any) (aiItineraryExplainResponse, error) {
	response := aiItineraryExplainResponse{}
	err := c.postJSON(ctx, "/v1/itinerary/explain", aiItineraryExplainRequest{
		UserID:        userID,
		PlanningBrief: brief,
		Itinerary:     itinerary,
	}, &response)
	return response, err
}

func mergePlanningBriefEnhancement(fallback PlanningBriefResponse, enhancement aiPlanningBriefEnhancementResponse) PlanningBriefResponse {
	next := fallback
	if message := strings.TrimSpace(enhancement.AssistantMessage); message != "" {
		next.AssistantMessage = message
	}
	if action := strings.TrimSpace(enhancement.NextAction); action != "" {
		next.NextAction = action
	}
	if question := strings.TrimSpace(enhancement.ClarificationQuestion); question != "" {
		next.ClarificationQuestion = question
	}
	if len(enhancement.SuggestedOptions) > 0 {
		next.SuggestedOptions = uniqueStrings(enhancement.SuggestedOptions)
	}
	if value := strings.TrimSpace(enhancement.Constraints.WeatherPreference); value != "" {
		next.PlanningBrief.Constraints.WeatherPreference = value
	}
	if value := strings.TrimSpace(enhancement.Constraints.DiningPreference); value != "" {
		next.PlanningBrief.Constraints.DiningPreference = value
	}
	if value := strings.TrimSpace(enhancement.Constraints.LodgingAnchor); value != "" {
		next.PlanningBrief.Constraints.LodgingAnchor = value
	}
	if len(enhancement.MustGoAdditions) > 0 {
		next.PlanningBrief.MustGo = uniqueStrings(append(next.PlanningBrief.MustGo, enhancement.MustGoAdditions...))
	}
	if len(enhancement.AvoidAdditions) > 0 {
		next.PlanningBrief.Avoid = uniqueStrings(append(next.PlanningBrief.Avoid, enhancement.AvoidAdditions...))
	}
	if len(enhancement.TravelStyleSuggestions) > 0 {
		next.PlanningBrief.TravelStyles = uniqueStrings(append(next.PlanningBrief.TravelStyles, enhancement.TravelStyleSuggestions...))
	}
	if sourceMode := strings.TrimSpace(enhancement.SourceMode); sourceMode != "" {
		next.SourceMode = sourceMode
	}
	return next
}

func mergeChatEnhancement(fallback map[string]any, enhancement aiChatEnhancementResponse) map[string]any {
	next := deepCloneMap(fallback)
	if message := strings.TrimSpace(enhancement.AssistantMessage); message != "" {
		next["assistant_message"] = message
	}
	if len(enhancement.SuggestedOptions) > 0 {
		next["suggested_options"] = uniqueStrings(enhancement.SuggestedOptions)
	}
	if action := strings.TrimSpace(enhancement.NextAction); action != "" {
		next["next_action"] = action
	}
	if enhancement.Confidence > 0 {
		next["confidence"] = enhancement.Confidence
	}
	if sourceMode := strings.TrimSpace(enhancement.SourceMode); sourceMode != "" {
		next["source_mode"] = sourceMode
	}
	return next
}

func applyItineraryExplainEnhancement(itinerary map[string]any, enhancement aiItineraryExplainResponse) {
	if itinerary == nil {
		return
	}
	if len(enhancement.DaySummaries) > 0 {
		items := make([]map[string]any, 0, len(enhancement.DaySummaries))
		for _, item := range enhancement.DaySummaries {
			if len(item) == 0 {
				continue
			}
			items = append(items, item)
		}
		if len(items) > 0 {
			itinerary["day_summaries"] = items
		}
	}
	if len(enhancement.TodayHint) > 0 {
		itinerary["today_hint"] = enhancement.TodayHint
	}

	blocksByID := map[string]map[string]any{}
	for _, dayItem := range asSlice(itinerary["days"]) {
		day := asMap(dayItem)
		for _, blockItem := range asSlice(day["blocks"]) {
			block := asMap(blockItem)
			blockID := strings.TrimSpace(asString(block["block_id"]))
			if blockID == "" {
				continue
			}
			blocksByID[blockID] = block
		}
	}
	for _, item := range enhancement.BlockExplanations {
		if strings.TrimSpace(item.BlockID) == "" || strings.TrimSpace(item.RecommendReason) == "" {
			continue
		}
		block, ok := blocksByID[item.BlockID]
		if !ok {
			continue
		}
		block["recommend_reason"] = item.RecommendReason
		reason := asMap(block["reason"])
		reason["note"] = item.RecommendReason
		block["reason"] = reason
	}
	if sourceMode := strings.TrimSpace(enhancement.SourceMode); sourceMode != "" {
		itinerary["explain_source_mode"] = sourceMode
	}
}

func (a *App) buildPlanningBriefResponse(ctx context.Context, input planningBriefRequest, userID string) PlanningBriefResponse {
	response := buildPlanningBrief(input)
	response = a.enrichPlanningBriefDestination(ctx, input, response)
	if a == nil || a.ai == nil {
		return response
	}
	enhancement, err := a.ai.EnhancePlanningBrief(ctx, userID, input, response)
	if err != nil {
		return response
	}
	return mergePlanningBriefEnhancement(response, enhancement)
}

func (a *App) nextChatResponsePayload(ctx context.Context, history []ChatTurn, draft map[string]any, userID string) map[string]any {
	response := nextChatResponse(history, draft, userID)
	if a == nil || a.ai == nil {
		return response
	}
	enhancement, err := a.ai.EnhanceChatIntake(ctx, userID, history, draft, response)
	if err != nil {
		return response
	}
	return mergeChatEnhancement(response, enhancement)
}

func (a *App) buildV2VariantItinerary(ctx context.Context, brief PlanningBrief, userID, variant string) map[string]any {
	return a.buildV2VariantItineraryWithOptions(ctx, brief, userID, variant, PlanGenerateOptions{})
}

func (a *App) buildV2VariantItineraryWithOptions(ctx context.Context, brief PlanningBrief, userID, variant string, options PlanGenerateOptions) map[string]any {
	itinerary, ok := a.buildProviderV2VariantItineraryWithOptions(ctx, brief, userID, variant, options)
	if !ok {
		itinerary = generateV2VariantItinerary(brief, userID, variant)
	}
	itinerary = a.groundV2Itinerary(ctx, brief, itinerary)
	if a != nil && a.store != nil && brief.Destination != nil && len(asMap(itinerary["community_reference_summary"])) == 0 {
		summary := a.store.BuildCommunityPlanningSummary(brief.Destination, brief.Destination.DestinationLabel, options.CommunityPostIDs, 8)
		if summary.PublishedPostCount > 0 {
			itinerary["community_reference_summary"] = communityPlanningSummaryMap(summary)
			itinerary["community_signal_mode"] = communitySignalMode(summary)
			requestSnapshot := asMap(itinerary["request_snapshot"])
			requestSnapshot["community_reference_summary"] = communityPlanningSummaryMap(summary)
			requestSnapshot["community_post_ids"] = uniqueStrings(append([]string{}, options.CommunityPostIDs...))
			itinerary["request_snapshot"] = requestSnapshot
		}
	}
	attachDataDiagnostics(itinerary)
	attachMobileSummaryFields(itinerary)
	if a != nil && a.store != nil {
		settings := a.store.GetPersonalizationSettings(userID)
		profile, _, ok := a.store.GetEffectivePrivateProfile(userID)
		if !ok {
			profile = UserPrivateProfile{}
		}
		attachPersonalizationSummary(itinerary, settings, profile)
	}
	if a == nil || a.ai == nil {
		return itinerary
	}
	enhancement, err := a.ai.ExplainItinerary(ctx, userID, brief, itinerary)
	if err != nil {
		return itinerary
	}
	applyItineraryExplainEnhancement(itinerary, enhancement)
	return itinerary
}
