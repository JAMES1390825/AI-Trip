import type { RouteCard } from "@/domain/types";

export function PosterShareCard({ routeCard }: { routeCard: RouteCard }) {
  return (
    <section className="share-card poster-card">
      <p>Poster</p>
      <h2>{routeCard.share.posterTitle}</h2>
      <span>{routeCard.share.posterSubtitle}</span>
      <small>AI Trip · 生成同款路线</small>
    </section>
  );
}
