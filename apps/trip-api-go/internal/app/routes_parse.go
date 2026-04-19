package app

import "strings"

func parseSavedPlanEntityRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanSummaryRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "summary" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanCommunityDraftRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "community-draft" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanVersionsRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "versions" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanTasksRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "tasks" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanExecutionRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "execution" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanDiffRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "diff" {
		return parts[4], true
	}
	return "", false
}

func parseSavedPlanShareRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "share" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityPostEntityRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "posts" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityPostDetailRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "posts" && parts[5] == "detail" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityAuthorEntityRoute(path string) (userID string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "authors" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityPostVoteRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "posts" && parts[5] == "vote" {
		return parts[4], true
	}
	return "", false
}

func parseCommunityPostReportRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 6 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "posts" && parts[5] == "report" {
		return parts[4], true
	}
	return "", false
}

func parseAdminCommunityPostModerateRoute(path string) (id string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 7 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "admin" && parts[3] == "community" && parts[4] == "posts" && parts[6] == "moderate" {
		return parts[5], true
	}
	return "", false
}

func parseSavedPlanShareTokenRoute(path string) (id, token string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 7 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "plans" && parts[3] == "saved" && parts[5] == "share" {
		return parts[4], parts[6], true
	}
	return "", "", false
}

func parsePublicShareRoute(path string) (token string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 4 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "share" {
		return parts[3], true
	}
	return "", false
}

func parsePlaceDetailRoute(path string) (provider, placeID string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "places" {
		return parts[3], parts[4], true
	}
	return "", "", false
}
