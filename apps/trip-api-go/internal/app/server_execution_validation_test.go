package app

import "testing"

func TestParseAndValidateExecutionUpdates(t *testing.T) {
	updates, err := parseAndValidateExecutionUpdates([]any{
		map[string]any{"day_index": 0, "block_id": "d1-09-11-01", "status": "done"},
	})
	if err != nil {
		t.Fatalf("expected valid updates, got %v", err)
	}
	if len(updates) != 1 || updates[0].Status != "done" {
		t.Fatalf("unexpected updates payload: %#v", updates)
	}
}

func TestParseAndValidateExecutionUpdatesRejectsInvalidStatus(t *testing.T) {
	_, err := parseAndValidateExecutionUpdates([]any{
		map[string]any{"day_index": 0, "block_id": "d1-09-11-01", "status": "archived"},
	})
	if err == nil {
		t.Fatalf("expected invalid status error")
	}
	if err.Code != "BAD_REQUEST" {
		t.Fatalf("expected BAD_REQUEST, got %q", err.Code)
	}
}

func TestCollectExecutionBlockScopeMatchesDate(t *testing.T) {
	itinerary := map[string]any{
		"request_snapshot": map[string]any{"start_date": "2026-04-02"},
		"days": []map[string]any{
			{
				"day_index": 0,
				"blocks": []map[string]any{
					{"block_id": "d1-09-11-01", "start_hour": 9, "end_hour": 11},
					{"block_id": "d1-11-13-02", "start_hour": 11, "end_hour": 13},
				},
			},
			{
				"day_index": 1,
				"date":      "2026-04-03",
				"blocks": []map[string]any{
					{"block_id": "d2-09-11-01", "start_hour": 9, "end_hour": 11},
				},
			},
		},
	}

	scope, total := collectExecutionBlockScope(itinerary, "2026-04-02")
	if total != 2 {
		t.Fatalf("expected total=2 for 2026-04-02, got %d", total)
	}
	if _, ok := scope[0]["d1-09-11-01"]; !ok {
		t.Fatalf("expected block d1-09-11-01 in scope")
	}
	if _, ok := scope[1]; ok {
		t.Fatalf("expected day 1 not included in 2026-04-02 scope")
	}
}
