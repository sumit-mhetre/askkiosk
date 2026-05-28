// Axios API helper. In dev, /api proxies to the backend on port 5000.
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/jobs/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function unlockJob(jobId, password) {
  const { data } = await api.post(`/jobs/${jobId}/unlock`, { password });
  return data;
}

export async function configureJob(jobId, config) {
  const { data } = await api.post(`/jobs/${jobId}/configure`, config);
  return data;
}

export async function createPayment(jobId) {
  const { data } = await api.post(`/jobs/${jobId}/pay`);
  return data;
}

export async function verifyPayment(jobId, payload) {
  const { data } = await api.post(`/jobs/${jobId}/verify`, payload);
  return data;
}

export async function getStatus(jobId) {
  const { data } = await api.get(`/jobs/${jobId}/status`);
  return data;
}

export async function kioskClaim(code) {
  const { data } = await api.post("/kiosk/claim", { code });
  return data;
}

// Helper-driven flow: claim only (backend won't try to print), then the
// kiosk page asks the local print helper to do the actual print.
export async function kioskClaimOnly(code) {
  const { data } = await api.post("/kiosk/claim-only", { code });
  return data;
}

export async function reportPrintResult(jobId, ok, error) {
  const { data } = await api.post(`/jobs/${jobId}/print-result`, { ok, error });
  return data;
}

export async function kioskInfo() {
  const { data } = await api.get("/kiosk/info");
  return data;
}

export default api;
