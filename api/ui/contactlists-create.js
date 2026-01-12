const GENESYS_BASE_API = "https://api.cac1.pure.cloud";
const GENESYS_LOGIN_URL = "https://login.cac1.pure.cloud";

// ⚠️ SOLO DEMO
const GENESYS_CLIENT_ID = "8510b821-97b8-4dab-a739-11260cfa2f1d";
const GENESYS_CLIENT_SECRET = "u8q39fufnYZYjr0xlf9m4WTAH16alfbxzgv86Ri0Gq4";

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) {
        return cachedToken;
    }

    const res = await fetch(`${GENESYS_LOGIN_URL}/oauth/token`, {
        method: "POST",
        headers: {
        "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: GENESYS_CLIENT_ID,
        client_secret: GENESYS_CLIENT_SECRET
        })
    });

    if (!res.ok) {
        throw new Error("Error obteniendo token Genesys");
    }

    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60000;

    return cachedToken;
}

export default async function handler(req, res) {
    try {
        const token = await getToken();

        // 🔴 NO QUEMAMOS NADA
        const payload = req.body;

        if (!payload?.name || !payload?.columnNames || !payload?.phoneColumns) {
        return res.status(400).json({
            error: "name, columnNames y phoneColumns son obligatorios"
        });
        }

        const response = await fetch(
        `${GENESYS_BASE_API}/api/v2/outbound/contactlists`,
        {
            method: "POST",
            headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        }
        );

        if (!response.ok) {
        const text = await response.text();
        throw new Error(text);
        }

        const data = await response.json();
        res.status(200).json(data);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
}