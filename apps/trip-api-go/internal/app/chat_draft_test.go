package app

import "testing"

func TestParseDayCountToken(t *testing.T) {
	cases := []struct {
		name  string
		input string
		want  int
		ok    bool
	}{
		{name: "arabic", input: "4", want: 4, ok: true},
		{name: "single_chinese", input: "四", want: 4, ok: true},
		{name: "liang", input: "两", want: 2, ok: true},
		{name: "ten", input: "十", want: 10, ok: true},
		{name: "eleven", input: "十一", want: 11, ok: true},
		{name: "fourteen", input: "十四", want: 14, ok: true},
		{name: "twenty", input: "二十", want: 20, ok: true},
		{name: "invalid_text", input: "这周", want: 0, ok: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parseDayCountToken(tc.input)
			if ok != tc.ok {
				t.Fatalf("expected ok=%v, got %v (value=%d)", tc.ok, ok, got)
			}
			if tc.ok && got != tc.want {
				t.Fatalf("expected %d, got %d", tc.want, got)
			}
		})
	}
}

func TestExtractTripDays(t *testing.T) {
	cases := []struct {
		name string
		text string
		want int
		ok   bool
	}{
		{name: "four_days_chinese", text: "四天吧", want: 4, ok: true},
		{name: "eleven_days", text: "想玩十一天", want: 11, ok: true},
		{name: "liang_days", text: "两天一夜就好", want: 2, ok: true},
		{name: "arabic_days", text: "3天", want: 3, ok: true},
		{name: "too_large_arabic", text: "20天深度游", want: 0, ok: false},
		{name: "too_large_chinese", text: "二十天", want: 0, ok: false},
		{name: "no_days", text: "5月1日出发", want: 0, ok: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := extractTripDays(tc.text)
			if ok != tc.ok {
				t.Fatalf("expected ok=%v, got %v (value=%d)", tc.ok, ok, got)
			}
			if tc.ok && got != tc.want {
				t.Fatalf("expected %d, got %d", tc.want, got)
			}
		})
	}
}

func TestFillDraftFromMessageExtractsChineseDays(t *testing.T) {
	draft := normalizeDraft(map[string]any{
		"origin_city":  "绍兴",
		"destination":  "北京",
		"budget_level": "medium",
		"start_date":   "2026-05-01",
		"pace":         "relaxed",
	}, "u-1")

	updated := fillDraftFromMessage(draft, "四天吧")
	days, ok := asInt(updated["days"])
	if !ok || days != 4 {
		t.Fatalf("expected days=4 from chinese input, got value=%v ok=%v", updated["days"], ok)
	}

	missing := missingDraftFields(updated)
	for _, field := range missing {
		if field == "days" {
			t.Fatalf("expected days to be filled, missing=%v", missing)
		}
	}
}
