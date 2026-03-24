package app

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestStoreReplaceTasksDoesNotCreateVersion(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if _, err := store.SavePlan(makeSavedPlan("p-task", 1)); err != nil {
		t.Fatalf("save plan failed: %v", err)
	}

	tasks := []PreTripTask{
		{
			ID:       "task-1",
			Category: "booking",
			Title:    "Book museum",
			DueAt:    "2026-04-01T12:00:00Z",
			Status:   "todo",
			Reminder: &PreTripTaskReminder{Enabled: true, OffsetHours: []int{168, 72, 24}},
		},
		{
			ID:       "task-2",
			Category: "packing",
			Title:    "Prepare luggage",
			Status:   "done",
			Reminder: &PreTripTaskReminder{Enabled: false, OffsetHours: []int{48, 24}},
		},
	}
	updated, err := store.ReplacePlanTasks("u-1", "p-task", tasks)
	if err != nil {
		t.Fatalf("replace tasks failed: %v", err)
	}
	if len(updated) != 2 {
		t.Fatalf("expected 2 tasks, got %d", len(updated))
	}

	got, err := store.GetPlanTasks("u-1", "p-task")
	if err != nil {
		t.Fatalf("get tasks failed: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 stored tasks, got %d", len(got))
	}
	if got[0].ID != "task-1" || got[1].Status != "done" {
		t.Fatalf("unexpected task payload: %#v", got)
	}
	if got[0].Reminder == nil || !got[0].Reminder.Enabled {
		t.Fatalf("expected task-1 reminder enabled, got %#v", got[0].Reminder)
	}
	if !reflect.DeepEqual(got[0].Reminder.OffsetHours, []int{168, 72, 24}) {
		t.Fatalf("unexpected task-1 reminder offsets: %#v", got[0].Reminder.OffsetHours)
	}
	if got[1].Reminder == nil || got[1].Reminder.Enabled {
		t.Fatalf("expected task-2 reminder disabled, got %#v", got[1].Reminder)
	}
	if !reflect.DeepEqual(got[1].Reminder.OffsetHours, []int{48, 24}) {
		t.Fatalf("unexpected task-2 reminder offsets: %#v", got[1].Reminder.OffsetHours)
	}

	versions, ok := store.ListPlanVersions("u-1", "p-task", 20)
	if !ok {
		t.Fatalf("expected versions to be found")
	}
	if len(versions) != 1 {
		t.Fatalf("expected version count to stay 1 after tasks update, got %d", len(versions))
	}
}

func TestStoreGetPlanTasksBackfillsDefaultReminder(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	plan := makeSavedPlan("p-task-default", 1)
	plan.Itinerary["pre_trip_tasks"] = []map[string]any{
		{
			"id":       "task-legacy-1",
			"category": "booking",
			"title":    "legacy task",
			"status":   "todo",
			"due_at":   "2026-04-01T12:00:00Z",
		},
	}
	if _, err := store.SavePlan(plan); err != nil {
		t.Fatalf("save plan failed: %v", err)
	}

	got, err := store.GetPlanTasks("u-1", "p-task-default")
	if err != nil {
		t.Fatalf("get tasks failed: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected one task, got %d", len(got))
	}
	if got[0].Reminder == nil || !got[0].Reminder.Enabled {
		t.Fatalf("expected default reminder enabled, got %#v", got[0].Reminder)
	}
	if !reflect.DeepEqual(got[0].Reminder.OffsetHours, []int{168, 72, 24}) {
		t.Fatalf("unexpected default reminder offsets: %#v", got[0].Reminder.OffsetHours)
	}
}

func TestStoreShareLifecycle(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if _, err := store.SavePlan(makeSavedPlan("p-share", 1)); err != nil {
		t.Fatalf("save plan failed: %v", err)
	}

	record, err := store.CreateShareToken("u-1", "p-share", 2)
	if err != nil {
		t.Fatalf("create share failed: %v", err)
	}
	if record.Token == "" {
		t.Fatalf("expected non-empty share token")
	}

	sharedPlan, sharedMeta, err := store.GetSharedPlanByToken(record.Token)
	if err != nil {
		t.Fatalf("get shared plan failed: %v", err)
	}
	if sharedPlan.ID != "p-share" || sharedMeta.Token != record.Token {
		t.Fatalf("unexpected shared payload: %#v %#v", sharedPlan, sharedMeta)
	}

	if err := store.CloseShareToken("u-1", "p-share", record.Token); err != nil {
		t.Fatalf("close share failed: %v", err)
	}

	_, _, err = store.GetSharedPlanByToken(record.Token)
	if !errors.Is(err, ErrShareTokenNotFound) {
		t.Fatalf("expected ErrShareTokenNotFound after close, got %v", err)
	}
}

func TestStoreShareExpiredToken(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if _, err := store.SavePlan(makeSavedPlan("p-expired", 1)); err != nil {
		t.Fatalf("save plan failed: %v", err)
	}

	record, err := store.CreateShareToken("u-1", "p-expired", 1)
	if err != nil {
		t.Fatalf("create share failed: %v", err)
	}

	mutated := store.shareByToken[record.Token]
	mutated.ExpiresAt = time.Now().UTC().Add(-1 * time.Hour)
	store.shareByToken[record.Token] = mutated

	_, _, err = store.GetSharedPlanByToken(record.Token)
	if !errors.Is(err, ErrShareTokenExpired) {
		t.Fatalf("expected ErrShareTokenExpired, got %v", err)
	}
}
