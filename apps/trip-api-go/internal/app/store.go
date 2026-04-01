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
	storeFileVersion = 8
	maxPlanVersions  = 20
)

var (
	ErrSavedPlanNotFound          = errors.New("saved plan not found")
	ErrSavedPlanForbidden         = errors.New("saved plan forbidden")
	ErrTargetVersionNotFound      = errors.New("target version not found")
	ErrShareTokenNotFound         = errors.New("share token not found")
	ErrShareTokenExpired          = errors.New("share token expired")
	ErrExecutionStateNotFound     = errors.New("execution state not found")
	ErrCommunityPostNotFound      = errors.New("community post not found")
	ErrCommunityVoteInvalid       = errors.New("community vote invalid")
	ErrCommunityReportInvalid     = errors.New("community report invalid")
	ErrCommunityModerationInvalid = errors.New("community moderation invalid")
)

type storeState struct {
	Version                   int                                    `json:"version"`
	SavedByUser               map[string][]SavedPlan                 `json:"saved_by_user"`
	VersionsByPlan            map[string][]SavedPlanVersion          `json:"versions_by_plan"`
	ShareByToken              map[string]ShareTokenRecord            `json:"share_by_token"`
	ExecutionByPlanDate       map[string]PlanExecutionState          `json:"execution_by_plan_date"`
	Events                    []EventRecord                          `json:"events"`
	ProfilesByUser            map[string]UserPrivateProfile          `json:"profiles_by_user"`
	PersonalizationByUser     map[string]UserPersonalizationSettings `json:"personalization_by_user"`
	CommunityPostsByID        map[string]CommunityPost               `json:"community_posts_by_id"`
	CommunityVotesByPost      map[string][]CommunityVote             `json:"community_votes_by_post"`
	CommunityReportsByPost    map[string][]CommunityReport           `json:"community_reports_by_post"`
	CommunityModerationByPost map[string][]CommunityModerationLog    `json:"community_moderation_by_post"`
}

// Store keeps runtime data in memory and persists to a local JSON file.
type Store struct {
	mu                        sync.RWMutex
	savedByUser               map[string][]SavedPlan
	savedByID                 map[string]SavedPlan
	versionsByPlan            map[string][]SavedPlanVersion
	shareByToken              map[string]ShareTokenRecord
	sharesByPlan              map[string][]string
	executionByPlanDate       map[string]PlanExecutionState
	events                    []EventRecord
	profilesByUser            map[string]UserPrivateProfile
	personalizationByUser     map[string]UserPersonalizationSettings
	communityPostsByID        map[string]CommunityPost
	communityVotesByPost      map[string][]CommunityVote
	communityReportsByPost    map[string][]CommunityReport
	communityModerationByPost map[string][]CommunityModerationLog
	dataFile                  string
}

func NewStore(dataFile string) (*Store, error) {
	s := &Store{
		savedByUser:               map[string][]SavedPlan{},
		savedByID:                 map[string]SavedPlan{},
		versionsByPlan:            map[string][]SavedPlanVersion{},
		shareByToken:              map[string]ShareTokenRecord{},
		sharesByPlan:              map[string][]string{},
		executionByPlanDate:       map[string]PlanExecutionState{},
		events:                    make([]EventRecord, 0, 128),
		profilesByUser:            map[string]UserPrivateProfile{},
		personalizationByUser:     map[string]UserPersonalizationSettings{},
		communityPostsByID:        map[string]CommunityPost{},
		communityVotesByPost:      map[string][]CommunityVote{},
		communityReportsByPost:    map[string][]CommunityReport{},
		communityModerationByPost: map[string][]CommunityModerationLog{},
		dataFile:                  strings.TrimSpace(dataFile),
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

	previousEvents := cloneEventList(s.events)
	previousProfiles := cloneUserPrivateProfileMap(s.profilesByUser)
	s.events = append(s.events, event)
	if userID := strings.TrimSpace(event.UserID); userID != "" && s.personalizationEnabledLocked(userID) {
		s.profilesByUser[userID] = projectUserPrivateProfile(userID, s.events)
	}

	if err := s.persistLocked(); err != nil {
		s.events = previousEvents
		s.profilesByUser = previousProfiles
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

func (s *Store) GetPrivateProfile(userID string) (UserPrivateProfile, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	profile, ok := s.profilesByUser[strings.TrimSpace(userID)]
	if !ok {
		return UserPrivateProfile{}, false
	}
	return cloneUserPrivateProfile(profile), true
}

func (s *Store) GetPersonalizationSettings(userID string) UserPersonalizationSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneUserPersonalizationSettings(s.personalizationSettingsLocked(userID))
}

func (s *Store) UpdatePersonalizationSettings(userID string, enabled bool) (UserPersonalizationSettings, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return UserPersonalizationSettings{}, errors.New("user id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	previousProfiles := cloneUserPrivateProfileMap(s.profilesByUser)
	previousSettings := cloneUserPersonalizationSettingsMap(s.personalizationByUser)

	settings := s.personalizationSettingsLocked(userID)
	settings.Enabled = enabled
	settings.UpdatedAt = time.Now().UTC()
	s.personalizationByUser[userID] = cloneUserPersonalizationSettings(settings)

	if enabled {
		if profile := projectUserPrivateProfile(userID, s.events); profile.UserID != "" {
			s.profilesByUser[userID] = profile
		}
	} else {
		delete(s.profilesByUser, userID)
	}

	if err := s.persistLocked(); err != nil {
		s.profilesByUser = previousProfiles
		s.personalizationByUser = previousSettings
		return UserPersonalizationSettings{}, err
	}
	return cloneUserPersonalizationSettings(settings), nil
}

func (s *Store) ClearPrivateSignals(userID string) (UserPersonalizationSettings, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return UserPersonalizationSettings{}, errors.New("user id is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	previousEvents := cloneEventList(s.events)
	previousProfiles := cloneUserPrivateProfileMap(s.profilesByUser)
	previousSettings := cloneUserPersonalizationSettingsMap(s.personalizationByUser)

	filtered := make([]EventRecord, 0, len(s.events))
	for _, item := range s.events {
		if strings.TrimSpace(item.UserID) == userID {
			continue
		}
		filtered = append(filtered, item)
	}
	s.events = filtered
	delete(s.profilesByUser, userID)

	settings := s.personalizationSettingsLocked(userID)
	settings.ClearedAt = time.Now().UTC()
	settings.UpdatedAt = settings.ClearedAt
	s.personalizationByUser[userID] = cloneUserPersonalizationSettings(settings)

	if err := s.persistLocked(); err != nil {
		s.events = previousEvents
		s.profilesByUser = previousProfiles
		s.personalizationByUser = previousSettings
		return UserPersonalizationSettings{}, err
	}
	return cloneUserPersonalizationSettings(settings), nil
}

func (s *Store) GetEffectivePrivateProfile(userID string) (UserPrivateProfile, UserPersonalizationSettings, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	settings := s.personalizationSettingsLocked(userID)
	if !settings.Enabled {
		return UserPrivateProfile{}, cloneUserPersonalizationSettings(settings), false
	}
	profile, ok := s.profilesByUser[strings.TrimSpace(userID)]
	if !ok {
		return UserPrivateProfile{}, cloneUserPersonalizationSettings(settings), false
	}
	return cloneUserPrivateProfile(profile), cloneUserPersonalizationSettings(settings), true
}

func (s *Store) CreateCommunityPost(post CommunityPost) (CommunityPost, error) {
	post = normalizeCommunityPost(post)
	if post.ID == "" {
		post.ID = randomID()
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	previousPosts := cloneCommunityPostMap(s.communityPostsByID)
	previousVotes := cloneCommunityVoteMap(s.communityVotesByPost)
	previousReports := cloneCommunityReportMap(s.communityReportsByPost)
	previousModeration := cloneCommunityModerationLogMap(s.communityModerationByPost)
	post.VoteSummary = summarizeCommunityVotes(s.communityVotesByPost[post.ID])
	s.communityPostsByID[post.ID] = cloneCommunityPost(post)

	if err := s.persistLocked(); err != nil {
		s.communityPostsByID = previousPosts
		s.communityVotesByPost = previousVotes
		s.communityReportsByPost = previousReports
		s.communityModerationByPost = previousModeration
		return CommunityPost{}, err
	}
	return cloneCommunityPost(post), nil
}

func (s *Store) ListCommunityPosts(filter CommunityPostFilter) []CommunityPost {
	s.mu.RLock()
	defer s.mu.RUnlock()

	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	destination := &DestinationEntity{
		DestinationID:    strings.TrimSpace(filter.DestinationID),
		DestinationLabel: strings.TrimSpace(filter.DestinationLabel),
	}
	if destination.DestinationID == "" && destination.DestinationLabel == "" {
		destination = nil
	}

	status := strings.TrimSpace(filter.Status)
	items := make([]CommunityPost, 0, len(s.communityPostsByID))
	for _, raw := range s.communityPostsByID {
		post := s.decorateCommunityPostLocked(raw)
		if filter.OwnerOnly {
			if strings.TrimSpace(post.UserID) != strings.TrimSpace(filter.RequestUserID) {
				continue
			}
		} else if !filter.AdminView && !communityPostVisibleToUser(post, filter.RequestUserID) {
			continue
		}
		if status != "" && post.Status != status {
			continue
		}
		if destination != nil && !communityPostMatchesDestination(post, destination, filter.DestinationLabel) {
			continue
		}
		items = append(items, post)
	}

	sort.SliceStable(items, func(i, j int) bool {
		leftScore := communityFeatureScore(items[i])
		rightScore := communityFeatureScore(items[j])
		if leftScore == rightScore {
			leftTime := firstNonZeroTime(items[i].PublishedAt, items[i].UpdatedAt, items[i].CreatedAt)
			rightTime := firstNonZeroTime(items[j].PublishedAt, items[j].UpdatedAt, items[j].CreatedAt)
			if leftTime.Equal(rightTime) {
				return items[i].ID < items[j].ID
			}
			return leftTime.After(rightTime)
		}
		return leftScore > rightScore
	})

	if len(items) > limit {
		items = items[:limit]
	}
	return cloneCommunityPostList(items)
}

func (s *Store) GetCommunityPost(postID string) (CommunityPost, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	post, ok := s.communityPostsByID[strings.TrimSpace(postID)]
	if !ok {
		return CommunityPost{}, false
	}
	return s.decorateCommunityPostLocked(post), true
}

func (s *Store) GetCommunityPostDetail(postID, requestUserID string, limit int) (CommunityPostDetail, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	post, ok := s.communityPostsByID[strings.TrimSpace(postID)]
	if !ok {
		return CommunityPostDetail{}, false
	}
	post = s.decorateCommunityPostLocked(post)
	if !communityPostVisibleToUser(post, requestUserID) {
		return CommunityPostDetail{}, false
	}

	author, ok := s.buildCommunityAuthorPublicProfileLocked(post.UserID, requestUserID, 6)
	if !ok {
		return CommunityPostDetail{}, false
	}

	related := s.relatedCommunityPostsLocked(post, requestUserID, limit)
	return CommunityPostDetail{
		Post:                cloneCommunityPost(post),
		Author:              cloneCommunityAuthorPublicProfile(author),
		RelatedPosts:        cloneCommunityPostList(related),
		ReferenceCount:      post.ReferenceCount,
		ReferencedSaveCount: post.ReferencedSaveCount,
	}, true
}

func (s *Store) GetCommunityAuthorPublicProfile(authorUserID, requestUserID string, limit int) (CommunityAuthorPublicProfile, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.buildCommunityAuthorPublicProfileLocked(authorUserID, requestUserID, limit)
}

func (s *Store) VoteCommunityPost(postID, userID, voteType string) (CommunityPost, error) {
	postID = strings.TrimSpace(postID)
	userID = strings.TrimSpace(userID)
	voteType = normalizeCommunityVoteType(voteType)
	if voteType == "" || userID == "" || postID == "" {
		return CommunityPost{}, ErrCommunityVoteInvalid
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	post, ok := s.communityPostsByID[postID]
	if !ok {
		return CommunityPost{}, ErrCommunityPostNotFound
	}

	previousPosts := cloneCommunityPostMap(s.communityPostsByID)
	previousVotes := cloneCommunityVoteMap(s.communityVotesByPost)
	previousReports := cloneCommunityReportMap(s.communityReportsByPost)
	previousModeration := cloneCommunityModerationLogMap(s.communityModerationByPost)

	votes := cloneCommunityVoteList(s.communityVotesByPost[postID])
	replaced := false
	for idx, vote := range votes {
		if strings.TrimSpace(vote.UserID) != userID {
			continue
		}
		votes[idx] = CommunityVote{
			PostID:    postID,
			UserID:    userID,
			VoteType:  voteType,
			CreatedAt: time.Now().UTC(),
		}
		replaced = true
		break
	}
	if !replaced {
		votes = append(votes, CommunityVote{
			PostID:    postID,
			UserID:    userID,
			VoteType:  voteType,
			CreatedAt: time.Now().UTC(),
		})
	}
	s.communityVotesByPost[postID] = votes
	post.VoteSummary = summarizeCommunityVotes(votes)
	s.communityPostsByID[postID] = cloneCommunityPost(post)

	if err := s.persistLocked(); err != nil {
		s.communityPostsByID = previousPosts
		s.communityVotesByPost = previousVotes
		s.communityReportsByPost = previousReports
		s.communityModerationByPost = previousModeration
		return CommunityPost{}, err
	}
	return cloneCommunityPost(post), nil
}

func (s *Store) ReportCommunityPost(postID, userID, reason, detail string) (CommunityPost, CommunityReport, error) {
	postID = strings.TrimSpace(postID)
	userID = strings.TrimSpace(userID)
	reason = normalizeCommunityReportReason(reason)
	detail = normalizeCommunityText(detail)
	if postID == "" || userID == "" || reason == "" {
		return CommunityPost{}, CommunityReport{}, ErrCommunityReportInvalid
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	post, ok := s.communityPostsByID[postID]
	if !ok {
		return CommunityPost{}, CommunityReport{}, ErrCommunityPostNotFound
	}
	if strings.TrimSpace(post.UserID) == userID || !communityPostCanBeReported(post) {
		return CommunityPost{}, CommunityReport{}, ErrCommunityReportInvalid
	}

	previousPosts := cloneCommunityPostMap(s.communityPostsByID)
	previousVotes := cloneCommunityVoteMap(s.communityVotesByPost)
	previousReports := cloneCommunityReportMap(s.communityReportsByPost)
	previousModeration := cloneCommunityModerationLogMap(s.communityModerationByPost)

	now := time.Now().UTC()
	reports := cloneCommunityReportList(s.communityReportsByPost[postID])
	var savedReport CommunityReport
	replaced := false
	for idx, report := range reports {
		if strings.TrimSpace(report.ReporterUserID) != userID {
			continue
		}
		report.Reason = reason
		report.Detail = detail
		report.Status = communityReportStatusOpen
		report.UpdatedAt = now
		report.ResolvedAt = time.Time{}
		reports[idx] = cloneCommunityReport(report)
		savedReport = cloneCommunityReport(report)
		replaced = true
		break
	}
	if !replaced {
		savedReport = CommunityReport{
			ID:             randomID(),
			PostID:         postID,
			ReporterUserID: userID,
			Reason:         reason,
			Detail:         detail,
			Status:         communityReportStatusOpen,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		reports = append(reports, cloneCommunityReport(savedReport))
	}

	post.VoteSummary = summarizeCommunityVotes(s.communityVotesByPost[postID])
	if countDistinctOpenCommunityReporters(reports) >= communityAutoReportThreshold && post.Status == communityPostStatusPublished {
		post.Status = communityPostStatusReported
		post.ProcessingNote = communityAutoReportedNote()
		post.UpdatedAt = now
	}

	s.communityReportsByPost[postID] = cloneCommunityReportList(reports)
	s.communityPostsByID[postID] = cloneCommunityPost(post)

	if err := s.persistLocked(); err != nil {
		s.communityPostsByID = previousPosts
		s.communityVotesByPost = previousVotes
		s.communityReportsByPost = previousReports
		s.communityModerationByPost = previousModeration
		return CommunityPost{}, CommunityReport{}, err
	}
	return cloneCommunityPost(post), cloneCommunityReport(savedReport), nil
}

func (s *Store) ModerateCommunityPost(postID, adminUserID, action, reason, note string) (CommunityPost, CommunityModerationLog, error) {
	postID = strings.TrimSpace(postID)
	adminUserID = strings.TrimSpace(adminUserID)
	action = normalizeCommunityModerationAction(action)
	reason = normalizedSignalKey(reason)
	note = normalizeCommunityText(note)
	if postID == "" || adminUserID == "" || action == "" || reason == "" {
		return CommunityPost{}, CommunityModerationLog{}, ErrCommunityModerationInvalid
	}

	nextStatus := communityModerationNextStatus(action)
	if nextStatus == "" {
		return CommunityPost{}, CommunityModerationLog{}, ErrCommunityModerationInvalid
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	post, ok := s.communityPostsByID[postID]
	if !ok {
		return CommunityPost{}, CommunityModerationLog{}, ErrCommunityPostNotFound
	}

	previousPosts := cloneCommunityPostMap(s.communityPostsByID)
	previousVotes := cloneCommunityVoteMap(s.communityVotesByPost)
	previousReports := cloneCommunityReportMap(s.communityReportsByPost)
	previousModeration := cloneCommunityModerationLogMap(s.communityModerationByPost)

	now := time.Now().UTC()
	logEntry := CommunityModerationLog{
		ID:             randomID(),
		PostID:         postID,
		OperatorUserID: adminUserID,
		Action:         action,
		Reason:         reason,
		Note:           note,
		PreviousStatus: post.Status,
		NextStatus:     nextStatus,
		CreatedAt:      now,
	}

	post.Status = nextStatus
	post.ProcessingNote = communityModerationNote(action)
	post.UpdatedAt = now
	if nextStatus == communityPostStatusPublished && post.PublishedAt.IsZero() {
		post.PublishedAt = now
	}

	reportResolution := communityReportStatusResolvedValid
	if nextStatus == communityPostStatusPublished {
		reportResolution = communityReportStatusResolvedInvalid
	}
	s.communityReportsByPost[postID] = resolveOpenCommunityReports(s.communityReportsByPost[postID], reportResolution, now)
	logs := append(cloneCommunityModerationLogList(s.communityModerationByPost[postID]), cloneCommunityModerationLog(logEntry))
	s.communityModerationByPost[postID] = logs
	post.VoteSummary = summarizeCommunityVotes(s.communityVotesByPost[postID])
	s.communityPostsByID[postID] = cloneCommunityPost(post)

	if err := s.persistLocked(); err != nil {
		s.communityPostsByID = previousPosts
		s.communityVotesByPost = previousVotes
		s.communityReportsByPost = previousReports
		s.communityModerationByPost = previousModeration
		return CommunityPost{}, CommunityModerationLog{}, err
	}
	return cloneCommunityPost(post), cloneCommunityModerationLog(logEntry), nil
}

func (s *Store) ListCommunityReports(limit int, status string) []CommunityReportAggregate {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > 100 {
		limit = 20
	}
	status = normalizeCommunityReportStatus(status)

	items := make([]CommunityReportAggregate, 0, len(s.communityReportsByPost))
	for postID, reports := range s.communityReportsByPost {
		post, ok := s.communityPostsByID[postID]
		if !ok {
			continue
		}
		filteredReports := make([]CommunityReport, 0, len(reports))
		openCount := 0
		reasons := make([]string, 0, 4)
		latest := time.Time{}
		for _, raw := range reports {
			report := cloneCommunityReport(raw)
			if status != "" && report.Status != status {
				continue
			}
			filteredReports = append(filteredReports, report)
			reasons = append(reasons, report.Reason)
			if report.Status == communityReportStatusOpen {
				openCount++
			}
			if report.UpdatedAt.After(latest) {
				latest = report.UpdatedAt
			}
		}
		if len(filteredReports) == 0 {
			continue
		}
		post = s.decorateCommunityPostLocked(post)
		items = append(items, CommunityReportAggregate{
			Post:            post,
			OpenReportCount: openCount,
			LatestReportAt:  latest,
			Reasons:         uniqueStrings(reasons),
			Reports:         filteredReports,
			ModerationLogs:  cloneCommunityModerationLogList(s.communityModerationByPost[postID]),
		})
	}

	sort.SliceStable(items, func(i, j int) bool {
		if items[i].OpenReportCount == items[j].OpenReportCount {
			if items[i].LatestReportAt.Equal(items[j].LatestReportAt) {
				return items[i].Post.ID < items[j].Post.ID
			}
			return items[i].LatestReportAt.After(items[j].LatestReportAt)
		}
		return items[i].OpenReportCount > items[j].OpenReportCount
	})

	if len(items) > limit {
		items = items[:limit]
	}
	return cloneCommunityReportAggregateList(items)
}

func (s *Store) BuildCommunityPlanningSummary(destination *DestinationEntity, fallbackLabel string, explicitPostIDs []string, limit int) CommunityPlanningSummary {
	s.mu.RLock()
	defer s.mu.RUnlock()

	posts := make([]CommunityPost, 0, len(s.communityPostsByID))
	for _, post := range s.communityPostsByID {
		posts = append(posts, s.decorateCommunityPostLocked(post))
	}
	return buildCommunityPlanningSummaryFromPosts(destination, fallbackLabel, posts, explicitPostIDs, limit)
}

func (s *Store) decorateCommunityPostLocked(raw CommunityPost) CommunityPost {
	post := cloneCommunityPost(raw)
	post.VoteSummary = summarizeCommunityVotes(s.communityVotesByPost[post.ID])
	post.ReferenceCount, post.ReferencedSaveCount = s.communityPostReferenceStatsLocked(post.ID)
	return cloneCommunityPost(post)
}

func (s *Store) communityPostReferenceStatsLocked(postID string) (int, int) {
	postID = strings.TrimSpace(postID)
	if postID == "" {
		return 0, 0
	}

	referenceCount := 0
	referencedSaveCount := 0
	for _, event := range s.events {
		ids := uniqueStrings(asStringSlice(event.Metadata["community_referenced_post_ids"]))
		if len(ids) == 0 {
			ids = uniqueStrings(asStringSlice(event.Metadata["community_post_ids"]))
		}
		if !containsString(ids, postID) {
			continue
		}
		switch strings.TrimSpace(event.EventName) {
		case "plan_generated_v2", "plan_generated":
			referenceCount++
		case "plan_saved":
			referencedSaveCount++
		}
	}
	return referenceCount, referencedSaveCount
}

func (s *Store) relatedCommunityPostsLocked(post CommunityPost, requestUserID string, limit int) []CommunityPost {
	if limit <= 0 || limit > 12 {
		limit = 4
	}

	items := make([]CommunityPost, 0, limit)
	for _, raw := range s.communityPostsByID {
		if strings.TrimSpace(raw.ID) == strings.TrimSpace(post.ID) {
			continue
		}
		candidate := s.decorateCommunityPostLocked(raw)
		if !communityPostVisibleToUser(candidate, requestUserID) {
			continue
		}
		if !communityPostsAreRelated(post, candidate) {
			continue
		}
		items = append(items, candidate)
	}

	sort.SliceStable(items, func(i, j int) bool {
		leftScore := communityRelatedScore(post, items[i])
		rightScore := communityRelatedScore(post, items[j])
		if leftScore == rightScore {
			return firstNonZeroTime(items[i].PublishedAt, items[i].UpdatedAt, items[i].CreatedAt).After(
				firstNonZeroTime(items[j].PublishedAt, items[j].UpdatedAt, items[j].CreatedAt),
			)
		}
		return leftScore > rightScore
	})

	if len(items) > limit {
		items = items[:limit]
	}
	return cloneCommunityPostList(items)
}

func (s *Store) buildCommunityAuthorPublicProfileLocked(authorUserID, requestUserID string, limit int) (CommunityAuthorPublicProfile, bool) {
	authorUserID = strings.TrimSpace(authorUserID)
	if authorUserID == "" {
		return CommunityAuthorPublicProfile{}, false
	}
	if limit <= 0 || limit > 20 {
		limit = 8
	}

	visiblePosts := make([]CommunityPost, 0, limit)
	destinationAgg := map[string]*CommunityAuthorDestinationSummary{}
	tagScores := map[string]int{}
	helpfulTotal := 0
	referenceTotal := 0
	referencedSaveTotal := 0
	latest := time.Time{}

	for _, raw := range s.communityPostsByID {
		if strings.TrimSpace(raw.UserID) != authorUserID {
			continue
		}
		post := s.decorateCommunityPostLocked(raw)
		if !communityPostVisibleToUser(post, requestUserID) {
			continue
		}
		visiblePosts = append(visiblePosts, post)
		helpfulTotal += post.VoteSummary.HelpfulCount
		referenceTotal += post.ReferenceCount
		referencedSaveTotal += post.ReferencedSaveCount
		if ts := firstNonZeroTime(post.PublishedAt, post.UpdatedAt, post.CreatedAt); ts.After(latest) {
			latest = ts
		}
		destKey := firstNonBlank(post.DestinationID, post.DestinationLabel)
		if destKey != "" {
			entry, ok := destinationAgg[destKey]
			if !ok {
				entry = &CommunityAuthorDestinationSummary{
					DestinationID:    strings.TrimSpace(post.DestinationID),
					DestinationLabel: strings.TrimSpace(post.DestinationLabel),
				}
				destinationAgg[destKey] = entry
			}
			entry.PostCount++
		}
		for _, tag := range post.Tags {
			tagScores[tag]++
		}
	}

	if len(visiblePosts) == 0 {
		return CommunityAuthorPublicProfile{}, false
	}

	sort.SliceStable(visiblePosts, func(i, j int) bool {
		left := firstNonZeroTime(visiblePosts[i].PublishedAt, visiblePosts[i].UpdatedAt, visiblePosts[i].CreatedAt)
		right := firstNonZeroTime(visiblePosts[j].PublishedAt, visiblePosts[j].UpdatedAt, visiblePosts[j].CreatedAt)
		if left.Equal(right) {
			return visiblePosts[i].ID < visiblePosts[j].ID
		}
		return left.After(right)
	})
	if len(visiblePosts) > limit {
		visiblePosts = visiblePosts[:limit]
	}

	destinations := make([]CommunityAuthorDestinationSummary, 0, len(destinationAgg))
	for _, item := range destinationAgg {
		destinations = append(destinations, *item)
	}
	sort.SliceStable(destinations, func(i, j int) bool {
		if destinations[i].PostCount == destinations[j].PostCount {
			return destinations[i].DestinationLabel < destinations[j].DestinationLabel
		}
		return destinations[i].PostCount > destinations[j].PostCount
	})
	if len(destinations) > 4 {
		destinations = destinations[:4]
	}

	topTags := sortedKeysByCount(tagScores, 5)
	profile := CommunityAuthorPublicProfile{
		UserID:              authorUserID,
		DisplayName:         communityAuthorDisplayName(authorUserID),
		PublishedPostCount:  len(visiblePosts),
		HelpfulCount:        helpfulTotal,
		ReferenceCount:      referenceTotal,
		ReferencedSaveCount: referencedSaveTotal,
		TopTags:             topTags,
		Destinations:        destinations,
		RecentPosts:         cloneCommunityPostList(visiblePosts),
		UpdatedAt:           latest,
	}
	return cloneCommunityAuthorPublicProfile(profile), true
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
	if state.ProfilesByUser == nil {
		state.ProfilesByUser = map[string]UserPrivateProfile{}
	}
	if state.PersonalizationByUser == nil {
		state.PersonalizationByUser = map[string]UserPersonalizationSettings{}
	}
	if state.CommunityPostsByID == nil {
		state.CommunityPostsByID = map[string]CommunityPost{}
	}
	if state.CommunityVotesByPost == nil {
		state.CommunityVotesByPost = map[string][]CommunityVote{}
	}
	if state.CommunityReportsByPost == nil {
		state.CommunityReportsByPost = map[string][]CommunityReport{}
	}
	if state.CommunityModerationByPost == nil {
		state.CommunityModerationByPost = map[string][]CommunityModerationLog{}
	}

	s.savedByUser = map[string][]SavedPlan{}
	s.savedByID = map[string]SavedPlan{}
	s.versionsByPlan = map[string][]SavedPlanVersion{}
	s.shareByToken = map[string]ShareTokenRecord{}
	s.sharesByPlan = map[string][]string{}
	s.executionByPlanDate = map[string]PlanExecutionState{}
	s.profilesByUser = map[string]UserPrivateProfile{}
	s.personalizationByUser = map[string]UserPersonalizationSettings{}
	s.communityPostsByID = map[string]CommunityPost{}
	s.communityVotesByPost = map[string][]CommunityVote{}
	s.communityReportsByPost = map[string][]CommunityReport{}
	s.communityModerationByPost = map[string][]CommunityModerationLog{}

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
	s.profilesByUser = cloneUserPrivateProfileMap(state.ProfilesByUser)
	s.personalizationByUser = cloneUserPersonalizationSettingsMap(state.PersonalizationByUser)
	if len(s.profilesByUser) == 0 && len(s.events) > 0 {
		s.profilesByUser = buildPrivateProfilesByUser(s.events)
	}
	for userID, profile := range cloneUserPrivateProfileMap(s.profilesByUser) {
		if !s.personalizationEnabledLocked(userID) {
			delete(s.profilesByUser, userID)
			continue
		}
		s.profilesByUser[userID] = profile
	}
	s.communityPostsByID = cloneCommunityPostMap(state.CommunityPostsByID)
	s.communityVotesByPost = cloneCommunityVoteMap(state.CommunityVotesByPost)
	s.communityReportsByPost = cloneCommunityReportMap(state.CommunityReportsByPost)
	s.communityModerationByPost = cloneCommunityModerationLogMap(state.CommunityModerationByPost)
	for postID, post := range s.communityPostsByID {
		post.VoteSummary = summarizeCommunityVotes(s.communityVotesByPost[postID])
		s.communityPostsByID[postID] = cloneCommunityPost(post)
	}
	return nil
}

func (s *Store) persistLocked() error {
	if s.dataFile == "" {
		return nil
	}

	state := storeState{
		Version:                   storeFileVersion,
		SavedByUser:               map[string][]SavedPlan{},
		VersionsByPlan:            map[string][]SavedPlanVersion{},
		ShareByToken:              cloneShareTokenMap(s.shareByToken),
		ExecutionByPlanDate:       clonePlanExecutionStateMap(s.executionByPlanDate),
		Events:                    cloneEventList(s.events),
		ProfilesByUser:            cloneUserPrivateProfileMap(s.profilesByUser),
		PersonalizationByUser:     cloneUserPersonalizationSettingsMap(s.personalizationByUser),
		CommunityPostsByID:        cloneCommunityPostMap(s.communityPostsByID),
		CommunityVotesByPost:      cloneCommunityVoteMap(s.communityVotesByPost),
		CommunityReportsByPost:    cloneCommunityReportMap(s.communityReportsByPost),
		CommunityModerationByPost: cloneCommunityModerationLogMap(s.communityModerationByPost),
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

func cloneUserPrivateProfileMap(values map[string]UserPrivateProfile) map[string]UserPrivateProfile {
	if len(values) == 0 {
		return map[string]UserPrivateProfile{}
	}
	out := make(map[string]UserPrivateProfile, len(values))
	for key, value := range values {
		out[key] = cloneUserPrivateProfile(value)
	}
	return out
}

func cloneUserPrivateProfile(profile UserPrivateProfile) UserPrivateProfile {
	profile.UserID = strings.TrimSpace(profile.UserID)
	profile.ExplicitPreferences.TravelStyles = append([]string{}, profile.ExplicitPreferences.TravelStyles...)
	profile.BehavioralAffinity.Categories = cloneStringFloatMap(profile.BehavioralAffinity.Categories)
	profile.BehavioralAffinity.Tags = cloneStringFloatMap(profile.BehavioralAffinity.Tags)
	profile.BehavioralAffinity.Districts = cloneStringFloatMap(profile.BehavioralAffinity.Districts)
	return normalizeUserPrivateProfile(profile)
}

func defaultUserPersonalizationSettings() UserPersonalizationSettings {
	return UserPersonalizationSettings{
		Enabled: true,
	}
}

func normalizeUserPersonalizationSettings(settings UserPersonalizationSettings) UserPersonalizationSettings {
	if settings.UpdatedAt.IsZero() && !settings.ClearedAt.IsZero() {
		settings.UpdatedAt = settings.ClearedAt
	}
	if settings.UpdatedAt.IsZero() {
		settings.UpdatedAt = time.Now().UTC()
	}
	return settings
}

func cloneUserPersonalizationSettings(settings UserPersonalizationSettings) UserPersonalizationSettings {
	return normalizeUserPersonalizationSettings(settings)
}

func cloneUserPersonalizationSettingsMap(values map[string]UserPersonalizationSettings) map[string]UserPersonalizationSettings {
	if len(values) == 0 {
		return map[string]UserPersonalizationSettings{}
	}
	out := make(map[string]UserPersonalizationSettings, len(values))
	for key, value := range values {
		out[key] = cloneUserPersonalizationSettings(value)
	}
	return out
}

func (s *Store) personalizationSettingsLocked(userID string) UserPersonalizationSettings {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return cloneUserPersonalizationSettings(defaultUserPersonalizationSettings())
	}
	settings, ok := s.personalizationByUser[userID]
	if !ok {
		return cloneUserPersonalizationSettings(defaultUserPersonalizationSettings())
	}
	return cloneUserPersonalizationSettings(settings)
}

func (s *Store) personalizationEnabledLocked(userID string) bool {
	return s.personalizationSettingsLocked(userID).Enabled
}

func cloneStringFloatMap(values map[string]float64) map[string]float64 {
	if len(values) == 0 {
		return map[string]float64{}
	}
	out := make(map[string]float64, len(values))
	for key, value := range values {
		out[key] = value
	}
	return out
}

func cloneCommunityPost(post CommunityPost) CommunityPost {
	post.Title = strings.TrimSpace(post.Title)
	post.Content = strings.TrimSpace(post.Content)
	post.DestinationID = strings.TrimSpace(post.DestinationID)
	post.DestinationLabel = strings.TrimSpace(post.DestinationLabel)
	post.DestinationAdcode = strings.TrimSpace(post.DestinationAdcode)
	post.Tags = append([]string{}, post.Tags...)
	post.ImageURLs = append([]string{}, post.ImageURLs...)
	post.FavoriteRestaurants = append([]string{}, post.FavoriteRestaurants...)
	post.FavoriteAttractions = append([]string{}, post.FavoriteAttractions...)
	post.MentionedPlaces = append([]string{}, post.MentionedPlaces...)
	post.VoteSummary = normalizeCommunityVoteSummary(post.VoteSummary)
	return post
}

func cloneCommunityPostList(posts []CommunityPost) []CommunityPost {
	if len(posts) == 0 {
		return []CommunityPost{}
	}
	out := make([]CommunityPost, 0, len(posts))
	for _, post := range posts {
		out = append(out, cloneCommunityPost(post))
	}
	return out
}

func cloneCommunityPostMap(values map[string]CommunityPost) map[string]CommunityPost {
	if len(values) == 0 {
		return map[string]CommunityPost{}
	}
	out := make(map[string]CommunityPost, len(values))
	for key, value := range values {
		out[key] = cloneCommunityPost(value)
	}
	return out
}

func cloneCommunityVoteList(votes []CommunityVote) []CommunityVote {
	if len(votes) == 0 {
		return []CommunityVote{}
	}
	out := make([]CommunityVote, 0, len(votes))
	for _, vote := range votes {
		out = append(out, vote)
	}
	return out
}

func cloneCommunityVoteMap(values map[string][]CommunityVote) map[string][]CommunityVote {
	if len(values) == 0 {
		return map[string][]CommunityVote{}
	}
	out := make(map[string][]CommunityVote, len(values))
	for key, votes := range values {
		out[key] = cloneCommunityVoteList(votes)
	}
	return out
}

func cloneCommunityReport(report CommunityReport) CommunityReport {
	report.ID = strings.TrimSpace(report.ID)
	report.PostID = strings.TrimSpace(report.PostID)
	report.ReporterUserID = strings.TrimSpace(report.ReporterUserID)
	report.Reason = normalizeCommunityReportReason(report.Reason)
	report.Detail = strings.TrimSpace(report.Detail)
	report.Status = normalizeCommunityReportStatus(report.Status)
	return report
}

func cloneCommunityReportList(reports []CommunityReport) []CommunityReport {
	if len(reports) == 0 {
		return []CommunityReport{}
	}
	out := make([]CommunityReport, 0, len(reports))
	for _, report := range reports {
		out = append(out, cloneCommunityReport(report))
	}
	return out
}

func cloneCommunityReportMap(values map[string][]CommunityReport) map[string][]CommunityReport {
	if len(values) == 0 {
		return map[string][]CommunityReport{}
	}
	out := make(map[string][]CommunityReport, len(values))
	for key, reports := range values {
		out[key] = cloneCommunityReportList(reports)
	}
	return out
}

func cloneCommunityModerationLog(logEntry CommunityModerationLog) CommunityModerationLog {
	logEntry.ID = strings.TrimSpace(logEntry.ID)
	logEntry.PostID = strings.TrimSpace(logEntry.PostID)
	logEntry.OperatorUserID = strings.TrimSpace(logEntry.OperatorUserID)
	logEntry.Action = normalizeCommunityModerationAction(logEntry.Action)
	logEntry.Reason = normalizedSignalKey(logEntry.Reason)
	logEntry.Note = strings.TrimSpace(logEntry.Note)
	logEntry.PreviousStatus = normalizeCommunityPostStatus(logEntry.PreviousStatus)
	logEntry.NextStatus = normalizeCommunityPostStatus(logEntry.NextStatus)
	return logEntry
}

func cloneCommunityModerationLogList(values []CommunityModerationLog) []CommunityModerationLog {
	if len(values) == 0 {
		return []CommunityModerationLog{}
	}
	out := make([]CommunityModerationLog, 0, len(values))
	for _, value := range values {
		out = append(out, cloneCommunityModerationLog(value))
	}
	return out
}

func cloneCommunityModerationLogMap(values map[string][]CommunityModerationLog) map[string][]CommunityModerationLog {
	if len(values) == 0 {
		return map[string][]CommunityModerationLog{}
	}
	out := make(map[string][]CommunityModerationLog, len(values))
	for key, logs := range values {
		out[key] = cloneCommunityModerationLogList(logs)
	}
	return out
}

func cloneCommunityReportAggregate(item CommunityReportAggregate) CommunityReportAggregate {
	item.Post = cloneCommunityPost(item.Post)
	item.Reasons = append([]string{}, item.Reasons...)
	item.Reports = cloneCommunityReportList(item.Reports)
	item.ModerationLogs = cloneCommunityModerationLogList(item.ModerationLogs)
	return item
}

func cloneCommunityAuthorPublicProfile(profile CommunityAuthorPublicProfile) CommunityAuthorPublicProfile {
	profile.UserID = strings.TrimSpace(profile.UserID)
	profile.DisplayName = strings.TrimSpace(profile.DisplayName)
	profile.TopTags = append([]string{}, profile.TopTags...)
	profile.Destinations = append([]CommunityAuthorDestinationSummary{}, profile.Destinations...)
	profile.RecentPosts = cloneCommunityPostList(profile.RecentPosts)
	return profile
}

func cloneCommunityReportAggregateList(values []CommunityReportAggregate) []CommunityReportAggregate {
	if len(values) == 0 {
		return []CommunityReportAggregate{}
	}
	out := make([]CommunityReportAggregate, 0, len(values))
	for _, value := range values {
		out = append(out, cloneCommunityReportAggregate(value))
	}
	return out
}

func summarizeCommunityVotes(votes []CommunityVote) CommunityVoteSummary {
	summary := CommunityVoteSummary{}
	for _, vote := range votes {
		switch normalizeCommunityVoteType(vote.VoteType) {
		case communityVoteTypeHelpful:
			summary.HelpfulCount++
		case communityVoteTypeWantToGo:
			summary.WantToGoCount++
		}
	}
	return summary
}

func countDistinctOpenCommunityReporters(reports []CommunityReport) int {
	distinct := map[string]bool{}
	for _, report := range reports {
		if report.Status != communityReportStatusOpen {
			continue
		}
		userID := strings.TrimSpace(report.ReporterUserID)
		if userID == "" {
			continue
		}
		distinct[userID] = true
	}
	return len(distinct)
}

func resolveOpenCommunityReports(reports []CommunityReport, nextStatus string, resolvedAt time.Time) []CommunityReport {
	nextStatus = normalizeCommunityReportStatus(nextStatus)
	if nextStatus == "" {
		return cloneCommunityReportList(reports)
	}
	out := make([]CommunityReport, 0, len(reports))
	for _, raw := range reports {
		report := cloneCommunityReport(raw)
		if report.Status == communityReportStatusOpen {
			report.Status = nextStatus
			report.UpdatedAt = resolvedAt
			report.ResolvedAt = resolvedAt
		}
		out = append(out, report)
	}
	return out
}

func firstNonZeroTime(values ...time.Time) time.Time {
	for _, value := range values {
		if !value.IsZero() {
			return value
		}
	}
	return time.Time{}
}

func communityPostsAreRelated(left, right CommunityPost) bool {
	if left.DestinationID != "" && right.DestinationID != "" && left.DestinationID == right.DestinationID {
		return true
	}
	if left.DestinationLabel != "" && right.DestinationLabel != "" && strings.EqualFold(left.DestinationLabel, right.DestinationLabel) {
		return true
	}
	for _, leftTag := range left.Tags {
		if containsString(right.Tags, leftTag) {
			return true
		}
	}
	return false
}

func communityRelatedScore(target, candidate CommunityPost) float64 {
	score := communityFeatureScore(candidate)
	if target.DestinationID != "" && candidate.DestinationID == target.DestinationID {
		score += 2.5
	}
	if target.DestinationLabel != "" && strings.EqualFold(candidate.DestinationLabel, target.DestinationLabel) {
		score += 1.5
	}
	for _, tag := range target.Tags {
		if containsString(candidate.Tags, tag) {
			score += 0.6
		}
	}
	return score
}

func sortedKeysByCount(values map[string]int, limit int) []string {
	if len(values) == 0 {
		return []string{}
	}
	type pair struct {
		Key   string
		Count int
	}
	items := make([]pair, 0, len(values))
	for key, count := range values {
		if strings.TrimSpace(key) == "" || count <= 0 {
			continue
		}
		items = append(items, pair{Key: key, Count: count})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Count == items[j].Count {
			return items[i].Key < items[j].Key
		}
		return items[i].Count > items[j].Count
	})
	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.Key)
	}
	return out
}

func communityAuthorDisplayName(userID string) string {
	trimmed := strings.TrimSpace(userID)
	if trimmed == "" {
		return "匿名旅行者"
	}
	suffix := trimmed
	if len(suffix) > 4 {
		suffix = suffix[len(suffix)-4:]
	}
	return "旅行者 " + suffix
}
