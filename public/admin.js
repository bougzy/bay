// ==================== CONFIG ====================
const API_BASE = "http://localhost:4000/api/admin"; // update if deployed
const ADMIN_USERNAME = "admin"; // load from secure storage/login
const ADMIN_PASSWORD = "admin123"; // load from secure storage/login

// ==================== Helper ====================
async function adminRequest(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "admin-username": ADMIN_USERNAME,
    "admin-password": ADMIN_PASSWORD,
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || "Request failed");
  }
  return res.json();
}

// ==================== Users ====================
async function getAllUsers() {
  return adminRequest(`/users`);
}

async function getUser(userId) {
  return adminRequest(`/users/${userId}`);
}

async function getUserTransactions(userId) {
  return adminRequest(`/users/${userId}/transactions`);
}

async function getUserDeposits(userId) {
  return adminRequest(`/users/${userId}/deposits`);
}

async function getUserWithdrawals(userId) {
  return adminRequest(`/users/${userId}/withdrawals`);
}

async function getUserProfits(userId) {
  return adminRequest(`/users/${userId}/profits`);
}

async function blockUser(userId) {
  return adminRequest(`/users/${userId}/block`, { method: "PUT" });
}

async function unblockUser(userId) {
  return adminRequest(`/users/${userId}/unblock`, { method: "PUT" });
}

// ==================== Transactions ====================
async function getTransactions(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  return adminRequest(`/transactions${query ? `?${query}` : ""}`);
}

async function approveDeposit(transactionId) {
  return adminRequest(`/transactions/${transactionId}/approve-deposit`, {
    method: "PUT",
  });
}

async function rejectDeposit(transactionId, adminNote = "") {
  return adminRequest(`/transactions/${transactionId}/reject-deposit`, {
    method: "PUT",
    body: JSON.stringify({ adminNote }),
  });
}

async function approveWithdrawal(transactionId) {
  return adminRequest(`/transactions/${transactionId}/approve-withdrawal`, {
    method: "PUT",
  });
}

async function rejectWithdrawal(transactionId, adminNote = "") {
  return adminRequest(`/transactions/${transactionId}/reject-withdrawal`, {
    method: "PUT",
    body: JSON.stringify({ adminNote }),
  });
}

async function updateUserBalance(userId, walletBalance) {
  return adminRequest(`/users/${userId}/balance`, {
    method: "PUT",
    body: JSON.stringify({ walletBalance }),
  });
}

// ==================== Profit ====================
async function addProfit(userId, amount, note = "") {
  return adminRequest(`/user/${userId}/profit`, {
    method: "PUT",
    body: JSON.stringify({ amount, note }),
  });
}

// ==================== Messaging ====================
async function sendMessage(userIds, title, content) {
  return adminRequest(`/message`, {
    method: "POST",
    body: JSON.stringify({ userIds, title, content }),
  });
}

// ==================== Trading ====================
async function createTrade(traderId, pair, type, amount) {
  return adminRequest(`/trade`, {
    method: "POST",
    body: JSON.stringify({ traderId, pair, type, amount }),
  });
}

async function executeTrade(tradeId) {
  return adminRequest(`/trade/${tradeId}/execute`, { method: "PUT" });
}

// ==================== Example ====================
// Load dashboard data on page load
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const users = await getAllUsers();
    console.log("All Users:", users);

    const pendingDeposits = await getTransactions({ type: "deposit", status: "pending" });
    console.log("Pending Deposits:", pendingDeposits);

    // TODO: replace console.log with DOM rendering in your dashboard
  } catch (err) {
    console.error("Admin API error:", err.message);
  }
});
