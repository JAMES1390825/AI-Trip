package app

import (
	"strings"
	"testing"
	"time"
)

func TestNormalizeRole(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "empty defaults to user", input: "", want: "USER"},
		{name: "admin lower", input: "admin", want: "ADMIN"},
		{name: "user mixed", input: " UsEr ", want: "USER"},
		{name: "invalid", input: "guest", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeRole(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for role %q", tc.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

func TestIssueAndVerifyToken(t *testing.T) {
	secret := "unit-test-secret"
	token, expiresAt, err := issueToken(secret, 5, "user-1", "admin")
	if err != nil {
		t.Fatalf("issue token failed: %v", err)
	}
	if strings.TrimSpace(token) == "" {
		t.Fatalf("expected non-empty token")
	}
	if _, err := time.Parse(time.RFC3339, expiresAt); err != nil {
		t.Fatalf("expected RFC3339 expiresAt, got %q", expiresAt)
	}

	user, err := verifyToken(secret, token)
	if err != nil {
		t.Fatalf("verify token failed: %v", err)
	}
	if user.UserID != "user-1" {
		t.Fatalf("expected user-1, got %q", user.UserID)
	}
	if user.Role != "ADMIN" {
		t.Fatalf("expected ADMIN, got %q", user.Role)
	}
}

func TestVerifyTokenRejectsWrongSignature(t *testing.T) {
	token, _, err := issueToken("secret-a", 5, "user-1", "USER")
	if err != nil {
		t.Fatalf("issue token failed: %v", err)
	}

	if _, err := verifyToken("secret-b", token); err == nil {
		t.Fatalf("expected signature verification to fail")
	}
}

func TestVerifyTokenExpired(t *testing.T) {
	token, _, err := issueToken("expired-secret", -1, "user-1", "USER")
	if err != nil {
		t.Fatalf("issue token failed: %v", err)
	}

	_, err = verifyToken("expired-secret", token)
	if err == nil {
		t.Fatalf("expected expired token error")
	}
	if !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expected expired token error, got %v", err)
	}
}
