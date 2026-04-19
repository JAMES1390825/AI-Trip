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

type LLMConfig struct {
	BaseURL   string
	APIToken  string
	ModelName string
	TimeoutMs int
}

type LLMService struct {
	baseURL   string
	apiToken  string
	modelName string
	client    *http.Client
}

func NewLLMService(cfg LLMConfig) *LLMService {
	timeout := time.Duration(cfg.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 4 * time.Second
	}

	return &LLMService{
		baseURL:   strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/"),
		apiToken:  strings.TrimSpace(cfg.APIToken),
		modelName: strings.TrimSpace(cfg.ModelName),
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

func (s *LLMService) postJSON(ctx context.Context, path string, body any, out any) error {
	if s == nil || strings.TrimSpace(s.baseURL) == "" {
		return fmt.Errorf("llm service disabled")
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.apiToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.apiToken)
	}
	if s.modelName != "" {
		req.Header.Set("X-LLM-Model", s.modelName)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("llm service %s failed with %d", path, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return err
	}
	return nil
}

func (s *LLMService) EnhancePlanningBrief(ctx context.Context, userID string, input planningBriefRequest, fallback PlanningBriefResponse) (aiPlanningBriefEnhancementResponse, error) {
	if s == nil || strings.TrimSpace(s.baseURL) == "" {
		return fallbackPlanningBriefEnhancement(fallback), nil
	}

	response := aiPlanningBriefEnhancementResponse{}
	err := s.postJSON(ctx, "/v1/brief/enhance", aiPlanningBriefEnhancementRequest{
		UserID:           userID,
		Input:            input,
		FallbackResponse: fallback,
	}, &response)
	return response, err
}

func (s *LLMService) EnhanceChatIntake(ctx context.Context, userID string, history []ChatTurn, draft map[string]any, fallback map[string]any) (aiChatEnhancementResponse, error) {
	if s == nil || strings.TrimSpace(s.baseURL) == "" {
		return fallbackChatEnhancement(fallback), nil
	}

	response := aiChatEnhancementResponse{}
	err := s.postJSON(ctx, "/v1/chat/enhance", aiChatEnhancementRequest{
		UserID:           userID,
		History:          history,
		DraftPlanRequest: draft,
		FallbackResponse: fallback,
	}, &response)
	return response, err
}

func (s *LLMService) ExplainItinerary(ctx context.Context, userID string, brief PlanningBrief, itinerary map[string]any) (aiItineraryExplainResponse, error) {
	if s == nil || strings.TrimSpace(s.baseURL) == "" {
		return aiItineraryExplainResponse{}, nil
	}

	response := aiItineraryExplainResponse{}
	err := s.postJSON(ctx, "/v1/itinerary/explain", aiItineraryExplainRequest{
		UserID:        userID,
		PlanningBrief: brief,
		Itinerary:     itinerary,
	}, &response)
	return response, err
}

func fallbackPlanningBriefEnhancement(fallback PlanningBriefResponse) aiPlanningBriefEnhancementResponse {
	return aiPlanningBriefEnhancementResponse{
		AssistantMessage:      fallback.AssistantMessage,
		NextAction:            fallback.NextAction,
		ClarificationQuestion: fallback.ClarificationQuestion,
		SuggestedOptions:      append([]string{}, fallback.SuggestedOptions...),
		Constraints:           fallback.PlanningBrief.Constraints,
		SourceMode:            fallback.SourceMode,
	}
}

func fallbackChatEnhancement(fallback map[string]any) aiChatEnhancementResponse {
	return aiChatEnhancementResponse{
		AssistantMessage: strings.TrimSpace(asString(fallback["assistant_message"])),
		SuggestedOptions: asStringSlice(fallback["suggested_options"]),
		NextAction:       strings.TrimSpace(asString(fallback["next_action"])),
		Confidence:       asFloat(fallback["confidence"], 0),
		SourceMode:       strings.TrimSpace(asString(fallback["source_mode"])),
	}
}
