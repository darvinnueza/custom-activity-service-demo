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
        // ✅ OPCIÓN B: llega plano desde Postman/SFMC demo
        const b = req.body || {};

        const row = {
            request_id: b.request_id ?? null,
            contact_key: b.contact_key ?? null,
            phone_number: b.phone_number ?? null,

            // ✅ NOMBRES EXACTOS COMO TU TABLA
            contact_list_id: b.contactListId ?? null,
            campaign_id: b.campaignId ?? null,

            // ✅ tus estados simples (lo que acordaste)
            status: b.status ?? "RECEIVED",

            // opcional
            error_message: null
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