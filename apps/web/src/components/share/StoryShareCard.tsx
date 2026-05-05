import type { RouteCard } from "@/domain/types";

export function StoryShareCard({ routeCard }: { routeCard: RouteCard }) {
  return (
    <section className="share-card story-card">
      <div className="photo-stack" aria-hidden="true">
        <span />
        <span />
      </div>
      <h2>{routeCard.share.storyTitle}</h2>
      <p>{routeCard.share.storyCaption}</p>
      <small>扫码生成同款 citywalk</small>
    </section>
  );
}
