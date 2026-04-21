package app

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func LoadConfig() Config {
	loadDotEnvFiles()
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
		AI: AIServiceConfig{
			BaseURL:   strings.TrimSpace(os.Getenv("AI_SERVICE_BASE_URL")),
			APIToken:  firstNonBlank(os.Getenv("AI_SERVICE_API_KEY"), os.Getenv("AI_SERVICE_INTERNAL_TOKEN"), os.Getenv("BAILIAN_API_KEY")),
			ModelName: firstNonBlank(os.Getenv("AI_SERVICE_MODEL_NAME"), os.Getenv("BAILIAN_MODEL_NAME")),
			TimeoutMs: toInt(os.Getenv("AI_SERVICE_TIMEOUT_MS"), 4000),
		},
		Amap: AmapConfig{
			APIKey:    strings.TrimSpace(os.Getenv("AMAP_API_KEY")),
			BaseURL:   defaultString(os.Getenv("AMAP_BASE_URL"), "https://restapi.amap.com"),
			TimeoutMs: toInt(os.Getenv("AMAP_TIMEOUT_MS"), 3500),
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

func firstNonBlank(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func loadDotEnvFiles() {
	for _, path := range envCandidatePaths() {
		loadDotEnvFile(path)
	}
}

func envCandidatePaths() []string {
	wd, err := os.Getwd()
	if err != nil {
		return nil
	}

	out := make([]string, 0, 8)
	seen := map[string]bool{}
	current := wd
	for depth := 0; depth < 4; depth++ {
		for _, name := range []string{".env", ".env.local"} {
			path := filepath.Join(current, name)
			if !seen[path] {
				seen[path] = true
				out = append(out, path)
			}
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return out
}

func loadDotEnvFile(path string) {
	file, err := os.Open(filepath.Clean(path))
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		key, value, ok := parseDotEnvLine(scanner.Text())
		if !ok {
			continue
		}
		if strings.TrimSpace(os.Getenv(key)) != "" {
			continue
		}
		_ = os.Setenv(key, value)
	}
}

func parseDotEnvLine(line string) (string, string, bool) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return "", "", false
	}
	if strings.HasPrefix(trimmed, "export ") {
		trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "export "))
	}
	idx := strings.Index(trimmed, "=")
	if idx <= 0 {
		return "", "", false
	}

	key := strings.TrimSpace(trimmed[:idx])
	value := strings.TrimSpace(trimmed[idx+1:])
	if key == "" {
		return "", "", false
	}
	if len(value) >= 2 {
		if (strings.HasPrefix(value, "\"") && strings.HasSuffix(value, "\"")) || (strings.HasPrefix(value, "'") && strings.HasSuffix(value, "'")) {
			value = value[1 : len(value)-1]
		}
	}
	return key, value, true
}
