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
        const b = req.body || {};

        console.log("BODY_IN:", JSON.stringify(b, null, 2));

        // Validación mínima (status ya NO se valida porque NO se recibe)
        const missing = [];
        if (!b.request_id) missing.push("request_id");
        if (!b.contact_key) missing.push("contact_key");
        if (!b.phone_number) missing.push("phone_number");
        if (!b.contactListId) missing.push("contactListId");
        if (!b.campaignId) missing.push("campaignId");

        if (missing.length) {
            return res.status(400).json({ ok: false, error: "missing_fields", missing });
        }

        // ✅ SIEMPRE: Registro recibido desde Salesforce
        const status = "RECEIVED";

        const row = {
            request_id: b.request_id,
            contact_key: b.contact_key,
            phone_number: b.phone_number,

            // ✅ camelCase -> snake_case
            contact_list_id: b.contactListId,
            campaign_id: b.campaignId,

            // ✅ fijo
            status,
            error_message: null
        };

        console.log("ROW_INSERT:", JSON.stringify(row, null, 2));

        const { data, error } = await supabase
        .from("vb_events")
        .insert([row])
        .select("id, status")
        .single();

        if (error) throw error;

        return res.status(200).json({ ok: true, id: data?.id, status: data?.status });
    } catch (err) {
        console.error("EXECUTE ERROR:", err);
        return res.status(500).json({
            ok: false,
            error: "execute_failed",
            details: String(err?.message || err),
        });
    }
}