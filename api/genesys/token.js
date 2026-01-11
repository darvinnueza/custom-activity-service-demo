module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const baseLogin = process.env.GENESYS_BASE_LOGIN;
    const clientId = process.env.GENESYS_CLIENT_ID;
    const clientSecret = process.env.GENESYS_CLIENT_SECRET;

    if (!baseLogin || !clientId || !clientSecret) {
      return res.status(500).json({
        error: "Missing env vars",
        missing: {
          GENESYS_BASE_LOGIN: !baseLogin,
          GENESYS_CLIENT_ID: !clientId,
          GENESYS_CLIENT_SECRET: !clientSecret
        }
      });
    }

    const tokenUrl = `${baseLogin.replace(/\/$/, "")}/oauth/token`;

    // grant_type=client_credentials (form urlencoded)
    const body = new URLSearchParams();
    body.set("grant_type", "client_credentials");

    // Basic Auth: base64(clientId:clientSecret)
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const r = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Token request failed",
        status: r.status,
        details: json
      });
    }

    // Respuesta como la que tú muestras (access_token, token_type, expires_in)
    return res.status(200).json({
      access_token: json.access_token,
      token_type: json.token_type,
      expires_in: json.expires_in
    });
  } catch (e) {
    return res.status(500).json({ error: "Unexpected error", message: String(e?.message || e) });
  }
};