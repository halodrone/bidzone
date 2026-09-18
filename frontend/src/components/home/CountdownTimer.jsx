import { useEffect, useState } from "react";

/**
 * Formats a countdown from `now` to `endTime` (ISO string).
 * Returns { label, isEndingSoon, isEnded }.
 */
function fmt(target) {
    if (!target) return { label: "—", isEndingSoon: false, isEnded: false };
    const end = new Date(target).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) return { label: "Ended", isEndingSoon: false, isEnded: true };

    const s = Math.floor(diff / 1000);
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    let label;
    if (days > 0) label = `${days}d ${hours}h`;
    else if (hours > 0) label = `${hours}h ${String(mins).padStart(2, "0")}m`;
    else label = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    return { label, isEndingSoon: diff < 5 * 60 * 1000, isEnded: false };
}

export function CountdownTimer({ endTime, testId }) {
    const [tick, setTick] = useState(() => fmt(endTime));

    useEffect(() => {
        if (!endTime) return undefined;
        const id = setInterval(() => setTick(fmt(endTime)), 1000);
        return () => clearInterval(id);
    }, [endTime]);

    const color = tick.isEnded
        ? "text-white/40"
        : tick.isEndingSoon
          ? "text-[hsl(var(--bz-red))]"
          : "text-white/80";

    return (
        <span
            data-testid={testId}
            className={`font-display text-sm tabular-nums ${color}`}
        >
            {tick.label}
        </span>
    );
}
