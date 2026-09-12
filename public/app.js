async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? {
        "Content-Type": "application/json"
      } : {}),
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "処理に失敗しました");
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(element, message, success = false) {
  if (!element) {
    return;
  }

  element.textContent = message || "";
  element.style.color = success ? "#496a8f" : "#b33a3a";
}

async function getCurrentUser() {
  try {
    return await api("/api/auth/me");
  } catch {
    return {
      loggedIn: false
    };
  }
}

function setupSearchPage() {
  const form = document.getElementById("searchForm");

  if (!form) {
    return;
  }

  const input = document.getElementById("searchInput");
  const clearButton = document.getElementById("clearSearch");
  const resultsSection = document.getElementById("resultsSection");
  const results = document.getElementById("results");
  const resultInfo = document.getElementById("resultInfo");

  clearButton.addEventListener("click", () => {
    input.value = "";
    input.focus();
    resultsSection.classList.add("hidden");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const q = input.value.trim();

    if (!q) {
      resultsSection.classList.add("hidden");
      return;
    }

    resultsSection.classList.remove("hidden");
    results.innerHTML = `
      <div class="result-card">
        検索しています...
      </div>
    `;

    try {
      const data = await api(
        `/api/search?q=${encodeURIComponent(q)}`
      );

      resultInfo.textContent =
        `${data.results.length}件のサイトが見つかりました`;

      if (!data.results.length) {
        results.innerHTML = `
          <div class="result-card">
            <h3>検索結果がありません</h3>
            <p>別のキーワードで検索してください。</p>
          </div>
        `;
        return;
      }

      results.innerHTML = data.results.map(site => {
        const domain = site.domains?.domain;
        const target = domain
          ? `/browser.html?snn=${encodeURIComponent(domain)}`
          : "#";

        return `
          <article class="result-card">
            <div class="result-url">
              ${domain ? `snn://${escapeHtml(domain)}` : "SenninNet Site"}
            </div>
            <h3>
              <a href="${target}">
                ${escapeHtml(site.title)}
              </a>
            </h3>
            <p>${escapeHtml(site.description)}</p>
            <div class="result-meta">
              <span class="meta-pill">
                ${escapeHtml(site.category)}
              </span>
              <span class="meta-pill">
                ${Number(site.views || 0)} views
              </span>
            </div>
          </article>
        `;
      }).join("");
    } catch (error) {
      resultInfo.textContent = "";
      results.innerHTML = `
        <div class="result-card">
          <h3>検索エラー</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  });
}

function setupSettingsPage() {
  const accountStatus = document.getElementById("accountStatus");

  if (!accountStatus) {
    return;
  }

  getCurrentUser().then(data => {
    if (data.loggedIn) {
      accountStatus.textContent =
        `${data.user.username} でログイン中`;
    } else {
      accountStatus.textContent =
        "ログインしていません";
    }
  });
}

async function loadDeveloperData() {
  const stats = await api("/api/stats");

  document.getElementById("siteCount").textContent =
    stats.siteCount;

  document.getElementById("domainCount").textContent =
    stats.domainCount;

  document.getElementById("totalViews").textContent =
    stats.totalViews;
}

async function loadDomains() {
  const data = await api("/api/domains/mine");
  const list = document.getElementById("domainList");
  const select = document.getElementById("siteDomain");

  if (!list) {
    return;
  }

  if (select) {
    select.innerHTML = `
      <option value="">ドメインなし</option>
      ${(data.domains || []).map(domain => `
        <option value="${escapeHtml(domain.id)}">
          snn://${escapeHtml(domain.domain)}
        </option>
      `).join("")}
    `;
  }

  if (!data.domains.length) {
    list.innerHTML = `
      <div class="management-item">
        <p>まだSenninドメインを取得していません。</p>
      </div>
    `;
    return;
  }

  list.innerHTML = data.domains.map(domain => `
    <div class="management-item">
      <div class="management-item-top">
        <div>
          <h3>snn://${escapeHtml(domain.domain)}</h3>
          <p>
            接続先:
            ${domain.target_url
              ? escapeHtml(domain.target_url)
              : "未接続"}
          </p>
        </div>

        <span class="status-pill">
          ${escapeHtml(domain.status)}
        </span>
      </div>

      <div class="management-actions">
        <button
          data-domain-action="connect"
          data-id="${escapeHtml(domain.id)}"
          data-current="${escapeHtml(domain.target_url || "")}"
        >
          接続先を変更
        </button>

        <button
          data-domain-action="toggle"
          data-id="${escapeHtml(domain.id)}"
          data-status="${escapeHtml(domain.status)}"
        >
          ${domain.status === "active" ? "停止" : "有効化"}
        </button>

        <button
          class="danger"
          data-domain-action="delete"
          data-id="${escapeHtml(domain.id)}"
        >
          削除
        </button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-domain-action]").forEach(button => {
    button.addEventListener("click", async () => {
      const action = button.dataset.domainAction;
      const id = button.dataset.id;

      try {
        if (action === "connect") {
          const current = button.dataset.current || "";
          const target = prompt(
            "RailwayやRenderのURLを入力してください",
            current
          );

          if (target === null) {
            return;
          }

          await api(`/api/domains/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
              target_url: target,
              status: "active"
            })
          });
        }

        if (action === "toggle") {
          const currentStatus = button.dataset.status;

          await api(`/api/domains/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
              target_url: button.dataset.current || "",
              status: currentStatus === "active"
                ? "disabled"
                : "active"
            })
          });
        }

        if (action === "delete") {
          if (!confirm("このドメインを削除しますか？")) {
            return;
          }

          await api(`/api/domains/${id}`, {
            method: "DELETE"
          });
        }

        await loadDomains();
        await loadDeveloperData();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

async function loadSites() {
  const data = await api("/api/sites/mine");
  const list = document.getElementById("siteList");

  if (!list) {
    return;
  }

  if (!data.sites.length) {
    list.innerHTML = `
      <div class="management-item">
        <p>まだサイトを公開していません。</p>
      </div>
    `;
    return;
  }

  list.innerHTML = data.sites.map(site => {
    const domain = site.domains?.domain;

    return `
      <div class="management-item">
        <div class="management-item-top">
          <div>
            <h3>${escapeHtml(site.title)}</h3>
            <p>${escapeHtml(site.description)}</p>
            <p>
              ${domain
                ? `snn://${escapeHtml(domain)}`
                : "ドメインなし"}
            </p>
          </div>

          <span class="status-pill">
            ${escapeHtml(site.status)}
          </span>
        </div>

        <div class="management-actions">
          ${domain ? `
            <a
              class="secondary-button"
              href="/browser.html?snn=${encodeURIComponent(domain)}"
            >
              開く
            </a>
          ` : ""}

          <button
            data-site-action="toggle"
            data-id="${escapeHtml(site.id)}"
            data-status="${escapeHtml(site.status)}"
          >
            ${site.status === "published"
              ? "非公開"
              : "公開"}
          </button>

          <button
            class="danger"
            data-site-action="delete"
            data-id="${escapeHtml(site.id)}"
          >
            削除
          </button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-site-action]").forEach(button => {
    button.addEventListener("click", async () => {
      const action = button.dataset.siteAction;
      const id = button.dataset.id;

      try {
        if (action === "toggle") {
          const status = button.dataset.status;

          await api(`/api/sites/${id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: status === "published"
                ? "private"
                : "published"
            })
          });
        }

        if (action === "delete") {
          if (!confirm("このサイトを削除しますか？")) {
            return;
          }

          await api(`/api/sites/${id}`, {
            method: "DELETE"
          });
        }

        await loadSites();
        await loadDeveloperData();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function setupDeveloperPage() {
  const loginPanel = document.getElementById("loginPanel");

  if (!loginPanel) {
    return;
  }

  const developerContent =
    document.getElementById("developerContent");

  const loginButton =
    document.getElementById("loginButton");

  const registerButton =
    document.getElementById("registerButton");

  const logoutButton =
    document.getElementById("logoutButton");

  const authMessage =
    document.getElementById("authMessage");

  const domainInput =
    document.getElementById("domainInput");

  const domainPreview =
    document.getElementById("domainPreview");

  const checkDomainButton =
    document.getElementById("checkDomainButton");

  const getDomainButton =
    document.getElementById("getDomainButton");

  const domainMessage =
    document.getElementById("domainMessage");

  const publishButton =
    document.getElementById("publishButton");

  const publishMessage =
    document.getElementById("publishMessage");

  function showDeveloper(user) {
    loginPanel.classList.add("hidden");
    developerContent.classList.remove("hidden");

    document.getElementById("developerUser").textContent =
      `${user.username} でログイン中`;

    loadAllDeveloperData();
  }

  function showLogin() {
    loginPanel.classList.remove("hidden");
    developerContent.classList.add("hidden");
  }

  async function loadAllDeveloperData() {
    try {
      await loadDeveloperData();
      await loadDomains();
      await loadSites();
    } catch (error) {
      setMessage(authMessage, error.message);
    }
  }

  loginButton.addEventListener("click", async () => {
    const username =
      document.getElementById("loginUsername").value;

    const password =
      document.getElementById("loginPassword").value;

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username,
          password
        })
      });

      setMessage(
        authMessage,
        "ログインしました",
        true
      );

      showDeveloper(data.user);
    } catch (error) {
      setMessage(authMessage, error.message);
    }
  });

  registerButton.addEventListener("click", async () => {
    const username =
      document.getElementById("loginUsername").value;

    const password =
      document.getElementById("loginPassword").value;

    try {
      const data = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username,
          password
        })
      });

      setMessage(
        authMessage,
        "アカウントを作成しました",
        true
      );

      showDeveloper(data.user);
    } catch (error) {
      setMessage(authMessage, error.message);
    }
  });

  logoutButton.addEventListener("click", async () => {
    await api("/api/auth/logout", {
      method: "POST"
    });

    showLogin();
  });

  domainInput.addEventListener("input", () => {
    const value = domainInput.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 32);

    domainInput.value = value;
    domainPreview.textContent = value || "mysite";
  });

  checkDomainButton.addEventListener("click", async () => {
    const domain = domainInput.value.trim();

    if (!domain) {
      setMessage(
        domainMessage,
        "ドメインを入力してください"
      );
      return;
    }

    try {
      const data = await api(
        `/api/domains/check/${encodeURIComponent(domain)}`
      );

      setMessage(
        domainMessage,
        data.available
          ? `snn://${domain} は取得できます`
          : "このドメインは使用できません",
        data.available
      );
    } catch (error) {
      setMessage(domainMessage, error.message);
    }
  });

  getDomainButton.addEventListener("click", async () => {
    const domain = domainInput.value.trim();

    if (!domain) {
      setMessage(
        domainMessage,
        "ドメインを入力してください"
      );
      return;
    }

    try {
      await api("/api/domains", {
        method: "POST",
        body: JSON.stringify({
          domain
        })
      });

      setMessage(
        domainMessage,
        `snn://${domain} を取得しました`,
        true
      );

      domainInput.value = "";

      await loadDomains();
      await loadDeveloperData();
    } catch (error) {
      setMessage(domainMessage, error.message);
    }
  });

  publishButton.addEventListener("click", async () => {
    const payload = {
      title: document.getElementById("siteTitle").value,
      description:
        document.getElementById("siteDescription").value,
      keywords:
        document.getElementById("siteKeywords").value,
      category:
        document.getElementById("siteCategory").value,
      domain_id:
        document.getElementById("siteDomain").value,
      html:
        document.getElementById("siteHtml").value,
      css:
        document.getElementById("siteCss").value,
      javascript:
        document.getElementById("siteJavascript").value
    };

    try {
      const data = await api("/api/sites", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setMessage(
        publishMessage,
        "サイトを公開しました",
        true
      );

      if (data.site?.id) {
        document.getElementById("siteTitle").value = "";
        document.getElementById("siteDescription").value = "";
        document.getElementById("siteKeywords").value = "";
      }

      await loadSites();
      await loadDeveloperData();
    } catch (error) {
      setMessage(publishMessage, error.message);
    }
  });

  getCurrentUser().then(data => {
    if (data.loggedIn) {
      showDeveloper(data.user);
    } else {
      showLogin();
    }
  });
}

function setupBrowserPage() {
  const frame = document.getElementById("browserFrame");

  if (!frame) {
    return;
  }

  const address =
    document.getElementById("browserAddress");

  const info =
    document.getElementById("browserInfo");

  const go =
    document.getElementById("browserGo");

  const back =
    document.getElementById("browserBack");

  const forward =
    document.getElementById("browserForward");

  const reload =
    document.getElementById("browserReload");

  let history = [];
  let historyIndex = -1;

  function normalizeAddress(value) {
    const trimmed = value.trim();

    if (trimmed.startsWith("snn://")) {
      const domain = trimmed
        .slice(6)
        .split("/")[0]
        .toLowerCase();

      return `/api/sites/public/${encodeURIComponent(domain)}`;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }

    return `/api/sites/public/${encodeURIComponent(trimmed)}`;
  }

  function navigate(value, addHistory = true) {
    if (!value) {
      return;
    }

    const normalized = normalizeAddress(value);

    frame.src = normalized;

    address.value = value;

    info.textContent =
      value.startsWith("snn://")
        ? `Sennin Domain: ${value}`
        : `External: ${value}`;

    if (addHistory) {
      history = history.slice(0, historyIndex + 1);
      history.push(value);
      historyIndex++;
    }
  }

  go.addEventListener("click", () => {
    navigate(address.value);
  });

  address.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      navigate(address.value);
    }
  });

  back.addEventListener("click", () => {
    if (historyIndex <= 0) {
      return;
    }

    historyIndex--;
    navigate(history[historyIndex], false);
  });

  forward.addEventListener("click", () => {
    if (historyIndex >= history.length - 1) {
      return;
    }

    historyIndex++;
    navigate(history[historyIndex], false);
  });

  reload.addEventListener("click", () => {
    frame.contentWindow?.location.reload();
  });

  const params = new URLSearchParams(
    window.location.search
  );

  const snn = params.get("snn");

  if (snn) {
    navigate(`snn://${snn}`);
  } else {
    navigate("snn://senninnetwork");
  }
}

setupSearchPage();
setupSettingsPage();
setupDeveloperPage();
setupBrowserPage();
