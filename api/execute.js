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
        // ✅ OPCIÓN B: body plano
        const b = req.body || {};

        // Validación mínima
        const missing = [];
        if (!b.request_id) missing.push("request_id");
        if (!b.contact_key) missing.push("contact_key");
        if (!b.phone_number) missing.push("phone_number");
        if (!b.contactListId) missing.push("contactListId");
        if (!b.campaignId) missing.push("campaignId");
        if (!b.status) missing.push("status");

        if (missing.length) {
            return res.status(400).json({ ok: false, error: "missing_fields", missing });
        }

        const row = {
            request_id: b.request_id,
            contact_key: b.contact_key,
            phone_number: b.phone_number,

            // ✅ Mapeo camelCase -> snake_case
            contact_list_id: b.contactListId,
            campaign_id: b.campaignId,

            status: b.status, // RECEIVED
            error_message: null
        };

        const { data, error } = await supabase.from("vb_events").insert([row]).select("id").single();
        if (error) throw error;

        return res.status(200).json({ ok: true, id: data?.id });
    } catch (err) {
        console.error("EXECUTE ERROR:", err);
        return res.status(500).json({
            ok: false,
            error: "execute_failed",
            details: String(err?.message || err),
        });
    }
}