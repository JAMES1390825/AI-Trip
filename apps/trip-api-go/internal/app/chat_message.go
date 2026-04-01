package app

import (
	"fmt"
	"strings"
	"time"
)

func hasValue(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case string:
		return strings.TrimSpace(v) != ""
	default:
		if _, ok := asInt(v); ok {
			return true
		}
		return strings.TrimSpace(asString(v)) != ""
	}
}

func fieldJustFilled(before, after any) bool {
	return !hasValue(before) && hasValue(after)
}

func fieldConfirmLabel(field string, value any) string {
	switch field {
	case "origin_city":
		return fmt.Sprintf("\u51fa\u53d1\u5730\u8bb0\u4e3a%s", cityLabel(value))
	case "destination":
		return fmt.Sprintf("\u76ee\u7684\u5730\u8bb0\u4e3a%s", cityLabel(value))
	case "days":
		if days, ok := asInt(value); ok && days > 0 {
			return fmt.Sprintf("%d\u5929", days)
		}
		return ""
	case "budget_level":
		return fmt.Sprintf("\u9884\u7b97\u504f\u597d\u4e3a%s", budgetLabel(value))
	case "start_date":
		t := strings.TrimSpace(asString(value))
		if t == "" {
			return ""
		}
		return fmt.Sprintf("\u51fa\u53d1\u65e5\u671f\u4e3a%s", t)
	case "pace":
		return fmt.Sprintf("\u8282\u594f\u504f\u597d\u4e3a%s", paceLabel(value))
	default:
		return ""
	}
}

func composeAssistantMessage(previous, updated map[string]any, missing []string) string {
	confirmations := make([]string, 0, len(requiredFields))
	for _, field := range requiredFields {
		if fieldJustFilled(previous[field], updated[field]) {
			label := fieldConfirmLabel(field, updated[field])
			if label != "" {
				confirmations = append(confirmations, label)
			}
		}
	}

	detail := strings.Join(confirmations, "\uff0c")
	style := (len(confirmations)*2 + len(missing)) % 3

	if len(missing) == 0 {
		if len(confirmations) > 0 {
			switch style {
			case 0:
				return "\u592a\u597d\u4e86\uff0c" + detail + "\u3002\u4fe1\u606f\u9f50\u5168\u4e86\uff0c\u4f60\u53ef\u4ee5\u5f00\u59cb\u751f\u6210\u884c\u7a0b\u3002"
			case 1:
				return "\u660e\u767d\u4e86\uff0c" + detail + "\u3002\u73b0\u5728\u4fe1\u606f\u90fd\u9f50\u4e86\uff0c\u53ef\u4ee5\u76f4\u63a5\u751f\u6210\u884c\u7a0b\u3002"
			default:
				return "\u6536\u5230\uff0c" + detail + "\u3002\u6761\u4ef6\u5df2\u7ecf\u5b8c\u6574\uff0c\u70b9\u4e00\u4e0b\u5c31\u80fd\u751f\u6210\u884c\u7a0b\u3002"
			}
		}
		return "\u4fe1\u606f\u9f50\u5168\u4e86\uff0c\u4f60\u53ef\u4ee5\u5f00\u59cb\u751f\u6210\u884c\u7a0b\u3002"
	}

	question := questionForField(missing[0])
	if len(confirmations) > 0 {
		switch style {
		case 0:
			return "\u6536\u5230\uff0c" + detail + "\u3002" + question
		case 1:
			return "\u597d\u561e\uff0c" + detail + "\u3002\u63a5\u4e0b\u6765\u60f3\u518d\u786e\u8ba4\u4e00\u4e0b\uff1a" + question
		default:
			return "\u660e\u767d\uff0c" + detail + "\u3002\u90a3\u6211\u4eec\u7ee7\u7eed\uff1a" + question
		}
	}
	switch style {
	case 0:
		return "\u597d\u7684\uff0c" + question
	case 1:
		return "\u6211\u4eec\u7ee7\u7eed\uff0c" + question
	default:
		return question
	}
}

func questionForField(field string) string {
	switch field {
	case "origin_city":
		return "\u4f60\u4ece\u54ea\u5ea7\u57ce\u5e02\u51fa\u53d1\uff1f"
	case "destination":
		return "\u8fd9\u6b21\u6700\u60f3\u53bb\u54ea\u5ea7\u57ce\u5e02\u73a9\uff1f"
	case "days":
		return "\u8ba1\u5212\u73a9\u51e0\u5929\uff1f"
	case "budget_level":
		return "\u9884\u7b97\u66f4\u504f\u7701\u94b1\u3001\u9002\u4e2d\u8fd8\u662f\u4f53\u9a8c\u4f18\u5148\uff1f"
	case "start_date":
		return "\u9884\u8ba1\u54ea\u5929\u51fa\u53d1\uff1f"
	case "pace":
		return "\u4f60\u5e0c\u671b\u8f7b\u677e\u6162\u6e38\u8fd8\u662f\u7d27\u51d1\u9ad8\u6548\uff1f"
	default:
		return "\u518d\u8865\u5145\u4e00\u70b9\u4fe1\u606f\uff0c\u6211\u5c31\u53ef\u4ee5\u7ee7\u7eed\u3002"
	}
}

func optionsForField(field string) []string {
	switch field {
	case "origin_city":
		return []string{"\u5317\u4eac", "\u4e0a\u6d77", "\u676d\u5dde"}
	case "destination":
		return []string{"\u5317\u4eac", "\u4e0a\u6d77", "\u6210\u90fd"}
	case "days":
		return []string{"2\u5929", "3\u5929", "4\u5929"}
	case "budget_level":
		return []string{"\u8282\u7701\u9884\u7b97", "\u9002\u4e2d\u9884\u7b97", "\u4f53\u9a8c\u4f18\u5148"}
	case "start_date":
		return []string{time.Now().AddDate(0, 0, 7).Format("2006-01-02"), time.Now().AddDate(0, 0, 14).Format("2006-01-02")}
	case "pace":
		return []string{"\u8f7b\u677e\u6162\u6e38", "\u7d27\u51d1\u9ad8\u6548"}
	default:
		return []string{"\u7ee7\u7eed"}
	}
}
