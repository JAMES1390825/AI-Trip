package app

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var isoDateRe = regexp.MustCompile(`^20\d{2}-\d{2}-\d{2}$`)

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func appError(status int, code, message string) *AppError {
	return &AppError{Status: status, Code: code, Message: message}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeAppError(w http.ResponseWriter, err *AppError) {
	if err == nil {
		err = appError(http.StatusInternalServerError, "INTERNAL_ERROR", "internal server error")
	}
	if err.Status <= 0 {
		err.Status = http.StatusInternalServerError
	}
	if strings.TrimSpace(err.Code) == "" {
		if err.Status >= 500 {
			err.Code = "INTERNAL_ERROR"
		} else {
			err.Code = "BAD_REQUEST"
		}
	}
	if strings.TrimSpace(err.Message) == "" {
		if err.Status >= 500 {
			err.Message = "internal server error"
		} else {
			err.Message = "bad request"
		}
	}

	writeJSON(w, err.Status, map[string]any{
		"error":     err.Code,
		"message":   err.Message,
		"timestamp": nowISO(),
	})
}

func decodeJSONBody(r *http.Request, out any) *AppError {
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	if err := decoder.Decode(out); err != nil {
		return appError(http.StatusBadRequest, "BAD_REQUEST", "invalid json body")
	}
	return nil
}

func mustFields(body map[string]any, fields ...string) *AppError {
	for _, field := range fields {
		value, ok := body[field]
		if !ok {
			return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("missing required field: %s", field))
		}
		if strings.TrimSpace(asString(value)) == "" {
			return appError(http.StatusBadRequest, "BAD_REQUEST", fmt.Sprintf("missing required field: %s", field))
		}
	}
	return nil
}

func isISODate(value string) bool {
	return isoDateRe.MatchString(strings.TrimSpace(value))
}

func clampLimit(value string, min, max, fallback int) int {
	n, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

func asString(value any) string {
	switch v := value.(type) {
	case string:
		return v
	case json.Number:
		return v.String()
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case int32:
		return strconv.FormatInt(int64(v), 10)
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return ""
	}
}

func asInt(value any) (int, bool) {
	switch v := value.(type) {
	case int:
		return v, true
	case int64:
		return int(v), true
	case int32:
		return int(v), true
	case float64:
		if math.Trunc(v) == v {
			return int(v), true
		}
		return 0, false
	case float32:
		f := float64(v)
		if math.Trunc(f) == f {
			return int(f), true
		}
		return 0, false
	case json.Number:
		i, err := v.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	case string:
		i, err := strconv.Atoi(strings.TrimSpace(v))
		if err != nil {
			return 0, false
		}
		return i, true
	default:
		return 0, false
	}
}

func asFloat(value any, fallback float64) float64 {
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		f, err := v.Float64()
		if err != nil {
			return fallback
		}
		return f
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		if err != nil {
			return fallback
		}
		return f
	default:
		return fallback
	}
}

func asBool(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(strings.TrimSpace(v), "true")
	default:
		return false
	}
}

func asMap(value any) map[string]any {
	mapped, ok := value.(map[string]any)
	if ok {
		return mapped
	}
	return map[string]any{}
}

func asSlice(value any) []any {
	if items, ok := value.([]any); ok {
		return items
	}
	if maps, ok := value.([]map[string]any); ok {
		out := make([]any, 0, len(maps))
		for _, item := range maps {
			out = append(out, item)
		}
		return out
	}
	if texts, ok := value.([]string); ok {
		out := make([]any, 0, len(texts))
		for _, item := range texts {
			out = append(out, item)
		}
		return out
	}
	return []any{}
}

func asStringSlice(value any) []string {
	if texts, ok := value.([]string); ok {
		out := make([]string, 0, len(texts))
		for _, text := range texts {
			trimmed := strings.TrimSpace(text)
			if trimmed == "" {
				continue
			}
			out = append(out, trimmed)
		}
		return out
	}

	items := asSlice(value)
	out := make([]string, 0, len(items))
	for _, item := range items {
		text := strings.TrimSpace(asString(item))
		if text == "" {
			continue
		}
		out = append(out, text)
	}
	return out
}

func uniqueStrings(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		text := strings.TrimSpace(value)
		if text == "" || seen[text] {
			continue
		}
		seen[text] = true
		out = append(out, text)
	}
	return out
}

func containsString(items []string, value string) bool {
	target := strings.TrimSpace(value)
	if target == "" {
		return false
	}
	for _, item := range items {
		if strings.TrimSpace(item) == target {
			return true
		}
	}
	return false
}

func deepCloneMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}
	blob, err := json.Marshal(input)
	if err != nil {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(blob, &out); err != nil {
		return map[string]any{}
	}
	if out == nil {
		return map[string]any{}
	}
	return out
}

func dedupeStringSlice(values []string) []string {
	return uniqueStrings(values)
}

func toRFC3339(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}

func sortSavedPlansDesc(plans []SavedPlan) {
	sort.SliceStable(plans, func(i, j int) bool {
		return plans[i].SavedAt.After(plans[j].SavedAt)
	})
}

func stringsContainsFold(items []string, value string) bool {
	for _, item := range items {
		if strings.EqualFold(strings.TrimSpace(item), strings.TrimSpace(value)) {
			return true
		}
	}
	return false
}
