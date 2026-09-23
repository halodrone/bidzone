import { Compass, Gavel, Trophy, PackageCheck, Sparkles, ArrowRight, Wallet, Image as ImageIcon, ShieldCheck, Zap, Info } from "lucide-react";

/**
 * BIDZONE — How It Works (shared section).
 *
 * Reused by both the Landing (guest) and Home (authed) pages via the
 * existing `#how-it-works` anchor. No routing changes: the section is
 * mounted right where the anchor jumps in, so desktop, mobile nav, footer
 * and hero CTAs all continue to work with the existing smooth-scroll.
 *
 * Strict content-only. Nothing here touches contracts, NFT ownership,
 * embedded wallet, bidding, shipping, escrow, dispute, admin, notifications,
 * auth, or the database schema.
 */

const STEPS = [
    {
        n: "01",
        title: "Discover",
        icon: Compass,
        blurb: "Find something worth bidding on.",
        points: [
            "Current bid",
            "Minimum bid increment",
            "Time remaining",
            "Auction details",
        ],
        note: "No hidden reserve. No hidden minimum.",
    },
    {
        n: "02",
        title: "Bid",
        icon: Gavel,
        blurb: "Make your move.",
        points: [
            "Place a valid bid at or above the required minimum.",
            "When you become the highest bidder, your bid amount is locked.",
            "If another bidder outbids you, your locked balance is released so you can bid again.",
        ],
    },
    {
        n: "03",
        title: "Win",
        icon: Trophy,
        blurb: "Be the highest valid bidder when the auction ends.",
        points: [
            "The highest valid bid at the end of the auction wins.",
            "If a qualifying bid arrives near the end, BIDZONE's anti-sniping mechanism can extend the auction to keep bidding fair.",
        ],
    },
    {
        n: "04",
        title: "Complete the transaction",
        icon: PackageCheck,
        blurb: "Protected transaction flow.",
        points: [
            "Seller ships the item.",
            "Seller provides tracking.",
            "Buyer receives the item.",
            "The confirmation window begins only after tracking reaches DELIVERED.",
            "If something goes wrong, the buyer can open a dispute.",
        ],
        note: "For digital / NFT assets, ownership follows the appropriate digital asset flow.",
    },
    {
        n: "05",
        title: "Own it",
        icon: Sparkles,
        blurb: "Once the transaction is successfully completed, the asset belongs to the winner according to its asset type.",
        points: [
            "Physical → receive the physical item.",
            "Digital → receive the digital asset.",
            "NFT → the ERC-721 NFT is transferred to the buyer's wallet.",
        ],
    },
];

const NFT_FLOW_STEPS = [
    { title: "External Wallet", icon: Wallet, hint: "MetaMask, Rainbow, etc." },
    { title: "Receive NFT", icon: ArrowRight, hint: "safeTransferFrom" },
    { title: "BIDZONE Embedded Wallet", icon: ShieldCheck, hint: "Same network" },
    { title: "My Collection", icon: ImageIcon, hint: "ownerOf() = truth" },
    { title: "Sell NFT", icon: Gavel, hint: "Create NFT Auction" },
    { title: "Winner", icon: Trophy, hint: "Highest valid bid" },
    { title: "NFT Transferred", icon: Sparkles, hint: "To winner's wallet" },
];

export function HowItWorks() {
    return (
        <section
            id="how-it-works"
            data-testid="how-it-works"
            className="relative scroll-mt-24 border-t border-white/[0.05] py-20 md:py-28"
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_20%,hsl(var(--bz-purple)/0.10),transparent_70%)]"
            />
            <div className="mx-auto max-w-[1200px] px-4 md:px-8">
                {/* Header */}
                <div className="max-w-3xl">
                    <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[hsl(var(--bz-purple))]">
                        <span className="inline-block h-px w-8 bg-[hsl(var(--bz-purple)/0.55)]" />
                        How BIDZONE works
                    </p>
                    <h2
                        data-testid="hiw-headline"
                        className="mt-4 font-display text-4xl font-bold uppercase leading-[1.02] tracking-tight sm:text-5xl md:text-6xl"
                    >
                        Bid. Win. <span className="bz-purple-text">Own.</span>
                    </h2>
                    <p className="mt-4 max-w-2xl text-sm text-white/60 md:text-base">
                        A transparent auction experience built for Physical, Digital, and NFT assets.
                    </p>
                </div>

                {/* Steps */}
                <ol
                    data-testid="hiw-steps"
                    className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                    {STEPS.map(({ n, title, icon: Icon, blurb, points, note }) => (
                        <li
                            key={n}
                            data-testid={`hiw-step-${n}`}
                            className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-[hsl(var(--bz-purple)/0.4)] hover:bg-[hsl(var(--bz-purple)/0.04)]"
                        >
                            <div className="flex items-center gap-3">
                                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--bz-purple)/0.4)] bg-[hsl(var(--bz-purple)/0.1)] text-[hsl(var(--bz-purple))]">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-[10px] font-semibold tracking-[0.28em] text-white/40">{n}</p>
                                    <h3 className="text-base font-semibold text-white truncate">{title}</h3>
                                </div>
                            </div>
                            <p className="mt-3 text-sm text-white/75">{blurb}</p>
                            <ul className="mt-3 space-y-1.5">
                                {points.map((p) => (
                                    <li key={p} className="flex items-start gap-2 text-[13px] text-white/65">
                                        <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                                        <span className="break-words">{p}</span>
                                    </li>
                                ))}
                            </ul>
                            {note && (
                                <p className="mt-3 rounded-lg bg-black/25 px-3 py-2 text-[11px] text-white/55">{note}</p>
                            )}
                        </li>
                    ))}
                </ol>

                {/* NFT Section */}
                <NftFlow />

                {/* Testnet vs Mainnet */}
                <NetworkNotice />

                {/* Fees + Transparency */}
                <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <FeeCard />
                    <TransparencyCard />
                </div>
            </div>
        </section>
    );
}

/* -------------------------------------------------------------------- */

function NftFlow() {
    return (
        <div data-testid="hiw-nft" className="mt-16 rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8">
            <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--bz-purple)/0.4)] bg-[hsl(var(--bz-purple)/0.1)] text-[hsl(var(--bz-purple))]">
                    <ImageIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold tracking-[0.28em] text-white/40">NFTs on BIDZONE</p>
                    <h3 className="font-display text-2xl font-bold text-white sm:text-3xl">
                        Bring your NFT. <span className="bz-purple-text">Bid. Sell. Own.</span>
                    </h3>
                </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm text-white/70">
                BIDZONE is <span className="font-semibold text-white">not</span> an NFT minting platform on Mainnet. Users bring NFTs they already own.
            </p>

            {/* Flow diagram — horizontal on desktop, vertical on mobile */}
            <ol
                data-testid="hiw-nft-flow"
                className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2"
            >
                {NFT_FLOW_STEPS.map(({ title, icon: Icon, hint }, i) => (
                    <li
                        key={title}
                        className="relative flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/25 p-3 lg:flex-col lg:items-center lg:text-center"
                    >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.08)] text-[hsl(var(--bz-purple))]">
                            <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 lg:mt-1">
                            <p className="text-[11px] font-semibold text-white leading-tight">{title}</p>
                            <p className="text-[10px] text-white/45 leading-tight mt-0.5">{hint}</p>
                        </div>
                        {i < NFT_FLOW_STEPS.length - 1 && (
                            <ArrowRight
                                aria-hidden
                                className="hidden lg:block absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/25"
                            />
                        )}
                    </li>
                ))}
            </ol>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                <NftDetail
                    title="Receive NFT"
                    text="Users can transfer an existing ERC-721 NFT from an external wallet (e.g. MetaMask) to their BIDZONE embedded wallet — sent to the wallet address on the same supported network. The NFT remains a real on-chain asset."
                />
                <NftDetail
                    title="My Collection"
                    text="After the NFT arrives, it appears in My Collection. Ownership uses BIDZONE's NFT Model B: on-chain ownerOf() is the source of truth; Supabase is an index/cache only."
                />
                <NftDetail
                    title="Sell NFT"
                    text="Sell NFT is only available when the user actually owns an NFT. Choose an NFT from your collection and create an NFT auction. BIDZONE does not manufacture or mint the NFT for the seller."
                />
                <NftDetail
                    title="Win NFT"
                    text="When another user wins the NFT auction, the existing NFT settlement flow handles ownership transfer to the winner's wallet."
                />
            </div>
        </div>
    );
}

function NftDetail({ title, text }) {
    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--bz-purple))]">{title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{text}</p>
        </div>
    );
}

/* -------------------------------------------------------------------- */

function NetworkNotice() {
    return (
        <div data-testid="hiw-network" className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div
                data-testid="hiw-network-testnet"
                className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-5"
            >
                <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200">
                    <Zap className="h-3.5 w-3.5" />
                    Testnet · development only
                </p>
                <h4 className="mt-2 text-lg font-semibold text-white">Mint NFT (Testnet)</h4>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
                    On testnet, BIDZONE may provide a Mint NFT tool so the team can create test NFTs and verify the full flow end-to-end:
                    Mint → Wallet → My Collection → NFT Detail → Sell → Auction → Bid → Win → Transfer.
                </p>
                <p className="mt-2 text-[11px] text-amber-200/80">
                    This exists strictly for testing and development.
                </p>
            </div>
            <div
                data-testid="hiw-network-mainnet"
                className="rounded-2xl border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.05)] p-5"
            >
                <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--bz-purple))]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Mainnet
                </p>
                <h4 className="mt-2 text-lg font-semibold text-white">Get your first NFT</h4>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
                    There is <span className="font-semibold text-white">no "Mint NFT" feature</span> on Mainnet. Users obtain NFTs elsewhere and transfer their existing NFT into their BIDZONE embedded wallet. Once the wallet actually owns an NFT, the user can use <span className="font-semibold text-white">Sell NFT</span>.
                </p>
            </div>
        </div>
    );
}

/* -------------------------------------------------------------------- */

function FeeCard() {
    return (
        <div data-testid="hiw-fees" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">
                <Info className="h-3.5 w-3.5" />
                Fees
            </p>
            <h4 className="mt-2 text-lg font-semibold text-white">Fair, only when it sells.</h4>
            <ul className="mt-3 space-y-1.5 text-[13px] text-white/70">
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    BIDZONE charges a <span className="font-semibold text-white">2.5%</span> platform fee only when an auction successfully sells.
                </li>
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    The winning bidder pays <span className="font-semibold text-white">exactly the displayed winning bid</span>.
                </li>
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    The seller receives <span className="font-semibold text-white">97.5%</span> of the successful auction amount.
                </li>
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    No platform fee is deducted from losing / outbid bids.
                </li>
            </ul>
        </div>
    );
}

function TransparencyCard() {
    return (
        <div data-testid="hiw-transparency" className="rounded-2xl border border-[hsl(var(--bz-purple)/0.35)] bg-[hsl(var(--bz-purple)/0.05)] p-5">
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--bz-purple))]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Built on transparency
            </p>
            <h4 className="mt-2 text-lg font-semibold text-white">What you see is what you bid on.</h4>
            <ul className="mt-3 space-y-1.5 text-[13px] text-white/70">
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    No hidden reserve price.
                </li>
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    No secret minimum price.
                </li>
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    Starting bid is visible.
                </li>
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    Minimum increment is visible.
                </li>
                <li className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[hsl(var(--bz-purple))]" />
                    Sellers cannot secretly change auction rules after the auction goes live.
                </li>
            </ul>
        </div>
    );
}
