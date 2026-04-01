package app

import "testing"

func TestStoreReportCommunityPostAutoDemotesAndExitsPlanningSignals(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	created, err := store.CreateCommunityPost(CommunityPost{
		UserID:              "author-1",
		Title:               "杭州钱塘江散步路线",
		Content:             "上午沿钱塘江边慢慢走，下午去中国丝绸博物馆，晚上在知味观吃饭，适合拍照和看江景。",
		DestinationID:       "amap:adcode:330100",
		DestinationLabel:    "杭州",
		DestinationAdcode:   "330100",
		Tags:                []string{"citywalk", "风景"},
		FavoriteRestaurants: []string{"知味观"},
		FavoriteAttractions: []string{"钱塘江", "中国丝绸博物馆"},
		ImageURLs:           []string{"https://img.example.com/qtj.jpg"},
	})
	if err != nil {
		t.Fatalf("create community post: %v", err)
	}
	if created.Status != communityPostStatusPublished {
		t.Fatalf("expected published post, got %q", created.Status)
	}

	firstPost, firstReport, err := store.ReportCommunityPost(created.ID, "reviewer-1", communityReportReasonFactuallyIncorrect, "地点描述和图片不一致")
	if err != nil {
		t.Fatalf("first report: %v", err)
	}
	if firstPost.Status != communityPostStatusPublished {
		t.Fatalf("expected first report to keep post published, got %q", firstPost.Status)
	}
	if firstReport.Status != communityReportStatusOpen {
		t.Fatalf("expected open report status, got %q", firstReport.Status)
	}

	_, updatedReport, err := store.ReportCommunityPost(created.ID, "reviewer-1", communityReportReasonAdvertising, "像商家导流")
	if err != nil {
		t.Fatalf("update same reporter report: %v", err)
	}
	if updatedReport.Reason != communityReportReasonAdvertising {
		t.Fatalf("expected merged report reason updated, got %q", updatedReport.Reason)
	}

	reportItems := store.ListCommunityReports(10, communityReportStatusOpen)
	if len(reportItems) != 1 {
		t.Fatalf("expected one reported post aggregate, got %d", len(reportItems))
	}
	if len(reportItems[0].Reports) != 1 {
		t.Fatalf("expected duplicate reporter to merge into one report, got %d", len(reportItems[0].Reports))
	}

	reportedPost, _, err := store.ReportCommunityPost(created.ID, "reviewer-2", communityReportReasonSpam, "内容灌水")
	if err != nil {
		t.Fatalf("second distinct report: %v", err)
	}
	if reportedPost.Status != communityPostStatusReported {
		t.Fatalf("expected post auto demoted to reported, got %q", reportedPost.Status)
	}

	publicItems := store.ListCommunityPosts(CommunityPostFilter{RequestUserID: "viewer-1", Limit: 10})
	if len(publicItems) != 0 {
		t.Fatalf("expected reported post hidden from public list, got %d items", len(publicItems))
	}

	summary := store.BuildCommunityPlanningSummary(&DestinationEntity{
		DestinationID:    "amap:adcode:330100",
		DestinationLabel: "杭州",
		Adcode:           "330100",
	}, "杭州", []string{created.ID}, 6)
	if summary.PublishedPostCount != 0 {
		t.Fatalf("expected reported post excluded from planning summary, got %d", summary.PublishedPostCount)
	}
	if len(summary.TopPlaces) != 0 {
		t.Fatalf("expected no community places after demotion, got %#v", summary.TopPlaces)
	}
}

func TestStoreModerateCommunityPostRestoreReactivatesSignals(t *testing.T) {
	store, err := NewStore("")
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	created, err := store.CreateCommunityPost(CommunityPost{
		UserID:              "author-2",
		Title:               "上海武康路咖啡路线",
		Content:             "下午沿武康路慢慢走，再去武康路咖啡馆坐一会，很适合 citywalk 和拍照。",
		DestinationID:       "amap:adcode:310000",
		DestinationLabel:    "上海",
		DestinationAdcode:   "310000",
		Tags:                []string{"citywalk", "咖啡"},
		FavoriteRestaurants: []string{"武康路咖啡馆"},
		FavoriteAttractions: []string{"武康路"},
		ImageURLs:           []string{"https://img.example.com/wukang.jpg"},
	})
	if err != nil {
		t.Fatalf("create community post: %v", err)
	}

	if _, _, err := store.ReportCommunityPost(created.ID, "reviewer-1", communityReportReasonFactuallyIncorrect, "地点说明有偏差"); err != nil {
		t.Fatalf("first report: %v", err)
	}
	reportedPost, _, err := store.ReportCommunityPost(created.ID, "reviewer-2", communityReportReasonOther, "想让管理员复核")
	if err != nil {
		t.Fatalf("second report: %v", err)
	}
	if reportedPost.Status != communityPostStatusReported {
		t.Fatalf("expected reported status before moderation, got %q", reportedPost.Status)
	}

	restored, logEntry, err := store.ModerateCommunityPost(created.ID, "admin-1", communityModerationActionRestore, "manual_review_passed", "核验后恢复")
	if err != nil {
		t.Fatalf("restore moderation: %v", err)
	}
	if restored.Status != communityPostStatusPublished {
		t.Fatalf("expected restored post to be published, got %q", restored.Status)
	}
	if logEntry.NextStatus != communityPostStatusPublished {
		t.Fatalf("expected moderation log next status published, got %q", logEntry.NextStatus)
	}

	openReports := store.ListCommunityReports(10, communityReportStatusOpen)
	if len(openReports) != 0 {
		t.Fatalf("expected open reports to be resolved after restore, got %d items", len(openReports))
	}

	resolvedReports := store.ListCommunityReports(10, communityReportStatusResolvedInvalid)
	if len(resolvedReports) != 1 {
		t.Fatalf("expected one resolved_invalid aggregate, got %d", len(resolvedReports))
	}
	if len(resolvedReports[0].ModerationLogs) != 1 {
		t.Fatalf("expected one moderation log, got %d", len(resolvedReports[0].ModerationLogs))
	}

	publicItems := store.ListCommunityPosts(CommunityPostFilter{RequestUserID: "viewer-2", Limit: 10})
	if len(publicItems) != 1 {
		t.Fatalf("expected restored post visible again, got %d items", len(publicItems))
	}

	summary := store.BuildCommunityPlanningSummary(&DestinationEntity{
		DestinationID:    "amap:adcode:310000",
		DestinationLabel: "上海",
		Adcode:           "310000",
	}, "上海", []string{created.ID}, 6)
	if summary.PublishedPostCount != 1 {
		t.Fatalf("expected restored post back in planning summary, got %d", summary.PublishedPostCount)
	}
	if len(summary.TopPlaces) == 0 {
		t.Fatalf("expected restored post to contribute planning places")
	}
}
