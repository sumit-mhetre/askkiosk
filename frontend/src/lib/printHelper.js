// Talks to the local print helper running on the same machine as the kiosk page.
// The helper is a tiny Node program (or future Android app) that bridges the
// kiosk page to the WiFi printer on the local network.

const HELPER_URL = import.meta.env.VITE_HELPER_URL || "http://localhost:5050";

export async function helperHealth() {
  try {
    const res = await fetch(HELPER_URL + "/health", { mode: "cors" });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Ask the local helper to print this job. The helper will call back to the
// backend to fetch the file, then push it to the printer.
export async function helperPrint(jobId, backendUrl) {
  const res = await fetch(HELPER_URL + "/print", {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobId,
      fileUrl: backendUrl
        ? backendUrl.replace(/\/+$/, "") + "/api/jobs/" + jobId + "/file"
        : undefined,
    }),
  });
  if (!res.ok) {
    let msg = "Print helper error.";
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}

export function isHelperConfigured() {
  return !!HELPER_URL;
}
