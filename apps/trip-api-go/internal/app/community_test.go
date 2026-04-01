package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestNormalizeCommunityPostPublishesStructuredShare(t *testing.T) {
	post := normalizeCommunityPost(CommunityPost{
		UserID:              "u-1",
		Title:               "杭州雨天也能逛的一天",
		Content:             "上午去中国丝绸博物馆，下午沿南宋御街慢慢逛，晚上在知味观吃饭，整体很适合雨天和拍照。",
		DestinationLabel:    "杭州",
		Tags:                []string{"雨天"},
		ImageURLs:           []string{"https://img.example.com/hz.jpg"},
		FavoriteRestaurants: []string{"知味观"},
		FavoriteAttractions: []string{"中国丝绸博物馆"},
	})

	if post.Status != communityPostStatusPublished {
		t.Fatalf("expected published status, got %q", post.Status)
	}
	if post.QualityScore < 0.8 {
		t.Fatalf("expected quality score >= 0.8, got %v", post.QualityScore)
	}
	if !containsString(post.Tags, "美食") {
		t.Fatalf("expected derived 美食 tag, got %#v", post.Tags)
	}
	if !containsString(post.MentionedPlaces, "中国丝绸博物馆") {
		t.Fatalf("expected mentioned places to include museum, got %#v", post.MentionedPlaces)
	}
	if post.ProcessingNote == "" {
		t.Fatalf("expected processing note")
	}
}

func TestHandleCommunityPostLifecycle(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	app := &App{store: store}

	createBody, err := json.Marshal(map[string]any{
		"title":                "上海雨天咖啡路线",
		"destination_label":    "上海",
		"content":              "下雨时很适合先去上海博物馆，再去武康路咖啡馆坐坐。",
		"favorite_restaurants": []string{"武康路咖啡馆"},
		"favorite_attractions": []string{"上海博物馆"},
		"tags":                 []string{"雨天", "citywalk"},
		"image_urls":           []string{"https://img.example.com/post.jpg"},
	})
	if err != nil {
		t.Fatalf("marshal create body: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/community/posts", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	app.handleCreateCommunityPost(rr, req, &AuthUser{UserID: "u-1"})
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var created CommunityPost
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.Status != communityPostStatusPublished {
		t.Fatalf("expected published post, got %q", created.Status)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/community/posts?destination_label=上海&limit=10", nil)
	listRR := httptest.NewRecorder()
	app.handleListCommunityPosts(listRR, listReq, &AuthUser{UserID: "u-2"})
	if listRR.Code != http.StatusOK {
		t.Fatalf("expected list 200, got %d", listRR.Code)
	}

	var listResp map[string]any
	if err := json.Unmarshal(listRR.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	items := asSlice(listResp["items"])
	if len(items) != 1 {
		t.Fatalf("expected 1 community post, got %d", len(items))
	}

	voteBody, err := json.Marshal(map[string]any{"vote_type": communityVoteTypeHelpful})
	if err != nil {
		t.Fatalf("marshal vote body: %v", err)
	}
	voteReq := httptest.NewRequest(http.MethodPost, "/api/v1/community/posts/"+created.ID+"/vote", bytes.NewReader(voteBody))
	voteReq.Header.Set("Content-Type", "application/json")
	voteRR := httptest.NewRecorder()
	app.handleVoteCommunityPost(voteRR, voteReq, &AuthUser{UserID: "u-2"}, created.ID)
	if voteRR.Code != http.StatusOK {
		t.Fatalf("expected vote 200, got %d", voteRR.Code)
	}

	var voteResp map[string]any
	if err := json.Unmarshal(voteRR.Body.Bytes(), &voteResp); err != nil {
		t.Fatalf("decode vote response: %v", err)
	}
	post := asMap(voteResp["post"])
	voteSummary := asMap(post["vote_summary"])
	if asIntOrZero(voteSummary["helpful_count"]) != 1 {
		t.Fatalf("expected helpful_count=1, got %#v", voteSummary["helpful_count"])
	}
}

func TestBuildV2VariantItineraryUsesCommunityReferenceSignals(t *testing.T) {
	server := newAmapStubServer()
	defer server.Close()

	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	created, err := store.CreateCommunityPost(CommunityPost{
		UserID:              "u-community",
		Title:               "武康路咖啡半日路线",
		Content:             "下午在武康路慢慢走，最后去武康路咖啡馆坐一会儿，很适合 citywalk。",
		DestinationID:       "amap:adcode:310000",
		DestinationLabel:    "上海市",
		DestinationAdcode:   "310000",
		Tags:                []string{"citywalk", "咖啡"},
		FavoriteRestaurants: []string{"武康路咖啡馆"},
		FavoriteAttractions: []string{"武康路"},
		ImageURLs:           []string{"https://img.example.com/wukang-route.jpg"},
	})
	if err != nil {
		t.Fatalf("create community post: %v", err)
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
		StartDate:    "2026-04-18",
		BudgetLevel:  "medium",
		Pace:         "relaxed",
		TravelStyles: []string{"citywalk"},
		MustGo:       []string{},
		Avoid:        []string{},
		Constraints: PlanningConstraints{
			DiningPreference: "咖啡",
		},
		MissingFields:   []string{},
		ReadyToGenerate: true,
	}

	itinerary := app.buildV2VariantItineraryWithOptions(context.Background(), brief, "u-1", "balanced", PlanGenerateOptions{
		CommunityPostIDs: []string{created.ID},
	})

	communitySummary := asMap(itinerary["community_reference_summary"])
	if asIntOrZero(communitySummary["published_post_count"]) < 1 {
		t.Fatalf("expected published community post count, got %#v", communitySummary["published_post_count"])
	}
	if !containsString(asStringSlice(communitySummary["referenced_post_ids"]), created.ID) {
		t.Fatalf("expected referenced_post_ids to include created post, got %#v", communitySummary["referenced_post_ids"])
	}

	day := asMap(asSlice(itinerary["days"])[0])
	blocks := asSlice(day["blocks"])
	foodBlock := asMap(blocks[1])
	if asString(foodBlock["poi"]) != "武康路咖啡馆" {
		t.Fatalf("expected community-referenced food block 武康路咖啡馆, got %q", asString(foodBlock["poi"]))
	}
	if len(asMap(foodBlock["community_basis"])) == 0 {
		t.Fatalf("expected community_basis on selected block")
	}
}

func TestHandleCommunityDetailAndAuthorProfile(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	primary, err := store.CreateCommunityPost(CommunityPost{
		UserID:              "u-author",
		Title:               "杭州滨江散步路线",
		Content:             "傍晚先去钱塘江边，再找一家临江餐厅吃饭，很适合散步和拍照。",
		DestinationID:       "amap:adcode:330100",
		DestinationLabel:    "杭州",
		DestinationAdcode:   "330100",
		Tags:                []string{"江景", "citywalk"},
		FavoriteRestaurants: []string{"临江小馆"},
		FavoriteAttractions: []string{"钱塘江"},
		ImageURLs:           []string{"https://img.example.com/hangzhou-river.jpg"},
	})
	if err != nil {
		t.Fatalf("create primary post: %v", err)
	}
	_, err = store.CreateCommunityPost(CommunityPost{
		UserID:              "u-author",
		Title:               "杭州博物馆半天",
		Content:             "下雨时很适合先逛博物馆，再去南宋御街吃饭。",
		DestinationID:       "amap:adcode:330100",
		DestinationLabel:    "杭州",
		DestinationAdcode:   "330100",
		Tags:                []string{"雨天", "人文"},
		FavoriteRestaurants: []string{"南宋御街小馆"},
		FavoriteAttractions: []string{"博物馆"},
		ImageURLs:           []string{"https://img.example.com/hangzhou-museum.jpg"},
	})
	if err != nil {
		t.Fatalf("create secondary post: %v", err)
	}
	_, err = store.CreateCommunityPost(CommunityPost{
		UserID:              "u-other",
		Title:               "杭州咖啡散步",
		Content:             "钱塘江附近散步后去咖啡馆坐坐。",
		DestinationID:       "amap:adcode:330100",
		DestinationLabel:    "杭州",
		DestinationAdcode:   "330100",
		Tags:                []string{"citywalk", "咖啡"},
		FavoriteRestaurants: []string{"江边咖啡馆"},
		FavoriteAttractions: []string{"钱塘江"},
		ImageURLs:           []string{"https://img.example.com/hangzhou-coffee.jpg"},
	})
	if err != nil {
		t.Fatalf("create related post: %v", err)
	}

	for _, eventName := range []string{"plan_generated_v2", "plan_saved"} {
		if err := store.AddEvent(EventRecord{
			EventName: eventName,
			UserID:    "u-viewer",
			CreatedAt: time.Now().UTC(),
			Metadata: map[string]any{
				"community_referenced_post_ids": []string{primary.ID},
			},
		}); err != nil {
			t.Fatalf("seed event %s: %v", eventName, err)
		}
	}

	app := &App{store: store}

	detailRR := httptest.NewRecorder()
	app.handleGetCommunityPostDetail(detailRR, &AuthUser{UserID: "u-viewer"}, primary.ID)
	if detailRR.Code != http.StatusOK {
		t.Fatalf("expected detail 200, got %d", detailRR.Code)
	}

	var detail CommunityPostDetail
	if err := json.Unmarshal(detailRR.Body.Bytes(), &detail); err != nil {
		t.Fatalf("decode detail response: %v", err)
	}
	if detail.ReferenceCount != 1 {
		t.Fatalf("expected reference_count=1, got %d", detail.ReferenceCount)
	}
	if detail.ReferencedSaveCount != 1 {
		t.Fatalf("expected referenced_save_count=1, got %d", detail.ReferencedSaveCount)
	}
	if detail.Author.UserID != "u-author" {
		t.Fatalf("expected author u-author, got %q", detail.Author.UserID)
	}
	if len(detail.RelatedPosts) == 0 {
		t.Fatalf("expected related posts in community detail")
	}

	authorRR := httptest.NewRecorder()
	app.handleGetCommunityAuthorProfile(authorRR, &AuthUser{UserID: "u-viewer"}, "u-author")
	if authorRR.Code != http.StatusOK {
		t.Fatalf("expected author 200, got %d", authorRR.Code)
	}

	var author CommunityAuthorPublicProfile
	if err := json.Unmarshal(authorRR.Body.Bytes(), &author); err != nil {
		t.Fatalf("decode author response: %v", err)
	}
	if author.PublishedPostCount != 2 {
		t.Fatalf("expected published_post_count=2, got %d", author.PublishedPostCount)
	}
	if author.ReferenceCount < 1 {
		t.Fatalf("expected author reference count >= 1, got %d", author.ReferenceCount)
	}
	if len(author.RecentPosts) != 2 {
		t.Fatalf("expected 2 recent posts, got %d", len(author.RecentPosts))
	}
}
