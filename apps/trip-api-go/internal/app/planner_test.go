package app

import (
	"math"
	"strings"
	"testing"
)

func TestBudgetMultiplier(t *testing.T) {
	if got := budgetMultiplier("low"); got != 0.75 {
		t.Fatalf("expected 0.75 for low, got %v", got)
	}
	if got := budgetMultiplier("high"); got != 1.35 {
		t.Fatalf("expected 1.35 for high, got %v", got)
	}
	if got := budgetMultiplier("unknown"); got != 1.0 {
		t.Fatalf("expected 1.0 for default case, got %v", got)
	}
}

func TestGenerateItineraryShape(t *testing.T) {
	req := PlanRequest{
		Destination: "beijing",
		Days:        2,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	}

	itinerary := generateItinerary(req)

	if asString(itinerary["granularity"]) != "hourly" {
		t.Fatalf("expected hourly granularity")
	}
	if asString(itinerary["map_provider"]) != "amap" {
		t.Fatalf("expected map provider amap")
	}

	days, ok := itinerary["days"].([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any for days, got %T", itinerary["days"])
	}
	if len(days) != 2 {
		t.Fatalf("expected 2 days, got %d", len(days))
	}
	for i, day := range days {
		blocks, ok := day["blocks"].([]map[string]any)
		if !ok {
			t.Fatalf("expected []map[string]any for blocks, got %T", day["blocks"])
		}
		if len(blocks) != 4 {
			t.Fatalf("expected 4 blocks for day %d, got %d", i, len(blocks))
		}
	}

	transitLegs, ok := itinerary["transit_legs"].([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any for transit legs, got %T", itinerary["transit_legs"])
	}
	if len(transitLegs) != 6 {
		t.Fatalf("expected 6 transit legs, got %d", len(transitLegs))
	}

	openingChecks, ok := itinerary["opening_checks"].([]map[string]any)
	if !ok {
		t.Fatalf("expected []map[string]any for opening checks, got %T", itinerary["opening_checks"])
	}
	if len(openingChecks) != 8 {
		t.Fatalf("expected 8 opening checks, got %d", len(openingChecks))
	}

	poiSequence, ok := itinerary["poi_sequence"].([]string)
	if !ok {
		t.Fatalf("expected []string for poi sequence, got %T", itinerary["poi_sequence"])
	}
	if len(poiSequence) != 8 {
		t.Fatalf("expected 8 pois, got %d", len(poiSequence))
	}

	cost, ok := asInt(itinerary["estimated_cost"])
	if !ok {
		t.Fatalf("expected integer estimated cost, got %T", itinerary["estimated_cost"])
	}
	if cost != 760 {
		t.Fatalf("expected estimated cost 760, got %d", cost)
	}
}

func TestGenerateItineraryUnknownDestinationFallsBackToDefaultCatalog(t *testing.T) {
	req := PlanRequest{
		Destination: "unknown-city",
		Days:        1,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
	}

	itinerary := generateItinerary(req)
	days, ok := itinerary["days"].([]map[string]any)
	if !ok || len(days) == 0 {
		t.Fatalf("expected non-empty days")
	}
	blocks, ok := days[0]["blocks"].([]map[string]any)
	if !ok || len(blocks) == 0 {
		t.Fatalf("expected non-empty blocks")
	}
	firstPOI := asString(blocks[0]["poi"])
	if firstPOI != catalogByCity["default"][0].POI {
		t.Fatalf("expected default catalog first poi %q, got %q", catalogByCity["default"][0].POI, firstPOI)
	}
}

func TestGenerateItineraryChineseDestinationUsesCityCatalog(t *testing.T) {
	req := PlanRequest{
		Destination: "北京",
		Days:        1,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
	}

	itinerary := generateItinerary(req)
	days, ok := itinerary["days"].([]map[string]any)
	if !ok || len(days) == 0 {
		t.Fatalf("expected non-empty days")
	}
	blocks, ok := days[0]["blocks"].([]map[string]any)
	if !ok || len(blocks) == 0 {
		t.Fatalf("expected non-empty blocks")
	}

	firstLat := asFloat(blocks[0]["poi_lat"], 0)
	firstLon := asFloat(blocks[0]["poi_lon"], 0)
	if firstLat != catalogByCity["beijing"][0].Lat || firstLon != catalogByCity["beijing"][0].Lon {
		t.Fatalf("expected beijing catalog coordinates (%v,%v), got (%v,%v)", catalogByCity["beijing"][0].Lat, catalogByCity["beijing"][0].Lon, firstLat, firstLon)
	}
}
func TestReplanItineraryUpdatesBudgetDatePreferencesPOIAndMustGo(t *testing.T) {
	base := generateItinerary(PlanRequest{
		Destination:  "beijing",
		Days:         2,
		BudgetLevel:  "medium",
		TravelStyles: []string{"culture"},
		MustGo:       []string{"landmark-a"},
		StartDate:    "2026-03-01",
	})

	baseCost, _ := asInt(base["estimated_cost"])
	budgetUpdated := replanItinerary(base, map[string]any{
		"change_type":      "budget",
		"new_budget_level": "high",
	})
	budgetCost, _ := asInt(budgetUpdated["estimated_cost"])
	wantBudgetCost := int(math.Round(float64(baseCost) * 1.35))
	if budgetCost != wantBudgetCost {
		t.Fatalf("expected budget-adjusted cost %d, got %d", wantBudgetCost, budgetCost)
	}
	budgetSnapshot := asMap(budgetUpdated["request_snapshot"])
	if asString(budgetSnapshot["budget_level"]) != "high" {
		t.Fatalf("expected budget level to be high")
	}

	dateUpdated := replanItinerary(base, map[string]any{
		"change_type":    "date",
		"new_start_date": "2026-04-10",
	})
	if asString(dateUpdated["start_date"]) != "2026-04-10" {
		t.Fatalf("expected start date to be updated")
	}
	dateDays := asSlice(dateUpdated["days"])
	if got := asString(asMap(dateDays[0])["date"]); got != "2026-04-10" {
		t.Fatalf("expected day 0 date 2026-04-10, got %q", got)
	}
	if got := asString(asMap(dateDays[1])["date"]); got != "2026-04-11" {
		t.Fatalf("expected day 1 date 2026-04-11, got %q", got)
	}

	preferencesUpdated := replanItinerary(base, map[string]any{
		"change_type":       "preferences",
		"new_travel_styles": []any{"food", "night", "food"},
		"add_must_go":       []any{"spot-b", "landmark-a"},
	})
	prefSnapshot := asMap(preferencesUpdated["request_snapshot"])
	travelStyles, ok := prefSnapshot["travel_styles"].([]string)
	if !ok {
		t.Fatalf("expected []string travel_styles, got %T", prefSnapshot["travel_styles"])
	}
	if len(travelStyles) != 2 || !containsString(travelStyles, "food") || !containsString(travelStyles, "night") {
		t.Fatalf("unexpected travel styles: %#v", travelStyles)
	}

	mustGo, ok := prefSnapshot["must_go"].([]string)
	if !ok {
		t.Fatalf("expected []string must_go, got %T", prefSnapshot["must_go"])
	}
	if len(mustGo) != 2 || !containsString(mustGo, "landmark-a") || !containsString(mustGo, "spot-b") {
		t.Fatalf("unexpected must_go values: %#v", mustGo)
	}

	warnings := asStringSlice(preferencesUpdated["warnings"])
	if len(warnings) != 1 {
		t.Fatalf("expected one warning after preferences patch, got %#v", warnings)
	}

	baseDays := base["days"].([]map[string]any)
	baseBlocks := baseDays[0]["blocks"].([]map[string]any)
	poiToRemove := asString(baseBlocks[0]["poi"])

	poiUpdated := replanItinerary(base, map[string]any{
		"change_type":   "poi",
		"remove_poi":    poiToRemove,
		"affected_days": []any{1},
	})

	for dayIdx, dayItem := range asSlice(poiUpdated["days"]) {
		day := asMap(dayItem)
		for _, blockItem := range asSlice(day["blocks"]) {
			block := asMap(blockItem)
			poi := asString(block["poi"])
			if dayIdx == 1 && strings.Contains(poi, poiToRemove) {
				t.Fatalf("expected poi %q to be replaced on affected day", poiToRemove)
			}
		}
	}

	fallbackActions := asSlice(poiUpdated["fallback_actions"])
	if len(fallbackActions) != 1 {
		t.Fatalf("expected one fallback action, got %d", len(fallbackActions))
	}
	action := asMap(fallbackActions[0])
	if got := asString(action["failed_poi"]); got != poiToRemove {
		t.Fatalf("expected failed_poi %q, got %q", poiToRemove, got)
	}
}

func TestSummarizeItinerary(t *testing.T) {
	itinerary := generateItinerary(PlanRequest{
		Destination: "beijing",
		Days:        2,
		BudgetLevel: "low",
		StartDate:   "2026-03-01",
	})

	summary := summarizeItinerary(itinerary)
	if strings.TrimSpace(summary) == "" {
		t.Fatalf("expected non-empty summary")
	}
	if !strings.Contains(summary, "beijing") {
		t.Fatalf("expected destination in summary, got %q", summary)
	}
	if !strings.Contains(summary, "low") {
		t.Fatalf("expected budget level in summary, got %q", summary)
	}
}

func containsString(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func TestGenerateItineraryVersionAndBlockID(t *testing.T) {
	itinerary := generateItinerary(PlanRequest{
		Destination: "beijing",
		Days:        1,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	})

	version, ok := asInt(itinerary["version"])
	if !ok || version != 1 {
		t.Fatalf("expected version=1, got %#v", itinerary["version"])
	}
	if asString(itinerary["map_provider"]) != "amap" {
		t.Fatalf("expected map_provider=amap")
	}

	days := itinerary["days"].([]map[string]any)
	blocks := days[0]["blocks"].([]map[string]any)
	if strings.TrimSpace(asString(blocks[0]["block_id"])) == "" {
		t.Fatalf("expected generated block_id")
	}
}

func TestReplanItineraryLockAndWindowConflict(t *testing.T) {
	base := generateItinerary(PlanRequest{
		Destination: "beijing",
		Days:        2,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	})

	baseDays := base["days"].([]map[string]any)
	baseBlocks := baseDays[0]["blocks"].([]map[string]any)
	startHour, _ := asInt(baseBlocks[0]["start_hour"])
	endHour, _ := asInt(baseBlocks[0]["end_hour"])

	locked := replanItinerary(base, map[string]any{
		"change_type": "lock",
		"targets": []any{
			map[string]any{
				"day_index":  0,
				"start_hour": startHour,
				"end_hour":   endHour,
			},
		},
	})

	lockedVersion, _ := asInt(locked["version"])
	lockedParentVersion, _ := asInt(locked["parent_version"])
	if lockedVersion != 2 || lockedParentVersion != 1 {
		t.Fatalf("expected version 2/parent 1 after lock, got %d/%d", lockedVersion, lockedParentVersion)
	}

	lockedDays := asSlice(locked["days"])
	lockedDay := asMap(lockedDays[0])
	lockedBlocks := asSlice(lockedDay["blocks"])
	firstBlock := asMap(lockedBlocks[0])
	if !asBool(firstBlock["locked"]) {
		t.Fatalf("expected first block to be locked")
	}

	changes := asSlice(locked["changes"])
	if len(changes) == 0 {
		t.Fatalf("expected lock changes")
	}
	if got := asString(asMap(changes[0])["change_type"]); got != "lock" {
		t.Fatalf("expected first change type lock, got %q", got)
	}

	windowResult := replanItinerary(locked, map[string]any{
		"change_type": "replan_window",
		"keep_locked": true,
		"targets": []any{
			map[string]any{
				"day_index":  0,
				"start_hour": startHour,
				"end_hour":   endHour,
			},
		},
	})

	windowVersion, _ := asInt(windowResult["version"])
	windowParent, _ := asInt(windowResult["parent_version"])
	if windowVersion != 3 || windowParent != 2 {
		t.Fatalf("expected version 3/parent 2 after window replan, got %d/%d", windowVersion, windowParent)
	}

	conflicts := asSlice(windowResult["conflicts"])
	if len(conflicts) != 1 {
		t.Fatalf("expected one conflict, got %d", len(conflicts))
	}
	if code := asString(asMap(conflicts[0])["code"]); code != "WINDOW_ALL_LOCKED" {
		t.Fatalf("expected WINDOW_ALL_LOCKED, got %q", code)
	}
}

func TestReplanItineraryWindowChangesUnlockedBlocks(t *testing.T) {
	base := generateItinerary(PlanRequest{
		Destination: "shanghai",
		Days:        1,
		BudgetLevel: "medium",
		StartDate:   "2026-03-01",
		UserID:      "u-1",
	})

	days := base["days"].([]map[string]any)
	blocks := days[0]["blocks"].([]map[string]any)
	oldPOI := asString(blocks[2]["poi"])
	startHour, _ := asInt(blocks[2]["start_hour"])
	endHour, _ := asInt(blocks[2]["end_hour"])

	updated := replanItinerary(base, map[string]any{
		"change_type": "replan_window",
		"targets": []any{
			map[string]any{
				"day_index":  0,
				"start_hour": startHour,
				"end_hour":   endHour,
			},
		},
	})

	updatedDays := asSlice(updated["days"])
	updatedDay := asMap(updatedDays[0])
	updatedBlocks := asSlice(updatedDay["blocks"])
	updatedBlock := asMap(updatedBlocks[2])
	newPOI := asString(updatedBlock["poi"])
	if newPOI == oldPOI {
		t.Fatalf("expected poi to change in replan window")
	}

	changes := asSlice(updated["changes"])
	if len(changes) == 0 {
		t.Fatalf("expected non-empty changes for window replan")
	}
	if got := asString(asMap(changes[0])["change_type"]); got != "replan_window" {
		t.Fatalf("expected change_type replan_window, got %q", got)
	}
}
