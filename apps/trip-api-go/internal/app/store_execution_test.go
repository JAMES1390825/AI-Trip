package app

import (
	"errors"
	"testing"
)

func makeExecutionSavedPlan(id string) SavedPlan {
	return SavedPlan{
		ID:     id,
		UserID: "u-1",
		Itinerary: map[string]any{
			"destination": "beijing",
			"version":     1,
			"request_snapshot": map[string]any{
				"user_id":    "u-1",
				"start_date": "2026-04-02",
			},
			"days": []map[string]any{
				{
					"day_index": 0,
					"date":      "2026-04-02",
					"blocks": []map[string]any{
						{"block_id": "d1-09-11-01", "start_hour": 9, "end_hour": 11},
						{"block_id": "d1-11-13-02", "start_hour": 11, "end_hour": 13},
					},
				},
			},
		},
	}
}

func TestStoreExecutionUpsertAndRead(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if _, err := store.SavePlan(makeExecutionSavedPlan("p-exec")); err != nil {
		t.Fatalf("save plan failed: %v", err)
	}

	if _, err := store.GetPlanExecution("u-1", "p-exec", "2026-04-02"); !errors.Is(err, ErrExecutionStateNotFound) {
		t.Fatalf("expected ErrExecutionStateNotFound before update, got %v", err)
	}

	updated, err := store.UpsertPlanExecution("u-1", "p-exec", "2026-04-02", []ExecutionBlockState{
		{DayIndex: 0, BlockID: "d1-09-11-01", Status: "done"},
	})
	if err != nil {
		t.Fatalf("upsert execution failed: %v", err)
	}
	if updated.Date != "2026-04-02" || len(updated.Blocks) != 1 {
		t.Fatalf("unexpected updated execution payload: %#v", updated)
	}
	if updated.Blocks[0].Status != "done" {
		t.Fatalf("expected done status, got %#v", updated.Blocks[0])
	}

	stored, err := store.GetPlanExecution("u-1", "p-exec", "2026-04-02")
	if err != nil {
		t.Fatalf("get execution failed: %v", err)
	}
	if len(stored.Blocks) != 1 || stored.Blocks[0].BlockID != "d1-09-11-01" {
		t.Fatalf("unexpected stored execution payload: %#v", stored)
	}

	versions, ok := store.ListPlanVersions("u-1", "p-exec", 20)
	if !ok {
		t.Fatalf("expected versions for p-exec")
	}
	if len(versions) != 1 {
		t.Fatalf("expected version count to stay 1 after execution update, got %d", len(versions))
	}
}

func TestStoreExecutionUpsertMergesByBlock(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if _, err := store.SavePlan(makeExecutionSavedPlan("p-exec-merge")); err != nil {
		t.Fatalf("save plan failed: %v", err)
	}

	if _, err := store.UpsertPlanExecution("u-1", "p-exec-merge", "2026-04-02", []ExecutionBlockState{{DayIndex: 0, BlockID: "d1-09-11-01", Status: "done"}}); err != nil {
		t.Fatalf("first upsert failed: %v", err)
	}
	updated, err := store.UpsertPlanExecution("u-1", "p-exec-merge", "2026-04-02", []ExecutionBlockState{{DayIndex: 0, BlockID: "d1-09-11-01", Status: "skipped"}})
	if err != nil {
		t.Fatalf("second upsert failed: %v", err)
	}
	if len(updated.Blocks) != 1 {
		t.Fatalf("expected merged one block state, got %d", len(updated.Blocks))
	}
	if updated.Blocks[0].Status != "skipped" {
		t.Fatalf("expected latest status skipped, got %#v", updated.Blocks[0])
	}
}

func TestStoreDeletePlanRemovesExecutionState(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if _, err := store.SavePlan(makeExecutionSavedPlan("p-exec-del")); err != nil {
		t.Fatalf("save plan failed: %v", err)
	}
	if _, err := store.UpsertPlanExecution("u-1", "p-exec-del", "2026-04-02", []ExecutionBlockState{{DayIndex: 0, BlockID: "d1-09-11-01", Status: "done"}}); err != nil {
		t.Fatalf("upsert execution failed: %v", err)
	}

	deleted, err := store.DeleteSavedPlan("u-1", "p-exec-del")
	if err != nil {
		t.Fatalf("delete plan failed: %v", err)
	}
	if !deleted {
		t.Fatalf("expected plan to be deleted")
	}
	if len(store.executionByPlanDate) != 0 {
		t.Fatalf("expected execution state to be removed, got %d", len(store.executionByPlanDate))
	}
}
