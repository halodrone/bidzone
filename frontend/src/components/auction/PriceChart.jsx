import { useMemo, useState } from "react";
import {
    LineChart,
    Line,
    ResponsiveContainer,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Area,
    AreaChart,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { useAuctionBids } from "@/hooks/useAuctionRoom";
import { fmtAmount } from "@/components/auction/format";

const RANGES = [
    { key: "1m",  label: "1m",  minutes: 1 },
    { key: "5m",  label: "5m",  minutes: 5 },
    { key: "15m", label: "15m", minutes: 15 },
    { key: "1h",  label: "1h",  minutes: 60 },
    { key: "all", label: "All", minutes: null },
];

export function PriceChart({ auctionId }) {
    const { data, isLoading } = useAuctionBids(auctionId, { limit: 200 });
    const [range, setRange] = useState("all");

    const points = useMemo(() => {
        const rows = data?.rows ?? [];
        if (rows.length === 0) return [];
        // Sort ascending by created_at so line rises through time.
        const asc = [...rows].sort(
            (a, b) => new Date(a.created_at) - new Date(b.created_at)
        );
        const cutoffMin = RANGES.find((r) => r.key === range)?.minutes;
        const filtered =
            cutoffMin == null
                ? asc
                : asc.filter(
                      (b) =>
                          Date.now() - new Date(b.created_at).getTime() <=
                          cutoffMin * 60 * 1000
                  );
        return filtered.map((b) => ({
            t: new Date(b.created_at).getTime(),
            price: Number(b.amount) || 0,
            label: new Date(b.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            }),
        }));
    }, [data, range]);

    const insufficient = points.length < 2;

    return (
        <section data-testid="auction-price-chart" className="bz-card p-5 md:p-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-display text-lg font-semibold">Live Price</h3>
                    <p className="text-[11px] uppercase tracking-widest text-white/40">
                        Bid trajectory
                    </p>
                </div>
                <div
                    role="tablist"
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.03] border border-white/[0.06] p-1"
                >
                    {RANGES.map((r) => {
                        const active = range === r.key;
                        return (
                            <button
                                key={r.key}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                data-testid={`price-chart-range-${r.key}`}
                                onClick={() => setRange(r.key)}
                                className={
                                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition " +
                                    (active
                                        ? "bg-[hsl(var(--bz-purple)/0.18)] text-[hsl(var(--bz-purple))]"
                                        : "text-white/50 hover:text-white")
                                }
                            >
                                {r.label}
                            </button>
                        );
                    })}
                </div>
            </header>

            <div className="mt-5 h-56 md:h-64">
                {isLoading ? (
                    <ChartSkeleton />
                ) : insufficient ? (
                    <ChartEmpty />
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                            <defs>
                                <linearGradient id="bz-price-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="hsl(262 83% 68% / 0.55)" />
                                    <stop offset="100%" stopColor="hsl(262 83% 68% / 0)" />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis
                                dataKey="label"
                                stroke="rgba(255,255,255,0.35)"
                                tickLine={false}
                                axisLine={false}
                                fontSize={11}
                                minTickGap={16}
                            />
                            <YAxis
                                dataKey="price"
                                stroke="rgba(255,255,255,0.35)"
                                tickLine={false}
                                axisLine={false}
                                fontSize={11}
                                width={48}
                                tickFormatter={(v) => fmtAmount(v)}
                            />
                            <Tooltip
                                cursor={{ stroke: "hsl(262 83% 68% / 0.4)", strokeWidth: 1 }}
                                contentStyle={{
                                    background: "hsl(240 8% 9%)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: 12,
                                    fontSize: 12,
                                    color: "#fff",
                                }}
                                formatter={(v) => [`${fmtAmount(v)} MON`, "Bid"]}
                                labelFormatter={(l) => `at ${l}`}
                            />
                            <Area
                                type="monotone"
                                dataKey="price"
                                stroke="hsl(262 83% 68%)"
                                strokeWidth={2}
                                fill="url(#bz-price-fill)"
                                isAnimationActive
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </section>
    );
}

function ChartSkeleton() {
    return <div className="h-full w-full animate-pulse rounded-xl bg-white/[0.04]" />;
}

function ChartEmpty() {
    return (
        <div
            data-testid="price-chart-empty"
            className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] text-white/40"
        >
            <TrendingUp className="h-5 w-5" />
            <span className="text-[11px] uppercase tracking-widest">
                Not enough bids to chart yet
            </span>
        </div>
    );
}
