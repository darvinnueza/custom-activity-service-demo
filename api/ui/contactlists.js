const GENESYS_BASE_API = "https://api.cac1.pure.cloud";
const GENESYS_LOGIN_URL = "https://login.cac1.pure.cloud";
const GENESYS_DIVISION_ID = "c36e51ad-bec1-4117-9fd3-9c1d22147888";

// ⚠️ SOLO DEMO (ideal mover a env en prod)
const GENESYS_CLIENT_ID = "8510b821-97b8-4dab-a739-11260cfa2f1d";
const GENESYS_CLIENT_SECRET = "u8q39fufnYZYjr0xlf9m4WTAH16alfbxzgv86Ri0Gq4";

let cachedToken = null;
let tokenExpiresAt = 0;

function unauthorized(res) {
  // Esto hace que el navegador “pida user/pass”
  res.setHeader("WWW-Authenticate", 'Basic realm="Restricted"');
  return res.status(401).json({ error: "unauthorized" });
}

function checkBasicAuth(req) {
  const USER = process.env.BASIC_AUTH_USER;
  const PASS = process.env.BASIC_AUTH_PASS;

  if (!USER || !PASS) {
    // Si no configuraste envs, bloquea (para que no quede abierto)
    return { ok: false, reason: "missing_env" };
  }

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) return { ok: false, reason: "no_basic" };

  const b64 = auth.slice("Basic ".length).trim();

  let decoded = "";
  try {
    decoded = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return { ok: false, reason: "bad_base64" };
  }

  const idx = decoded.indexOf(":");
  if (idx < 0) return { ok: false, reason: "bad_format" };

  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);

  if (u !== USER || p !== PASS) return { ok: false, reason: "bad_creds" };

  return { ok: true };
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${GENESYS_LOGIN_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: GENESYS_CLIENT_ID,
      client_secret: GENESYS_CLIENT_SECRET
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Error obteniendo token Genesys: ${res.status} ${t}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60000;

  return cachedToken;
}

export default async function handler(req, res) {
  // CORS (si lo necesitas)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ✅ BLOQUEO por Basic Auth
  const authCheck = checkBasicAuth(req);
  if (!authCheck.ok) {
    // (opcional) log mínimo para debug
    console.log("CONTACTLISTS AUTH BLOCKED:", authCheck.reason);
    return unauthorized(res);
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const token = await getToken();

    const response = await fetch(
      `${GENESYS_BASE_API}/api/v2/outbound/contactlists?pageSize=25&divisionId=${GENESYS_DIVISION_ID}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!response.ok) {
      const t = await response.text().catch(() => "");
      throw new Error(`Error consultando contact lists: ${response.status} ${t}`);
    }

    const data = await response.json();

    const result = (data.entities || []).map((c) => ({
      id: c.id,
      name: c.name
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error("CONTACTLISTS ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}