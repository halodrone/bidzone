import { Link } from "react-router-dom";
import {
    Cpu,
    Footprints,
    Package,
    Palette,
    Gamepad2,
    Shirt,
    Gem,
    Crown,
    LayoutGrid,
} from "lucide-react";

const CATEGORIES = [
    { slug: "electronics",   label: "Electronics",   icon: Cpu },
    { slug: "sneakers",      label: "Sneakers",      icon: Footprints },
    { slug: "collectibles",  label: "Collectibles",  icon: Package },
    { slug: "art-design",    label: "Art & Design",  icon: Palette },
    { slug: "gaming",        label: "Gaming",        icon: Gamepad2 },
    { slug: "fashion",       label: "Fashion",       icon: Shirt },
    { slug: "luxury",        label: "Luxury",        icon: Crown },
    { slug: "jewelry",       label: "Jewelry",       icon: Gem },
    { slug: "others",        label: "Others",        icon: LayoutGrid },
];

export function CategorySection() {
    return (
        <section
            data-testid="home-categories"
            className="mx-auto max-w-[1400px] px-4 md:px-8 py-16 md:py-24"
            id="categories"
        >
            <header className="mb-8 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h2 className="font-display text-3xl font-bold md:text-4xl">
                        Browse by Category
                    </h2>
                    <p className="mt-2 text-sm text-white/50 md:text-base">
                        Find what you're looking for, or explore something new.
                    </p>
                </div>
            </header>

            {/* Desktop grid */}
            <ul className="hidden md:grid md:grid-cols-3 lg:grid-cols-9 gap-3">
                {CATEGORIES.map((c) => (
                    <li key={c.slug}>
                        <CategoryItem {...c} />
                    </li>
                ))}
            </ul>

            {/* Mobile horizontal scroll */}
            <ul className="md:hidden bz-scroll-x -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
                {CATEGORIES.map((c) => (
                    <li key={c.slug} className="snap-start shrink-0 w-[130px]">
                        <CategoryItem {...c} />
                    </li>
                ))}
            </ul>
        </section>
    );
}

function CategoryItem({ slug, label, icon: Icon }) {
    return (
        <Link
            to={`/explore?category=${slug}`}
            data-testid={`category-${slug}`}
            className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-6 transition hover:-translate-y-0.5 hover:border-[hsl(var(--bz-purple)/0.55)] hover:bg-white/[0.04]"
        >
            <span className="bz-icon-frame transition-shadow group-hover:shadow-[0_0_24px_hsl(var(--bz-purple)/0.35)]">
                <Icon className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <span className="text-sm font-medium text-white/85 text-center leading-tight">
                {label}
            </span>
        </Link>
    );
}
