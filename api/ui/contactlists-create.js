import { getToken } from "../genesys/token.js";

const GENESYS_BASE_API = "https://api.cac1.pure.cloud";

// Columnas fijas según tu JSON
const DEFAULT_PAYLOAD = (name) => ({
    name,
    columnNames: ["request_id", "contact_key", "phone_number", "status"],
    phoneColumns: [{ columnName: "phone_number", type: "cell" }]
});

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { name } = req.body || {};
        if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Falta 'name'" });
        }

        const token = await getToken();

        const r = await fetch(`${GENESYS_BASE_API}/api/v2/outbound/contactlists`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(DEFAULT_PAYLOAD(name.trim()))
        });

        const text = await r.text();

        if (!r.ok) {
        return res.status(r.status).json({ error: text });
        }

        const created = JSON.parse(text);
        return res.status(200).json({
        id: created.id,
        name: created.name
        });
    } catch (e) {
        console.error("ERROR create contactlist:", e);
        return res.status(500).json({ error: e.message });
    }
}