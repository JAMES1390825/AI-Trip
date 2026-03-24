package app

import "testing"

func buildValidationItinerary() map[string]any {
	return generateItinerary(PlanRequest{
		Destination: "beijing",
		Days:        2,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	})
}

func TestValidateReplanPatchRejectsUnsupportedChangeType(t *testing.T) {
	itinerary := buildValidationItinerary()
	patch := map[string]any{"change_type": "unknown"}

	err := validateReplanPatch(itinerary, patch)
	if err == nil {
		t.Fatalf("expected validation error for unsupported change_type")
	}
	if err.Code != "BAD_REQUEST" {
		t.Fatalf("expected BAD_REQUEST, got %q", err.Code)
	}
}

func TestValidateReplanPatchRejectsInvalidWindow(t *testing.T) {
	itinerary := buildValidationItinerary()
	patch := map[string]any{
		"change_type": "replan_window",
		"targets": []any{
			map[string]any{"day_index": 0, "start_hour": 18, "end_hour": 14},
		},
	}

	err := validateReplanPatch(itinerary, patch)
	if err == nil {
		t.Fatalf("expected invalid window error")
	}
}

func TestValidateReplanPatchRejectsInvalidBudget(t *testing.T) {
	itinerary := buildValidationItinerary()
	patch := map[string]any{
		"change_type":      "budget",
		"new_budget_level": "vip",
	}

	err := validateReplanPatch(itinerary, patch)
	if err == nil {
		t.Fatalf("expected invalid budget error")
	}
}

func TestValidateReplanPatchSupportsLegacyPreserveLocked(t *testing.T) {
	itinerary := buildValidationItinerary()
	patch := map[string]any{
		"change_type":     "replan_window",
		"preserve_locked": true,
		"targets": []any{
			map[string]any{"day_index": 1, "start_hour": 14, "end_hour": 18},
		},
	}

	normalizeReplanPatch(patch)
	if !asBool(patch["keep_locked"]) {
		t.Fatalf("expected keep_locked=true after normalization")
	}
	if err := validateReplanPatch(itinerary, patch); err != nil {
		t.Fatalf("expected patch to pass validation, got %v", err)
	}
}

func TestValidateReplanPatchLockNeedsResolvableTarget(t *testing.T) {
	itinerary := buildValidationItinerary()
	patch := map[string]any{
		"change_type": "lock",
		"targets": []any{
			map[string]any{"day_index": 0},
		},
	}

	err := validateReplanPatch(itinerary, patch)
	if err == nil {
		t.Fatalf("expected lock target validation error")
	}
}
