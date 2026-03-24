package app

import (
	"reflect"
	"testing"
)

func TestParseAndValidateTasksDefaultsReminder(t *testing.T) {
	tasks, err := parseAndValidateTasks([]any{
		map[string]any{
			"id":       "task-001",
			"category": "booking",
			"title":    "book ticket",
			"status":   "todo",
		},
	})
	if err != nil {
		t.Fatalf("expected valid tasks, got %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0].Reminder == nil || !tasks[0].Reminder.Enabled {
		t.Fatalf("expected default reminder enabled, got %#v", tasks[0].Reminder)
	}
	if !reflect.DeepEqual(tasks[0].Reminder.OffsetHours, []int{168, 72, 24}) {
		t.Fatalf("unexpected default reminder offsets: %#v", tasks[0].Reminder.OffsetHours)
	}
}

func TestParseAndValidateTasksCustomReminder(t *testing.T) {
	tasks, err := parseAndValidateTasks([]any{
		map[string]any{
			"id":       "task-002",
			"category": "booking",
			"title":    "book museum",
			"status":   "todo",
			"reminder": map[string]any{
				"enabled":      false,
				"offset_hours": []any{24, 168, 24, 72},
			},
		},
	})
	if err != nil {
		t.Fatalf("expected valid tasks, got %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0].Reminder == nil {
		t.Fatalf("expected reminder payload")
	}
	if tasks[0].Reminder.Enabled {
		t.Fatalf("expected reminder enabled=false")
	}
	if !reflect.DeepEqual(tasks[0].Reminder.OffsetHours, []int{168, 72, 24}) {
		t.Fatalf("unexpected normalized reminder offsets: %#v", tasks[0].Reminder.OffsetHours)
	}
}

func TestParseAndValidateTasksRejectsInvalidReminderOffset(t *testing.T) {
	_, err := parseAndValidateTasks([]any{
		map[string]any{
			"id":       "task-003",
			"category": "booking",
			"title":    "book hotel",
			"status":   "todo",
			"reminder": map[string]any{
				"enabled":      true,
				"offset_hours": []any{12, 24},
			},
		},
	})
	if err == nil {
		t.Fatalf("expected invalid reminder offset error")
	}
	if err.Code != "BAD_REQUEST" {
		t.Fatalf("expected BAD_REQUEST, got %q", err.Code)
	}
	if err.Message != "invalid reminder offset_hours" {
		t.Fatalf("unexpected error message: %q", err.Message)
	}
}

func TestTaskToResponseItemIncludesReminderFallback(t *testing.T) {
	item := taskToResponseItem(PreTripTask{
		ID:       "task-004",
		Category: "general",
		Title:    "legacy",
		Status:   "todo",
	})
	reminder := asMap(item["reminder"])
	if !asBool(reminder["enabled"]) {
		t.Fatalf("expected response reminder enabled=true")
	}
	offsets, ok := reminder["offset_hours"].([]int)
	if !ok {
		t.Fatalf("expected offset_hours to be []int, got %T", reminder["offset_hours"])
	}
	if len(offsets) != 3 {
		t.Fatalf("expected 3 default offsets, got %d", len(offsets))
	}
}
