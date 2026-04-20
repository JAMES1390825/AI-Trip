package app

import (
	"context"
	"strings"
	"testing"
)

func TestInProcessLLMServiceReturnsFallbackBriefEnhancementWhenNoModelKey(t *testing.T) {
	service := NewLLMService(LLMConfig{})

	result, err := service.EnhancePlanningBrief(context.Background(), "u-1", planningBriefRequest{}, PlanningBriefResponse{
		AssistantMessage: "fallback",
	})
	if err != nil {
		t.Fatalf("enhance planning brief: %v", err)
	}

	if strings.TrimSpace(result.AssistantMessage) == "" {
		t.Fatalf("expected assistant message")
	}
}
