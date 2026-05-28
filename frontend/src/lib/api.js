// Axios API helper. Uses VITE_API_BASE_URL on deployed envs; falls back to the
// dev proxy (/api) locally.
import axios from "axios";

const BASE = (import.meta.env.VITE_API_BASE_URL || "") + "/api";
const api = axios.create({ baseURL: BASE });

// Attach admin token if present (for admin endpoints).
api.interceptors.request.use((config) => {
  const t = localStorage.getItem("askkiosk_admin_token");
  if (t) config.headers.Authorization = "Bearer " + t;
  return config;
});

// ---- Customer (phone) flow ----
export async function uploadFile(file, kioskId) {
  const form = new FormData();
  form.append("file", file);
  if (kioskId) form.append("kioskId", kioskId);
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

// ---- Kiosk flow ----
export async function kioskClaim(code, kioskId) {
  const { data } = await api.post("/kiosk/claim", { code, kioskId });
  return data;
}

export async function kioskClaimOnly(code, kioskId) {
  const { data } = await api.post("/kiosk/claim-only", { code, kioskId });
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

// ---- Admin (super admin) ----
export async function adminLogin(email, password) {
  const { data } = await api.post("/admin/login", { email, password });
  return data;
}

export async function listOperators() {
  const { data } = await api.get("/admin/operators");
  return data;
}

export async function createOperator(payload) {
  const { data } = await api.post("/admin/operators", payload);
  return data;
}

export async function listKiosks(operatorId) {
  const q = operatorId ? `?operatorId=${operatorId}` : "";
  const { data } = await api.get("/admin/kiosks" + q);
  return data;
}

export async function createKiosk(payload) {
  const { data } = await api.post("/admin/kiosks", payload);
  return data;
}

export default api;
