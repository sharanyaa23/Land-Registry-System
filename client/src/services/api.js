import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 180000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('dlr_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('dlr_token');
      localStorage.removeItem('dlr_user');
      if (window.location.pathname !== '/') window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

/* ── Auth ────────────────────────────────────────── */
export const authAPI = {
  // User auth
  getNonce:        (walletAddress) => api.post('/auth/nonce', { walletAddress }),
  verifySignature: (data)          => api.post('/auth/verify', data),
  getMe:           ()              => api.get('/auth/me'),
  updateRole:      (role)          => api.patch('/auth/role', { role }),

  // Officer auth (separate endpoints)
  getOfficerNonce:  (walletAddress) => api.post('/auth/officer/nonce', { walletAddress }),
  verifyOfficer:    (data)          => api.post('/auth/officer/verify', data),
};

/* ── Profile ─────────────────────────────────────── */
export const profileAPI = {
  get:    ()     => api.get('/profile'),
  update: (data) => api.put('/profile', data),
  kyc:    (data) => api.post('/profile/kyc', data),
};

/* ── Land ────────────────────────────────────────── */
export const landAPI = {
  register:         (data)     => api.post('/land/register', data),
  registerExisting: (id, data) => api.post(`/land/${id}/register`, data),
  listForSale:      (id, data) => api.put(`/land/${id}/list`, data),
  delistFromSale:   (id)       => api.put(`/land/${id}/delist`),
  list:             (params)   => api.get('/land', { params }),
  search:           (params)   => api.get('/land/search', { params }),
  getById:          (id)       => api.get(`/land/${id}`),
  update:           (id, data) => api.put(`/land/${id}`, data),
  uploadDocuments:  (id, data) => api.post(`/land/${id}/upload-documents`, data),
  updateStatus:     (id, data) => api.put(`/land/${id}/status`, data),
  // Freeze status (set by officer rejection)
  getFreezeStatus:  (id)       => api.get(`/land/${id}/freeze-status`),
};

/* ── Co-Owner (nested under /land) ───────────────── */
export const coOwnerAPI = {
  add:       (landId, data)              => api.post(`/land/${landId}/coowners`, data),
  list:      (landId)                    => api.get(`/land/${landId}/coowners`),
  uploadNoc: (landId, coOwnerId, fd)     => api.post(`/land/${landId}/coowners/${coOwnerId}/noc`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  signNoc:   (landId, coOwnerId, data)   => api.put(`/land/${landId}/coowners/${coOwnerId}/sign`, data),
};

/* ── Polygon ──────────────────────────────────────── */
export const polygonAPI = {
  save:              (landId, data) => api.post(`/polygon/${landId}/polygon`, data),
  get:               (landId)       => api.get(`/polygon/${landId}/polygon`),
  validate:          (landId)       => api.post(`/polygon/${landId}/polygon/validate`),
  fromMahabhunaksha: (data)         => api.post('/polygon/from-mahabhunaksha', data),
  getBhuvanPreview:  (landId)       => api.get(`/polygon/${landId}/bhuvan-preview`),
  exportKml:         (landId)       => api.get(`/polygon/${landId}/export/kml`, { responseType: 'blob' }),
};

/* ── Transfer ────────────────────────────────────── */
export const transferAPI = {
  // Buyer actions
  createOffer:      (data)     => api.post('/transfer/offer', data),
  cancelOffer:      (id)       => api.post(`/transfer/${id}/cancel`),

  // Seller actions
  accept:           (id)       => api.post(`/transfer/${id}/accept`),
  reject:           (id)       => api.post(`/transfer/${id}/reject`),
  submitToOfficers: (id, data) => api.post(`/transfer/${id}/submit-officers`, data),

  // Co-owner actions
  coownerConsent:    (id, data) => api.post(`/transfer/${id}/coowner-consent`, data),
  getCoownerPending: ()         => api.get('/transfer/coowner-pending'),

  // Escrow
  lockFunds:        (id, data) => api.post(`/transfer/${id}/lock-funds`, data),

  // Queries
  getIncomingOffers: ()        => api.get('/transfer/incoming'),
  getMyTransfers:    ()        => api.get('/transfer/my'),
  getById:           (id)      => api.get(`/transfer/${id}`),

  // Officer decision (called after on-chain tx)
  officerDecision:  (id, data) => api.post(`/transfer/${id}/officer-decision`, data),

  // Legacy
  finalize:         (id, data) => api.post(`/transfer/${id}/finalize`, data),
};

/* ── Escrow ──────────────────────────────────────── */
export const escrowAPI = {
  getStatus:  (transferId) => api.get(`/escrow/${transferId}`),
  getHistory: (transferId) => api.get(`/escrow/${transferId}/history`),
};

/* ── IPFS ────────────────────────────────────────── */
export const ipfsAPI = {
  upload:            (formData) => api.post('/ipfs/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  extractAndCompare: (formData) => api.post('/ipfs/extract-and-compare', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getDocument:       (cid)      => api.get(`/ipfs/${cid}`),
};

/* ── Verification ────────────────────────────────── */
export const verificationAPI = {
  getResult:      (landId)   => api.get(`/verification/${landId}/result`),
  trigger:        (landId)   => api.post(`/verification/${landId}/ready`),
  // Manual document upload when auto-verification fails
  uploadDocument: (formData) => api.post('/verification/upload-document', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 min for large PDFs
  }),
};

/* ── Officer ─────────────────────────────────────── */
export const officerAPI = {
  // List all cases — backend populates land + transferRequest
  listCases: (params) => api.get('/officer/cases', { params }),
  getCaseById: (id)   => api.get(`/officer/cases/${id}`),

  // Officer approves — syncs DB after on-chain tx
  // data: { txHash, reviewId, justification }
  approve: (id, data) => api.post(`/officer/cases/${id}/approve`, data),

  // Officer rejects — syncs DB after on-chain tx  
  // data: { txHash, reviewId, reason, justification }
  reject: (id, data) => api.post(`/officer/cases/${id}/reject`, data),

  // Clear freeze on land after rejection is resolved
  // data: { txHash }
  clearFreeze: (landId, data) => api.post(`/officer/land/${landId}/clear-freeze`, data),

  // Grant seller wallet ability to register land on-chain
  addRegistrar:    (data) => api.post('/officer/registrar/add', data),
  removeRegistrar: (data) => api.post('/officer/registrar/remove', data),
};

/* ── Notifications ───────────────────────────────── */
export const notificationAPI = {
  getAll:      ()   => api.get('/notifications'),
  markRead:    (id) => api.put(`/notifications/${id}/read`),
  markAllRead: ()   => api.put('/notifications/read-all'),
};

export default api;