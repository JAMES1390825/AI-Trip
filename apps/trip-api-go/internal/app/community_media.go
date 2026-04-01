package app

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const communityMediaMaxBytes = 8 << 20

var errCommunityMediaInvalid = errors.New("community media invalid")

func resolveCommunityMediaDir(cfg Config) string {
	dir := strings.TrimSpace(cfg.Storage.CommunityMediaDir)
	if dir == "" {
		dir = "tmp/data/community-media"
	}
	return filepath.Clean(dir)
}

func parseCommunityMediaEntityRoute(path string) (fileName string, ok bool) {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 5 && parts[0] == "api" && parts[1] == "v1" && parts[2] == "community" && parts[3] == "media" {
		return parts[4], true
	}
	return "", false
}

func normalizeCommunityImageMime(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "image/jpeg", "image/jpg":
		return "image/jpeg"
	case "image/png":
		return "image/png"
	case "image/gif":
		return "image/gif"
	case "image/webp":
		return "image/webp"
	case "image/heic":
		return "image/heic"
	case "image/heif":
		return "image/heif"
	default:
		return ""
	}
}

func communityImageExtension(mimeType string) string {
	switch normalizeCommunityImageMime(mimeType) {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/heic":
		return ".heic"
	case "image/heif":
		return ".heif"
	default:
		return ""
	}
}

func parsePositiveInt(value string) int {
	n, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || n < 0 {
		return 0
	}
	return n
}

func buildRequestBaseURL(r *http.Request) string {
	scheme := "http"
	if strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https") || r.TLS != nil {
		scheme = "https"
	}
	host := strings.TrimSpace(r.Host)
	if host == "" {
		host = "127.0.0.1"
	}
	return scheme + "://" + host
}

func safeCommunityMediaFileName(value string) string {
	fileName := filepath.Base(strings.TrimSpace(value))
	if fileName == "." || fileName == "" {
		return ""
	}
	if strings.Contains(fileName, "..") || strings.ContainsAny(fileName, `/\`) {
		return ""
	}
	return fileName
}

func readCommunityUploadFile(r *http.Request) ([]byte, string, int, int, error) {
	if err := r.ParseMultipartForm(communityMediaMaxBytes + (1 << 20)); err != nil {
		return nil, "", 0, 0, errCommunityMediaInvalid
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		return nil, "", 0, 0, errCommunityMediaInvalid
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, communityMediaMaxBytes+1))
	if err != nil {
		return nil, "", 0, 0, err
	}
	if len(data) == 0 || len(data) > communityMediaMaxBytes {
		return nil, "", 0, 0, errCommunityMediaInvalid
	}

	mimeType := normalizeCommunityImageMime(http.DetectContentType(data))
	if mimeType == "" {
		mimeType = normalizeCommunityImageMime(header.Header.Get("Content-Type"))
	}
	if mimeType == "" {
		mimeType = normalizeCommunityImageMime(r.FormValue("mime_type"))
	}
	if mimeType == "" {
		return nil, "", 0, 0, errCommunityMediaInvalid
	}

	width := parsePositiveInt(r.FormValue("width"))
	height := parsePositiveInt(r.FormValue("height"))
	return data, mimeType, width, height, nil
}

func writeCommunityMediaFile(dir, fileName string, data []byte) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, fileName)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func communityMediaPublicURL(r *http.Request, fileName string) string {
	escaped := url.PathEscape(fileName)
	return buildRequestBaseURL(r) + "/api/v1/community/media/" + escaped
}

func (a *App) handleUploadCommunityMedia(w http.ResponseWriter, r *http.Request, user *AuthUser) {
	data, mimeType, width, height, err := readCommunityUploadFile(r)
	if err != nil {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "image upload requires multipart file field, supports jpg/png/gif/webp/heic, and max 8MB"))
		return
	}

	ext := communityImageExtension(mimeType)
	if ext == "" {
		writeAppError(w, appError(http.StatusBadRequest, "BAD_REQUEST", "unsupported image type"))
		return
	}

	fileName := "cm_" + strings.ReplaceAll(randomID(), "-", "") + ext
	path, writeErr := writeCommunityMediaFile(resolveCommunityMediaDir(a.config), fileName, data)
	if writeErr != nil {
		writeAppError(w, appError(http.StatusInternalServerError, "INTERNAL_ERROR", "failed to persist community image"))
		return
	}

	publicURL := communityMediaPublicURL(r, fileName)
	a.trackEvent("community_media_uploaded", user.UserID, map[string]any{
		"file_name": fileName,
		"mime_type": mimeType,
		"file_size": len(data),
		"width":     width,
		"height":    height,
		"media_url": publicURL,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"asset_id":     fileName,
		"public_url":   publicURL,
		"public_path":  "/api/v1/community/media/" + url.PathEscape(fileName),
		"mime_type":    mimeType,
		"file_size":    len(data),
		"width":        width,
		"height":       height,
		"storage_path": path,
	})
}

func (a *App) handlePublicCommunityMediaRead(w http.ResponseWriter, r *http.Request, fileName string) {
	safeName := safeCommunityMediaFileName(fileName)
	if safeName == "" {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community media not found"))
		return
	}

	path := filepath.Join(resolveCommunityMediaDir(a.config), safeName)
	info, err := os.Stat(path)
	if err != nil || info.IsDir() {
		writeAppError(w, appError(http.StatusNotFound, "NOT_FOUND", "community media not found"))
		return
	}

	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(safeName)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, path)
}

func communityMediaFieldHint() string {
	return fmt.Sprintf("支持 jpg/png/gif/webp/heic，单张不超过 %dMB", communityMediaMaxBytes>>20)
}
