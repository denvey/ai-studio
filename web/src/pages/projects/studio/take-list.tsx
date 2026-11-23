import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { dramaKeys } from "@/lib/drama/drama-query-keys";
import { formatRelativeTime } from "@/lib/relative-time";
import { listDramaTakes, type DramaTakeKind, type DramaTakeSource } from "@/services/api/drama";

import { MediaThumb } from "../drama-shared";
import { translate } from "@/i18n";

const SOURCE_LABEL: Record<DramaTakeSource, string> = { pipeline: translate("account.welcome.chapters.motion.label"), upload: translate("canvasA.assetView.upload"), canvas: translate("drama.studio.takeList.fromCanvas") };

/** 设定参考图、剧情段视频或成片的版本记录，新版本在前；标出来源（流水线生成、上传、从精修画布采用）与当前版本。 */
export function DramaTakeList({ projectId, ownerId, kind, limit = 6 }: { projectId: string; ownerId: string; kind: DramaTakeKind; limit?: number }) {
    const query = useQuery({
        queryKey: dramaKeys.takes(projectId, kind, ownerId),
        queryFn: ({ signal }) => listDramaTakes(projectId, ownerId, kind, signal),
        enabled: Boolean(projectId && ownerId),
        staleTime: 10_000,
    });
    const takes = query.data?.takes || [];
    if (query.isError) return <p className="drama-sg-note is-warn">{translate("drama.studio.takeList.failedToLoadVersionHistory")}</p>;
    if (!takes.length) return null;
    return (
        <section className="drama-takes" aria-label={translate("drama.studio.takeList.versionHistory")}>
            <div className="drama-takes-head">
                <History className="size-3.5" aria-hidden />
                <span>{translate("drama.studio.takeList.versionHistory")}</span>
                <small>{takes.length}</small>
            </div>
            <ol className="drama-takes-list">
                {takes.slice(0, limit).map((take) => (
                    <li key={take.id} className={take.current ? "is-current" : undefined}>
                        {kind === "cast" ? (
                            <span className="drama-take-thumb">
                                <MediaThumb resourceId={take.resourceId} alt={`V${take.version}`} />
                            </span>
                        ) : null}
                        <b>V{take.version}</b>
                        <span className={`drama-take-source is-${take.source}`}>{SOURCE_LABEL[take.source]}</span>
                        <time dateTime={take.createdAt}>{formatRelativeTime(take.createdAt)}</time>
                        {take.current ? <em>{translate("canvasB.mediaVersion.current")}</em> : null}
                    </li>
                ))}
            </ol>
            {takes.length > limit ? <p className="drama-takes-more">{translate("drama.studio.takeList.also")} {takes.length - limit} {translate("drama.studio.takeList.earlierVersions")}</p> : null}
        </section>
    );
}
