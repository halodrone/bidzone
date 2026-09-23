import { useEffect, useRef, useState } from "react";

/**
 * Shared countdown presentation for cards and the Auction Room.
 * The server/contract end_time remains the only source of truth; this hook
 * only formats the timestamp and highlights urgency without extending it.
 */
function fmt(target) {
    if (!target) return { label: "—", isEndingSoon: false, isUrgent: false, isEnded: false, secondsRemaining: null };
    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) return { label: "Ended", isEndingSoon: false, isUrgent: false, isEnded: true, secondsRemaining: 0 };

    const secondsRemaining = Math.ceil(diff / 1000);
    const days = Math.floor(secondsRemaining / 86400);
    const hours = Math.floor((secondsRemaining % 86400) / 3600);
    const mins = Math.floor((secondsRemaining % 3600) / 60);
    const secs = secondsRemaining % 60;

    let label;
    if (days > 0) label = `${days}d ${hours}h`;
    else if (hours > 0) label = `${hours}h ${String(mins).padStart(2, "0")}m`;
    else label = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    return {
        label,
        isEndingSoon: secondsRemaining <= 60,
        isUrgent: secondsRemaining <= 10,
        isEnded: false,
        secondsRemaining,
    };
}

export function CountdownTimer({ endTime, testId, antiSnipingSeconds = 10, showExtension = true }) {
    const [tick, setTick] = useState(() => fmt(endTime));
    const previousEnd = useRef(endTime ? new Date(endTime).getTime() : null);
    const [extension, setExtension] = useState(null);

    useEffect(() => {
        const nextEnd = endTime ? new Date(endTime).getTime() : null;
        const oldEnd = previousEnd.current;
        if (nextEnd && oldEnd && nextEnd - oldEnd > 500) {
            const seconds = Math.max(1, Math.round((nextEnd - oldEnd) / 1000));
            setExtension(seconds);
            const timeout = window.setTimeout(() => setExtension(null), 5200);
            previousEnd.current = nextEnd;
            return () => window.clearTimeout(timeout);
        }
        previousEnd.current = nextEnd;
        return undefined;
    }, [endTime]);

    useEffect(() => {
        setTick(fmt(endTime));
        if (!endTime) return undefined;
        const id = window.setInterval(() => setTick(fmt(endTime)), 1000);
        return () => window.clearInterval(id);
    }, [endTime]);

    const color = tick.isEnded
        ? "text-white/40"
        : tick.isUrgent
          ? "text-[hsl(var(--bz-red))]"
          : tick.isEndingSoon
            ? "text-amber-200"
            : "text-white/80";
    const urgency = tick.isUrgent
        ? "border-[hsl(var(--bz-red)/0.6)] bg-[hsl(var(--bz-red)/0.14)] shadow-[0_0_24px_hsl(var(--bz-red)/0.18)] animate-pulse"
        : tick.isEndingSoon
          ? "border-amber-300/35 bg-amber-300/[0.08]"
          : "border-white/10 bg-black/70";

    return (
        <span className="inline-flex items-center gap-2" data-countdown-phase={tick.isUrgent ? "final-10" : tick.isEndingSoon ? "final-60" : tick.isEnded ? "ended" : "normal"} data-anti-sniping-seconds={antiSnipingSeconds}>
            <span
                data-testid={testId}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 font-display text-sm tabular-nums transition-colors ${urgency} ${color}`}
                title={tick.isUrgent ? "Final 10 seconds" : tick.isEndingSoon ? "Final minute" : undefined}
            >
                {tick.isUrgent && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-current" />}
                {tick.label}
            </span>
            {showExtension && extension && (
                <span
                    data-testid="auction-extension-notice"
                    className="animate-in fade-in rounded-full border border-[hsl(var(--bz-purple)/0.5)] bg-[hsl(var(--bz-purple)/0.14)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--bz-purple))]"
                >
                    +{extension}s EXTENDED
                </span>
            )}
        </span>
    );
}
