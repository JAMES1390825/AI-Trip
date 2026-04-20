package app

import "strings"

func parseSavedPlanEntityRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" {
		return parts[4], true
	}
	return "", false
}
