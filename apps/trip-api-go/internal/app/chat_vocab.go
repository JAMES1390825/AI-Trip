package app

import "regexp"

var requiredFields = []string{"origin_city", "destination", "days", "budget_level", "start_date", "pace"}

var cityAlias = map[string][]string{
	"beijing":   {"\u5317\u4eac", "beijing", "\u5317\u4eac\u5e02"},
	"tianjin":   {"\u5929\u6d25", "tianjin", "\u5929\u6d25\u5e02"},
	"shanghai":  {"\u4e0a\u6d77", "shanghai", "\u4e0a\u6d77\u5e02"},
	"hangzhou":  {"\u676d\u5dde", "hangzhou", "\u676d\u5dde\u5e02"},
	"chengdu":   {"\u6210\u90fd", "chengdu", "\u6210\u90fd\u5e02"},
	"guangzhou": {"\u5e7f\u5dde", "guangzhou", "\u5e7f\u5dde\u5e02"},
	"shenzhen":  {"\u6df1\u5733", "shenzhen", "\u6df1\u5733\u5e02"},
	"xi_an":     {"\u897f\u5b89", "xian", "xi'an", "xi an", "\u897f\u5b89\u5e02"},
	"shaoxing":  {"\u7ecd\u5174", "shaoxing", "\u7ecd\u5174\u5e02"},
	"suzhou":    {"\u82cf\u5dde", "suzhou", "\u82cf\u5dde\u5e02"},
	"wuhan":     {"\u6b66\u6c49", "wuhan", "\u6b66\u6c49\u5e02"},
	"nanjing":   {"\u5357\u4eac", "nanjing", "\u5357\u4eac\u5e02"},
}

var cityDisplay = map[string]string{
	"beijing":   "\u5317\u4eac",
	"tianjin":   "\u5929\u6d25",
	"shanghai":  "\u4e0a\u6d77",
	"hangzhou":  "\u676d\u5dde",
	"chengdu":   "\u6210\u90fd",
	"guangzhou": "\u5e7f\u5dde",
	"shenzhen":  "\u6df1\u5733",
	"xi_an":     "\u897f\u5b89",
	"shaoxing":  "\u7ecd\u5174",
	"suzhou":    "\u82cf\u5dde",
	"wuhan":     "\u6b66\u6c49",
	"nanjing":   "\u5357\u4eac",
}

var (
	originFromRe    = regexp.MustCompile("\u4ece\\s*([A-Za-z\\p{Han}]{2,20}?)(?:\\s*(?:\u51fa\u53d1|\u53bb|\u5230|\u73a9|\u901b|\u65c5\u6e38|\u65c5\u884c)|$|[\uFF0C,\u3002.!\uFF01?\uFF1F])")
	originRe        = regexp.MustCompile("([A-Za-z\\p{Han}]{2,20})\\s*\u51fa\u53d1")
	destinationGoRe = regexp.MustCompile("\u53bb\\s*([A-Za-z\\p{Han}]{2,20})")
	destinationToRe = regexp.MustCompile("\u5230\\s*([A-Za-z\\p{Han}]{2,20})")
	daysRe          = regexp.MustCompile("([0-9\u96f6\u3007\u25cb\u4e00\u4e8c\u4e24\u4fe9\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]{1,4})\\s*\u5929")
	dateRe          = regexp.MustCompile("(20\\d{2})[-/\u5e74](\\d{1,2})[-/\u6708](\\d{1,2})")
	hanCityTokenRe  = regexp.MustCompile("^[\\p{Han}]{2,4}$")
	cityKeywordRe   = regexp.MustCompile("[\u4ece\u53bb\u5230\u73a9\u5929\u9884\u7b97\u8282\u594f\u51fa\u53d1\u65c5\u6e38\u65c5\u884c]")
)

var cityStopwordSet = map[string]bool{
	"\u4f60\u597d": true,
	"\u60a8\u597d": true,
	"\u54c8\u55bd": true,
	"\u8c22\u8c22": true,
	"\u597d\u7684": true,
	"\u53ef\u4ee5": true,
	"\u5b89\u6392": true,
	"\u884c\u7a0b": true,
	"\u65c5\u884c": true,
	"\u65c5\u6e38": true,
	"\u7ee7\u7eed": true,
	"\u51fa\u53d1": true,
}
