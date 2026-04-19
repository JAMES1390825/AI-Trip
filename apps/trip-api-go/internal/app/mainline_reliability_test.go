package app

import "testing"

func TestNormalizeMainlineDegradedReasonUsesValidationFailureWhenProviderLooksGrounded(t *testing.T) {
	reason := normalizeMainlineDegradedReason(false, ValidationResult{Passed: false}, "provider", "")
	if reason != mainlineDegradedReasonValidationNotPassed {
		t.Fatalf("expected %q, got %q", mainlineDegradedReasonValidationNotPassed, reason)
	}
}

func TestBuildMainlineGenerateV2ResponseAggregatesTopLevelDegradedState(t *testing.T) {
	response := buildMainlineGenerateV2Response([]map[string]any{
		{
			"plan_variant": "balanced",
			"itinerary": map[string]any{
				"degraded":        true,
				"degraded_reason": mainlineDegradedReasonProviderCoverageLow,
			},
		},
	})

	if !asBool(response["degraded"]) {
		t.Fatalf("expected top-level degraded=true")
	}
	if asString(response["degraded_reason"]) != mainlineDegradedReasonProviderCoverageLow {
		t.Fatalf("expected degraded_reason %q, got %q", mainlineDegradedReasonProviderCoverageLow, asString(response["degraded_reason"]))
	}
}
