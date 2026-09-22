import { useEffect, useRef, useState } from "react";

/**
 * Phase Polish 2 — cinematic scroll-reveal system (landing only).
 * IntersectionObserver-based, CSS-transition driven (no animation library
 * dependency). Respects prefers-reduced-motion via the CSS classes in
 * index.css (.rv*). Non-blocking: elements never intercept interaction.
 */
export function Reveal({
    as: Tag = "div",
    variant = "up",
    delay = 0,
    className = "",
    children,
    ...rest
}) {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            el.classList.add("is-in");
            return undefined;
        }
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    el.classList.add("is-in");
                    io.disconnect();
                }
            },
            { threshold: 0.16, rootMargin: "0px 0px -7% 0px" }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);
    return (
        <Tag
            ref={ref}
            className={`rv rv-${variant} ${className}`}
            style={{ "--d": `${delay}ms` }}
            {...rest}
        >
            {children}
        </Tag>
    );
}

/** Subtle scroll parallax (transform-only, rAF-throttled).
 *  Disabled on mobile widths + reduced-motion for performance. */
export function useParallax(speed = 0.08) {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
            return undefined;
        if (window.innerWidth < 768) return undefined;
        let raf = 0;
        const update = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const r = el.getBoundingClientRect();
                const center = r.top + r.height / 2 - window.innerHeight / 2;
                el.style.transform = `translateY(${(-center * speed).toFixed(1)}px)`;
            });
        };
        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            cancelAnimationFrame(raf);
        };
    }, [speed]);
    return ref;
}

/** Count-up that starts when the element enters the viewport. */
export function useCountUp(target, { decimals = 1, duration = 1200 } = {}) {
    const ref = useRef(null);
    const [val, setVal] = useState(0);
    const [go, setGo] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setGo(true);
                    io.disconnect();
                }
            },
            { threshold: 0.45 }
        );
        io.observe(el);
        return () => io.disconnect();
    }, []);
    useEffect(() => {
        if (!go) return undefined;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            setVal(target);
            return undefined;
        }
        let raf;
        const t0 = performance.now();
        const step = (t) => {
            const p = Math.min(1, (t - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(Number((target * eased).toFixed(decimals)));
            if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [go, target, decimals, duration]);
    return [ref, val];
}
