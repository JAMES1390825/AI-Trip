package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigDefaults(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("CORS_ALLOWED_ORIGIN_1", "")
	t.Setenv("CORS_ALLOWED_ORIGIN_2", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("JWT_EXPIRATION_MINUTES", "")
	t.Setenv("BOOTSTRAP_CLIENT_SECRET", "")
	t.Setenv("DATA_FILE", "")
	t.Setenv("COMMUNITY_MEDIA_DIR", "")
	t.Setenv("AI_SERVICE_BASE_URL", "")
	t.Setenv("AI_SERVICE_API_KEY", "")
	t.Setenv("AI_SERVICE_INTERNAL_TOKEN", "")
	t.Setenv("BAILIAN_API_KEY", "")
	t.Setenv("AI_SERVICE_MODEL_NAME", "")
	t.Setenv("BAILIAN_MODEL_NAME", "")
	t.Setenv("AI_SERVICE_TIMEOUT_MS", "")
	t.Setenv("AMAP_API_KEY", "")
	t.Setenv("AMAP_BASE_URL", "")
	t.Setenv("AMAP_TIMEOUT_MS", "")

	cfg := LoadConfig()

	if cfg.Port != 8080 {
		t.Fatalf("expected default port 8080, got %d", cfg.Port)
	}
	if len(cfg.CORSOrigins) != 2 {
		t.Fatalf("expected 2 cors origins, got %d", len(cfg.CORSOrigins))
	}
	if cfg.CORSOrigins[0] != "http://localhost:5500" {
		t.Fatalf("unexpected default cors origin #1: %q", cfg.CORSOrigins[0])
	}
	if cfg.CORSOrigins[1] != "http://127.0.0.1:5500" {
		t.Fatalf("unexpected default cors origin #2: %q", cfg.CORSOrigins[1])
	}
	if cfg.Auth.JWTSecret != "change-this-secret-in-production-change-this-secret" {
		t.Fatalf("unexpected default jwt secret: %q", cfg.Auth.JWTSecret)
	}
	if cfg.Auth.ExpirationMinutes != 1440 {
		t.Fatalf("expected default expiration 1440, got %d", cfg.Auth.ExpirationMinutes)
	}
	if cfg.Auth.BootstrapClientSecret != "dev-bootstrap-secret" {
		t.Fatalf("unexpected default bootstrap secret: %q", cfg.Auth.BootstrapClientSecret)
	}
	if cfg.Storage.DataFile != "tmp/data/trip-api-go-store.json" {
		t.Fatalf("unexpected default data file: %q", cfg.Storage.DataFile)
	}
	if cfg.AI.BaseURL != "" {
		t.Fatalf("expected default ai base url blank, got %q", cfg.AI.BaseURL)
	}
	if cfg.AI.APIToken != "" {
		t.Fatalf("expected default ai token blank, got %q", cfg.AI.APIToken)
	}
	if cfg.AI.ModelName != "" {
		t.Fatalf("expected default ai model name blank, got %q", cfg.AI.ModelName)
	}
	if cfg.AI.TimeoutMs != 4000 {
		t.Fatalf("expected default ai timeout 4000, got %d", cfg.AI.TimeoutMs)
	}
	if cfg.Amap.APIKey != "" {
		t.Fatalf("expected default amap key blank, got %q", cfg.Amap.APIKey)
	}
	if cfg.Amap.BaseURL != "https://restapi.amap.com" {
		t.Fatalf("unexpected default amap base url: %q", cfg.Amap.BaseURL)
	}
	if cfg.Amap.TimeoutMs != 3500 {
		t.Fatalf("expected default amap timeout 3500, got %d", cfg.Amap.TimeoutMs)
	}
}

func TestLoadConfigEnvOverrides(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("CORS_ALLOWED_ORIGIN_1", "https://a.example.com")
	t.Setenv("CORS_ALLOWED_ORIGIN_2", "https://b.example.com")
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("JWT_EXPIRATION_MINUTES", "30")
	t.Setenv("BOOTSTRAP_CLIENT_SECRET", "bootstrap-override")
	t.Setenv("DATA_FILE", "tmp/data/custom.json")
	t.Setenv("COMMUNITY_MEDIA_DIR", "tmp/data/ignored")
	t.Setenv("AI_SERVICE_BASE_URL", "http://127.0.0.1:8091")
	t.Setenv("AI_SERVICE_API_KEY", "service-key")
	t.Setenv("AI_SERVICE_MODEL_NAME", "qwen-plus")
	t.Setenv("AI_SERVICE_TIMEOUT_MS", "5500")
	t.Setenv("AMAP_API_KEY", "amap-key")
	t.Setenv("AMAP_BASE_URL", "http://127.0.0.1:8899")
	t.Setenv("AMAP_TIMEOUT_MS", "2100")

	cfg := LoadConfig()

	if cfg.Port != 9090 {
		t.Fatalf("expected port 9090, got %d", cfg.Port)
	}
	if cfg.CORSOrigins[0] != "https://a.example.com" || cfg.CORSOrigins[1] != "https://b.example.com" {
		t.Fatalf("unexpected cors origins: %#v", cfg.CORSOrigins)
	}
	if cfg.Auth.JWTSecret != "test-secret" {
		t.Fatalf("unexpected jwt secret: %q", cfg.Auth.JWTSecret)
	}
	if cfg.Auth.ExpirationMinutes != 30 {
		t.Fatalf("expected expiration 30, got %d", cfg.Auth.ExpirationMinutes)
	}
	if cfg.Auth.BootstrapClientSecret != "bootstrap-override" {
		t.Fatalf("unexpected bootstrap secret: %q", cfg.Auth.BootstrapClientSecret)
	}
	if cfg.Storage.DataFile != "tmp/data/custom.json" {
		t.Fatalf("unexpected data file: %q", cfg.Storage.DataFile)
	}
	if cfg.AI.BaseURL != "http://127.0.0.1:8091" {
		t.Fatalf("unexpected ai base url: %q", cfg.AI.BaseURL)
	}
	if cfg.AI.APIToken != "service-key" {
		t.Fatalf("unexpected ai token: %q", cfg.AI.APIToken)
	}
	if cfg.AI.ModelName != "qwen-plus" {
		t.Fatalf("unexpected ai model name: %q", cfg.AI.ModelName)
	}
	if cfg.AI.TimeoutMs != 5500 {
		t.Fatalf("unexpected ai timeout: %d", cfg.AI.TimeoutMs)
	}
	if cfg.Amap.APIKey != "amap-key" {
		t.Fatalf("unexpected amap key: %q", cfg.Amap.APIKey)
	}
	if cfg.Amap.BaseURL != "http://127.0.0.1:8899" {
		t.Fatalf("unexpected amap base url: %q", cfg.Amap.BaseURL)
	}
	if cfg.Amap.TimeoutMs != 2100 {
		t.Fatalf("unexpected amap timeout: %d", cfg.Amap.TimeoutMs)
	}
}

func TestDefaultString(t *testing.T) {
	if got := defaultString(" value ", "fallback"); got != " value " {
		t.Fatalf("expected original value, got %q", got)
	}
	if got := defaultString("   ", "fallback"); got != "fallback" {
		t.Fatalf("expected fallback for blank input, got %q", got)
	}
}

func TestToInt(t *testing.T) {
	if got := toInt(" 42 ", 5); got != 42 {
		t.Fatalf("expected 42, got %d", got)
	}
	if got := toInt("x", 5); got != 5 {
		t.Fatalf("expected fallback 5 for invalid input, got %d", got)
	}
}

func TestFirstNonBlank(t *testing.T) {
	if got := firstNonBlank("   ", "", "value", "other"); got != "value" {
		t.Fatalf("expected value, got %q", got)
	}
	if got := firstNonBlank(" ", ""); got != "" {
		t.Fatalf("expected blank, got %q", got)
	}
}

func TestParseDotEnvLine(t *testing.T) {
	key, value, ok := parseDotEnvLine("BAILIAN_API_KEY=test-key")
	if !ok || key != "BAILIAN_API_KEY" || value != "test-key" {
		t.Fatalf("unexpected parse result: %v %q %q", ok, key, value)
	}

	key, value, ok = parseDotEnvLine("export AI_SERVICE_BASE_URL=\"http://127.0.0.1:8091\"")
	if !ok || key != "AI_SERVICE_BASE_URL" || value != "http://127.0.0.1:8091" {
		t.Fatalf("unexpected quoted parse result: %v %q %q", ok, key, value)
	}

	if _, _, ok := parseDotEnvLine("# comment"); ok {
		t.Fatalf("expected comment line ignored")
	}
}

func TestLoadDotEnvFileDoesNotOverrideExistingEnv(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("BAILIAN_API_KEY=from-file\nAI_SERVICE_BASE_URL=http://127.0.0.1:8091\n"), 0o644); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	t.Setenv("BAILIAN_API_KEY", "from-env")
	t.Setenv("AI_SERVICE_BASE_URL", "")
	loadDotEnvFile(path)

	if got := os.Getenv("BAILIAN_API_KEY"); got != "from-env" {
		t.Fatalf("expected existing env preserved, got %q", got)
	}
	if got := os.Getenv("AI_SERVICE_BASE_URL"); got != "http://127.0.0.1:8091" {
		t.Fatalf("expected env loaded from file, got %q", got)
	}
}
