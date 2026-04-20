package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStorePersistedStateExcludesRetiredKeys(t *testing.T) {
	dataFile := filepath.Join(t.TempDir(), "store.json")
	store, err := NewStore(dataFile)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	_, err = store.SavePlan(SavedPlan{
		ID:        "p-1",
		UserID:    "u-1",
		SavedAt:   time.Date(2026, time.April, 20, 10, 0, 0, 0, time.UTC),
		Itinerary: map[string]any{"destination": "Shanghai"},
	})
	if err != nil {
		t.Fatalf("save plan: %v", err)
	}

	raw := map[string]any{}
	data, err := os.ReadFile(dataFile)
	if err != nil {
		t.Fatalf("read store file: %v", err)
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("decode store file: %v", err)
	}

	for _, key := range []string{
		"versions_by_plan",
		"share_by_token",
		"execution_by_plan_date",
		"events",
		"profiles_by_user",
		"personalization_by_user",
		"community_posts_by_id",
		"community_votes_by_post",
		"community_reports_by_post",
		"community_moderation_by_post",
	} {
		if _, exists := raw[key]; exists {
			t.Fatalf("expected key %q to be absent", key)
		}
	}
}
