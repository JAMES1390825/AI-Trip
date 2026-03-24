package app

import (
	"crypto/hmac"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const tokenIssuer = "trip-api-go"

func normalizeRole(role string) (string, error) {
	normalized := strings.ToUpper(strings.TrimSpace(role))
	if normalized == "" {
		normalized = "USER"
	}
	if normalized != "USER" && normalized != "ADMIN" {
		return "", errors.New("role must be USER or ADMIN")
	}
	return normalized, nil
}

func issueToken(secret string, expirationMinutes int, userID, role string) (string, string, error) {
	normalizedRole, err := normalizeRole(role)
	if err != nil {
		return "", "", err
	}

	now := time.Now().UTC()
	expiresAt := now.Add(time.Duration(expirationMinutes) * time.Minute)

	header := map[string]any{
		"alg": "HS384",
		"typ": "JWT",
	}
	payload := map[string]any{
		"role": normalizedRole,
		"sub":  strings.TrimSpace(userID),
		"iss":  tokenIssuer,
		"iat":  now.Unix(),
		"exp":  expiresAt.Unix(),
	}

	headerJSON, _ := json.Marshal(header)
	payloadJSON, _ := json.Marshal(payload)

	headerSeg := base64.RawURLEncoding.EncodeToString(headerJSON)
	payloadSeg := base64.RawURLEncoding.EncodeToString(payloadJSON)
	unsigned := headerSeg + "." + payloadSeg

	mac := hmac.New(sha512.New384, []byte(secret))
	_, _ = mac.Write([]byte(unsigned))
	signature := mac.Sum(nil)
	token := unsigned + "." + base64.RawURLEncoding.EncodeToString(signature)

	return token, expiresAt.Format(time.RFC3339), nil
}

func verifyToken(secret, token string) (*AuthUser, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token format")
	}

	unsigned := parts[0] + "." + parts[1]
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, errors.New("invalid token signature")
	}

	mac := hmac.New(sha512.New384, []byte(secret))
	_, _ = mac.Write([]byte(unsigned))
	expected := mac.Sum(nil)
	if subtle.ConstantTimeCompare(signature, expected) != 1 {
		return nil, errors.New("invalid token signature")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("invalid token header")
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("invalid token payload")
	}

	var header map[string]any
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, errors.New("invalid token header")
	}
	if !strings.EqualFold(asString(header["alg"]), "HS384") {
		return nil, errors.New("invalid token algorithm")
	}

	var payload map[string]any
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, errors.New("invalid token payload")
	}

	issuer := strings.TrimSpace(asString(payload["iss"]))
	if issuer != tokenIssuer {
		return nil, errors.New("invalid token issuer")
	}

	exp, ok := asInt(payload["exp"])
	if !ok {
		return nil, errors.New("invalid token exp")
	}
	if time.Now().UTC().Unix() >= int64(exp) {
		return nil, errors.New("token expired")
	}

	userID := strings.TrimSpace(asString(payload["sub"]))
	if userID == "" {
		return nil, errors.New("invalid token subject")
	}

	role, err := normalizeRole(asString(payload["role"]))
	if err != nil {
		role = "USER"
	}

	return &AuthUser{UserID: userID, Role: role}, nil
}
