package app

import (
	"fmt"
	"strings"
	"time"
)

var cityAlias = map[string][]string{
	"beijing":   {"beijing", "peking", "北京", "北京市"},
	"shanghai":  {"shanghai", "上海", "上海市"},
	"hangzhou":  {"hangzhou", "杭州", "杭州市"},
	"suzhou":    {"suzhou", "苏州", "苏州市"},
	"nanjing":   {"nanjing", "南京", "南京市"},
	"chengdu":   {"chengdu", "成都", "成都市"},
	"chongqing": {"chongqing", "重庆", "重庆市"},
	"xian":      {"xian", "xi'an", "西安", "西安市"},
	"guangzhou": {"guangzhou", "广州", "广州市"},
	"shenzhen":  {"shenzhen", "深圳", "深圳市"},
}

var cityDisplay = map[string]string{
	"beijing":   "北京",
	"shanghai":  "上海",
	"hangzhou":  "杭州",
	"suzhou":    "苏州",
	"nanjing":   "南京",
	"chengdu":   "成都",
	"chongqing": "重庆",
	"xian":      "西安",
	"guangzhou": "广州",
	"shenzhen":  "深圳",
}

func firstNonEmpty(values ...any) any {
	for _, value := range values {
		if strings.TrimSpace(asString(value)) != "" {
			return value
		}
	}
	return ""
}

func normalizeCity(value string) string {
	raw := strings.TrimSpace(value)
	if raw == "" {
		return ""
	}
	lower := strings.ToLower(raw)
	for key, aliases := range cityAlias {
		for _, alias := range aliases {
			if strings.ToLower(alias) == lower {
				return key
			}
		}
	}
	return raw
}

func normalizeBudget(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	if text == "" {
		return ""
	}
	if strings.Contains(text, "low") || strings.Contains(text, "省") || strings.Contains(text, "节约") {
		return "low"
	}
	if strings.Contains(text, "high") || strings.Contains(text, "高") || strings.Contains(text, "体验") {
		return "high"
	}
	if strings.Contains(text, "medium") || strings.Contains(text, "中") || strings.Contains(text, "适中") {
		return "medium"
	}
	return ""
}

func normalizePace(value string) string {
	text := strings.ToLower(strings.TrimSpace(value))
	if text == "" {
		return ""
	}
	if strings.Contains(text, "relaxed") || strings.Contains(text, "轻松") || strings.Contains(text, "慢") {
		return "relaxed"
	}
	if strings.Contains(text, "compact") || strings.Contains(text, "紧凑") || strings.Contains(text, "高效") {
		return "compact"
	}
	return ""
}

func normalizeDate(value string) string {
	text := strings.TrimSpace(value)
	if text == "" {
		return ""
	}
	replaced := strings.NewReplacer("年", "-", "月", "-", "日", "", "/", "-").Replace(text)
	parts := strings.Split(replaced, "-")
	if len(parts) != 3 {
		return ""
	}
	y := strings.TrimSpace(parts[0])
	m := strings.TrimSpace(parts[1])
	d := strings.TrimSpace(parts[2])
	if len(y) != 4 || !strings.HasPrefix(y, "20") {
		return ""
	}
	if m == "" || d == "" {
		return ""
	}
	if len(m) == 1 {
		m = "0" + m
	}
	if len(d) == 1 {
		d = "0" + d
	}
	candidate := fmt.Sprintf("%s-%s-%s", y, m, d)
	if !isISODate(candidate) {
		return ""
	}
	return candidate
}

func cityLabel(value any) string {
	code := normalizeCity(asString(value))
	if label, ok := cityDisplay[code]; ok {
		return label
	}
	raw := strings.TrimSpace(asString(value))
	if raw == "" {
		return "-"
	}
	return raw
}

func questionForField(field string) string {
	switch field {
	case "origin_city":
		return "你从哪座城市出发？"
	case "destination":
		return "这次最想去哪座城市玩？"
	case "days":
		return "计划玩几天？"
	case "budget_level":
		return "预算更偏省钱、适中还是体验优先？"
	case "start_date":
		return "预计哪天出发？"
	case "pace":
		return "你希望轻松慢游还是紧凑高效？"
	default:
		return "再补充一点信息，我就可以继续。"
	}
}

func optionsForField(field string) []string {
	switch field {
	case "origin_city":
		return []string{"北京", "上海", "杭州"}
	case "destination":
		return []string{"北京", "上海", "成都"}
	case "days":
		return []string{"2天", "3天", "4天"}
	case "budget_level":
		return []string{"节省预算", "适中预算", "体验优先"}
	case "start_date":
		return []string{time.Now().AddDate(0, 0, 7).Format("2006-01-02"), time.Now().AddDate(0, 0, 14).Format("2006-01-02")}
	case "pace":
		return []string{"轻松慢游", "紧凑高效"}
	default:
		return []string{"继续"}
	}
}
