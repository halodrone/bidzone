import { useState, useMemo } from "react";
import { ImageOff, Video } from "lucide-react";

export function MediaGallery({ items = [] }) {
    const sorted = useMemo(
        () =>
            [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        [items]
    );
    const [activeIdx, setActiveIdx] = useState(0);
    const active = sorted[activeIdx];

    if (!sorted.length) {
        return <MediaEmpty />;
    }

    return (
        <section
            data-testid="auction-media-gallery"
            className="bz-card overflow-hidden"
        >
            <div className="relative aspect-[4/3] bg-[hsl(var(--bz-surface-2))]">
                {active.media_type === "VIDEO" ? (
                    <video
                        key={active.id}
                        src={active.media_url}
                        controls
                        playsInline
                        className="h-full w-full object-contain bg-black"
                    />
                ) : (
                    <MediaImage src={active.media_url} />
                )}
                {sorted.length > 1 && (
                    <div className="absolute bottom-3 right-3 rounded-full bg-black/70 backdrop-blur border border-white/10 px-2.5 py-1 text-[11px] text-white/85">
                        {activeIdx + 1} / {sorted.length}
                    </div>
                )}
            </div>

            {sorted.length > 1 && (
                <ul
                    data-testid="auction-media-thumbs"
                    className="flex gap-2 overflow-x-auto bz-scroll-x p-3"
                >
                    {sorted.map((m, i) => {
                        const active = i === activeIdx;
                        return (
                            <li key={m.id} className="shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setActiveIdx(i)}
                                    aria-label={`View media ${i + 1}`}
                                    aria-current={active || undefined}
                                    data-testid={`auction-media-thumb-${i}`}
                                    className={
                                        "relative h-16 w-20 overflow-hidden rounded-lg border transition " +
                                        (active
                                            ? "border-[hsl(var(--bz-purple))] shadow-[0_0_0_1px_hsl(var(--bz-purple)/0.5)]"
                                            : "border-white/10 hover:border-white/25")
                                    }
                                >
                                    {m.media_type === "VIDEO" ? (
                                        <div className="flex h-full w-full items-center justify-center bg-black/60">
                                            <Video className="h-4 w-4 text-white/70" />
                                        </div>
                                    ) : (
                                        <MediaImage src={m.media_url} className="h-full w-full object-cover" />
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

function MediaImage({ src, className = "" }) {
    const [ok, setOk] = useState(Boolean(src));
    if (!src || !ok) {
        return (
            <div className={`flex h-full w-full items-center justify-center bg-[hsl(var(--bz-surface-2))] text-white/40 ${className}`}>
                <ImageOff className="h-6 w-6" />
            </div>
        );
    }
    return (
        <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setOk(false)}
            className={className || "absolute inset-0 h-full w-full object-cover"}
        />
    );
}

function MediaEmpty() {
    return (
        <div
            data-testid="auction-media-empty"
            className="bz-card flex aspect-[4/3] flex-col items-center justify-center gap-3 text-white/40"
        >
            <ImageOff className="h-8 w-8" />
            <span className="text-[11px] uppercase tracking-widest">
                No media provided
            </span>
        </div>
    );
}
