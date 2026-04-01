package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleDestinationResolveUsesAmapProvider(t *testing.T) {
	server := newAmapStubServer()
	defer server.Close()

	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{
		store: store,
		amap:  NewAmapClient(AmapConfig{APIKey: "test-key", BaseURL: server.URL, TimeoutMs: 2000}),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/destinations/resolve?q=上海&limit=5", nil)
	rr := httptest.NewRecorder()

	app.handleDestinationResolve(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp DestinationResolveResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Degraded {
		t.Fatalf("expected degraded=false")
	}
	if len(resp.Items) == 0 {
		t.Fatalf("expected at least 1 item")
	}
	if resp.Items[0].Provider != "amap" {
		t.Fatalf("expected amap provider, got %q", resp.Items[0].Provider)
	}
	if resp.Items[0].DestinationID != "amap:adcode:310000" {
		t.Fatalf("unexpected destination id: %q", resp.Items[0].DestinationID)
	}
}

func TestHandlePlaceDetailReturnsAmapPlace(t *testing.T) {
	server := newAmapStubServer()
	defer server.Close()

	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{
		store: store,
		amap:  NewAmapClient(AmapConfig{APIKey: "test-key", BaseURL: server.URL, TimeoutMs: 2000}),
	}

	rr := httptest.NewRecorder()
	app.handlePlaceDetail(rr, &AuthUser{UserID: "u-1"}, "amap", "poi-bund")

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp PlaceDetail
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Provider != "amap" {
		t.Fatalf("expected provider amap, got %q", resp.Provider)
	}
	if resp.Name != "外滩" {
		t.Fatalf("expected 外滩, got %q", resp.Name)
	}
	if resp.OpeningHoursText == "" {
		t.Fatalf("expected opening hours text")
	}
}

func TestBuildV2VariantItineraryGroundsWithAmap(t *testing.T) {
	server := newAmapStubServer()
	defer server.Close()

	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{
		store: store,
		amap:  NewAmapClient(AmapConfig{APIKey: "test-key", BaseURL: server.URL, TimeoutMs: 2000}),
	}

	brief := PlanningBrief{
		OriginCity: "上海",
		Destination: &DestinationEntity{
			DestinationID:    "amap:adcode:310000",
			DestinationLabel: "上海市",
			Country:          "中国",
			Region:           "上海",
			Adcode:           "310000",
			CityCode:         "021",
			CenterLat:        31.2304,
			CenterLng:        121.4737,
			Provider:         "amap",
			ProviderPlaceID:  "city-shanghai",
			MatchType:        "city",
		},
		Days:            3,
		StartDate:       "2026-04-16",
		BudgetLevel:     "medium",
		Pace:            "relaxed",
		TravelStyles:    []string{"citywalk"},
		MustGo:          []string{"外滩"},
		Avoid:           []string{},
		Constraints:     PlanningConstraints{WeatherPreference: "rain_friendly"},
		MissingFields:   []string{},
		ReadyToGenerate: true,
	}

	itinerary := app.buildV2VariantItinerary(context.Background(), brief, "u-1", "balanced")

	if strings.TrimSpace(asString(itinerary["source_mode"])) != "provider" {
		t.Fatalf("expected top-level source_mode provider, got %q", asString(itinerary["source_mode"]))
	}
	if asBool(itinerary["degraded"]) {
		t.Fatalf("expected degraded=false")
	}

	validation := asMap(itinerary["validation_result"])
	coverage := asMap(validation["coverage"])
	if asFloat(coverage["provider_grounded_blocks"], 0) < 0.85 {
		t.Fatalf("expected provider grounded coverage >= 0.85, got %v", coverage["provider_grounded_blocks"])
	}
	if asFloat(coverage["route_evidence_coverage"], 0) < 0.8 {
		t.Fatalf("expected route evidence coverage >= 0.8, got %v", coverage["route_evidence_coverage"])
	}
	if asFloat(coverage["weather_evidence_coverage"], 0) < 0.85 {
		t.Fatalf("expected weather evidence coverage >= 0.85, got %v", coverage["weather_evidence_coverage"])
	}

	firstDay := asMap(asSlice(itinerary["days"])[0])
	firstBlock := asMap(asSlice(firstDay["blocks"])[0])
	if firstBlock["provider"] != "amap" {
		t.Fatalf("expected block provider amap, got %v", firstBlock["provider"])
	}
	if strings.TrimSpace(asString(asMap(firstBlock["evidence"])["weather_basis"])) == "" {
		t.Fatalf("expected real weather basis on block evidence")
	}

	firstLeg := asMap(asSlice(itinerary["transit_legs"])[0])
	if firstLeg["provider"] != "amap" {
		t.Fatalf("expected transit leg provider amap, got %v", firstLeg["provider"])
	}
	if strings.TrimSpace(asString(asMap(firstLeg["evidence"])["provider_basis"])) != "amap_driving_v3" {
		t.Fatalf("expected amap_driving_v3 leg evidence, got %q", asString(asMap(firstLeg["evidence"])["provider_basis"]))
	}
}

func TestBuildV2VariantItineraryUsesProviderCandidatePoolForMustGoAndFood(t *testing.T) {
	server := newAmapStubServer()
	defer server.Close()

	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{
		store: store,
		amap:  NewAmapClient(AmapConfig{APIKey: "test-key", BaseURL: server.URL, TimeoutMs: 2000}),
	}

	brief := PlanningBrief{
		OriginCity: "上海",
		Destination: &DestinationEntity{
			DestinationID:    "amap:adcode:310000",
			DestinationLabel: "上海市",
			Country:          "中国",
			Region:           "上海",
			Adcode:           "310000",
			CityCode:         "021",
			CenterLat:        31.2304,
			CenterLng:        121.4737,
			Provider:         "amap",
			ProviderPlaceID:  "city-shanghai",
			MatchType:        "city",
		},
		Days:         1,
		StartDate:    "2026-04-16",
		BudgetLevel:  "medium",
		Pace:         "relaxed",
		TravelStyles: []string{"citywalk", "culture"},
		MustGo:       []string{"上海博物馆"},
		Avoid:        []string{},
		Constraints: PlanningConstraints{
			DiningPreference: "本帮菜",
		},
		MissingFields:   []string{},
		ReadyToGenerate: true,
	}

	itinerary := app.buildV2VariantItinerary(context.Background(), brief, "u-1", "balanced")

	if strings.TrimSpace(asString(itinerary["provider_generation_basis"])) != "amap_candidate_pool_scored" {
		t.Fatalf("expected provider_generation_basis amap_candidate_pool_scored, got %q", asString(itinerary["provider_generation_basis"]))
	}

	warnings := asStringSlice(itinerary["warnings"])
	if !containsString(warnings, providerCandidatePoolWarning) {
		t.Fatalf("expected candidate pool warning in warnings, got %#v", warnings)
	}

	if asFloat(asMap(asMap(itinerary["validation_result"])["coverage"])["must_go_hit_rate"], 0) < 1 {
		t.Fatalf("expected must_go_hit_rate 1, got %v", asMap(asMap(itinerary["validation_result"])["coverage"])["must_go_hit_rate"])
	}

	day := asMap(asSlice(itinerary["days"])[0])
	blocks := asSlice(day["blocks"])
	if len(blocks) != 4 {
		t.Fatalf("expected 4 blocks, got %d", len(blocks))
	}

	foodBlock := asMap(blocks[1])
	if strings.TrimSpace(asString(foodBlock["poi"])) != "老上海本帮菜馆" {
		t.Fatalf("expected food block to use provider restaurant, got %q", asString(foodBlock["poi"]))
	}
	if strings.TrimSpace(asString(foodBlock["provider"])) != "amap" {
		t.Fatalf("expected food block provider amap, got %q", asString(foodBlock["provider"]))
	}

	if !itineraryContainsText(asStringSlice(itinerary["poi_sequence"]), "上海博物馆") {
		t.Fatalf("expected poi sequence to include must-go 上海博物馆, got %#v", asStringSlice(itinerary["poi_sequence"]))
	}
}

func TestHandleGeneratePlanV2RejectsWhenFallbackForbiddenAndProviderCoverageLow(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	body, err := json.Marshal(map[string]any{
		"planning_brief": map[string]any{
			"origin_city": "上海",
			"destination": map[string]any{
				"destination_id":    "builtin:cn-shanghai",
				"destination_label": "上海市",
				"country":           "中国",
				"region":            "上海",
				"adcode":            "310000",
				"city_code":         "021",
				"center_lat":        31.2304,
				"center_lng":        121.4737,
				"provider":          "builtin",
				"provider_place_id": "cn-shanghai",
				"match_type":        "city",
			},
			"days":              2,
			"start_date":        "2026-04-16",
			"budget_level":      "medium",
			"pace":              "relaxed",
			"travel_styles":     []string{"citywalk"},
			"must_go":           []string{"外滩"},
			"avoid":             []string{},
			"constraints":       map[string]any{"weather_preference": "rain_friendly"},
			"missing_fields":    []string{},
			"ready_to_generate": true,
		},
		"options": map[string]any{
			"variants":       1,
			"allow_fallback": false,
		},
	})
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/plans/generate-v2", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	app.handleGeneratePlanV2(rr, req, &AuthUser{UserID: "u-1"})

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rr.Code)
	}
}

func newAmapStubServer() *httptest.Server {
	placesByKeyword := map[string][]map[string]any{
		"上海": {{
			"id":        "city-shanghai",
			"name":      "上海市",
			"pname":     "上海市",
			"cityname":  "上海市",
			"adname":    "上海市",
			"adcode":    "310000",
			"citycode":  "021",
			"location":  "121.473700,31.230400",
			"type":      "地名地址信息;普通地名;地级市",
			"address":   "",
			"biz_ext":   map[string]any{"rating": "4.8", "cost": "0"},
			"business":  map[string]any{},
			"photos":    []map[string]any{},
			"tel":       "",
			"important": true,
		}},
		"外滩": {{
			"id":       "poi-bund",
			"name":     "外滩",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.490000,31.240000",
			"type":     "风景名胜;景点;海滨",
			"address":  "中山东一路",
			"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
			"business": map[string]any{"opentime_today": "全天开放", "tel": "021-12345678"},
			"photos":   []map[string]any{{"url": "https://img.example.com/bund.jpg"}},
			"tel":      "021-12345678",
		}},
		"武康路": {{
			"id":       "poi-wukang",
			"name":     "武康路",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "徐汇区",
			"adcode":   "310104",
			"citycode": "021",
			"location": "121.437800,31.205800",
			"type":     "风景名胜;景点;特色街区",
			"address":  "武康路",
			"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
			"business": map[string]any{"opentime_today": "全天开放"},
			"photos":   []map[string]any{{"url": "https://img.example.com/wukang.jpg"}},
		}},
		"豫园": {{
			"id":       "poi-yuyuan",
			"name":     "豫园",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.492100,31.227200",
			"type":     "风景名胜;景点;园林",
			"address":  "福佑路168号",
			"biz_ext":  map[string]any{"rating": "4.6", "cost": "40"},
			"business": map[string]any{"opentime_today": "09:00-16:30"},
			"photos":   []map[string]any{{"url": "https://img.example.com/yuyuan.jpg"}},
		}},
		"陆家嘴": {{
			"id":       "poi-lujiazui",
			"name":     "陆家嘴",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "浦东新区",
			"adcode":   "310115",
			"citycode": "021",
			"location": "121.499800,31.235400",
			"type":     "风景名胜;景点;商圈",
			"address":  "陆家嘴环路",
			"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
			"business": map[string]any{"opentime_today": "全天开放"},
			"photos":   []map[string]any{{"url": "https://img.example.com/lujiazui.jpg"}},
		}},
		"上海博物馆": {{
			"id":       "poi-shmuseum",
			"name":     "上海博物馆",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.489400,31.230300",
			"type":     "科教文化服务;博物馆;综合博物馆",
			"address":  "人民大道201号",
			"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
			"business": map[string]any{"opentime_today": "09:00-17:00"},
			"photos":   []map[string]any{{"url": "https://img.example.com/shmuseum.jpg"}},
		}},
		"老上海本帮菜馆": {{
			"id":       "poi-benbang",
			"name":     "老上海本帮菜馆",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.486800,31.232100",
			"type":     "餐饮服务;中餐厅;本帮菜",
			"address":  "福州路188号",
			"biz_ext":  map[string]any{"rating": "4.6", "cost": "88"},
			"business": map[string]any{"opentime_today": "11:00-21:30"},
			"photos":   []map[string]any{{"url": "https://img.example.com/benbang.jpg"}},
		}},
		"武康路咖啡馆": {{
			"id":       "poi-wukang-cafe",
			"name":     "武康路咖啡馆",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "徐汇区",
			"adcode":   "310104",
			"citycode": "021",
			"location": "121.438600,31.206200",
			"type":     "餐饮服务;咖啡厅;咖啡厅",
			"address":  "武康路210号",
			"biz_ext":  map[string]any{"rating": "4.5", "cost": "48"},
			"business": map[string]any{"opentime_today": "10:00-22:00"},
			"photos":   []map[string]any{{"url": "https://img.example.com/wukang-cafe.jpg"}},
		}},
		"南京路步行街": {{
			"id":       "poi-nanjing-road",
			"name":     "南京路步行街",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.479900,31.236100",
			"type":     "风景名胜;景点;特色街区",
			"address":  "南京东路",
			"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
			"business": map[string]any{"opentime_today": "全天开放"},
			"photos":   []map[string]any{{"url": "https://img.example.com/nanjing-road.jpg"}},
		}},
		"热门景点": {
			{
				"id":       "poi-bund",
				"name":     "外滩",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.490000,31.240000",
				"type":     "风景名胜;景点;海滨",
				"address":  "中山东一路",
				"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
				"photos":   []map[string]any{{"url": "https://img.example.com/bund.jpg"}},
			},
			{
				"id":       "poi-yuyuan",
				"name":     "豫园",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.492100,31.227200",
				"type":     "风景名胜;景点;园林",
				"address":  "福佑路168号",
				"biz_ext":  map[string]any{"rating": "4.6", "cost": "40"},
				"business": map[string]any{"opentime_today": "09:00-16:30"},
				"photos":   []map[string]any{{"url": "https://img.example.com/yuyuan.jpg"}},
			},
		},
		"地标": {
			{
				"id":       "poi-bund",
				"name":     "外滩",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.490000,31.240000",
				"type":     "风景名胜;景点;海滨",
				"address":  "中山东一路",
				"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
			{
				"id":       "poi-lujiazui",
				"name":     "陆家嘴",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "浦东新区",
				"adcode":   "310115",
				"citycode": "021",
				"location": "121.499800,31.235400",
				"type":     "风景名胜;景点;商圈",
				"address":  "陆家嘴环路",
				"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
		},
		"景点": {
			{
				"id":       "poi-bund",
				"name":     "外滩",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.490000,31.240000",
				"type":     "风景名胜;景点;海滨",
				"address":  "中山东一路",
				"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
		},
		"本帮菜": {{
			"id":       "poi-benbang",
			"name":     "老上海本帮菜馆",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.486800,31.232100",
			"type":     "餐饮服务;中餐厅;本帮菜",
			"address":  "福州路188号",
			"biz_ext":  map[string]any{"rating": "4.6", "cost": "88"},
			"business": map[string]any{"opentime_today": "11:00-21:30"},
		}},
		"本地菜": {{
			"id":       "poi-benbang",
			"name":     "老上海本帮菜馆",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.486800,31.232100",
			"type":     "餐饮服务;中餐厅;本帮菜",
			"address":  "福州路188号",
			"biz_ext":  map[string]any{"rating": "4.6", "cost": "88"},
			"business": map[string]any{"opentime_today": "11:00-21:30"},
		}},
		"特色餐厅": {
			{
				"id":       "poi-benbang",
				"name":     "老上海本帮菜馆",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.486800,31.232100",
				"type":     "餐饮服务;中餐厅;本帮菜",
				"address":  "福州路188号",
				"biz_ext":  map[string]any{"rating": "4.6", "cost": "88"},
				"business": map[string]any{"opentime_today": "11:00-21:30"},
			},
			{
				"id":       "poi-wukang-cafe",
				"name":     "武康路咖啡馆",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "徐汇区",
				"adcode":   "310104",
				"citycode": "021",
				"location": "121.438600,31.206200",
				"type":     "餐饮服务;咖啡厅;咖啡厅",
				"address":  "武康路210号",
				"biz_ext":  map[string]any{"rating": "4.5", "cost": "48"},
				"business": map[string]any{"opentime_today": "10:00-22:00"},
			},
		},
		"咖啡": {{
			"id":       "poi-wukang-cafe",
			"name":     "武康路咖啡馆",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "徐汇区",
			"adcode":   "310104",
			"citycode": "021",
			"location": "121.438600,31.206200",
			"type":     "餐饮服务;咖啡厅;咖啡厅",
			"address":  "武康路210号",
			"biz_ext":  map[string]any{"rating": "4.5", "cost": "48"},
			"business": map[string]any{"opentime_today": "10:00-22:00"},
		}},
		"博物馆": {{
			"id":       "poi-shmuseum",
			"name":     "上海博物馆",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.489400,31.230300",
			"type":     "科教文化服务;博物馆;综合博物馆",
			"address":  "人民大道201号",
			"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
			"business": map[string]any{"opentime_today": "09:00-17:00"},
		}},
		"街区": {
			{
				"id":       "poi-wukang",
				"name":     "武康路",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "徐汇区",
				"adcode":   "310104",
				"citycode": "021",
				"location": "121.437800,31.205800",
				"type":     "风景名胜;景点;特色街区",
				"address":  "武康路",
				"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
			{
				"id":       "poi-nanjing-road",
				"name":     "南京路步行街",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.479900,31.236100",
				"type":     "风景名胜;景点;特色街区",
				"address":  "南京东路",
				"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
		},
		"步行街": {
			{
				"id":       "poi-nanjing-road",
				"name":     "南京路步行街",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.479900,31.236100",
				"type":     "风景名胜;景点;特色街区",
				"address":  "南京东路",
				"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
			{
				"id":       "poi-wukang",
				"name":     "武康路",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "徐汇区",
				"adcode":   "310104",
				"citycode": "021",
				"location": "121.437800,31.205800",
				"type":     "风景名胜;景点;特色街区",
				"address":  "武康路",
				"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
		},
		"老街": {{
			"id":       "poi-nanjing-road",
			"name":     "南京路步行街",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.479900,31.236100",
			"type":     "风景名胜;景点;特色街区",
			"address":  "南京东路",
			"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
			"business": map[string]any{"opentime_today": "全天开放"},
		}},
		"夜景": {
			{
				"id":       "poi-bund",
				"name":     "外滩",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.490000,31.240000",
				"type":     "风景名胜;景点;海滨",
				"address":  "中山东一路",
				"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
			{
				"id":       "poi-lujiazui",
				"name":     "陆家嘴",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "浦东新区",
				"adcode":   "310115",
				"citycode": "021",
				"location": "121.499800,31.235400",
				"type":     "风景名胜;景点;商圈",
				"address":  "陆家嘴环路",
				"biz_ext":  map[string]any{"rating": "4.7", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
		},
		"观景": {
			{
				"id":       "poi-bund",
				"name":     "外滩",
				"pname":    "上海市",
				"cityname": "上海市",
				"adname":   "黄浦区",
				"adcode":   "310101",
				"citycode": "021",
				"location": "121.490000,31.240000",
				"type":     "风景名胜;景点;海滨",
				"address":  "中山东一路",
				"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
				"business": map[string]any{"opentime_today": "全天开放"},
			},
		},
		"滨江": {{
			"id":       "poi-bund",
			"name":     "外滩",
			"pname":    "上海市",
			"cityname": "上海市",
			"adname":   "黄浦区",
			"adcode":   "310101",
			"citycode": "021",
			"location": "121.490000,31.240000",
			"type":     "风景名胜;景点;海滨",
			"address":  "中山东一路",
			"biz_ext":  map[string]any{"rating": "4.8", "cost": "0"},
			"business": map[string]any{"opentime_today": "全天开放"},
		}},
	}

	placesByID := map[string]map[string]any{}
	for _, items := range placesByKeyword {
		for _, item := range items {
			id := strings.TrimSpace(asString(item["id"]))
			if id == "" {
				continue
			}
			placesByID[id] = item
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/v5/place/text", func(w http.ResponseWriter, r *http.Request) {
		keyword := strings.TrimSpace(r.URL.Query().Get("keywords"))
		pois, ok := placesByKeyword[keyword]
		if !ok {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "1",
				"info":   "OK",
				"pois":   []map[string]any{},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "1",
			"info":   "OK",
			"pois":   pois,
		})
	})
	mux.HandleFunc("/v5/place/detail", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		poi, ok := placesByID[id]
		if !ok {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "1",
				"info":   "OK",
				"pois":   []map[string]any{},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "1",
			"info":   "OK",
			"pois":   []map[string]any{poi},
		})
	})
	mux.HandleFunc("/v3/weather/weatherInfo", func(w http.ResponseWriter, r *http.Request) {
		if strings.TrimSpace(r.URL.Query().Get("extensions")) == "all" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "1",
				"info":   "OK",
				"forecasts": []map[string]any{{
					"city":   "上海市",
					"adcode": "310000",
					"casts": []map[string]any{
						{"date": "2026-04-16", "dayweather": "多云", "nightweather": "晴", "daytemp": "25", "nighttemp": "17", "daywind": "东南", "nightwind": "东南", "daypower": "3", "nightpower": "2"},
						{"date": "2026-04-17", "dayweather": "小雨", "nightweather": "阴", "daytemp": "22", "nighttemp": "16", "daywind": "东", "nightwind": "东", "daypower": "3", "nightpower": "2"},
						{"date": "2026-04-18", "dayweather": "晴", "nightweather": "晴", "daytemp": "27", "nighttemp": "18", "daywind": "东南", "nightwind": "东南", "daypower": "2", "nightpower": "2"},
					},
				}},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "1",
			"info":   "OK",
			"lives": []map[string]any{{
				"province":      "上海市",
				"city":          "上海市",
				"adcode":        "310000",
				"weather":       "多云",
				"temperature":   "24",
				"winddirection": "东南",
				"windpower":     "3",
				"humidity":      "60",
				"reporttime":    "2026-04-16 09:00:00",
			}},
		})
	})
	mux.HandleFunc("/v3/direction/driving", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status": "1",
			"info":   "OK",
			"route": map[string]any{
				"paths": []map[string]any{{
					"distance": "4200",
					"duration": "1260",
					"steps": []map[string]any{
						{"polyline": "121.4737,31.2304;121.4900,31.2400"},
						{"polyline": "121.4900,31.2400;121.4998,31.2354"},
					},
				}},
			},
		})
	})

	return httptest.NewServer(mux)
}
