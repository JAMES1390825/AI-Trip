package app

import "testing"

func TestLoadConfigDefaults(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("CORS_ALLOWED_ORIGIN_1", "")
	t.Setenv("CORS_ALLOWED_ORIGIN_2", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("JWT_EXPIRATION_MINUTES", "")
	t.Setenv("BOOTSTRAP_CLIENT_SECRET", "")
	t.Setenv("DATA_FILE", "")

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
}

func TestLoadConfigEnvOverrides(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("CORS_ALLOWED_ORIGIN_1", "https://a.example.com")
	t.Setenv("CORS_ALLOWED_ORIGIN_2", "https://b.example.com")
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("JWT_EXPIRATION_MINUTES", "30")
	t.Setenv("BOOTSTRAP_CLIENT_SECRET", "bootstrap-override")
	t.Setenv("DATA_FILE", "tmp/data/custom.json")

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
