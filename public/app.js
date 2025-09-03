// ================== GLOBAL ==================
const API = {
  register: (body) => fetch("/api/register", postJSON(body)),
  login: (body) => fetch("/api/login", postJSON(body)),
  forgotPassword: (body) => fetch("/api/forgot-password", postJSON(body)),
  resetPassword: (token, body) => fetch(`/api/reset-password/${token}`, postJSON(body)),
  me: () => authFetch("/api/me"),

  referrals: () => authFetch("/api/user/referrals"),
  messages: () => authFetch("/api/user/messages"),

  // Transactions
  deposit: (formData) => authFetch("/api/deposits", { method: "POST", body: formData }),
  withdrawal: (body) => authFetch("/api/withdrawals", postJSON(body)),
  transactions: () => authFetch("/api/user/transactions"),

  // Investment & Trading
  plans: () => fetch("/api/investment-plans"),
  traders: () => authFetch("/api/traders"),
  copyTrades: () => authFetch("/api/user/copy-trades"),
  followTrader: (traderId) => authFetch("/api/user/follow-trader", postJSON({ traderId })),
  unfollowTrader: (traderId) => authFetch("/api/user/unfollow-trader", postJSON({ traderId })),
};

// ================== HELPERS ==================
function postJSON(body) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function authFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  if (!options.headers) options.headers = {};
  options.headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, options);
}

function formatDate(d) {
  return new Date(d).toLocaleString();
}

// ================== AUTH ==================
const Auth = {
  async register(form) {
    const res = await API.register(form);
    const data = await res.json();
    if (res.ok) localStorage.setItem("token", data.token);
    return data;
  },
  async login(form) {
    const res = await API.login(form);
    const data = await res.json();
    if (res.ok) localStorage.setItem("token", data.token);
    return data;
  },
  logout() {
    localStorage.removeItem("token");
    window.location = "/login.html";
  }
};

// ================== DASHBOARD ==================
const Dashboard = {
  async load() {
    const [userRes, refsRes, msgsRes, txRes, plansRes, tradersRes, copyRes] = await Promise.all([
      API.me(), API.referrals(), API.messages(),
      API.transactions(), API.plans(),
      API.traders(), API.copyTrades()
    ]);

    const user = await userRes.json();
    const refs = await refsRes.json();
    const msgs = await msgsRes.json();
    const txs = await txRes.json();
    const plans = await plansRes.json();
    const traders = await tradersRes.json();
    const copyTrades = await copyRes.json();

    this.renderUser(user);
    this.renderReferrals(refs);
    this.renderMessages(msgs);
    this.renderTransactions(txs);
    this.renderPlans(plans);
    this.renderTraders(traders, copyTrades);
  },

  renderUser(user) {
    document.getElementById("userName").innerText = user.name;
    document.getElementById("userEmail").innerText = user.email;
    document.getElementById("walletBalance").innerText = `$${user.walletBalance}`;
    document.getElementById("referralCode").innerText = user.referralCode;
  },

  renderReferrals(refs) {
    const list = document.getElementById("referrals");
    list.innerHTML = "";
    refs.forEach(r => {
      const li = document.createElement("li");
      li.textContent = `${r.email} (joined ${formatDate(r.createdAt)})`;
      list.appendChild(li);
    });
  },

  renderMessages(msgs) {
    const list = document.getElementById("messages");
    list.innerHTML = "";
    msgs.forEach(m => {
      const li = document.createElement("li");
      li.textContent = `${formatDate(m.createdAt)} - ${m.message}`;
      list.appendChild(li);
    });
  },

  renderTransactions(txs) {
    const table = document.getElementById("transactions");
    table.innerHTML = `
      <tr>
        <th>Date</th><th>Type</th><th>Amount</th><th>Status</th>
      </tr>
    `;
    txs.forEach(t => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatDate(t.createdAt)}</td>
        <td>${t.type}</td>
        <td>$${t.amount}</td>
        <td>${t.status}</td>
      `;
      table.appendChild(tr);
    });
  },

  renderPlans(plans) {
    const container = document.getElementById("plans");
    container.innerHTML = "";
    plans.forEach(p => {
      const div = document.createElement("div");
      div.className = "plan-card";
      div.innerHTML = `
        <h3>${p.name}</h3>
        <p>Min: $${p.minDeposit}</p>
        <p>Max: $${p.maxDeposit}</p>
        <p>Profit: ${p.profitRate}%</p>
        <button onclick="navigator.clipboard.writeText('${p.walletAddress}')">Copy Wallet Address</button>
      `;
      container.appendChild(div);
    });
  },

  renderTraders(traders, copyTrades) {
    const container = document.getElementById("traders");
    container.innerHTML = "";
    traders.forEach(t => {
      const isFollowing = copyTrades.some(ct => ct.trader === t._id);
      const div = document.createElement("div");
      div.className = "trader-card";
      div.innerHTML = `
        <h4>${t.name}</h4>
        <p>Strategy: ${t.strategy}</p>
        <p>Followers: ${t.followers}</p>
        <button onclick="Dashboard.toggleFollow('${t._id}', ${isFollowing})">
          ${isFollowing ? "Unfollow" : "Follow"}
        </button>
      `;
      container.appendChild(div);
    });
  },

  async toggleFollow(traderId, isFollowing) {
    if (isFollowing) {
      await API.unfollowTrader(traderId);
    } else {
      await API.followTrader(traderId);
    }
    this.load(); // refresh dashboard
  },

  async deposit(amount, proofFile) {
    const fd = new FormData();
    fd.append("amount", amount);
    fd.append("proof", proofFile);
    const res = await API.deposit(fd);
    return res.json();
  },

  async withdraw(amount) {
    const res = await API.withdrawal({ amount });
    return res.json();
  }
};

// ================== ON LOAD ==================
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("dashboardPage")) {
    Dashboard.load();
  }
});
