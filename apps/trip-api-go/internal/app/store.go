package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	storeFileVersion = 4
	maxPlanVersions  = 20
)

var (
	ErrSavedPlanNotFound      = errors.New("saved plan not found")
	ErrSavedPlanForbidden     = errors.New("saved plan forbidden")
	ErrTargetVersionNotFound  = errors.New("target version not found")
	ErrShareTokenNotFound     = errors.New("share token not found")
	ErrShareTokenExpired      = errors.New("share token expired")
	ErrExecutionStateNotFound = errors.New("execution state not found")
)

type storeState struct {
	Version             int                           `json:"version"`
	SavedByUser         map[string][]SavedPlan        `json:"saved_by_user"`
	VersionsByPlan      map[string][]SavedPlanVersion `json:"versions_by_plan"`
	ShareByToken        map[string]ShareTokenRecord   `json:"share_by_token"`
	ExecutionByPlanDate map[string]PlanExecutionState `json:"execution_by_plan_date"`
	Events              []EventRecord                 `json:"events"`
}

// Store keeps runtime data in memory and persists to a local JSON file.
type Store struct {
	mu                  sync.RWMutex
	savedByUser         map[string][]SavedPlan
	savedByID           map[string]SavedPlan
	versionsByPlan      map[string][]SavedPlanVersion
	shareByToken        map[string]ShareTokenRecord
	sharesByPlan        map[string][]string
	executionByPlanDate map[string]PlanExecutionState
	events              []EventRecord
	dataFile            string
}

func NewStore(dataFile string) (*Store, error) {
	s := &Store{
		savedByUser:         map[string][]SavedPlan{},
		savedByID:           map[string]SavedPlan{},
		versionsByPlan:      map[string][]SavedPlanVersion{},
		shareByToken:        map[string]ShareTokenRecord{},
		sharesByPlan:        map[string][]string{},
		executionByPlanDate: map[string]PlanExecutionState{},
		events:              make([]EventRecord, 0, 128),
		dataFile:            strings.TrimSpace(dataFile),
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
	previousVersions := cloneSavedPlanVersionList(s.versionsByPlan[plan.ID])

	s.savedByID[plan.ID] = plan
	s.savedByUser[plan.UserID] = prependOrReplacePlan(s.savedByUser[plan.UserID], plan)

	version := buildSavedPlanVersion(plan.Itinerary, plan.SavedAt)
	versions := append([]SavedPlanVersion{version}, cloneSavedPlanVersionList(s.versionsByPlan[plan.ID])...)
	s.versionsByPlan[plan.ID] = trimPlanVersions(versions)

	if err := s.persistLocked(); err != nil {
		s.savedByUser[plan.UserID] = previousUserPlans
		if hadPrevious {
			s.savedByID[plan.ID] = previousByID
		} else {
			delete(s.savedByID, plan.ID)
		}
		s.versionsByPlan[plan.ID] = previousVersions
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

func (s *Store) ListPlanVersions(userID, id string, limit int) ([]SavedPlanVersion, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	plan, ok := s.savedByID[id]
	if !ok || plan.UserID != userID {
		return []SavedPlanVersion{}, false
	}

	versions := cloneSavedPlanVersionList(s.versionsByPlan[id])
	if len(versions) == 0 {
		versions = []SavedPlanVersion{buildSavedPlanVersion(plan.Itinerary, plan.SavedAt)}
	}

	if limit <= 0 || limit > len(versions) {
		limit = len(versions)
	}

	out := make([]SavedPlanVersion, 0, limit)
	for i := 0; i < limit; i++ {
		out = append(out, cloneSavedPlanVersion(versions[i]))
	}
	return out, true
}

func (s *Store) GetPlanVersion(userID, id string, version int) (SavedPlanVersion, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	plan, err := s.getPlanAccessLocked(userID, id)
	if err != nil {
		return SavedPlanVersion{}, err
	}

	versions := cloneSavedPlanVersionList(s.versionsByPlan[id])
	if len(versions) == 0 {
		versions = []SavedPlanVersion{buildSavedPlanVersion(plan.Itinerary, plan.SavedAt)}
	}

	for _, item := range versions {
		if item.Version == version {
			return cloneSavedPlanVersion(item), nil
		}
	}
	return SavedPlanVersion{}, ErrTargetVersionNotFound
}

func (s *Store) RevertSavedPlan(userID, id string, targetVersion int) (SavedPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	plan, err := s.getPlanAccessLocked(userID, id)
	if err != nil {
		return SavedPlan{}, err
	}

	versions := cloneSavedPlanVersionList(s.versionsByPlan[id])
	if len(versions) == 0 {
		versions = []SavedPlanVersion{buildSavedPlanVersion(plan.Itinerary, plan.SavedAt)}
	}

	var target SavedPlanVersion
	found := false
	for _, version := range versions {
		if version.Version == targetVersion {
			target = cloneSavedPlanVersion(version)
			found = true
			break
		}
	}
	if !found {
		return SavedPlan{}, ErrTargetVersionNotFound
	}

	previousUserPlans := cloneSavedPlanList(s.savedByUser[userID])
	previousPlan := cloneSavedPlan(plan)
	previousVersions := cloneSavedPlanVersionList(s.versionsByPlan[id])

	currentVersion := extractItineraryVersion(plan.Itinerary)
	if currentVersion <= 0 {
		currentVersion = 1
	}
	nextVersion := currentVersion + 1

	nextItinerary := normalizeItineraryForStorage(target.Itinerary)
	nextItinerary["version"] = nextVersion
	nextItinerary["parent_version"] = currentVersion
	nextItinerary["generated_at"] = nowISO()
	nextItinerary["changes"] = []map[string]any{
		{
			"change_type": "revert",
			"reason":      fmt.Sprintf("reverted_to_version_%d", targetVersion),
		},
	}
	nextItinerary["conflicts"] = []map[string]any{}

	updatedPlan := cloneSavedPlan(plan)
	updatedPlan.Itinerary = deepCloneMap(nextItinerary)
	updatedPlan.SavedAt = time.Now().UTC()

	s.savedByID[id] = cloneSavedPlan(updatedPlan)
	s.savedByUser[userID] = prependOrReplacePlan(s.savedByUser[userID], updatedPlan)

	nextVersionRecord := buildSavedPlanVersion(nextItinerary, updatedPlan.SavedAt)
	mergedVersions := append([]SavedPlanVersion{nextVersionRecord}, versions...)
	s.versionsByPlan[id] = trimPlanVersions(mergedVersions)

	if err := s.persistLocked(); err != nil {
		s.savedByUser[userID] = previousUserPlans
		s.savedByID[id] = previousPlan
		s.versionsByPlan[id] = previousVersions
		return SavedPlan{}, err
	}

	return cloneSavedPlan(updatedPlan), nil
}

func (s *Store) GetPlanTasks(userID, id string) ([]PreTripTask, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	plan, err := s.getPlanAccessLocked(userID, id)
	if err != nil {
		return nil, err
	}

	tasks := extractPreTripTasks(plan.Itinerary)
	return clonePreTripTaskList(tasks), nil
}

func (s *Store) ReplacePlanTasks(userID, id string, tasks []PreTripTask) ([]PreTripTask, error) {
	tasks = normalizePreTripTaskList(tasks)

	s.mu.Lock()
	defer s.mu.Unlock()

	plan, err := s.getPlanAccessLocked(userID, id)
	if err != nil {
		return nil, err
	}

	previousPlan := cloneSavedPlan(plan)
	previousUserPlans := cloneSavedPlanList(s.savedByUser[plan.UserID])

	updated := cloneSavedPlan(plan)
	updated.Itinerary = normalizeItineraryForStorage(updated.Itinerary)
	updated.Itinerary["pre_trip_tasks"] = tasksToStorage(tasks)
	updated.SavedAt = time.Now().UTC()

	s.savedByID[id] = cloneSavedPlan(updated)
	s.savedByUser[updated.UserID] = prependOrReplacePlan(s.savedByUser[updated.UserID], updated)

	if err := s.persistLocked(); err != nil {
		s.savedByID[id] = previousPlan
		s.savedByUser[updated.UserID] = previousUserPlans
		return nil, err
	}

	return clonePreTripTaskList(tasks), nil
}

func (s *Store) GetPlanExecution(userID, id, date string) (PlanExecutionState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if _, err := s.getPlanAccessLocked(userID, id); err != nil {
		return PlanExecutionState{}, err
	}

	key := buildExecutionStateKey(userID, id, date)
	state, ok := s.executionByPlanDate[key]
	if !ok {
		return PlanExecutionState{}, ErrExecutionStateNotFound
	}

	return clonePlanExecutionState(state), nil
}

func (s *Store) UpsertPlanExecution(userID, id, date string, updates []ExecutionBlockState) (PlanExecutionState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.getPlanAccessLocked(userID, id); err != nil {
		return PlanExecutionState{}, err
	}

	key := buildExecutionStateKey(userID, id, date)
	previousExecutionByPlanDate := clonePlanExecutionStateMap(s.executionByPlanDate)
	state, hasState := s.executionByPlanDate[key]
	if !hasState {
		state = PlanExecutionState{
			SavedPlanID: id,
			UserID:      userID,
			Date:        strings.TrimSpace(date),
			Blocks:      []ExecutionBlockState{},
		}
	}

	now := time.Now().UTC()
	merged := map[string]ExecutionBlockState{}
	for _, block := range state.Blocks {
		blockID := strings.TrimSpace(block.BlockID)
		status := normalizeExecutionStatus(block.Status)
		if blockID == "" || block.DayIndex < 0 || status == "" {
			continue
		}
		block.BlockID = blockID
		block.Status = status
		merged[executionBlockStateMapKey(block.DayIndex, blockID)] = block
	}
	for _, update := range updates {
		blockID := strings.TrimSpace(update.BlockID)
		status := normalizeExecutionStatus(update.Status)
		if blockID == "" || update.DayIndex < 0 || status == "" {
			continue
		}
		merged[executionBlockStateMapKey(update.DayIndex, blockID)] = ExecutionBlockState{
			DayIndex:  update.DayIndex,
			BlockID:   blockID,
			Status:    status,
			UpdatedAt: now,
		}
	}

	nextBlocks := make([]ExecutionBlockState, 0, len(merged))
	for _, block := range merged {
		nextBlocks = append(nextBlocks, block)
	}
	sort.Slice(nextBlocks, func(i, j int) bool {
		if nextBlocks[i].DayIndex != nextBlocks[j].DayIndex {
			return nextBlocks[i].DayIndex < nextBlocks[j].DayIndex
		}
		if nextBlocks[i].BlockID != nextBlocks[j].BlockID {
			return nextBlocks[i].BlockID < nextBlocks[j].BlockID
		}
		return nextBlocks[i].UpdatedAt.Before(nextBlocks[j].UpdatedAt)
	})

	state.SavedPlanID = id
	state.UserID = userID
	state.Date = strings.TrimSpace(date)
	state.Blocks = nextBlocks
	state.UpdatedAt = now
	s.executionByPlanDate[key] = clonePlanExecutionState(state)

	if err := s.persistLocked(); err != nil {
		s.executionByPlanDate = previousExecutionByPlanDate
		return PlanExecutionState{}, err
	}

	return clonePlanExecutionState(state), nil
}

func (s *Store) CreateShareToken(userID, planID string, expiresInHours int) (ShareTokenRecord, error) {
	now := time.Now().UTC()
	if expiresInHours <= 0 {
		expiresInHours = 168
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.getPlanAccessLocked(userID, planID)
	if err != nil {
		return ShareTokenRecord{}, err
	}

	previousShareByToken := cloneShareTokenMap(s.shareByToken)
	previousSharesByPlan := cloneSharesByPlanMap(s.sharesByPlan)

	token := "shr_" + strings.ReplaceAll(randomID(), "-", "")[:20]
	for {
		if _, exists := s.shareByToken[token]; !exists {
			break
		}
		token = "shr_" + strings.ReplaceAll(randomID(), "-", "")[:20]
	}

	record := ShareTokenRecord{
		Token:     token,
		PlanID:    planID,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(time.Duration(expiresInHours) * time.Hour),
	}

	s.shareByToken[token] = record
	s.sharesByPlan[planID] = uniqueStrings(append(s.sharesByPlan[planID], token))

	if err := s.persistLocked(); err != nil {
		s.shareByToken = previousShareByToken
		s.sharesByPlan = previousSharesByPlan
		return ShareTokenRecord{}, err
	}

	return cloneShareTokenRecord(record), nil
}

func (s *Store) CloseShareToken(userID, planID, token string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return ErrShareTokenNotFound
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.getPlanAccessLocked(userID, planID)
	if err != nil {
		return err
	}

	record, ok := s.shareByToken[token]
	if !ok || record.PlanID != planID {
		return ErrShareTokenNotFound
	}
	if !record.ClosedAt.IsZero() {
		return ErrShareTokenNotFound
	}

	previousShareByToken := cloneShareTokenMap(s.shareByToken)

	record.ClosedAt = time.Now().UTC()
	s.shareByToken[token] = record

	if err := s.persistLocked(); err != nil {
		s.shareByToken = previousShareByToken
		return err
	}

	return nil
}

func (s *Store) GetSharedPlanByToken(token string) (SavedPlan, ShareTokenRecord, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return SavedPlan{}, ShareTokenRecord{}, ErrShareTokenNotFound
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	record, ok := s.shareByToken[token]
	if !ok {
		return SavedPlan{}, ShareTokenRecord{}, ErrShareTokenNotFound
	}
	if !record.ClosedAt.IsZero() {
		return SavedPlan{}, ShareTokenRecord{}, ErrShareTokenNotFound
	}
	if time.Now().UTC().After(record.ExpiresAt) {
		return SavedPlan{}, ShareTokenRecord{}, ErrShareTokenExpired
	}

	plan, ok := s.savedByID[record.PlanID]
	if !ok {
		return SavedPlan{}, ShareTokenRecord{}, ErrSavedPlanNotFound
	}

	return cloneSavedPlan(plan), cloneShareTokenRecord(record), nil
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
	previousVersions := cloneSavedPlanVersionList(s.versionsByPlan[id])
	previousShareByToken := cloneShareTokenMap(s.shareByToken)
	previousSharesByPlan := cloneSharesByPlanMap(s.sharesByPlan)
	previousExecutionByPlanDate := clonePlanExecutionStateMap(s.executionByPlanDate)

	delete(s.savedByID, id)
	delete(s.versionsByPlan, id)

	tokens := append([]string{}, s.sharesByPlan[id]...)
	for _, token := range tokens {
		delete(s.shareByToken, token)
	}
	delete(s.sharesByPlan, id)

	for key, state := range s.executionByPlanDate {
		if strings.TrimSpace(state.SavedPlanID) == id {
			delete(s.executionByPlanDate, key)
		}
	}

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
		s.versionsByPlan[id] = previousVersions
		s.shareByToken = previousShareByToken
		s.sharesByPlan = previousSharesByPlan
		s.executionByPlanDate = previousExecutionByPlanDate
		return false, err
	}
	return true, nil
}

func (s *Store) AddEvent(event EventRecord) error {
	event.Metadata = deepCloneMap(event.Metadata)
	if event.CreatedAt.IsZero() {
		event.CreatedAt = time.Now().UTC()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	previous := cloneEventList(s.events)
	s.events = append(s.events, event)

	if err := s.persistLocked(); err != nil {
		s.events = previous
		return err
	}
	return nil
}

func (s *Store) EventSummary() map[string]int {
	s.mu.RLock()
	defer s.mu.RUnlock()

	summary := map[string]int{}
	for _, event := range s.events {
		summary[event.EventName] += 1
	}
	return summary
}

func (s *Store) RecentEvents(limit int) []EventRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 30
	}
	if limit > len(s.events) {
		limit = len(s.events)
	}

	out := make([]EventRecord, 0, limit)
	for i := len(s.events) - 1; i >= 0 && len(out) < limit; i-- {
		item := s.events[i]
		item.Metadata = deepCloneMap(item.Metadata)
		out = append(out, item)
	}
	return out
}

func (s *Store) getPlanAccessLocked(userID, id string) (SavedPlan, error) {
	plan, ok := s.savedByID[id]
	if !ok {
		return SavedPlan{}, ErrSavedPlanNotFound
	}
	if plan.UserID != userID {
		return SavedPlan{}, ErrSavedPlanForbidden
	}
	return cloneSavedPlan(plan), nil
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
	if state.VersionsByPlan == nil {
		state.VersionsByPlan = map[string][]SavedPlanVersion{}
	}
	if state.ShareByToken == nil {
		state.ShareByToken = map[string]ShareTokenRecord{}
	}
	if state.ExecutionByPlanDate == nil {
		state.ExecutionByPlanDate = map[string]PlanExecutionState{}
	}

	s.savedByUser = map[string][]SavedPlan{}
	s.savedByID = map[string]SavedPlan{}
	s.versionsByPlan = map[string][]SavedPlanVersion{}
	s.shareByToken = map[string]ShareTokenRecord{}
	s.sharesByPlan = map[string][]string{}
	s.executionByPlanDate = map[string]PlanExecutionState{}

	for userID, plans := range state.SavedByUser {
		copied := cloneSavedPlanList(plans)
		s.savedByUser[userID] = copied
		for _, plan := range copied {
			plan.Itinerary = normalizeItineraryForStorage(plan.Itinerary)
			s.savedByID[plan.ID] = cloneSavedPlan(plan)
		}
	}

	for planID, versions := range state.VersionsByPlan {
		s.versionsByPlan[planID] = trimPlanVersions(cloneSavedPlanVersionList(versions))
	}

	for _, plan := range s.savedByID {
		if len(s.versionsByPlan[plan.ID]) == 0 {
			s.versionsByPlan[plan.ID] = []SavedPlanVersion{buildSavedPlanVersion(plan.Itinerary, plan.SavedAt)}
		}
	}

	for token, record := range state.ShareByToken {
		rec := cloneShareTokenRecord(record)
		if strings.TrimSpace(rec.Token) == "" {
			rec.Token = token
		}
		tokenKey := strings.TrimSpace(rec.Token)
		if tokenKey == "" {
			continue
		}
		s.shareByToken[tokenKey] = rec
		s.sharesByPlan[rec.PlanID] = uniqueStrings(append(s.sharesByPlan[rec.PlanID], tokenKey))
	}

	for key, stateItem := range state.ExecutionByPlanDate {
		item := clonePlanExecutionState(stateItem)
		if strings.TrimSpace(item.SavedPlanID) == "" || strings.TrimSpace(item.UserID) == "" || !isISODate(item.Date) {
			continue
		}
		stateKey := strings.TrimSpace(key)
		if stateKey == "" {
			stateKey = buildExecutionStateKey(item.UserID, item.SavedPlanID, item.Date)
		}
		s.executionByPlanDate[stateKey] = item
	}

	s.events = cloneEventList(state.Events)
	return nil
}

func (s *Store) persistLocked() error {
	if s.dataFile == "" {
		return nil
	}

	state := storeState{
		Version:             storeFileVersion,
		SavedByUser:         map[string][]SavedPlan{},
		VersionsByPlan:      map[string][]SavedPlanVersion{},
		ShareByToken:        cloneShareTokenMap(s.shareByToken),
		ExecutionByPlanDate: clonePlanExecutionStateMap(s.executionByPlanDate),
		Events:              cloneEventList(s.events),
	}

	for userID, plans := range s.savedByUser {
		state.SavedByUser[userID] = cloneSavedPlanList(plans)
	}
	for planID, versions := range s.versionsByPlan {
		state.VersionsByPlan[planID] = trimPlanVersions(cloneSavedPlanVersionList(versions))
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

func buildSavedPlanVersion(itinerary map[string]any, createdAt time.Time) SavedPlanVersion {
	normalized := normalizeItineraryForStorage(itinerary)
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}

	version, _ := asInt(normalized["version"])
	if version <= 0 {
		version = 1
	}
	parentVersion := 0
	if parent, ok := asInt(normalized["parent_version"]); ok {
		parentVersion = parent
	}
	changeTypes, changeCount := extractChangeMetadata(normalized)
	summary := summarizeVersion(normalized, changeTypes)

	return SavedPlanVersion{
		Version:       version,
		ParentVersion: parentVersion,
		Summary:       summary,
		ChangeCount:   changeCount,
		ChangeTypes:   changeTypes,
		Itinerary:     deepCloneMap(normalized),
		CreatedAt:     createdAt,
	}
}

func extractChangeMetadata(itinerary map[string]any) ([]string, int) {
	changeItems := asSlice(itinerary["changes"])
	if len(changeItems) == 0 {
		return []string{}, 0
	}
	types := make([]string, 0, len(changeItems))
	for _, item := range changeItems {
		changeType := strings.TrimSpace(asString(asMap(item)["change_type"]))
		if changeType == "" {
			continue
		}
		types = append(types, changeType)
	}
	types = uniqueStrings(types)
	return types, len(changeItems)
}

func summarizeVersion(itinerary map[string]any, changeTypes []string) string {
	if len(changeTypes) == 0 {
		return "initial save"
	}

	primary := changeTypes[0]
	switch primary {
	case "revert":
		for _, item := range asSlice(itinerary["changes"]) {
			change := asMap(item)
			if asString(change["change_type"]) != "revert" {
				continue
			}
			reason := asString(change["reason"])
			prefix := "reverted_to_version_"
			if strings.HasPrefix(reason, prefix) {
				return "revert to v" + strings.TrimPrefix(reason, prefix)
			}
		}
		return "version reverted"
	case "replan_window":
		return "window replan"
	case "lock":
		return "locked blocks"
	case "unlock":
		return "unlocked blocks"
	case "budget":
		return "budget updated"
	case "date":
		return "date updated"
	case "preferences":
		return "preferences updated"
	case "poi":
		return "poi replaced"
	default:
		return "itinerary updated"
	}
}

func extractPreTripTasks(itinerary map[string]any) []PreTripTask {
	items := asSlice(itinerary["pre_trip_tasks"])
	if len(items) == 0 {
		items = asSlice(itinerary["tasks"])
	}
	out := make([]PreTripTask, 0, len(items))
	for _, item := range items {
		m := asMap(item)
		task := PreTripTask{
			ID:       strings.TrimSpace(asString(m["id"])),
			Category: strings.TrimSpace(asString(m["category"])),
			Title:    strings.TrimSpace(asString(m["title"])),
			DueAt:    strings.TrimSpace(asString(m["due_at"])),
			Status:   strings.TrimSpace(asString(m["status"])),
			Reminder: extractTaskReminderFromStorage(m["reminder"]),
		}
		if task.Category == "" {
			task.Category = "general"
		}
		if task.Status == "" {
			task.Status = "todo"
		}
		if task.ID == "" && task.Title == "" {
			continue
		}
		out = append(out, task)
	}
	return normalizePreTripTaskList(out)
}

func extractTaskReminderFromStorage(raw any) *PreTripTaskReminder {
	reminderMap := asMap(raw)
	if len(reminderMap) == 0 {
		return nil
	}
	enabled := true
	if rawEnabled, ok := reminderMap["enabled"]; ok {
		enabled = asBool(rawEnabled)
	}
	offsets := make([]int, 0, len(asSlice(reminderMap["offset_hours"])))
	for _, item := range asSlice(reminderMap["offset_hours"]) {
		hour, ok := asInt(item)
		if !ok {
			continue
		}
		offsets = append(offsets, hour)
	}
	return &PreTripTaskReminder{
		Enabled:     enabled,
		OffsetHours: offsets,
	}
}

func normalizePreTripTaskList(tasks []PreTripTask) []PreTripTask {
	out := make([]PreTripTask, 0, len(tasks))
	for _, task := range tasks {
		next := PreTripTask{
			ID:       strings.TrimSpace(task.ID),
			Category: strings.TrimSpace(task.Category),
			Title:    strings.TrimSpace(task.Title),
			DueAt:    strings.TrimSpace(task.DueAt),
			Status:   strings.ToLower(strings.TrimSpace(task.Status)),
			Reminder: normalizePreTripTaskReminder(task.Reminder),
		}
		if next.Category == "" {
			next.Category = "general"
		}
		if next.Status == "" {
			next.Status = "todo"
		}
		if next.ID == "" {
			next.ID = fmt.Sprintf("task-%03d", len(out)+1)
		}
		if next.Title == "" {
			next.Title = "Unnamed task"
		}
		out = append(out, next)
	}
	return out
}

func tasksToStorage(tasks []PreTripTask) []map[string]any {
	out := make([]map[string]any, 0, len(tasks))
	for _, task := range tasks {
		normalizedReminder := normalizePreTripTaskReminder(task.Reminder)
		item := map[string]any{
			"id":       task.ID,
			"category": task.Category,
			"title":    task.Title,
			"status":   task.Status,
			"reminder": reminderToResponse(normalizedReminder),
		}
		if strings.TrimSpace(task.DueAt) != "" {
			item["due_at"] = task.DueAt
		}
		out = append(out, item)
	}
	return out
}

func trimPlanVersions(versions []SavedPlanVersion) []SavedPlanVersion {
	if len(versions) <= maxPlanVersions {
		return versions
	}
	return cloneSavedPlanVersionList(versions[:maxPlanVersions])
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

func cloneSavedPlanVersion(version SavedPlanVersion) SavedPlanVersion {
	version.Itinerary = deepCloneMap(version.Itinerary)
	version.ChangeTypes = append([]string{}, version.ChangeTypes...)
	return version
}

func cloneSavedPlanVersionList(versions []SavedPlanVersion) []SavedPlanVersion {
	if len(versions) == 0 {
		return []SavedPlanVersion{}
	}
	out := make([]SavedPlanVersion, 0, len(versions))
	for _, version := range versions {
		out = append(out, cloneSavedPlanVersion(version))
	}
	return out
}

func clonePreTripTaskList(tasks []PreTripTask) []PreTripTask {
	if len(tasks) == 0 {
		return []PreTripTask{}
	}
	out := make([]PreTripTask, 0, len(tasks))
	for _, task := range tasks {
		cloned := task
		if task.Reminder != nil {
			cloned.Reminder = &PreTripTaskReminder{
				Enabled:     task.Reminder.Enabled,
				OffsetHours: cloneReminderOffsetHours(task.Reminder.OffsetHours),
			}
		}
		out = append(out, cloned)
	}
	return out
}

func executionBlockStateMapKey(dayIndex int, blockID string) string {
	return fmt.Sprintf("%d::%s", dayIndex, strings.TrimSpace(blockID))
}

func buildExecutionStateKey(userID, planID, date string) string {
	return strings.TrimSpace(userID) + ":" + strings.TrimSpace(planID) + ":" + strings.TrimSpace(date)
}

func normalizeExecutionStatus(status string) string {
	normalized := strings.ToLower(strings.TrimSpace(status))
	switch normalized {
	case "pending", "done", "skipped":
		return normalized
	default:
		return ""
	}
}

func cloneExecutionBlockStateList(blocks []ExecutionBlockState) []ExecutionBlockState {
	if len(blocks) == 0 {
		return []ExecutionBlockState{}
	}
	out := make([]ExecutionBlockState, 0, len(blocks))
	for _, block := range blocks {
		out = append(out, block)
	}
	return out
}

func clonePlanExecutionState(state PlanExecutionState) PlanExecutionState {
	state.Blocks = cloneExecutionBlockStateList(state.Blocks)
	return state
}

func clonePlanExecutionStateMap(values map[string]PlanExecutionState) map[string]PlanExecutionState {
	if len(values) == 0 {
		return map[string]PlanExecutionState{}
	}
	out := make(map[string]PlanExecutionState, len(values))
	for key, value := range values {
		out[key] = clonePlanExecutionState(value)
	}
	return out
}

func cloneShareTokenRecord(record ShareTokenRecord) ShareTokenRecord {
	return ShareTokenRecord{
		Token:     record.Token,
		PlanID:    record.PlanID,
		UserID:    record.UserID,
		ExpiresAt: record.ExpiresAt,
		CreatedAt: record.CreatedAt,
		ClosedAt:  record.ClosedAt,
	}
}

func cloneShareTokenMap(values map[string]ShareTokenRecord) map[string]ShareTokenRecord {
	if len(values) == 0 {
		return map[string]ShareTokenRecord{}
	}
	out := make(map[string]ShareTokenRecord, len(values))
	for key, value := range values {
		out[key] = cloneShareTokenRecord(value)
	}
	return out
}

func cloneSharesByPlanMap(values map[string][]string) map[string][]string {
	if len(values) == 0 {
		return map[string][]string{}
	}
	out := make(map[string][]string, len(values))
	for key, items := range values {
		copied := make([]string, 0, len(items))
		for _, token := range items {
			if strings.TrimSpace(token) == "" {
				continue
			}
			copied = append(copied, token)
		}
		out[key] = copied
	}
	return out
}

func cloneEventList(events []EventRecord) []EventRecord {
	if len(events) == 0 {
		return []EventRecord{}
	}
	out := make([]EventRecord, 0, len(events))
	for _, event := range events {
		event.Metadata = deepCloneMap(event.Metadata)
		out = append(out, event)
	}
	return out
}
