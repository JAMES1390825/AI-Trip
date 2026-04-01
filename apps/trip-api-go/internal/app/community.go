package app

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	communityPostStatusDraft     = "draft"
	communityPostStatusReviewing = "reviewing"
	communityPostStatusPublished = "published"
	communityPostStatusLimited   = "limited"
	communityPostStatusReported  = "reported"
	communityPostStatusRemoved   = "removed"

	communityVoteTypeHelpful  = "helpful"
	communityVoteTypeWantToGo = "want_to_go"

	communityReportStatusOpen            = "open"
	communityReportStatusTriaged         = "triaged"
	communityReportStatusResolvedValid   = "resolved_valid"
	communityReportStatusResolvedInvalid = "resolved_invalid"

	communityReportReasonFactuallyIncorrect = "factually_incorrect"
	communityReportReasonAdvertising        = "advertising"
	communityReportReasonUnsafe             = "unsafe"
	communityReportReasonSpam               = "spam"
	communityReportReasonOther              = "other"

	communityModerationActionApprove = "approve"
	communityModerationActionLimit   = "limit"
	communityModerationActionRemove  = "remove"
	communityModerationActionRestore = "restore"

	communityAutoReportThreshold = 2
)

var (
	communityUnsafeKeywords = []string{
		"色情", "黄赌毒", "赌博", "博彩", "代购", "刷单", "诈骗", "约炮", "枪支", "毒品",
	}
	communityPlacePattern = regexp.MustCompile(`[\p{Han}A-Za-z0-9]{2,24}(?:景区|景点|公园|博物馆|古镇|老街|步行街|广场|寺|庙|塔|湖|山|岛|乐园|街区|天地|城墙|遗址|码头|动物园|植物园|美术馆|艺术馆|餐厅|饭店|咖啡馆|茶馆|酒吧|小吃)`)
)

func normalizeCommunityPost(post CommunityPost) CommunityPost {
	now := time.Now().UTC()
	post.ID = strings.TrimSpace(post.ID)
	post.UserID = strings.TrimSpace(post.UserID)
	post.Title = normalizeCommunityText(post.Title)
	post.Content = normalizeCommunityText(post.Content)
	post.DestinationID = strings.TrimSpace(post.DestinationID)
	post.DestinationLabel = normalizeCommunityText(post.DestinationLabel)
	post.DestinationAdcode = strings.TrimSpace(post.DestinationAdcode)
	if post.DestinationID == "" && post.DestinationLabel != "" {
		post.DestinationID = "community:custom:" + normalizeGroundingText(post.DestinationLabel)
	}
	post.Tags = normalizeCommunityTags(post.Tags, post.Title, post.Content)
	post.ImageURLs = normalizeCommunityImageURLs(post.ImageURLs)
	post.FavoriteRestaurants = normalizeCommunityPlaces(post.FavoriteRestaurants)
	post.FavoriteAttractions = normalizeCommunityPlaces(post.FavoriteAttractions)
	post.MentionedPlaces = buildCommunityMentionedPlaces(post)
	post.VoteSummary = normalizeCommunityVoteSummary(post.VoteSummary)
	if post.CreatedAt.IsZero() {
		post.CreatedAt = now
	}
	if post.UpdatedAt.IsZero() {
		post.UpdatedAt = now
	}
	post.Status, post.QualityScore, post.ProcessingNote = processCommunityPost(post)
	if post.Status == communityPostStatusPublished {
		if post.PublishedAt.IsZero() {
			post.PublishedAt = now
		}
	} else {
		post.PublishedAt = time.Time{}
	}
	return post
}

func normalizeCommunityVoteSummary(summary CommunityVoteSummary) CommunityVoteSummary {
	if summary.HelpfulCount < 0 {
		summary.HelpfulCount = 0
	}
	if summary.WantToGoCount < 0 {
		summary.WantToGoCount = 0
	}
	return summary
}

func normalizeCommunityText(value string) string {
	text := strings.TrimSpace(value)
	if text == "" {
		return ""
	}
	return strings.Join(strings.Fields(text), " ")
}

func normalizeCommunityTags(tags []string, texts ...string) []string {
	out := make([]string, 0, len(tags)+8)
	for _, tag := range tags {
		normalized := normalizedSignalKey(tag)
		if normalized == "" {
			continue
		}
		out = append(out, normalized)
	}

	combined := strings.ToLower(strings.Join(texts, " "))
	switch {
	case containsAnyText(combined, "citywalk", "街区", "步行", "漫步", "老街", "步行街"):
		out = append(out, "citywalk")
	}
	switch {
	case containsAnyText(combined, "拍照", "出片", "摄影"):
		out = append(out, "拍照")
	}
	switch {
	case containsAnyText(combined, "咖啡", "餐厅", "小吃", "本帮", "火锅", "茶馆", "吃饭", "晚饭", "午饭"):
		out = append(out, "美食")
	}
	switch {
	case containsAnyText(combined, "江景", "江边", "滨江", "湖边", "夜景", "观景"):
		out = append(out, "风景")
	}
	switch {
	case containsAnyText(combined, "博物馆", "美术馆", "展览", "古建", "历史"):
		out = append(out, "人文")
	}
	return uniqueStrings(out)
}

func normalizeCommunityImageURLs(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		text := strings.TrimSpace(value)
		if text == "" {
			continue
		}
		parsed, err := url.Parse(text)
		if err != nil || parsed == nil {
			continue
		}
		if !strings.EqualFold(parsed.Scheme, "http") && !strings.EqualFold(parsed.Scheme, "https") {
			continue
		}
		if strings.TrimSpace(parsed.Host) == "" {
			continue
		}
		out = append(out, parsed.String())
	}
	return uniqueStrings(out)
}

func normalizeCommunityPlaces(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		text := normalizeCommunityText(value)
		if runeLength(text) < 2 {
			continue
		}
		out = append(out, text)
	}
	return uniqueStrings(out)
}

func buildCommunityMentionedPlaces(post CommunityPost) []string {
	out := append([]string{}, post.FavoriteRestaurants...)
	out = append(out, post.FavoriteAttractions...)
	for _, match := range communityPlacePattern.FindAllString(joinNonBlank(" ", post.Title, post.Content), -1) {
		out = append(out, normalizeCommunityText(match))
	}
	return uniqueStrings(filterNonBlankStrings(out))
}

func processCommunityPost(post CommunityPost) (string, float64, string) {
	signalPlaceCount := len(uniqueStrings(append(append([]string{}, post.FavoriteRestaurants...), append(post.FavoriteAttractions, post.MentionedPlaces...)...)))
	score := 0.0
	if runeLength(post.Content) >= 80 {
		score += 0.2
	}
	if len(post.ImageURLs) > 0 {
		score += 0.2
	}
	if len(post.Tags) >= 2 {
		score += 0.2
	}
	if signalPlaceCount > 0 {
		score += 0.2
	}
	if runeLength(post.Title) >= 8 {
		score += 0.2
	}
	score = roundToTwoDecimals(clampFloat(score, 0, 1))

	searchText := strings.ToLower(joinNonBlank(
		" ",
		post.Title,
		post.Content,
		strings.Join(post.Tags, " "),
		strings.Join(post.FavoriteRestaurants, " "),
		strings.Join(post.FavoriteAttractions, " "),
	))
	for _, keyword := range communityUnsafeKeywords {
		if containsAnyText(searchText, keyword) {
			return communityPostStatusLimited, score, "内容命中社区安全规则，暂不公开展示，也不会进入规划信号层。"
		}
	}

	if runeLength(post.Title) < 4 && runeLength(post.Content) < 30 && signalPlaceCount == 0 && len(post.ImageURLs) == 0 {
		return communityPostStatusDraft, score, "内容信息较少，先保存为草稿；补充地点、图片或更完整描述后会自动变成可发布。"
	}
	if runeLength(post.Content) < 20 && signalPlaceCount == 0 {
		return communityPostStatusDraft, score, "当前分享还缺少足够的地点或内容描述，暂不进入公开推荐。"
	}
	return communityPostStatusPublished, score, "已发布：地点、标签和图片会先结构化，再作为社区灵感软信号反哺 AI 规划。"
}

func normalizeCommunityVoteType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case communityVoteTypeHelpful:
		return communityVoteTypeHelpful
	case communityVoteTypeWantToGo:
		return communityVoteTypeWantToGo
	default:
		return ""
	}
}

func normalizeCommunityPostStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case communityPostStatusDraft:
		return communityPostStatusDraft
	case communityPostStatusReviewing:
		return communityPostStatusReviewing
	case communityPostStatusPublished:
		return communityPostStatusPublished
	case communityPostStatusLimited:
		return communityPostStatusLimited
	case communityPostStatusReported:
		return communityPostStatusReported
	case communityPostStatusRemoved:
		return communityPostStatusRemoved
	default:
		return ""
	}
}

func normalizeCommunityReportReason(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case communityReportReasonFactuallyIncorrect:
		return communityReportReasonFactuallyIncorrect
	case communityReportReasonAdvertising:
		return communityReportReasonAdvertising
	case communityReportReasonUnsafe:
		return communityReportReasonUnsafe
	case communityReportReasonSpam:
		return communityReportReasonSpam
	case communityReportReasonOther:
		return communityReportReasonOther
	default:
		return ""
	}
}

func normalizeCommunityReportStatus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case communityReportStatusOpen:
		return communityReportStatusOpen
	case communityReportStatusTriaged:
		return communityReportStatusTriaged
	case communityReportStatusResolvedValid:
		return communityReportStatusResolvedValid
	case communityReportStatusResolvedInvalid:
		return communityReportStatusResolvedInvalid
	default:
		return ""
	}
}

func normalizeCommunityModerationAction(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case communityModerationActionApprove:
		return communityModerationActionApprove
	case communityModerationActionLimit:
		return communityModerationActionLimit
	case communityModerationActionRemove:
		return communityModerationActionRemove
	case communityModerationActionRestore:
		return communityModerationActionRestore
	default:
		return ""
	}
}

func communityPostVisibleToUser(post CommunityPost, requestUserID string) bool {
	if post.Status == communityPostStatusPublished {
		return true
	}
	return strings.TrimSpace(post.UserID) != "" && strings.TrimSpace(post.UserID) == strings.TrimSpace(requestUserID)
}

func communityPostCanBeReported(post CommunityPost) bool {
	return normalizeCommunityPostStatus(post.Status) == communityPostStatusPublished
}

func communityModerationNextStatus(action string) string {
	switch normalizeCommunityModerationAction(action) {
	case communityModerationActionApprove, communityModerationActionRestore:
		return communityPostStatusPublished
	case communityModerationActionLimit:
		return communityPostStatusLimited
	case communityModerationActionRemove:
		return communityPostStatusRemoved
	default:
		return ""
	}
}

func communityAutoReportedNote() string {
	return "该分享已收到多位用户举报，暂时退出公开社区和 AI 灵感引用，等待人工审核。"
}

func communityModerationNote(action string) string {
	switch normalizeCommunityModerationAction(action) {
	case communityModerationActionApprove:
		return "该分享已通过人工审核，恢复公开展示，并重新进入 AI 灵感引用范围。"
	case communityModerationActionRestore:
		return "该分享已恢复公开展示，并重新进入 AI 灵感引用范围。"
	case communityModerationActionLimit:
		return "该分享经审核已限制展示，不再进入公开社区和 AI 灵感引用。"
	case communityModerationActionRemove:
		return "该分享经审核已下架，不再进入公开社区和 AI 灵感引用。"
	default:
		return ""
	}
}

func communityFeatureScore(post CommunityPost) float64 {
	score := post.QualityScore*100 + float64(post.VoteSummary.HelpfulCount*12) + float64(post.VoteSummary.WantToGoCount*8)
	if !post.PublishedAt.IsZero() {
		ageHours := time.Since(post.PublishedAt).Hours()
		switch {
		case ageHours <= 48:
			score += 18
		case ageHours <= 24*7:
			score += 10
		}
	}
	return score
}

func communityDestinationKeys(post CommunityPost) []string {
	keys := make([]string, 0, 3)
	for _, value := range []string{
		strings.TrimSpace(post.DestinationID),
		strings.TrimSpace(post.DestinationAdcode),
		normalizeGroundingText(post.DestinationLabel),
	} {
		if strings.TrimSpace(value) == "" {
			continue
		}
		keys = append(keys, value)
	}
	return uniqueStrings(keys)
}

func communityDestinationMatchKeys(destination *DestinationEntity, fallbackLabel string) []string {
	keys := make([]string, 0, 4)
	if destination != nil {
		keys = append(keys,
			strings.TrimSpace(destination.DestinationID),
			strings.TrimSpace(destination.Adcode),
			normalizeGroundingText(destination.DestinationLabel),
			normalizeGroundingText(destination.Region),
		)
	}
	if label := normalizeGroundingText(fallbackLabel); label != "" {
		keys = append(keys, label)
	}
	return uniqueStrings(filterNonBlankStrings(keys))
}

func communityPostMatchesDestination(post CommunityPost, destination *DestinationEntity, fallbackLabel string) bool {
	postKeys := communityDestinationKeys(post)
	if len(postKeys) == 0 {
		return false
	}
	targetKeys := communityDestinationMatchKeys(destination, fallbackLabel)
	for _, postKey := range postKeys {
		for _, targetKey := range targetKeys {
			if postKey == targetKey {
				return true
			}
		}
	}
	return false
}

func buildCommunityFallbackDestination(label string) *DestinationEntity {
	text := normalizeCommunityText(label)
	if text == "" {
		return nil
	}
	return &DestinationEntity{
		DestinationID:    fmt.Sprintf("community:custom:%s", normalizeGroundingText(text)),
		DestinationLabel: text,
		Provider:         "community",
		MatchType:        "custom",
	}
}
