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
export async function uploadFile(file, kioskId, onProgress) {
  const form = new FormData();
  form.append("file", file);
  if (kioskId) form.append("kioskId", kioskId);
  const { data } = await api.post("/jobs/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

// Upload multiple files in one batch.
export async function uploadFiles(files, kioskId, onProgress) {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  if (kioskId) form.append("kioskId", kioskId);
  const { data } = await api.post("/jobs/upload-multi", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function unlockJobFile(jobId, fileId, password) {
  const { data } = await api.post(`/jobs/${jobId}/file/${fileId}/unlock`, {
    password,
  });
  return data;
}

export async function configureMulti(jobId, payload) {
  const { data } = await api.post(`/jobs/${jobId}/configure-multi`, payload);
  return data;
}

export async function appendFilesToJob(jobId, files, onProgress) {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const { data } = await api.post(`/jobs/${jobId}/add-files`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });
  return data;
}

export async function deleteJobFile(jobId, fileId) {
  const { data } = await api.delete(`/jobs/${jobId}/file/${fileId}`);
  return data;
}

// Paper precheck called right before Pay & Get Code on the phone.
// Always returns 200; { ok: false, sheetsNeeded, sheetsAvailable } means show a warning.
export async function precheckPaper(jobId) {
  const { data } = await api.get(`/jobs/${jobId}/precheck-paper`);
  return data;
}

// Paper status (public read for the kiosk screen indicator).
export async function publicPaperStatus(kioskId) {
  const { data } = await api.get(`/kiosk/${kioskId}/paper-status`);
  return data;
}

// Admin paper management
export async function adminPaperGet(kioskId) {
  const { data } = await api.get(`/admin/kiosks/${kioskId}/paper`);
  return data;
}
export async function adminPaperAdd(kioskId, sheets, note) {
  const { data } = await api.post(`/admin/kiosks/${kioskId}/paper/add`, { sheets, note });
  return data;
}
export async function adminPaperSet(kioskId, sheets, note) {
  const { data } = await api.post(`/admin/kiosks/${kioskId}/paper/set`, { sheets, note });
  return data;
}
export async function adminPaperConfig(kioskId, payload) {
  const { data } = await api.put(`/admin/kiosks/${kioskId}/paper/config`, payload);
  return data;
}
export async function adminPaperHistory(kioskId, limit) {
  const { data } = await api.get(`/admin/kiosks/${kioskId}/paper/history`, { params: { limit } });
  return data;
}

// Admin reports
export async function adminReports(range, from, to) {
  const params = {};
  if (range) params.range = range;
  if (from) params.from = from;
  if (to) params.to = to;
  const { data } = await api.get(`/admin/reports`, { params });
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

export async function kioskInfo(kioskId) {
  const q = kioskId ? `?kioskId=${kioskId}` : "";
  const { data } = await api.get("/kiosk/info" + q);
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

// ---- Settings (per-kiosk; pass kioskId. For global, omit it.) ----
export async function getSettings(kioskId) {
  const q = kioskId ? `?kioskId=${kioskId}` : "";
  const { data } = await api.get("/settings" + q);
  return data;
}

export async function updateSetting(key, value, kioskId) {
  const { data } = await api.put("/settings", { key, value, kioskId });
  return data;
}

export default api;
