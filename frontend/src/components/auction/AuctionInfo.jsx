import { ShieldCheck, Truck, Eye, Globe2, Timer } from "lucide-react";
import { fmtAmount } from "@/components/auction/format";

export function AuctionInfo({ auction }) {
    if (!auction) return null;

    return (
        <section
            data-testid="auction-info"
            className="bz-card p-5 md:p-6"
        >
            {auction.description ? (
                <>
                    <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
                        About this item
                    </h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/80">
                        {auction.description}
                    </p>
                </>
            ) : (
                <p className="text-sm text-white/50 italic">
                    The seller hasn't added a description.
                </p>
            )}

            {/* Auction details grid */}
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-5 text-sm">
                <Row label="Starting bid" value={`${fmtAmount(auction.starting_bid)} MON`} />
                <Row label="Increment" value={`${fmtAmount(auction.minimum_increment)} MON`} />
                {auction.current_bid && (
                    <Row
                        label="Current bid"
                        value={`${fmtAmount(auction.current_bid)} MON`}
                        emphasize
                    />
                )}
                <Row label="Category" value={auction.category || "—"} />
                <Row label="Type" value={auction.auction_type || "—"} />
                <Row label="Condition" value={auction.condition || "—"} />
                <Row
                    label="Ends"
                    value={auction.end_time ? new Date(auction.end_time).toLocaleString() : "—"}
                />
                {auction.start_time && (
                    <Row
                        label="Started"
                        value={new Date(auction.start_time).toLocaleString()}
                    />
                )}
                {auction.allowed_regions?.length ? (
                    <Row
                        label="Regions"
                        value={
                            auction.allowed_regions.includes("GLOBAL")
                                ? "Global"
                                : auction.allowed_regions.join(", ")
                        }
                    />
                ) : null}
            </dl>

            {/* Trust indicators */}
            <ul
                data-testid="auction-trust-indicators"
                className="mt-6 grid grid-cols-1 gap-2 border-t border-white/[0.06] pt-5 sm:grid-cols-2"
            >
                <Trust icon={ShieldCheck} label="Escrow Protected" />
                <Trust icon={Eye} label="Transparent Bidding" />
                <Trust icon={Timer} label="Final 10s Protected" />
                {auction.auction_type === "PHYSICAL" ? (
                    <Trust icon={Truck} label="Global Shipping" />
                ) : (
                    <Trust icon={Globe2} label="Instant Digital Delivery" />
                )}
            </ul>
        </section>
    );
}

function Row({ label, value, emphasize }) {
    return (
        <>
            <dt className="text-[11px] uppercase tracking-widest text-white/40">
                {label}
            </dt>
            <dd
                className={
                    "text-right font-medium tabular-nums " +
                    (emphasize ? "text-[hsl(var(--bz-purple))]" : "text-white/85")
                }
            >
                {value}
            </dd>
        </>
    );
}

function Trust({ icon: Icon, label }) {
    return (
        <li className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <span className="bz-icon-frame !h-8 !w-8 !rounded-lg">
                <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="text-xs font-medium text-white/80">{label}</span>
        </li>
    );
}
