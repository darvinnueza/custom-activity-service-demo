import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** ===== Genesys (igual que tus otros servicios) ===== */
const GENESYS_BASE_API = "https://api.cac1.pure.cloud";
const GENESYS_LOGIN_URL = "https://login.cac1.pure.cloud";

const GENESYS_CLIENT_ID = process.env.GENESYS_CLIENT_ID;
const GENESYS_CLIENT_SECRET = process.env.GENESYS_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
    if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

    if (!GENESYS_CLIENT_ID) throw new Error("Missing env GENESYS_CLIENT_ID");
    if (!GENESYS_CLIENT_SECRET) throw new Error("Missing env GENESYS_CLIENT_SECRET");

    const res = await fetch(`${GENESYS_LOGIN_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: GENESYS_CLIENT_ID,
            client_secret: GENESYS_CLIENT_SECRET,
        }),
    });

    if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Error obteniendo token Genesys: ${res.status} ${t}`);
    }

    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60000; // 60s buffer
    return cachedToken;
}

/** ===== Helpers ===== */
function groupByActivityAndList(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = `${r.activity_id}||${r.contact_list_id}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  // Límites
  const LIMIT = Number(process.env.DISPATCH_LIMIT || 500);            // filas totales por corrida
  const BATCH_SIZE = Number(process.env.GENESYS_BATCH_SIZE || 1000);  // items por request a Genesys

  try {
    // 1) Traer RECEIVED
    const { data: received, error: selErr } = await supabase
      .from("vb_events")
      .select("id, request_id, contact_key, phone_number, contact_list_id, activity_id, status")
      .eq("status", "RECEIVED")
      .order("id", { ascending: true })
      .limit(LIMIT);

    if (selErr) throw selErr;

    if (!received || received.length === 0) {
      return res.status(200).json({ ok: true, message: "nothing_to_dispatch" });
    }

    // 2) Agrupar por activity_id + contact_list_id
    const groups = groupByActivityAndList(received);

    // 3) Token Genesys (una vez por corrida)
    const token = await getToken();

    const results = [];

    // 4) Procesar grupos
    for (const [key, rows] of groups.entries()) {
      const [activity_id, contact_list_id] = key.split("||");
      const ids = rows.map((r) => r.id);

      // 4.1 Claim: RECEIVED -> DISPATCHING
      const { data: claimed, error: claimErr } = await supabase
        .from("vb_events")
        .update({ status: "DISPATCHING", error_message: null })
        .in("id", ids)
        .eq("status", "RECEIVED")
        .select("id, request_id, contact_key, phone_number, contact_list_id, activity_id");

      if (claimErr) {
        results.push({ activity_id, contact_list_id, ok: false, step: "claim", error: String(claimErr.message || claimErr) });
        continue;
      }

      if (!claimed || claimed.length === 0) {
        results.push({ activity_id, contact_list_id, ok: true, skipped: true, reason: "already_claimed" });
        continue;
      }

      // 4.2 Body para Genesys (status interno para Genesys siempre "NEW")
      const bodyAll = claimed.map((r) => ({
        contactListId: r.contact_list_id,
        data: {
          request_id: r.request_id,
          contact_key: r.contact_key,
          phone_number: r.phone_number,
          status: "NEW",
        },
        callable: true,
      }));

      const batches = chunk(bodyAll, BATCH_SIZE);

      let allOk = true;
      let lastError = "";

      // 4.3 Enviar a Genesys por batches
      for (let i = 0; i < batches.length; i++) {
        const b = batches[i];
        const url = `${GENESYS_BASE_API}/api/v2/outbound/contactlists/${contact_list_id}/contacts`;

        // ✅ LOG REQUEST (sin reventar logs)
        console.log("GENESYS REQUEST", {
          activity_id,
          contact_list_id,
          batch: `${i + 1}/${batches.length}`,
          url,
          contacts: b.length,
          body_preview: b.length <= 5 ? b : `[${b.length} contacts]`,
        });

        const startedAt = Date.now();
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(b),
        });
        const durationMs = Date.now() - startedAt;
        const txt = await r.text().catch(() => "");

        // ✅ LOG RESPONSE
        console.log("GENESYS RESPONSE", {
          activity_id,
          contact_list_id,
          batch: `${i + 1}/${batches.length}`,
          status: r.status,
          duration_ms: durationMs,
          response: txt?.slice(0, 1200),
        });

        if (!r.ok) {
          allOk = false;
          lastError = `Genesys ${r.status}: ${txt}`;
          break;
        }
      }

      // 4.4 Update estados en Supabase
      if (allOk) {
        await supabase
          .from("vb_events")
          .update({ status: "DISPATCHED", error_message: null })
          .in("id", claimed.map((x) => x.id));

        results.push({
          activity_id,
          contact_list_id,
          ok: true,
          dispatched: claimed.length,
          batches: batches.length,
        });
      } else {
        await supabase
          .from("vb_events")
          .update({ status: "FAILED", error_message: lastError })
          .in("id", claimed.map((x) => x.id));

        results.push({
          activity_id,
          contact_list_id,
          ok: false,
          failed: claimed.length,
          error: lastError.slice(0, 600),
        });
      }
    }

    return res.status(200).json({ ok: true, processedGroups: results.length, results });
  } catch (err) {
    console.error("DISPATCH ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: "dispatch_failed",
      details: String(err?.message || err),
    });
  }
}