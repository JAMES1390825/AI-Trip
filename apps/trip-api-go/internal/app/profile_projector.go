package app

import (
	"math"
	"sort"
	"strings"
	"time"
)

const userPrivateProfileVersion = 1

func defaultUserPrivateProfile(userID string) UserPrivateProfile {
	return UserPrivateProfile{
		UserID:  strings.TrimSpace(userID),
		Version: userPrivateProfileVersion,
		BehavioralAffinity: UserBehavioralAffinity{
			Categories: map[string]float64{},
			Tags:       map[string]float64{},
			Districts:  map[string]float64{},
		},
		TimingProfile: UserTimingProfile{
			MaxTransitMinutes: 20,
		},
		RiskProfile: UserRiskProfile{
			RainAvoidOutdoor: 0.5,
			WalkingTolerance: 0.5,
			QueueTolerance:   0.5,
		},
	}
}

func projectUserPrivateProfile(userID string, events []EventRecord) UserPrivateProfile {
	userID = strings.TrimSpace(userID)
	profile := defaultUserPrivateProfile(userID)
	if userID == "" {
		return profile
	}

	filtered := make([]EventRecord, 0, len(events))
	for _, event := range events {
		if strings.TrimSpace(event.UserID) != userID {
			continue
		}
		filtered = append(filtered, event)
	}
	if len(filtered) == 0 {
		return profile
	}

	sort.SliceStable(filtered, func(i, j int) bool {
		return filtered[i].CreatedAt.Before(filtered[j].CreatedAt)
	})

	now := time.Now().UTC()
	var latest time.Time

	var transitWeightedSum float64
	var transitWeight float64
	var dailyBlocksWeightedSum float64
	var dailyBlocksWeight float64
	var rainSignalTotal float64
	var walkingSignalTotal float64
	var queueSignalTotal float64
	var timingSignals int
	var riskSignals int

	for _, event := range filtered {
		if event.CreatedAt.After(latest) {
			latest = event.CreatedAt
		}

		metadata := deepCloneMap(event.Metadata)
		weight := recencyWeight(now, event.CreatedAt)
		if withinDays(now, event.CreatedAt, 30) {
			profile.Stats.Events30d++
			if countsAsEffectiveAction(event.EventName) {
				profile.Stats.EffectiveActions30d++
			}
			if strings.EqualFold(strings.TrimSpace(event.EventName), "plan_saved") {
				profile.Stats.SavedPlans30d++
			}
		}

		switch strings.TrimSpace(event.EventName) {
		case "preference_changed":
			applyExplicitPreferences(&profile, metadata)
			applyPreferenceDerivedRiskSignals(&rainSignalTotal, &queueSignalTotal, metadata)
			riskSignals++
		case "block_removed":
			applyMapDelta(profile.BehavioralAffinity.Categories, normalizedSignalKey(asString(metadata["poi_category"])), -0.35*weight)
			applySliceDelta(profile.BehavioralAffinity.Tags, asStringSlice(metadata["poi_tags"]), -0.18*weight)
			applyDistrictDelta(profile.BehavioralAffinity.Districts, metadata, -0.12*weight)
			if minutes := asFloat(metadata["route_minutes_from_prev"], 0); minutes > 0 {
				transitWeightedSum += math.Max(8, minutes-4) * weight
				transitWeight += weight
				timingSignals++
			}
		case "block_replaced":
			applyMapDelta(profile.BehavioralAffinity.Categories, normalizedSignalKey(asString(metadata["removed_category"])), -0.45*weight)
			applySliceDelta(profile.BehavioralAffinity.Tags, asStringSlice(metadata["removed_tags"]), -0.22*weight)
			applyMapDelta(profile.BehavioralAffinity.Categories, normalizedSignalKey(asString(metadata["added_category"])), 0.45*weight)
			applySliceDelta(profile.BehavioralAffinity.Tags, asStringSlice(metadata["added_tags"]), 0.22*weight)
			applyDistrictDelta(profile.BehavioralAffinity.Districts, metadata, 0.14*weight)
			if minutes := asFloat(metadata["route_minutes_from_prev"], 0); minutes > 0 {
				transitWeightedSum += minutes * weight
				transitWeight += weight
				timingSignals++
			}
		case "block_locked":
			applyMapDelta(profile.BehavioralAffinity.Categories, normalizedSignalKey(asString(metadata["poi_category"])), 0.32*weight)
			applySliceDelta(profile.BehavioralAffinity.Tags, asStringSlice(metadata["poi_tags"]), 0.16*weight)
			applyDistrictDelta(profile.BehavioralAffinity.Districts, metadata, 0.10*weight)
			if minutes := asFloat(metadata["route_minutes_from_prev"], 0); minutes > 0 {
				transitWeightedSum += minutes * weight
				transitWeight += weight
				timingSignals++
			}
		case "navigation_started":
			applyMapDelta(profile.BehavioralAffinity.Categories, normalizedSignalKey(asString(metadata["poi_category"])), 0.40*weight)
			applySliceDelta(profile.BehavioralAffinity.Tags, asStringSlice(metadata["poi_tags"]), 0.20*weight)
			applyDistrictDelta(profile.BehavioralAffinity.Districts, metadata, 0.12*weight)
			if minutes := asFloat(metadata["route_minutes_from_prev"], 0); minutes > 0 {
				transitWeightedSum += minutes * weight
				transitWeight += weight
				timingSignals++
			}
			if walking := asFloat(metadata["walking_minutes"], 0); walking > 0 {
				walkingSignalTotal += math.Min(walking/30, 1) * weight
				riskSignals++
			}
		case "poi_detail_opened":
			applyMapDelta(profile.BehavioralAffinity.Categories, normalizedSignalKey(asString(metadata["poi_category"])), 0.05*weight)
			applySliceDelta(profile.BehavioralAffinity.Tags, asStringSlice(metadata["poi_tags"]), 0.03*weight)
			applyDistrictDelta(profile.BehavioralAffinity.Districts, metadata, 0.02*weight)
		case "plan_saved":
			applyMapDelta(profile.BehavioralAffinity.Categories, normalizedSignalKey(asString(metadata["poi_category"])), 0.18*weight)
			applySliceDelta(profile.BehavioralAffinity.Tags, asStringSlice(metadata["poi_tags"]), 0.10*weight)
			applyDistrictDelta(profile.BehavioralAffinity.Districts, metadata, 0.08*weight)
			if blocks := asFloat(metadata["daily_block_count"], 0); blocks > 0 {
				dailyBlocksWeightedSum += blocks * weight
				dailyBlocksWeight += weight
				timingSignals++
			}
		}
	}

	if latest.IsZero() {
		latest = now
	}
	profile.UpdatedAt = latest

	if transitWeight > 0 {
		avg := transitWeightedSum / transitWeight
		profile.TimingProfile.MaxTransitMinutes = clampInt(int(math.Round(avg)), 12, 60)
		profile.RiskProfile.WalkingTolerance = clampFloat((avg-10)/35, 0, 1)
	} else {
		profile.TimingProfile.MaxTransitMinutes = 20
	}

	if dailyBlocksWeight > 0 {
		profile.TimingProfile.PreferredDailyBlocks = roundToOneDecimal(dailyBlocksWeightedSum / dailyBlocksWeight)
	}

	if rainSignalTotal != 0 {
		profile.RiskProfile.RainAvoidOutdoor = clampFloat(0.5+rainSignalTotal, 0, 1)
	}
	if walkingSignalTotal != 0 {
		profile.RiskProfile.WalkingTolerance = clampFloat(0.5+(walkingSignalTotal/2), 0, 1)
	}
	if queueSignalTotal != 0 {
		profile.RiskProfile.QueueTolerance = clampFloat(0.5+queueSignalTotal, 0, 1)
	}

	effective := float64(profile.Stats.EffectiveActions30d)
	profile.Confidence.BehavioralAffinity = clampFloat(effective/8, 0, 1)
	profile.Confidence.TimingProfile = clampFloat(float64(timingSignals)/6, 0, 1)
	profile.Confidence.RiskProfile = clampFloat(float64(riskSignals)/6, 0, 1)

	return normalizeUserPrivateProfile(profile)
}

func buildPrivateProfilesByUser(events []EventRecord) map[string]UserPrivateProfile {
	users := map[string]bool{}
	for _, event := range events {
		userID := strings.TrimSpace(event.UserID)
		if userID == "" {
			continue
		}
		users[userID] = true
	}
	out := make(map[string]UserPrivateProfile, len(users))
	for userID := range users {
		out[userID] = projectUserPrivateProfile(userID, events)
	}
	return out
}

func applyExplicitPreferences(profile *UserPrivateProfile, metadata map[string]any) {
	if profile == nil {
		return
	}
	if budget := strings.TrimSpace(asString(metadata["budget_level"])); budget != "" {
		profile.ExplicitPreferences.BudgetLevel = budget
	}
	if pace := strings.TrimSpace(asString(metadata["pace"])); pace != "" {
		profile.ExplicitPreferences.Pace = pace
	}
	if dining := strings.TrimSpace(asString(metadata["dining_preference"])); dining != "" {
		profile.ExplicitPreferences.DiningPreference = dining
	}
	if weather := strings.TrimSpace(asString(metadata["weather_preference"])); weather != "" {
		profile.ExplicitPreferences.WeatherPreference = weather
	}
	if styles := uniqueStrings(asStringSlice(metadata["travel_styles"])); len(styles) > 0 {
		profile.ExplicitPreferences.TravelStyles = styles
	}
}

func applyPreferenceDerivedRiskSignals(rainSignalTotal, queueSignalTotal *float64, metadata map[string]any) {
	weatherPreference := strings.ToLower(strings.TrimSpace(asString(metadata["weather_preference"])))
	switch weatherPreference {
	case "rain_friendly":
		*rainSignalTotal -= 0.25
	case "avoid_rain", "sunny_only":
		*rainSignalTotal += 0.25
	}

	diningPreference := strings.ToLower(strings.TrimSpace(asString(metadata["dining_preference"])))
	switch diningPreference {
	case "local_food":
		*queueSignalTotal -= 0.12
	case "no_queue", "fast_food":
		*queueSignalTotal += 0.12
	}
}

func applySliceDelta(target map[string]float64, values []string, delta float64) {
	for _, value := range values {
		applyMapDelta(target, normalizedSignalKey(value), delta)
	}
}

func applyMapDelta(target map[string]float64, key string, delta float64) {
	if target == nil {
		return
	}
	key = normalizedSignalKey(key)
	if key == "" || delta == 0 {
		return
	}
	target[key] = clampFloat(target[key]+delta, -1, 1)
}

func applyDistrictDelta(target map[string]float64, metadata map[string]any, delta float64) {
	if target == nil {
		return
	}
	key := normalizedSignalKey(asString(firstNonEmpty(metadata["district_adcode"], metadata["adcode"], metadata["destination_adcode"])))
	if key == "" {
		return
	}
	target[key] = clampFloat(target[key]+delta, -1, 1)
}

func normalizeUserPrivateProfile(profile UserPrivateProfile) UserPrivateProfile {
	profile.UserID = strings.TrimSpace(profile.UserID)
	if profile.Version <= 0 {
		profile.Version = userPrivateProfileVersion
	}
	profile.ExplicitPreferences.TravelStyles = uniqueStrings(profile.ExplicitPreferences.TravelStyles)
	profile.BehavioralAffinity.Categories = normalizeSignalMap(profile.BehavioralAffinity.Categories)
	profile.BehavioralAffinity.Tags = normalizeSignalMap(profile.BehavioralAffinity.Tags)
	profile.BehavioralAffinity.Districts = normalizeSignalMap(profile.BehavioralAffinity.Districts)
	profile.TimingProfile.MaxTransitMinutes = clampInt(profile.TimingProfile.MaxTransitMinutes, 0, 120)
	profile.TimingProfile.LunchOffsetMinutes = clampInt(profile.TimingProfile.LunchOffsetMinutes, -180, 180)
	profile.TimingProfile.PreferredDailyBlocks = roundToOneDecimal(clampFloat(profile.TimingProfile.PreferredDailyBlocks, 0, 8))
	profile.RiskProfile.RainAvoidOutdoor = clampFloat(profile.RiskProfile.RainAvoidOutdoor, 0, 1)
	profile.RiskProfile.WalkingTolerance = clampFloat(profile.RiskProfile.WalkingTolerance, 0, 1)
	profile.RiskProfile.QueueTolerance = clampFloat(profile.RiskProfile.QueueTolerance, 0, 1)
	profile.Confidence.BehavioralAffinity = clampFloat(profile.Confidence.BehavioralAffinity, 0, 1)
	profile.Confidence.TimingProfile = clampFloat(profile.Confidence.TimingProfile, 0, 1)
	profile.Confidence.RiskProfile = clampFloat(profile.Confidence.RiskProfile, 0, 1)
	return profile
}

func normalizeSignalMap(values map[string]float64) map[string]float64 {
	if len(values) == 0 {
		return map[string]float64{}
	}
	out := make(map[string]float64, len(values))
	for key, value := range values {
		normalized := normalizedSignalKey(key)
		if normalized == "" {
			continue
		}
		out[normalized] = roundToTwoDecimals(clampFloat(value, -1, 1))
	}
	return out
}

func normalizedSignalKey(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func recencyWeight(now, createdAt time.Time) float64 {
	if createdAt.IsZero() {
		return 1
	}
	ageHours := now.Sub(createdAt).Hours()
	if ageHours <= 0 {
		return 1
	}
	ageDays := ageHours / 24
	return math.Pow(0.5, ageDays/30)
}

func withinDays(now, createdAt time.Time, days int) bool {
	if createdAt.IsZero() {
		return false
	}
	return now.Sub(createdAt) <= time.Duration(days)*24*time.Hour
}

func countsAsEffectiveAction(eventName string) bool {
	switch strings.TrimSpace(eventName) {
	case "plan_saved", "block_removed", "block_replaced", "block_locked", "navigation_started", "preference_changed":
		return true
	default:
		return false
	}
}

func clampFloat(value, minValue, maxValue float64) float64 {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func clampInt(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func roundToTwoDecimals(value float64) float64 {
	return math.Round(value*100) / 100
}

func roundToOneDecimal(value float64) float64 {
	return math.Round(value*10) / 10
}
