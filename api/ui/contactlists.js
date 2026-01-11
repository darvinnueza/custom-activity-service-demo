import fetch from "node-fetch";

const GENESYS_BASE_API = "https://api.cac1.pure.cloud";
const GENESYS_LOGIN_URL = "https://login.cac1.pure.cloud";
const GENESYS_DIVISION_ID = "c36e51ad-bec1-4117-9fd3-9c1d22147888";

// ⚠️ SOLO DEMO
const GENESYS_CLIENT_ID = "REEMPLAZA_LUEGO";
const GENESYS_CLIENT_SECRET = "REEMPLAZA_LUEGO";

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

    const response = await fetch(
      `${GENESYS_BASE_API}/api/v2/outbound/contactlists?pageSize=25&divisionId=${GENESYS_DIVISION_ID}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error("Error consultando contact lists");
    }

    const data = await response.json();

    const result = data.entities.map((c) => ({
      id: c.id,
      name: c.name
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
}