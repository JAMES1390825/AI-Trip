package app

import (
	"errors"
	"testing"
)

func makeSavedPlan(id string, version int) SavedPlan {
	if version < 1 {
		version = 1
	}
	return SavedPlan{
		ID:     id,
		UserID: "u-1",
		Itinerary: map[string]any{
			"destination": "beijing",
			"version":     version,
			"request_snapshot": map[string]any{
				"user_id": "u-1",
			},
		},
	}
}

func TestStoreSavePlanCreatesVersionRecord(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	saved, err := store.SavePlan(makeSavedPlan("p-1", 1))
	if err != nil {
		t.Fatalf("save plan failed: %v", err)
	}

	versions, ok := store.ListPlanVersions("u-1", saved.ID, 20)
	if !ok {
		t.Fatalf("expected versions to be found")
	}
	if len(versions) != 1 {
		t.Fatalf("expected one version, got %d", len(versions))
	}
	if versions[0].Version != 1 {
		t.Fatalf("expected version 1, got %d", versions[0].Version)
	}
}

func TestStoreRevertSavedPlanCreatesNewVersion(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if _, err := store.SavePlan(makeSavedPlan("p-2", 1)); err != nil {
		t.Fatalf("save initial plan failed: %v", err)
	}

	reverted, err := store.RevertSavedPlan("u-1", "p-2", 1)
	if err != nil {
		t.Fatalf("revert failed: %v", err)
	}

	version, _ := asInt(reverted.Itinerary["version"])
	parent, _ := asInt(reverted.Itinerary["parent_version"])
	if version != 2 || parent != 1 {
		t.Fatalf("expected reverted version 2 parent 1, got %d/%d", version, parent)
	}

	versions, ok := store.ListPlanVersions("u-1", "p-2", 20)
	if !ok {
		t.Fatalf("expected versions to be listed")
	}
	if len(versions) != 2 {
		t.Fatalf("expected two versions after revert, got %d", len(versions))
	}
	if versions[0].Version != 2 {
		t.Fatalf("expected latest version 2, got %d", versions[0].Version)
	}
}

func TestStoreSavePlanTrimsToRecent20Versions(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	for v := 1; v <= 25; v++ {
		if _, err := store.SavePlan(makeSavedPlan("p-3", v)); err != nil {
			t.Fatalf("save version %d failed: %v", v, err)
		}
	}

	versions, ok := store.ListPlanVersions("u-1", "p-3", 20)
	if !ok {
		t.Fatalf("expected versions for p-3")
	}
	if len(versions) != 20 {
		t.Fatalf("expected 20 versions retained, got %d", len(versions))
	}
	if versions[0].Version != 25 {
		t.Fatalf("expected newest version 25, got %d", versions[0].Version)
	}
	if versions[len(versions)-1].Version != 6 {
		t.Fatalf("expected oldest retained version 6, got %d", versions[len(versions)-1].Version)
	}
}

func TestStoreRevertMissingTargetVersion(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store failed: %v", err)
	}

	if _, err := store.SavePlan(makeSavedPlan("p-4", 1)); err != nil {
		t.Fatalf("save plan failed: %v", err)
	}

	_, err = store.RevertSavedPlan("u-1", "p-4", 9)
	if !errors.Is(err, ErrTargetVersionNotFound) {
		t.Fatalf("expected ErrTargetVersionNotFound, got %v", err)
	}
}
