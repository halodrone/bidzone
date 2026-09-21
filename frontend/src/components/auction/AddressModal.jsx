import { useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { insertMyAddress } from "@/lib/shipping";
import { useAuth } from "@/context/AuthContext";

/**
 * BIDZONE Phase 7 — Add Shipping Address modal.
 * Writes to the EXISTING private `addresses` table (RLS: owner-only).
 * Never shows or stores anything publicly; used by the physical-bid gate
 * and by My Activity fulfillment.
 */
export function AddressModal({ open, onClose, onSaved }) {
    const [form, setForm] = useState({
        recipient_name: "",
        phone: "",
        address_line: "",
        city: "",
        province: "",
        country: "",
        postal_code: "",
    });
    const [saving, setSaving] = useState(false);
    const { user } = useAuth();

    if (!open) return null;

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const valid =
        form.recipient_name.trim() &&
        form.address_line.trim() &&
        form.city.trim() &&
        form.country.trim();

    async function save(e) {
        e.preventDefault();
        if (!valid || saving) return;
        setSaving(true);
        try {
            await insertMyAddress(
                {
                    recipient_name: form.recipient_name.trim(),
                    phone: form.phone.trim() || null,
                    address_line: form.address_line.trim(),
                    city: form.city.trim(),
                    province: form.province.trim() || null,
                    country: form.country.trim(),
                    postal_code: form.postal_code.trim() || null,
                },
                user.id
            );
            toast.success("Shipping address saved");
            onClose();
            onSaved && onSaved();
        } catch (err) {
            toast.error("Could not save address", {
                description: (err && err.message) || "Please try again.",
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center px-4"
            data-testid="address-modal"
            role="dialog"
            aria-modal="true"
        >
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            />
            <div className="relative w-full max-w-md rounded-3xl bz-card p-6">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close dialog"
                    className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-white/60 hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--bz-surface))] border border-white/10">
                        <MapPin className="h-4 w-4 text-[hsl(var(--bz-purple))]" />
                    </span>
                    <div>
                        <h2 className="font-display text-lg font-bold">Add Shipping Address</h2>
                        <p className="text-[11px] text-white/45">
                            Private — only the seller of an order you won can see this,
                            after payment is secured.
                        </p>
                    </div>
                </div>

                <form onSubmit={save} className="mt-5 space-y-3">
                    <Field label="Recipient name">
                        <input className="bz-input w-full" data-testid="address-recipient"
                            value={form.recipient_name} onChange={set("recipient_name")}
                            placeholder="Full name" />
                    </Field>
                    <Field label="Phone (optional)">
                        <input className="bz-input w-full" data-testid="address-phone"
                            value={form.phone} onChange={set("phone")}
                            placeholder="+62 ..." />
                    </Field>
                    <Field label="Street address">
                        <input className="bz-input w-full" data-testid="address-line"
                            value={form.address_line} onChange={set("address_line")}
                            placeholder="Street, house number" />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="City">
                            <input className="bz-input w-full" data-testid="address-city"
                                value={form.city} onChange={set("city")} placeholder="City" />
                        </Field>
                        <Field label="Province (optional)">
                            <input className="bz-input w-full" data-testid="address-province"
                                value={form.province} onChange={set("province")}
                                placeholder="Province" />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Country">
                            <input className="bz-input w-full" data-testid="address-country"
                                value={form.country} onChange={set("country")}
                                placeholder="Country" />
                        </Field>
                        <Field label="Postal code (optional)">
                            <input className="bz-input w-full" data-testid="address-postal"
                                value={form.postal_code} onChange={set("postal_code")}
                                placeholder="Postal code" />
                        </Field>
                    </div>

                    <button
                        type="submit"
                        data-testid="address-save"
                        disabled={!valid || saving}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full bz-btn-primary px-5 py-3 text-sm font-semibold disabled:opacity-50"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save Address
                    </button>
                </form>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/50">
                {label}
            </span>
            {children}
        </label>
    );
}
