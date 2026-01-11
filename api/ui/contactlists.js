module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

    const baseApi = process.env.GENESYS_BASE_API;
    const divisionId = process.env.GENESYS_DIVISION_ID;

    if (!baseApi || !divisionId) {
      return res.status(500).json({
        error: "Missing env vars",
        missing: {
          GENESYS_BASE_API: !baseApi,
          GENESYS_DIVISION_ID: !divisionId
        }
      });
    }

    // llamar al token endpoint interno (server-side)
    const host = req.headers["x-forwarded-host"] || req.headers["host"];
    const proto = req.headers["x-forwarded-proto"] || "https";
    const selfBase = `${proto}://${host}`;

    const tokenResp = await fetch(`${selfBase}/api/genesys/token`, { method: "POST" });
    const tokenJson = await tokenResp.json();

    if (!tokenResp.ok || !tokenJson?.access_token) {
      return res.status(502).json({ error: "Cannot obtain access token", details: tokenJson });
    }

    const accessToken = tokenJson.access_token;

    const url =
      `${baseApi.replace(/\/$/, "")}/api/v2/outbound/contactlists` +
      `?pageSize=25&divisionId=${encodeURIComponent(divisionId)}`;

    const r = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!r.ok) {
      return res.status(r.status).json({
        error: "Genesys contactlists failed",
        status: r.status,
        details: json
      });
    }

    // EXACTO: viene en json.entities[]
    const entities = Array.isArray(json.entities) ? json.entities : [];

    // respuesta limpia para llenar el combo
    const contactLists = entities.map(e => ({
      id: e.id,
      name: e.name,
      phoneColumns: e.phoneColumns || [],
      columnNames: e.columnNames || []
    }));

    return res.status(200).json({
      divisionId,
      pageSize: json.pageSize,
      pageNumber: json.pageNumber,
      total: json.total,
      contactLists
    });
  } catch (e) {
    return res.status(500).json({ error: "Unexpected error", message: String(e?.message || e) });
  }
};