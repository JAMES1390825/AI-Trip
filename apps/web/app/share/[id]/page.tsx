import Link from "next/link";
import { RouteCard } from "@/components/RouteCard";
import { PosterShareCard } from "@/components/share/PosterShareCard";
import { StoryShareCard } from "@/components/share/StoryShareCard";
import { createRouteCardStore } from "@/server/route-card-store";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const routeCard = await createRouteCardStore().get(id);

  if (!routeCard) {
    return (
      <main className="page-shell">
        <div className="empty-preview">
          <p>这张路线卡不存在或已经删除。</p>
          <Link href="/">生成一张新的路线卡</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell share-page">
      <Link className="home-link" href="/">
        生成同款
      </Link>
      <RouteCard routeCard={routeCard} />
      <PosterShareCard routeCard={routeCard} />
      <StoryShareCard routeCard={routeCard} />
    </main>
  );
}
