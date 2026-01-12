import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

    try {
        // ✅ SOLO B: si mandan inArguments, lo rechazamos
        if (req.body?.inArguments) {
            return res.status(400).json({
                ok: false,
                error: "invalid_payload",
                details: "Envía payload PLANO (Opción B). No uses inArguments."
            });
        }

        const b = req.body || {};

        const row = {
            request_id: b.request_id ?? null,
            contact_key: b.contact_key ?? null,
            phone_number: b.phone_number ?? null,
            status: b.status ?? "RECEIVED",
            created_at: b.created_at ?? new Date().toISOString(),
            updated_at: b.updated_at ?? null,
            contactlistid: b.contactListId ?? null,
            usenewlist: !!b.useNewList,
            newlistname: b.newListName ?? null,
            campaignid: b.campaignId ?? null,
            sfmc_payload: b
        };

        const { error } = await supabase.from("vb_events").insert([row]);
        if (error) throw error;

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error("EXECUTE ERROR:", err);
        return res.status(500).json({
            ok: false,
            error: "execute_failed",
            details: String(err?.message || err)
        });
    }
}