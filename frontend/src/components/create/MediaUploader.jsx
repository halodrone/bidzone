import { useRef } from "react";
import { ImagePlus, Trash2, ChevronUp, ChevronDown, AlertCircle, Film } from "lucide-react";
import {
    validateFile,
    MAX_IMAGES,
    MAX_VIDEOS,
    MAX_IMAGE_MB,
    MAX_VIDEO_MB,
} from "@/lib/storage";

/**
 * BIDZONE Phase 6.1 — media selection/upload UI for Create Auction.
 * MVP limits: up to 5 images (10 MB each) + 1 optional video (100 MB).
 * The first image in the list becomes the primary thumbnail unless the
 * seller reorders. Pure client-side state; uploads happen only on Publish.
 */
export function MediaUploader({ media, setMedia }) {
    const inputRef = useRef(null);

    const imageCount = media.filter((m) => m.mediaType === "IMAGE").length;
    const videoCount = media.length - imageCount;

    function addFiles(fileList) {
        const next = [...media];
        const errors = [];
        for (const file of fileList) {
            const mediaType = (file.type || "").startsWith("video/") ? "VIDEO" : "IMAGE";
            const err = validateFile(file);
            if (err) {
                errors.push(`${file.name}: ${err}`);
                continue;
            }
            const currentImages = next.filter((m) => m.mediaType === "IMAGE").length;
            const currentVideos = next.length - currentImages;
            if (mediaType === "IMAGE" && currentImages >= MAX_IMAGES) {
                errors.push(`Maximum ${MAX_IMAGES} images`);
                continue;
            }
            if (mediaType === "VIDEO" && currentVideos >= MAX_VIDEOS) {
                errors.push(`Maximum ${MAX_VIDEOS} video`);
                continue;
            }
            next.push({
                id: `${file.name}-${file.size}-${next.length}`,
                file,
                mediaType,
                previewUrl: URL.createObjectURL(file),
                progress: 0,
                error: null,
                uploadedPath: null,
            });
        }
        setMedia(next);
        return errors;
 }

    function removeAt(idx) {
        const item = media[idx];
        if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        setMedia(media.filter((_, i) => i !== idx));
    }

    function move(idx, dir) {
        const target = idx + dir;
        if (target < 0 || target >= media.length) return;
        const next = [...media];
        [next[idx], next[target]] = [next[target], next[idx]];
        setMedia(next);
    }

    return (
        <div className="bz-card p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-white/80">
                    Media
                </h3>
                <span className="text-[11px] text-white/40">
                    Up to {MAX_IMAGES} images ({MAX_IMAGE_MB} MB each) + {MAX_VIDEOS} video ({MAX_VIDEO_MB} MB)
                </span>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                multiple
                className="hidden"
                data-testid="media-file-input"
                onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    const errs = addFiles(picked);
                    setMedia((current) => current); // keep state stable
                    if (errs.length) {
                        // Surface count-validation errors through the list area
                        setMedia((current) => [
                            ...current,
                            ...errs.map((msg, i) => ({
                                id: `err-${Date.now()}-${i}`,
                                errorOnly: true,
                                error: msg,
                            })),
                        ]);
                    }
                    e.target.value = "";
                }}
            />

            <button
                type="button"
                data-testid="media-add-button"
                onClick={() => inputRef.current && inputRef.current.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-8 text-white/50 transition hover:border-[hsl(var(--bz-purple))]/50 hover:text-white/75"
            >
                <ImagePlus className="h-6 w-6" />
                <span className="text-sm">Select images or a video</span>
                <span className="text-[11px] text-white/35">JPEG, PNG, WebP, MP4, WebM</span>
            </button>

            {media.length > 0 && (
                <ul className="mt-4 space-y-3">
                    {media.map((item, idx) =>
                        item.errorOnly ? (
                            <li
                                key={item.id}
                                data-testid="media-validation-error"
                                className="flex items-center gap-2 rounded-xl border border-[hsl(var(--bz-red))]/40 bg-[hsl(var(--bz-red))]/10 px-3 py-2 text-xs text-white/85"
                            >
                                <AlertCircle className="h-4 w-4 shrink-0 text-[hsl(var(--bz-red))]" />
                                {item.error}
                                <button
                                    type="button"
                                    onClick={() => removeAt(idx)}
                                    className="ml-auto text-white/50 hover:text-white"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </li>
                        ) : (
                            <li
                                key={item.id}
                                data-testid={`media-item-${idx}`}
                                className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                            >
                                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-black/50">
                                    {item.mediaType === "VIDEO" ? (
                                        <video
                                            src={item.previewUrl}
                                            muted
                                            playsInline
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <img
                                            src={item.previewUrl}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        {item.mediaType === "VIDEO" && (
                                            <Film className="h-3.5 w-3.5 text-white/50" />
                                        )}
                                        <span className="truncate text-xs text-white/75">
                                            {item.file.name}
                                        </span>
                                        {idx === 0 && item.mediaType === "IMAGE" && (
                                            <span className="shrink-0 rounded-full border border-[hsl(var(--bz-purple))]/40 bg-[hsl(var(--bz-purple))]/15 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-[hsl(var(--bz-purple))]">
                                                Primary
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1 text-[10px] text-white/40">
                                        {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                                        {item.uploadedPath && " — uploaded"}
                                    </div>
                                    {item.uploading && (
                                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                            <div
                                                className="h-full rounded-full bg-[hsl(var(--bz-purple))] transition-all"
                                                style={{ width: `${item.progress}%` }}
                                                data-testid={`media-progress-${idx}`}
                                            />
                                        </div>
                                    )}
                                    {item.error && (
                                        <div className="mt-1 flex items-center gap-1 text-[11px] text-[hsl(var(--bz-red))]">
                                            <AlertCircle className="h-3 w-3" /> {item.error}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <button
                                        type="button"
                                        aria-label="Move up"
                                        data-testid={`media-move-up-${idx}`}
                                        disabled={idx === 0}
                                        onClick={() => move(idx, -1)}
                                        className="rounded-md border border-white/10 p-1 text-white/60 disabled:opacity-30 hover:text-white"
                                    >
                                        <ChevronUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Move down"
                                        data-testid={`media-move-down-${idx}`}
                                        disabled={idx === media.length - 1}
                                        onClick={() => move(idx, 1)}
                                        className="rounded-md border border-white/10 p-1 text-white/60 disabled:opacity-30 hover:text-white"
                                    >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label="Remove media"
                                        data-testid={`media-remove-${idx}`}
                                        onClick={() => removeAt(idx)}
                                        className="rounded-md border border-white/10 p-1 text-[hsl(var(--bz-red))] hover:text-white"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </li>
                        )
                    )}
                </ul>
            )}
        </div>
    );
}
