// frontend/api/userApi.js
const API_BASE = "http://localhost:4000/api"; // Change to your deployed backend URL

// ================= AUTH =================
export const registerUser = async (data) => {
  return fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(res => res.json());
};

export const loginUser = async (data) => {
  return fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(res => res.json());
};

export const forgotPassword = async (email) => {
  return fetch(`${API_BASE}/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  }).then(res => res.json());
};

export const resetPassword = async (token, password) => {
  return fetch(`${API_BASE}/reset-password/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }).then(res => res.json());
};

// ================= USER PROFILE =================
export const getMe = async (token) => {
  return fetch(`${API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};

// ================= TRANSACTIONS =================
export const getUserTransactions = async (token) => {
  return fetch(`${API_BASE}/user/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};

export const makeDeposit = async (token, amount) => {
  return fetch(`${API_BASE}/deposits`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ amount }),
  }).then(res => res.json());
};

export const makeWithdrawal = async (token, amount) => {
  return fetch(`${API_BASE}/withdrawals`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ amount }),
  }).then(res => res.json());
};

// ================= REFERRALS =================
export const getUserReferrals = async (token) => {
  return fetch(`${API_BASE}/user/referrals`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};

// ================= MESSAGES =================
export const getUserMessages = async (token) => {
  return fetch(`${API_BASE}/user/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};

// ================= NOTIFICATIONS =================
export const getUserNotifications = async (token) => {
  return fetch(`${API_BASE}/user/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};

export const markNotificationRead = async (token, id) => {
  return fetch(`${API_BASE}/user/notifications/${id}/read`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};

export const markAllNotificationsRead = async (token) => {
  return fetch(`${API_BASE}/user/notifications/read-all`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};

// ================= TRADING =================
export const getTraders = async (token) => {
  return fetch(`${API_BASE}/traders`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};

export const followTrader = async (token, traderId) => {
  return fetch(`${API_BASE}/user/follow-trader`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ traderId }),
  }).then(res => res.json());
};

export const unfollowTrader = async (token, traderId) => {
  return fetch(`${API_BASE}/user/unfollow-trader`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      Authorization: `Bearer ${token}` 
    },
    body: JSON.stringify({ traderId }),
  }).then(res => res.json());
};

export const getUserCopyTrades = async (token) => {
  return fetch(`${API_BASE}/user/copy-trades`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(res => res.json());
};
