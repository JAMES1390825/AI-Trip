package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type AmapClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

type amapPOI struct {
	ID            string
	Name          string
	Address       string
	Province      string
	City          string
	District      string
	Adcode        string
	CityCode      string
	Type          string
	Lat           float64
	Lng           float64
	Rating        float64
	Cost          float64
	BusinessHours string
	Tel           string
	Photos        []string
}

type amapRoute struct {
	DistanceMeters int
	DurationSec    int
	Polyline       string
}

type amapLiveWeather struct {
	City          string
	Adcode        string
	Weather       string
	Temperature   string
	WindDirection string
	WindPower     string
	Humidity      string
	ReportTime    string
}

type amapForecast struct {
	City   string
	Adcode string
	Days   []amapForecastDay
}

type amapForecastDay struct {
	Date         string
	DayWeather   string
	NightWeather string
	DayTemp      int
	NightTemp    int
	DayWind      string
	NightWind    string
	DayPower     string
	NightPower   string
}

func NewAmapClient(cfg AmapConfig) *AmapClient {
	apiKey := strings.TrimSpace(cfg.APIKey)
	if apiKey == "" {
		return nil
	}

	baseURL := strings.TrimRight(defaultString(cfg.BaseURL, "https://restapi.amap.com"), "/")
	timeout := time.Duration(cfg.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 3500 * time.Millisecond
	}

	return &AmapClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *AmapClient) Enabled() bool {
	return c != nil && strings.TrimSpace(c.apiKey) != ""
}

func (c *AmapClient) ResolveDestinations(ctx context.Context, query string, limit int) ([]DestinationEntity, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("query is blank")
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 20 {
		limit = 20
	}

	payload, err := c.getJSON(ctx, "/v5/place/text", url.Values{
		"keywords":    []string{query},
		"page_size":   []string{strconv.Itoa(limit)},
		"city_limit":  []string{"false"},
		"show_fields": []string{"business"},
	})
	if err != nil {
		return nil, err
	}

	items := make([]DestinationEntity, 0, limit)
	seen := map[string]bool{}
	for _, item := range asSlice(payload["pois"]) {
		entity, ok := amapDestinationEntityFromPOI(amapPOIFromMap(asMap(item)))
		if !ok {
			continue
		}
		if seen[entity.DestinationID] {
			continue
		}
		seen[entity.DestinationID] = true
		items = append(items, entity)
		if len(items) >= limit {
			break
		}
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("no destination candidates")
	}
	return items, nil
}

func (c *AmapClient) SearchPOIs(ctx context.Context, keyword string, destination *DestinationEntity, limit int) ([]amapPOI, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return nil, fmt.Errorf("keyword is blank")
	}
	if limit <= 0 {
		limit = 5
	}
	if limit > 20 {
		limit = 20
	}

	attempts := make([]url.Values, 0, 3)
	if destination != nil {
		if strings.TrimSpace(destination.Adcode) != "" {
			params := url.Values{
				"keywords":    []string{keyword},
				"page_size":   []string{strconv.Itoa(limit)},
				"region":      []string{strings.TrimSpace(destination.Adcode)},
				"city_limit":  []string{"true"},
				"show_fields": []string{"business,photos"},
			}
			if destination.CenterLat != 0 || destination.CenterLng != 0 {
				params.Set("location", formatLngLat(destination.CenterLng, destination.CenterLat))
				params.Set("sortrule", "distance")
			}
			attempts = append(attempts, params)
		}
		if label := strings.TrimSpace(destination.DestinationLabel); label != "" {
			params := url.Values{
				"keywords":    []string{keyword},
				"page_size":   []string{strconv.Itoa(limit)},
				"region":      []string{label},
				"city_limit":  []string{"true"},
				"show_fields": []string{"business,photos"},
			}
			if destination.CenterLat != 0 || destination.CenterLng != 0 {
				params.Set("location", formatLngLat(destination.CenterLng, destination.CenterLat))
				params.Set("sortrule", "distance")
			}
			attempts = append(attempts, params)
		}
	}
	attempts = append(attempts, url.Values{
		"keywords":    []string{keyword},
		"page_size":   []string{strconv.Itoa(limit)},
		"show_fields": []string{"business,photos"},
	})

	var lastErr error
	for _, params := range attempts {
		payload, err := c.getJSON(ctx, "/v5/place/text", params)
		if err != nil {
			lastErr = err
			continue
		}

		pois := make([]amapPOI, 0, limit)
		for _, item := range asSlice(payload["pois"]) {
			poi := amapPOIFromMap(asMap(item))
			if strings.TrimSpace(poi.ID) == "" || strings.TrimSpace(poi.Name) == "" {
				continue
			}
			pois = append(pois, poi)
			if len(pois) >= limit {
				break
			}
		}
		if len(pois) > 0 {
			return pois, nil
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no poi candidates")
}

func (c *AmapClient) PlaceDetail(ctx context.Context, placeID string) (PlaceDetail, error) {
	placeID = strings.TrimSpace(placeID)
	if placeID == "" {
		return PlaceDetail{}, fmt.Errorf("place id is blank")
	}

	payload, err := c.getJSON(ctx, "/v5/place/detail", url.Values{
		"id":          []string{placeID},
		"show_fields": []string{"business,photos"},
	})
	if err != nil {
		return PlaceDetail{}, err
	}

	pois := asSlice(payload["pois"])
	if len(pois) == 0 {
		return PlaceDetail{}, fmt.Errorf("place detail not found")
	}
	return amapPlaceDetailFromPOI(amapPOIFromMap(asMap(pois[0]))), nil
}

func (c *AmapClient) DrivingRoute(ctx context.Context, fromLat, fromLng, toLat, toLng float64) (amapRoute, error) {
	if fromLat == 0 && fromLng == 0 {
		return amapRoute{}, fmt.Errorf("origin coordinates are blank")
	}
	if toLat == 0 && toLng == 0 {
		return amapRoute{}, fmt.Errorf("destination coordinates are blank")
	}

	payload, err := c.getJSON(ctx, "/v3/direction/driving", url.Values{
		"origin":      []string{formatLngLat(fromLng, fromLat)},
		"destination": []string{formatLngLat(toLng, toLat)},
		"strategy":    []string{"0"},
		"extensions":  []string{"base"},
	})
	if err != nil {
		return amapRoute{}, err
	}

	route := asMap(payload["route"])
	paths := asSlice(route["paths"])
	if len(paths) == 0 {
		return amapRoute{}, fmt.Errorf("route path not found")
	}

	path := asMap(paths[0])
	polylines := make([]string, 0, len(asSlice(path["steps"])))
	for _, stepItem := range asSlice(path["steps"]) {
		step := asMap(stepItem)
		polyline := strings.TrimSpace(asString(step["polyline"]))
		if polyline != "" {
			polylines = append(polylines, polyline)
		}
	}

	return amapRoute{
		DistanceMeters: asIntOrZero(path["distance"]),
		DurationSec:    asIntOrZero(path["duration"]),
		Polyline:       strings.Join(polylines, ";"),
	}, nil
}

func (c *AmapClient) LiveWeather(ctx context.Context, adcode string) (amapLiveWeather, error) {
	adcode = strings.TrimSpace(adcode)
	if adcode == "" {
		return amapLiveWeather{}, fmt.Errorf("adcode is blank")
	}

	payload, err := c.getJSON(ctx, "/v3/weather/weatherInfo", url.Values{
		"city":       []string{adcode},
		"extensions": []string{"base"},
	})
	if err != nil {
		return amapLiveWeather{}, err
	}

	lives := asSlice(payload["lives"])
	if len(lives) == 0 {
		return amapLiveWeather{}, fmt.Errorf("live weather not found")
	}

	item := asMap(lives[0])
	return amapLiveWeather{
		City:          amapString(firstNonNil(item["city"], item["province"])),
		Adcode:        strings.TrimSpace(asString(item["adcode"])),
		Weather:       strings.TrimSpace(asString(item["weather"])),
		Temperature:   strings.TrimSpace(asString(item["temperature"])),
		WindDirection: strings.TrimSpace(asString(item["winddirection"])),
		WindPower:     strings.TrimSpace(asString(item["windpower"])),
		Humidity:      strings.TrimSpace(asString(item["humidity"])),
		ReportTime:    strings.TrimSpace(asString(item["reporttime"])),
	}, nil
}

func (c *AmapClient) ForecastWeather(ctx context.Context, adcode string) (amapForecast, error) {
	adcode = strings.TrimSpace(adcode)
	if adcode == "" {
		return amapForecast{}, fmt.Errorf("adcode is blank")
	}

	payload, err := c.getJSON(ctx, "/v3/weather/weatherInfo", url.Values{
		"city":       []string{adcode},
		"extensions": []string{"all"},
	})
	if err != nil {
		return amapForecast{}, err
	}

	forecasts := asSlice(payload["forecasts"])
	if len(forecasts) == 0 {
		return amapForecast{}, fmt.Errorf("forecast weather not found")
	}

	record := asMap(forecasts[0])
	out := amapForecast{
		City:   amapString(firstNonNil(record["city"], record["province"])),
		Adcode: strings.TrimSpace(asString(record["adcode"])),
		Days:   make([]amapForecastDay, 0, len(asSlice(record["casts"]))),
	}
	for _, castItem := range asSlice(record["casts"]) {
		cast := asMap(castItem)
		out.Days = append(out.Days, amapForecastDay{
			Date:         strings.TrimSpace(asString(cast["date"])),
			DayWeather:   strings.TrimSpace(asString(cast["dayweather"])),
			NightWeather: strings.TrimSpace(asString(cast["nightweather"])),
			DayTemp:      asIntOrZero(cast["daytemp"]),
			NightTemp:    asIntOrZero(cast["nighttemp"]),
			DayWind:      strings.TrimSpace(asString(cast["daywind"])),
			NightWind:    strings.TrimSpace(asString(cast["nightwind"])),
			DayPower:     strings.TrimSpace(asString(cast["daypower"])),
			NightPower:   strings.TrimSpace(asString(cast["nightpower"])),
		})
	}
	return out, nil
}

func (c *AmapClient) getJSON(ctx context.Context, path string, params url.Values) (map[string]any, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("amap client is disabled")
	}

	baseURL, err := url.Parse(c.baseURL + path)
	if err != nil {
		return nil, err
	}

	query := baseURL.Query()
	for key, values := range params {
		for _, value := range values {
			query.Add(key, value)
		}
	}
	query.Set("key", c.apiKey)
	baseURL.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL.String(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	payload := map[string]any{}
	decoder := json.NewDecoder(resp.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return nil, err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("amap http status %d", resp.StatusCode)
	}
	if status := strings.TrimSpace(asString(payload["status"])); status != "" && status != "1" {
		info := strings.TrimSpace(asString(payload["info"]))
		if info == "" {
			info = "unknown amap error"
		}
		code := strings.TrimSpace(asString(payload["infocode"]))
		if code != "" {
			return nil, fmt.Errorf("%s (%s)", info, code)
		}
		return nil, fmt.Errorf(info)
	}
	return payload, nil
}

func amapPOIFromMap(item map[string]any) amapPOI {
	location := strings.TrimSpace(asString(item["location"]))
	lng, lat := parseLngLat(location)
	business := asMap(item["business"])
	bizExt := asMap(item["biz_ext"])

	return amapPOI{
		ID:            strings.TrimSpace(asString(item["id"])),
		Name:          strings.TrimSpace(asString(item["name"])),
		Address:       strings.TrimSpace(asString(item["address"])),
		Province:      amapString(firstNonNil(item["pname"], item["province"])),
		City:          amapString(firstNonNil(item["cityname"], item["city"])),
		District:      amapString(firstNonNil(item["adname"], item["district"])),
		Adcode:        strings.TrimSpace(asString(item["adcode"])),
		CityCode:      amapString(firstNonNil(item["citycode"], item["city_code"])),
		Type:          strings.TrimSpace(asString(item["type"])),
		Lat:           lat,
		Lng:           lng,
		Rating:        asFloat(firstNonEmpty(bizExt["rating"], business["rating"]), 0),
		Cost:          asFloat(firstNonEmpty(bizExt["cost"], business["cost"]), 0),
		BusinessHours: firstNonBlank(asString(business["opentime_today"]), asString(business["opentime_week"]), asString(bizExt["open_time"])),
		Tel:           firstNonBlank(asString(item["tel"]), asString(business["tel"])),
		Photos:        amapPhotoURLs(item["photos"]),
	}
}

func amapDestinationEntityFromPOI(poi amapPOI) (DestinationEntity, bool) {
	label := amapDestinationLabel(poi)
	if label == "" {
		return DestinationEntity{}, false
	}

	destinationID := ""
	switch {
	case strings.TrimSpace(poi.Adcode) != "":
		destinationID = "amap:adcode:" + strings.TrimSpace(poi.Adcode)
	case strings.TrimSpace(poi.ID) != "":
		destinationID = "amap:place:" + strings.TrimSpace(poi.ID)
	default:
		destinationID = "amap:name:" + sanitizePlaceIDToken(label)
	}

	return DestinationEntity{
		DestinationID:    destinationID,
		DestinationLabel: label,
		Country:          "中国",
		Region:           firstNonBlank(trimRegionLabel(poi.District, label), trimRegionLabel(poi.Province, label), trimRegionLabel(poi.City, label)),
		Adcode:           strings.TrimSpace(poi.Adcode),
		CityCode:         strings.TrimSpace(poi.CityCode),
		CenterLat:        poi.Lat,
		CenterLng:        poi.Lng,
		Provider:         "amap",
		ProviderPlaceID:  firstNonBlank(strings.TrimSpace(poi.ID), strings.TrimSpace(poi.Adcode)),
		MatchType:        "city",
	}, true
}

func amapDestinationLabel(poi amapPOI) string {
	name := strings.TrimSpace(poi.Name)
	city := strings.TrimSpace(poi.City)

	switch {
	case looksLikeAdministrativeLabel(name):
		return name
	case city != "":
		return city
	default:
		return name
	}
}

func looksLikeAdministrativeLabel(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	for _, suffix := range []string{"市", "区", "县", "自治州", "特别行政区", "盟", "州", "旗"} {
		if strings.HasSuffix(value, suffix) {
			return true
		}
	}
	return false
}

func trimRegionLabel(value, label string) string {
	value = strings.TrimSpace(value)
	label = strings.TrimSpace(label)
	if value == "" || value == label {
		return ""
	}
	return value
}

func amapPlaceDetailFromPOI(poi amapPOI) PlaceDetail {
	return PlaceDetail{
		Provider:         "amap",
		ProviderPlaceID:  strings.TrimSpace(poi.ID),
		Name:             strings.TrimSpace(poi.Name),
		Address:          firstNonBlank(strings.TrimSpace(poi.Address), joinNonBlank(" ", poi.Province, poi.City, poi.District)),
		Lat:              poi.Lat,
		Lng:              poi.Lng,
		Rating:           poi.Rating,
		PriceLevel:       amapPriceLevel(poi.Cost),
		OpeningHoursText: strings.TrimSpace(poi.BusinessHours),
		Phone:            strings.TrimSpace(poi.Tel),
		Images:           append([]string{}, poi.Photos...),
		Tags:             amapTags(poi.Type),
		SourceFetchedAt:  nowISO(),
	}
}

func amapTags(typeText string) []string {
	items := strings.FieldsFunc(strings.TrimSpace(typeText), func(r rune) bool {
		return r == ';' || r == '|' || r == '/'
	})
	return uniqueStrings(items)
}

func amapPhotoURLs(value any) []string {
	out := make([]string, 0, len(asSlice(value)))
	for _, item := range asSlice(value) {
		record := asMap(item)
		url := strings.TrimSpace(asString(firstNonEmpty(record["url"], record["title"])))
		if url == "" || strings.EqualFold(url, "[]") {
			continue
		}
		out = append(out, url)
	}
	return uniqueStrings(out)
}

func amapPriceLevel(cost float64) int {
	switch {
	case cost <= 0:
		return 0
	case cost <= 50:
		return 1
	case cost <= 120:
		return 2
	case cost <= 300:
		return 3
	default:
		return 4
	}
}

func amapString(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []string:
		return strings.TrimSpace(strings.Join(v, " "))
	case []any:
		parts := make([]string, 0, len(v))
		for _, item := range v {
			text := strings.TrimSpace(asString(item))
			if text != "" {
				parts = append(parts, text)
			}
		}
		return strings.TrimSpace(strings.Join(parts, " "))
	default:
		return strings.TrimSpace(asString(value))
	}
}

func parseLngLat(value string) (lng, lat float64) {
	parts := strings.Split(strings.TrimSpace(value), ",")
	if len(parts) != 2 {
		return 0, 0
	}
	lng = asFloat(strings.TrimSpace(parts[0]), 0)
	lat = asFloat(strings.TrimSpace(parts[1]), 0)
	return lng, lat
}

func formatLngLat(lng, lat float64) string {
	return fmt.Sprintf("%.6f,%.6f", lng, lat)
}

func joinNonBlank(separator string, values ...string) string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return strings.Join(out, separator)
}
