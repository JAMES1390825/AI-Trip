package app

import "strings"

type destinationCandidate struct {
	ID              string
	Name            string
	DisplayName     string
	Country         string
	Region          string
	Adcode          string
	CityCode        string
	Lat             float64
	Lng             float64
	Provider        string
	ProviderPlaceID string
	MatchType       string
	Keywords        []string
}

var destinationCandidates = []destinationCandidate{
	{ID: "builtin:cn-beijing", Name: "北京市", DisplayName: "中国北京市", Country: "中国", Region: "北京", Adcode: "110000", CityCode: "010", Lat: 39.9042, Lng: 116.4074, Provider: "builtin", ProviderPlaceID: "cn-beijing", MatchType: "city", Keywords: []string{"beijing", "peking"}},
	{ID: "builtin:cn-shanghai", Name: "上海市", DisplayName: "中国上海市", Country: "中国", Region: "上海", Adcode: "310000", CityCode: "021", Lat: 31.2304, Lng: 121.4737, Provider: "builtin", ProviderPlaceID: "cn-shanghai", MatchType: "city", Keywords: []string{"shanghai"}},
	{ID: "builtin:cn-hangzhou", Name: "杭州市", DisplayName: "中国浙江省杭州市", Country: "中国", Region: "浙江", Adcode: "330100", CityCode: "0571", Lat: 30.2741, Lng: 120.1551, Provider: "builtin", ProviderPlaceID: "cn-hangzhou", MatchType: "city", Keywords: []string{"hangzhou"}},
	{ID: "builtin:cn-suzhou", Name: "苏州市", DisplayName: "中国江苏省苏州市", Country: "中国", Region: "江苏", Adcode: "320500", CityCode: "0512", Lat: 31.2989, Lng: 120.5853, Provider: "builtin", ProviderPlaceID: "cn-suzhou", MatchType: "city", Keywords: []string{"suzhou"}},
	{ID: "builtin:cn-nanjing", Name: "南京市", DisplayName: "中国江苏省南京市", Country: "中国", Region: "江苏", Adcode: "320100", CityCode: "025", Lat: 32.0603, Lng: 118.7969, Provider: "builtin", ProviderPlaceID: "cn-nanjing", MatchType: "city", Keywords: []string{"nanjing"}},
	{ID: "builtin:cn-chengdu", Name: "成都市", DisplayName: "中国四川省成都市", Country: "中国", Region: "四川", Adcode: "510100", CityCode: "028", Lat: 30.5728, Lng: 104.0668, Provider: "builtin", ProviderPlaceID: "cn-chengdu", MatchType: "city", Keywords: []string{"chengdu"}},
	{ID: "builtin:cn-chongqing", Name: "重庆市", DisplayName: "中国重庆市", Country: "中国", Region: "重庆", Adcode: "500000", CityCode: "023", Lat: 29.5630, Lng: 106.5516, Provider: "builtin", ProviderPlaceID: "cn-chongqing", MatchType: "city", Keywords: []string{"chongqing"}},
	{ID: "builtin:cn-xian", Name: "西安市", DisplayName: "中国陕西省西安市", Country: "中国", Region: "陕西", Adcode: "610100", CityCode: "029", Lat: 34.3416, Lng: 108.9398, Provider: "builtin", ProviderPlaceID: "cn-xian", MatchType: "city", Keywords: []string{"xian", "xi'an"}},
	{ID: "builtin:cn-guangzhou", Name: "广州市", DisplayName: "中国广东省广州市", Country: "中国", Region: "广东", Adcode: "440100", CityCode: "020", Lat: 23.1291, Lng: 113.2644, Provider: "builtin", ProviderPlaceID: "cn-guangzhou", MatchType: "city", Keywords: []string{"guangzhou"}},
	{ID: "builtin:cn-shenzhen", Name: "深圳市", DisplayName: "中国广东省深圳市", Country: "中国", Region: "广东", Adcode: "440300", CityCode: "0755", Lat: 22.5431, Lng: 114.0579, Provider: "builtin", ProviderPlaceID: "cn-shenzhen", MatchType: "city", Keywords: []string{"shenzhen"}},
}

func resolveDestinations(query string, limit int) DestinationResolveResponse {
	items, degraded := matchDestinationCandidates(query, limit)
	out := make([]DestinationEntity, 0, len(items))
	for _, item := range items {
		out = append(out, DestinationEntity{
			DestinationID:    item.ID,
			DestinationLabel: item.Name,
			Country:          item.Country,
			Region:           item.Region,
			Adcode:           item.Adcode,
			CityCode:         item.CityCode,
			CenterLat:        item.Lat,
			CenterLng:        item.Lng,
			Provider:         item.Provider,
			ProviderPlaceID:  item.ProviderPlaceID,
			MatchType:        item.MatchType,
		})
	}
	return DestinationResolveResponse{
		Items:    out,
		Degraded: degraded,
	}
}

func matchDestinationCandidates(query string, limit int) ([]destinationCandidate, bool) {
	text := strings.ToLower(strings.TrimSpace(query))
	if limit <= 0 {
		limit = 10
	}
	if limit > 20 {
		limit = 20
	}

	out := make([]destinationCandidate, 0, limit)
	for _, item := range destinationCandidates {
		if text != "" {
			joined := strings.ToLower(strings.Join([]string{
				item.ID,
				item.Name,
				item.DisplayName,
				item.Country,
				item.Region,
				item.Adcode,
				item.CityCode,
				strings.Join(item.Keywords, " "),
			}, " "))
			if !strings.Contains(joined, text) {
				continue
			}
		}
		out = append(out, item)
		if len(out) >= limit {
			break
		}
	}

	if len(out) == 0 && text != "" {
		trimmedQuery := strings.TrimSpace(query)
		out = append(out, destinationCandidate{
			ID:              "custom:" + trimmedQuery,
			Name:            trimmedQuery,
			DisplayName:     trimmedQuery,
			Provider:        "custom",
			MatchType:       "custom",
			ProviderPlaceID: "",
		})
		return out, true
	}

	return out, false
}
