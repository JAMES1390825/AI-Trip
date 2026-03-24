package app

import (
	"os"
	"strconv"
	"strings"
)

func LoadConfig() Config {
	return Config{
		Port: toInt(os.Getenv("PORT"), 8080),
		CORSOrigins: []string{
			defaultString(os.Getenv("CORS_ALLOWED_ORIGIN_1"), "http://localhost:5500"),
			defaultString(os.Getenv("CORS_ALLOWED_ORIGIN_2"), "http://127.0.0.1:5500"),
		},
		Auth: AuthConfig{
			JWTSecret:             defaultString(os.Getenv("JWT_SECRET"), "change-this-secret-in-production-change-this-secret"),
			ExpirationMinutes:     toInt(os.Getenv("JWT_EXPIRATION_MINUTES"), 1440),
			BootstrapClientSecret: defaultString(os.Getenv("BOOTSTRAP_CLIENT_SECRET"), "dev-bootstrap-secret"),
		},
		Storage: StorageConfig{
			DataFile: defaultString(os.Getenv("DATA_FILE"), "tmp/data/trip-api-go-store.json"),
		},
	}
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func toInt(value string, fallback int) int {
	n, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}
	return n
}
