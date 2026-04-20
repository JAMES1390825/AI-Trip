package app

import "strings"

func isRetiredPublicAPIPath(path string) bool {
	return strings.HasPrefix(path, "/api/v1/community/media/") ||
		strings.HasPrefix(path, "/api/v1/share/")
}
