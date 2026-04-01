package app

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestHandleUploadCommunityMediaAndPublicRead(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	app := &App{
		config: Config{
			Storage: StorageConfig{
				CommunityMediaDir: t.TempDir(),
			},
		},
		store: store,
	}

	pngData, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yF9kAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatalf("decode png fixture: %v", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "tiny.png")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(pngData); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if err := writer.WriteField("width", "1"); err != nil {
		t.Fatalf("write width: %v", err)
	}
	if err := writer.WriteField("height", "1"); err != nil {
		t.Fatalf("write height: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/community/media", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Host = "127.0.0.1:8080"

	rr := httptest.NewRecorder()
	app.handleUploadCommunityMedia(rr, req, &AuthUser{UserID: "u-1"})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected upload 200, got %d body=%s", rr.Code, rr.Body.String())
	}

	var payload map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode upload response: %v", err)
	}
	publicURL := strings.TrimSpace(asString(payload["public_url"]))
	if publicURL == "" {
		t.Fatalf("expected public_url in upload response")
	}

	parsed, err := url.Parse(publicURL)
	if err != nil {
		t.Fatalf("parse public_url: %v", err)
	}
	getReq := httptest.NewRequest(http.MethodGet, parsed.Path, nil)
	getReq.Host = "127.0.0.1:8080"
	getRR := httptest.NewRecorder()
	app.ServeHTTP(getRR, getReq)

	if getRR.Code != http.StatusOK {
		t.Fatalf("expected public read 200, got %d body=%s", getRR.Code, getRR.Body.String())
	}
	if !bytes.Equal(getRR.Body.Bytes(), pngData) {
		t.Fatalf("expected public read body to match uploaded bytes")
	}
	if got := strings.TrimSpace(getRR.Header().Get("Content-Type")); got != "image/png" {
		t.Fatalf("expected image/png content-type, got %q", got)
	}
}
