package app

import (
	"strings"
	"testing"
	"time"
)

func TestBuildPlanDiffDetectsChangedBlock(t *testing.T) {
	from := generateItinerary(PlanRequest{
		Destination: "beijing",
		Days:        2,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	})

	to := deepCloneMap(from)
	days := asSlice(to["days"])
	firstDay := asMap(days[0])
	blocks := asSlice(firstDay["blocks"])
	firstBlock := asMap(blocks[0])
	firstBlock["poi"] = "Alt POI"
	firstBlock["locked"] = true
	to["changes"] = []map[string]any{{"change_type": "replan_window"}}

	diff := buildPlanDiff(from, to)
	summary := asMap(diff["summary"])
	if asIntOrZero(summary["changed_blocks"]) != 1 {
		t.Fatalf("expected changed_blocks=1, got %#v", summary["changed_blocks"])
	}

	items := asSlice(diff["items"])
	if len(items) != 1 {
		t.Fatalf("expected one diff item, got %d", len(items))
	}
	item := asMap(items[0])
	if asString(item["block_id"]) == "" {
		t.Fatalf("expected block_id in diff item")
	}
	if asIntOrZero(item["start_hour"]) <= 0 || asIntOrZero(item["end_hour"]) <= 0 {
		t.Fatalf("expected start/end hour in diff item: %#v", item)
	}
}

func TestAttachDataDiagnosticsIncludesMismatchAndConflict(t *testing.T) {
	itinerary := generateItinerary(PlanRequest{
		Destination: "beijing",
		Days:        1,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	})

	itinerary["destination"] = "shanghai"
	itinerary["conflicts"] = []map[string]any{{"code": "WINDOW_ALL_LOCKED"}}
	attachDataDiagnostics(itinerary)

	diagnostics := asSlice(itinerary["diagnostics"])
	if !hasDiagnosticCode(diagnostics, "DEST_COORD_MISMATCH") {
		t.Fatalf("expected DEST_COORD_MISMATCH diagnostics")
	}
	if !hasDiagnosticCode(diagnostics, "WINDOW_ALL_LOCKED") {
		t.Fatalf("expected WINDOW_ALL_LOCKED diagnostics")
	}
}

func TestAttachDataDiagnosticsBuildsActionAndTargetForOpeningRisk(t *testing.T) {
	itinerary := generateItinerary(PlanRequest{
		Destination: "beijing",
		Days:        1,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	})

	checks := asSlice(itinerary["opening_checks"])
	if len(checks) == 0 {
		t.Fatalf("expected opening checks")
	}
	first := asMap(checks[0])
	first["within_window"] = false
	first["open_hour"] = 10
	first["close_hour"] = 16

	attachDataDiagnostics(itinerary)
	diagnostics := asSlice(itinerary["diagnostics"])

	if !hasDiagnosticCode(diagnostics, "POI_OPEN_HOURS_MISMATCH") {
		t.Fatalf("expected POI_OPEN_HOURS_MISMATCH diagnostics")
	}
	if !hasDiagnosticActionType(diagnostics, "POI_OPEN_HOURS_MISMATCH", "replan_window") {
		t.Fatalf("expected replan_window action for POI_OPEN_HOURS_MISMATCH")
	}
}

func TestAttachDataDiagnosticsAddsAppointmentSoonAction(t *testing.T) {
	soonDate := addDays(time.Now().UTC().Format("2006-01-02"), 2)
	itinerary := generateItinerary(PlanRequest{
		Destination: "beijing",
		Days:        1,
		BudgetLevel: "medium",
		StartDate:   soonDate,
		UserID:      "u-1",
	})

	attachDataDiagnostics(itinerary)
	diagnostics := asSlice(itinerary["diagnostics"])

	if !hasDiagnosticCode(diagnostics, "APPOINTMENT_DEADLINE_SOON") {
		t.Fatalf("expected APPOINTMENT_DEADLINE_SOON diagnostics")
	}
	if !hasDiagnosticActionType(diagnostics, "APPOINTMENT_DEADLINE_SOON", "add_pretrip_task") {
		t.Fatalf("expected add_pretrip_task action for APPOINTMENT_DEADLINE_SOON")
	}
}

func hasDiagnosticCode(items []any, code string) bool {
	for _, item := range items {
		d := asMap(item)
		if asString(d["code"]) == code {
			return true
		}
	}
	return false
}

func hasDiagnosticActionType(items []any, code, actionType string) bool {
	for _, item := range items {
		d := asMap(item)
		if asString(d["code"]) != code {
			continue
		}
		action := asMap(d["action"])
		if strings.ToLower(strings.TrimSpace(asString(action["type"]))) == strings.ToLower(strings.TrimSpace(actionType)) {
			return true
		}
	}
	return false
}
