package app

import "sort"

var (
	allowedPreTripReminderOffsetHours = map[int]struct{}{
		24:  {},
		48:  {},
		72:  {},
		168: {},
	}
	defaultPreTripReminderOffsetHours = []int{168, 72, 24}
)

func isAllowedPreTripReminderOffsetHour(value int) bool {
	_, ok := allowedPreTripReminderOffsetHours[value]
	return ok
}

func cloneReminderOffsetHours(values []int) []int {
	if len(values) == 0 {
		return []int{}
	}
	out := make([]int, 0, len(values))
	out = append(out, values...)
	return out
}

func normalizeReminderOffsetHours(values []int) []int {
	if len(values) == 0 {
		return []int{}
	}
	seen := map[int]bool{}
	out := make([]int, 0, len(values))
	for _, value := range values {
		if !isAllowedPreTripReminderOffsetHour(value) {
			continue
		}
		if seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	if len(out) == 0 {
		return []int{}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i] > out[j]
	})
	return out
}

func defaultPreTripTaskReminder() *PreTripTaskReminder {
	return &PreTripTaskReminder{
		Enabled:     true,
		OffsetHours: cloneReminderOffsetHours(defaultPreTripReminderOffsetHours),
	}
}

func normalizePreTripTaskReminder(reminder *PreTripTaskReminder) *PreTripTaskReminder {
	if reminder == nil {
		return defaultPreTripTaskReminder()
	}

	offsetHours := normalizeReminderOffsetHours(reminder.OffsetHours)
	if len(offsetHours) == 0 {
		offsetHours = cloneReminderOffsetHours(defaultPreTripReminderOffsetHours)
	}
	return &PreTripTaskReminder{
		Enabled:     reminder.Enabled,
		OffsetHours: offsetHours,
	}
}

func reminderToResponse(reminder *PreTripTaskReminder) map[string]any {
	normalized := normalizePreTripTaskReminder(reminder)
	return map[string]any{
		"enabled":      normalized.Enabled,
		"offset_hours": cloneReminderOffsetHours(normalized.OffsetHours),
	}
}
