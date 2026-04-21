package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const storeFileVersion = 9

type storeState struct {
	Version     int                    `json:"version"`
	SavedByUser map[string][]SavedPlan `json:"saved_by_user"`
}

// Store keeps current saved-plan data in memory and persists it to a local JSON file.
type Store struct {
	mu          sync.RWMutex
	savedByUser map[string][]SavedPlan
	savedByID   map[string]SavedPlan
	dataFile    string
}

func NewStore(dataFile string) (*Store, error) {
	s := &Store{
		savedByUser: map[string][]SavedPlan{},
		savedByID:   map[string]SavedPlan{},
		dataFile:    strings.TrimSpace(dataFile),
	}
	if s.dataFile == "" {
		return s, nil
	}
	s.dataFile = filepath.Clean(s.dataFile)
	if err := s.loadFromDisk(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) SavePlan(plan SavedPlan) (SavedPlan, error) {
	plan = cloneSavedPlan(plan)
	plan.Itinerary = normalizeItineraryForStorage(plan.Itinerary)

	s.mu.Lock()
	defer s.mu.Unlock()

	previousUserPlans := cloneSavedPlanList(s.savedByUser[plan.UserID])
	previousByID, hadPrevious := s.savedByID[plan.ID]

	s.savedByID[plan.ID] = plan
	s.savedByUser[plan.UserID] = prependOrReplacePlan(s.savedByUser[plan.UserID], plan)

	if err := s.persistLocked(); err != nil {
		s.savedByUser[plan.UserID] = previousUserPlans
		if hadPrevious {
			s.savedByID[plan.ID] = previousByID
		} else {
			delete(s.savedByID, plan.ID)
		}
		return SavedPlan{}, err
	}
	return cloneSavedPlan(plan), nil
}

func (s *Store) GetSavedPlan(userID, id string) (SavedPlan, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	plan, ok := s.savedByID[id]
	if !ok || plan.UserID != userID {
		return SavedPlan{}, false
	}
	return cloneSavedPlan(plan), true
}

func (s *Store) ListSavedPlans(userID string, limit int) []SavedPlan {
	s.mu.RLock()
	defer s.mu.RUnlock()

	plans := s.savedByUser[userID]
	if len(plans) == 0 {
		return []SavedPlan{}
	}
	if limit <= 0 || limit > len(plans) {
		limit = len(plans)
	}

	out := make([]SavedPlan, 0, limit)
	for i := 0; i < limit; i++ {
		out = append(out, cloneSavedPlan(plans[i]))
	}
	return out
}

func (s *Store) DeleteSavedPlan(userID, id string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	plan, ok := s.savedByID[id]
	if !ok || plan.UserID != userID {
		return false, nil
	}

	previousUserPlans := cloneSavedPlanList(s.savedByUser[userID])
	previousByID := cloneSavedPlan(plan)

	delete(s.savedByID, id)

	plans := s.savedByUser[userID]
	next := make([]SavedPlan, 0, len(plans))
	for _, item := range plans {
		if item.ID == id {
			continue
		}
		next = append(next, item)
	}
	s.savedByUser[userID] = next

	if err := s.persistLocked(); err != nil {
		s.savedByUser[userID] = previousUserPlans
		s.savedByID[id] = previousByID
		return false, err
	}
	return true, nil
}

func (s *Store) loadFromDisk() error {
	blob, err := os.ReadFile(s.dataFile)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if len(strings.TrimSpace(string(blob))) == 0 {
		return nil
	}

	var state storeState
	if err := json.Unmarshal(blob, &state); err != nil {
		return err
	}
	if state.SavedByUser == nil {
		state.SavedByUser = map[string][]SavedPlan{}
	}

	s.savedByUser = map[string][]SavedPlan{}
	s.savedByID = map[string]SavedPlan{}

	for userID, plans := range state.SavedByUser {
		copied := cloneSavedPlanList(plans)
		s.savedByUser[userID] = copied
		for _, plan := range copied {
			plan.Itinerary = normalizeItineraryForStorage(plan.Itinerary)
			s.savedByID[plan.ID] = cloneSavedPlan(plan)
		}
	}

	return nil
}

func (s *Store) persistLocked() error {
	if s.dataFile == "" {
		return nil
	}

	state := storeState{
		Version:     storeFileVersion,
		SavedByUser: map[string][]SavedPlan{},
	}
	for userID, plans := range s.savedByUser {
		state.SavedByUser[userID] = cloneSavedPlanList(plans)
	}

	blob, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(s.dataFile)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	tmpPath := s.dataFile + ".tmp"
	if err := os.WriteFile(tmpPath, blob, 0o644); err != nil {
		return err
	}
	if err := os.Remove(s.dataFile); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Rename(tmpPath, s.dataFile); err != nil {
		return err
	}
	return nil
}

func normalizeItineraryForStorage(itinerary map[string]any) map[string]any {
	next := deepCloneMap(itinerary)
	version := extractItineraryVersion(next)
	if version <= 0 {
		version = 1
	}
	next["version"] = version

	if _, exists := next["parent_version"]; !exists {
		next["parent_version"] = nil
	}
	if strings.TrimSpace(asString(next["map_provider"])) == "" {
		next["map_provider"] = "amap"
	}
	if _, exists := next["changes"]; !exists {
		next["changes"] = []map[string]any{}
	}
	if _, exists := next["conflicts"]; !exists {
		next["conflicts"] = []map[string]any{}
	}
	if _, exists := next["pre_trip_tasks"]; !exists {
		next["pre_trip_tasks"] = []map[string]any{}
	}
	if _, exists := next["diagnostics"]; !exists {
		next["diagnostics"] = []map[string]any{}
	}
	return next
}

func extractItineraryVersion(itinerary map[string]any) int {
	if version, ok := asInt(itinerary["version"]); ok && version > 0 {
		return version
	}
	return 1
}

func prependOrReplacePlan(items []SavedPlan, plan SavedPlan) []SavedPlan {
	next := make([]SavedPlan, 0, len(items)+1)
	next = append(next, cloneSavedPlan(plan))
	for _, item := range items {
		if item.ID == plan.ID {
			continue
		}
		next = append(next, cloneSavedPlan(item))
	}
	return next
}

func cloneSavedPlan(plan SavedPlan) SavedPlan {
	plan.Itinerary = deepCloneMap(plan.Itinerary)
	return plan
}

func cloneSavedPlanList(plans []SavedPlan) []SavedPlan {
	if len(plans) == 0 {
		return []SavedPlan{}
	}
	out := make([]SavedPlan, 0, len(plans))
	for _, plan := range plans {
		out = append(out, cloneSavedPlan(plan))
	}
	return out
}
