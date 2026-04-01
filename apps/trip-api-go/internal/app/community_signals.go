package app

import (
	"math"
	"sort"
	"strings"
	"time"
)

type communityBlockBasis struct {
	MatchedPlace  string
	MatchedTags   []string
	SourcePostIDs []string
	SignalScore   float64
	MentionCount  int
	Referenced    bool
}

type communityPlaceAggregate struct {
	Name          string
	Category      string
	Score         float64
	MentionCount  int
	SourcePostIDs map[string]bool
}

type communityTagAggregate struct {
	Tag           string
	Score         float64
	SourcePostIDs map[string]bool
}

func buildCommunityPlanningSummaryFromPosts(destination *DestinationEntity, fallbackLabel string, posts []CommunityPost, explicitPostIDs []string, limit int) CommunityPlanningSummary {
	if limit <= 0 {
		limit = 6
	}
	explicitSet := map[string]bool{}
	for _, id := range explicitPostIDs {
		if text := strings.TrimSpace(id); text != "" {
			explicitSet[text] = true
		}
	}

	placeAgg := map[string]*communityPlaceAggregate{}
	tagAgg := map[string]*communityTagAggregate{}
	referenced := make([]string, 0, len(explicitSet))
	seenReferenced := map[string]bool{}
	publishedCount := 0
	latest := time.Time{}

	for _, raw := range posts {
		post := cloneCommunityPost(raw)
		if post.Status != communityPostStatusPublished {
			continue
		}

		matchedDestination := communityPostMatchesDestination(post, destination, fallbackLabel)
		if !matchedDestination && !explicitSet[post.ID] {
			continue
		}
		publishedCount++
		if explicitSet[post.ID] && !seenReferenced[post.ID] {
			referenced = append(referenced, post.ID)
			seenReferenced[post.ID] = true
		}
		if post.UpdatedAt.After(latest) {
			latest = post.UpdatedAt
		}

		weight := 1 + post.QualityScore*0.8 + float64(post.VoteSummary.HelpfulCount)*0.12 + float64(post.VoteSummary.WantToGoCount)*0.08
		if explicitSet[post.ID] {
			weight += 1.25
		}
		if matchedDestination {
			weight += 0.2
		}

		for _, place := range post.FavoriteRestaurants {
			addCommunityPlaceSignal(placeAgg, place, "food", weight+0.2, post.ID)
		}
		for _, place := range post.FavoriteAttractions {
			addCommunityPlaceSignal(placeAgg, place, "sight", weight+0.2, post.ID)
		}
		for _, place := range post.MentionedPlaces {
			addCommunityPlaceSignal(placeAgg, place, "general", weight, post.ID)
		}
		for _, tag := range post.Tags {
			addCommunityTagSignal(tagAgg, tag, weight, post.ID)
		}
	}

	places := make([]CommunityPlaceSignal, 0, len(placeAgg))
	for _, agg := range placeAgg {
		places = append(places, CommunityPlaceSignal{
			Name:          agg.Name,
			Category:      agg.Category,
			Score:         roundToTwoDecimals(agg.Score),
			MentionCount:  agg.MentionCount,
			SourcePostIDs: sortedTrueKeys(agg.SourcePostIDs),
		})
	}
	sort.SliceStable(places, func(i, j int) bool {
		if places[i].Score == places[j].Score {
			if places[i].MentionCount == places[j].MentionCount {
				return places[i].Name < places[j].Name
			}
			return places[i].MentionCount > places[j].MentionCount
		}
		return places[i].Score > places[j].Score
	})
	if len(places) > limit {
		places = places[:limit]
	}

	tags := make([]CommunityTagSignal, 0, len(tagAgg))
	for _, agg := range tagAgg {
		tags = append(tags, CommunityTagSignal{
			Tag:           agg.Tag,
			Score:         roundToTwoDecimals(agg.Score),
			SourcePostIDs: sortedTrueKeys(agg.SourcePostIDs),
		})
	}
	sort.SliceStable(tags, func(i, j int) bool {
		if tags[i].Score == tags[j].Score {
			return tags[i].Tag < tags[j].Tag
		}
		return tags[i].Score > tags[j].Score
	})
	if len(tags) > limit {
		tags = tags[:limit]
	}

	destinationID := fallbackLabel
	destinationLabel := fallbackLabel
	if destination != nil {
		destinationID = firstNonBlank(destination.DestinationID, destination.Adcode, fallbackLabel)
		destinationLabel = firstNonBlank(destination.DestinationLabel, destination.Region, fallbackLabel)
	}

	return CommunityPlanningSummary{
		DestinationID:       strings.TrimSpace(destinationID),
		DestinationLabel:    strings.TrimSpace(destinationLabel),
		PublishedPostCount:  publishedCount,
		ReferencedPostIDs:   referenced,
		TopPlaces:           places,
		TopTags:             tags,
		LastSignalUpdatedAt: latest,
	}
}

func addCommunityPlaceSignal(target map[string]*communityPlaceAggregate, place, category string, weight float64, postID string) {
	name := normalizeCommunityText(place)
	key := normalizeGroundingText(name)
	if key == "" {
		return
	}
	entry, ok := target[key]
	if !ok {
		entry = &communityPlaceAggregate{
			Name:          name,
			Category:      strings.TrimSpace(category),
			SourcePostIDs: map[string]bool{},
		}
		target[key] = entry
	}
	if communityPlaceCategoryPriority(category) > communityPlaceCategoryPriority(entry.Category) {
		entry.Category = category
	}
	entry.Score += weight
	entry.MentionCount++
	if strings.TrimSpace(postID) != "" {
		entry.SourcePostIDs[postID] = true
	}
}

func addCommunityTagSignal(target map[string]*communityTagAggregate, tag string, weight float64, postID string) {
	normalized := normalizedSignalKey(tag)
	if normalized == "" {
		return
	}
	entry, ok := target[normalized]
	if !ok {
		entry = &communityTagAggregate{
			Tag:           normalized,
			SourcePostIDs: map[string]bool{},
		}
		target[normalized] = entry
	}
	entry.Score += weight
	if strings.TrimSpace(postID) != "" {
		entry.SourcePostIDs[postID] = true
	}
}

func communityPlaceCategoryPriority(category string) int {
	switch strings.TrimSpace(category) {
	case "food":
		return 3
	case "sight":
		return 2
	default:
		return 1
	}
}

func sortedTrueKeys(values map[string]bool) []string {
	if len(values) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(values))
	for key, ok := range values {
		if ok && strings.TrimSpace(key) != "" {
			out = append(out, key)
		}
	}
	sort.Strings(out)
	return out
}

func communityPlanningSummaryMap(summary CommunityPlanningSummary) map[string]any {
	return map[string]any{
		"destination_id":         summary.DestinationID,
		"destination_label":      summary.DestinationLabel,
		"published_post_count":   summary.PublishedPostCount,
		"referenced_post_ids":    append([]string{}, summary.ReferencedPostIDs...),
		"top_places":             summary.TopPlaces,
		"top_tags":               summary.TopTags,
		"last_signal_updated_at": summary.LastSignalUpdatedAt,
	}
}

func communitySignalMode(summary CommunityPlanningSummary) string {
	if summary.PublishedPostCount == 0 {
		return "none"
	}
	if len(summary.ReferencedPostIDs) > 0 {
		return "destination_public_posts+explicit_reference"
	}
	return "destination_public_posts"
}

func communityQueriesForSlot(summary CommunityPlanningSummary, slotType string) []string {
	queries := make([]string, 0, 6)
	for _, place := range summary.TopPlaces {
		if !communityPlaceRelevantToSlot(place.Category, slotType) {
			continue
		}
		queries = append(queries, place.Name)
		if len(queries) >= 3 {
			break
		}
	}
	for _, tag := range summary.TopTags {
		switch {
		case slotType == "food" && containsAnyText(tag.Tag, "美食", "咖啡", "酒吧", "茶"):
			queries = append(queries, "咖啡", "特色餐厅")
		case slotType != "food" && containsAnyText(tag.Tag, "citywalk", "风景", "拍照"):
			queries = append(queries, "街区", "观景")
		case slotType != "food" && containsAnyText(tag.Tag, "人文", "展览"):
			queries = append(queries, "博物馆", "美术馆")
		}
		if len(queries) >= 6 {
			break
		}
	}
	return uniqueStrings(filterNonBlankStrings(queries))
}

func communityScoreBoost(summary CommunityPlanningSummary, slotType string, poi amapPOI) int {
	basis := communityBlockBasisForPOI(summary, slotType, poi)
	if basis == nil {
		return 0
	}
	boost := int(math.Round(basis.SignalScore * 30))
	if basis.MatchedPlace != "" {
		boost += 16 + basis.MentionCount*4
	}
	boost += len(basis.MatchedTags) * 6
	if basis.Referenced {
		boost += 34
	}
	return boost
}

func communityBlockBasisForPOI(summary CommunityPlanningSummary, slotType string, poi amapPOI) *communityBlockBasis {
	if summary.PublishedPostCount == 0 {
		return nil
	}
	text := strings.ToLower(joinNonBlank(" ", poi.Name, poi.Type, poi.Address, strings.Join(amapTags(poi.Type), " ")))
	semantic := poiSemanticKind(poi.Name, amapTags(poi.Type))
	var basis communityBlockBasis
	referencedSet := map[string]bool{}
	for _, id := range summary.ReferencedPostIDs {
		if strings.TrimSpace(id) != "" {
			referencedSet[strings.TrimSpace(id)] = true
		}
	}

	bestPlaceScore := 0.0
	for _, place := range summary.TopPlaces {
		if !communityPlaceRelevantToSlot(place.Category, slotType) {
			continue
		}
		if !communityPlaceMatchesPOI(place.Name, poi) {
			continue
		}
		if place.Score <= bestPlaceScore {
			continue
		}
		bestPlaceScore = place.Score
		basis.MatchedPlace = place.Name
		basis.SignalScore = place.Score
		basis.MentionCount = place.MentionCount
		basis.SourcePostIDs = append([]string{}, place.SourcePostIDs...)
	}

	tagMatches := make([]string, 0, 3)
	tagScore := 0.0
	tagSourceIDs := map[string]bool{}
	for _, tag := range summary.TopTags {
		if !communityTagMatches(tag.Tag, slotType, semantic, text) {
			continue
		}
		tagMatches = append(tagMatches, tag.Tag)
		tagScore += tag.Score * 0.35
		for _, postID := range tag.SourcePostIDs {
			tagSourceIDs[postID] = true
		}
		if len(tagMatches) >= 3 {
			break
		}
	}
	if len(tagMatches) > 0 {
		basis.MatchedTags = uniqueStrings(tagMatches)
		basis.SignalScore = roundToTwoDecimals(basis.SignalScore + tagScore)
		for _, postID := range sortedTrueKeys(tagSourceIDs) {
			if !containsExactString(basis.SourcePostIDs, postID) {
				basis.SourcePostIDs = append(basis.SourcePostIDs, postID)
			}
		}
	}

	if basis.MatchedPlace == "" && len(basis.MatchedTags) == 0 {
		return nil
	}
	for _, postID := range basis.SourcePostIDs {
		if referencedSet[postID] {
			basis.Referenced = true
			break
		}
	}
	return &basis
}

func communityPlaceMatchesPOI(place string, poi amapPOI) bool {
	placeKey := normalizeGroundingText(place)
	if placeKey == "" {
		return false
	}
	for _, value := range []string{poi.Name, poi.Address, poi.Type} {
		valueKey := normalizeGroundingText(value)
		if valueKey == "" {
			continue
		}
		if strings.Contains(valueKey, placeKey) || strings.Contains(placeKey, valueKey) {
			return true
		}
	}
	return false
}

func communityPlaceRelevantToSlot(category, slotType string) bool {
	switch strings.TrimSpace(category) {
	case "food":
		return slotType == "food"
	case "sight":
		return slotType != "food"
	default:
		return true
	}
}

func communityTagMatches(tag, slotType, semantic, text string) bool {
	switch {
	case slotType == "food" && semantic == "food" && containsAnyText(tag, "美食", "咖啡", "酒吧", "茶"):
		return true
	case slotType != "food" && semantic == "street" && containsAnyText(tag, "citywalk", "拍照", "风景"):
		return true
	case slotType != "food" && semantic == "culture" && containsAnyText(tag, "人文", "展览", "历史"):
		return true
	case slotType == "night" && (semantic == "waterfront" || containsAnyText(text, "夜景", "滨江", "观景")) && containsAnyText(tag, "风景", "拍照", "夜景"):
		return true
	default:
		return false
	}
}

func containsExactString(items []string, value string) bool {
	target := strings.TrimSpace(value)
	if target == "" {
		return false
	}
	for _, item := range items {
		if strings.TrimSpace(item) == target {
			return true
		}
	}
	return false
}
