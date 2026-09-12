require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIENT_URL = process.env.CLIENT_URL || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

if (JWT_SECRET === "change-this-secret") {
  console.warn("WARNING: Change JWT_SECRET in your environment variables.");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  cors({
    origin: CLIENT_URL || true,
    credentials: true
  })
);

app.use(cookieParser());

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "2mb"
  })
);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

const publishLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false
});

app.use(generalLimiter);

function cleanString(value, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function validUsername(username) {
  return /^[A-Za-z0-9_]{3,32}$/.test(username);
}

function validDomain(domain) {
  return /^[a-z0-9][a-z0-9-]{1,30}$/.test(domain);
}

function validUrl(value) {
  try {
    const url = new URL(value);

    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

function setAuthCookie(res, token) {
  res.cookie("sennin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

function clearAuthCookie(res) {
  res.clearCookie("sennin_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.sennin_token;

    if (!token) {
      return res.status(401).json({
        error: "ログインが必要です"
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, created_at")
      .eq("id", decoded.sub)
      .maybeSingle();

    if (error || !user) {
      clearAuthCookie(res);

      return res.status(401).json({
        error: "ログイン情報が無効です"
      });
    }

    req.user = user;
    next();
  } catch {
    clearAuthCookie(res);

    return res.status(401).json({
      error: "ログイン情報が無効です"
    });
  }
}

function normalizeTargetUrl(value) {
  const url = new URL(value);

  url.hash = "";

  return url.toString();
}

function isAllowedTargetUrl(value) {
  if (!validUrl(value)) {
    return false;
  }

  const url = new URL(value);

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  ) {
    return false;
  }

  if (
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.20.") ||
    hostname.startsWith("172.21.") ||
    hostname.startsWith("172.22.") ||
    hostname.startsWith("172.23.") ||
    hostname.startsWith("172.24.") ||
    hostname.startsWith("172.25.") ||
    hostname.startsWith("172.26.") ||
    hostname.startsWith("172.27.") ||
    hostname.startsWith("172.28.") ||
    hostname.startsWith("172.29.") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.")
  ) {
    return false;
  }

  return true;
}

app.get("/api/health", async (req, res) => {
  try {
    const { error } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (error) {
      return res.status(503).json({
        ok: false,
        name: "SenninNet",
        database: "error"
      });
    }

    res.json({
      ok: true,
      name: "SenninNet",
      version: "2.0.0",
      database: "connected"
    });
  } catch {
    res.status(503).json({
      ok: false,
      name: "SenninNet",
      database: "error"
    });
  }
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const username = cleanString(req.body.username, 32);
    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    if (!validUsername(username)) {
      return res.status(400).json({
        error: "ユーザー名は3〜32文字の英数字と_のみ使用できます"
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: "パスワードは8〜128文字にしてください"
      });
    }

    const normalizedUsername = username.toLowerCase();

    const { data: existingUser, error: existingError } = await supabase
      .from("users")
      .select("id")
      .eq("username", normalizedUsername)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({
        error: "ユーザー確認に失敗しました"
      });
    }

    if (existingUser) {
      return res.status(409).json({
        error: "そのユーザー名は既に使用されています"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        username: normalizedUsername,
        password_hash: passwordHash
      })
      .select("id, username, created_at")
      .single();

    if (error) {
      return res.status(500).json({
        error: "ユーザー登録に失敗しました"
      });
    }

    const token = createToken(user);

    setAuthCookie(res, token);

    res.status(201).json({
      ok: true,
      user
    });
  } catch {
    res.status(500).json({
      error: "ユーザー登録に失敗しました"
    });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const username = cleanString(req.body.username, 32).toLowerCase();
    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    if (!validUsername(username) || password.length === 0) {
      return res.status(400).json({
        error: "ユーザー名とパスワードを入力してください"
      });
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, password_hash, created_at")
      .eq("username", username)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({
        error: "ユーザー名またはパスワードが違います"
      });
    }

    const passwordOk = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordOk) {
      return res.status(401).json({
        error: "ユーザー名またはパスワードが違います"
      });
    }

    const token = createToken(user);

    setAuthCookie(res, token);

    res.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at
      }
    });
  } catch {
    res.status(500).json({
      error: "ログインに失敗しました"
    });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearAuthCookie(res);

  res.json({
    ok: true
  });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const token = req.cookies.sennin_token;

    if (!token) {
      return res.json({
        loggedIn: false
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const { data: user } = await supabase
      .from("users")
      .select("id, username, created_at")
      .eq("id", decoded.sub)
      .maybeSingle();

    if (!user) {
      clearAuthCookie(res);

      return res.json({
        loggedIn: false
      });
    }

    res.json({
      loggedIn: true,
      user
    });
  } catch {
    clearAuthCookie(res);

    res.json({
      loggedIn: false
    });
  }
});

app.get("/api/domains/check/:domain", async (req, res) => {
  try {
    const domain = cleanString(req.params.domain, 32).toLowerCase();

    if (!validDomain(domain)) {
      return res.json({
        available: false,
        error: "使用できないドメインです"
      });
    }

    const { data } = await supabase
      .from("domains")
      .select("id")
      .eq("domain", domain)
      .maybeSingle();

    res.json({
      available: !data,
      domain
    });
  } catch {
    res.status(500).json({
      error: "ドメイン確認に失敗しました"
    });
  }
});

app.post("/api/domains", requireAuth, async (req, res) => {
  try {
    const domain = cleanString(req.body.domain, 32).toLowerCase();
    const targetUrl = cleanString(req.body.target_url, 1000);

    if (!validDomain(domain)) {
      return res.status(400).json({
        error: "ドメインは英数字とハイフンで3〜32文字にしてください"
      });
    }

    if (targetUrl && !isAllowedTargetUrl(targetUrl)) {
      return res.status(400).json({
        error: "接続先URLが無効です"
      });
    }

    const { data: existing } = await supabase
      .from("domains")
      .select("id")
      .eq("domain", domain)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        error: "そのドメインは既に取得されています"
      });
    }

    const { data: created, error } = await supabase
      .from("domains")
      .insert({
        domain,
        owner_id: req.user.id,
        target_url: targetUrl ? normalizeTargetUrl(targetUrl) : null,
        status: "active"
      })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({
        error: "ドメイン取得に失敗しました"
      });
    }

    res.status(201).json({
      ok: true,
      domain: created
    });
  } catch {
    res.status(500).json({
      error: "ドメイン取得に失敗しました"
    });
  }
});

app.get("/api/domains/mine", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("domains")
      .select("*")
      .eq("owner_id", req.user.id)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      return res.status(500).json({
        error: "ドメイン取得に失敗しました"
      });
    }

    res.json({
      domains: data || []
    });
  } catch {
    res.status(500).json({
      error: "ドメイン取得に失敗しました"
    });
  }
});

app.patch("/api/domains/:id", requireAuth, async (req, res) => {
  try {
    const id = cleanString(req.params.id, 100);
    const targetUrl = cleanString(req.body.target_url, 1000);
    const status = cleanString(req.body.status, 20);

    if (targetUrl && !isAllowedTargetUrl(targetUrl)) {
      return res.status(400).json({
        error: "接続先URLが無効です"
      });
    }

    if (!["active", "disabled"].includes(status)) {
      return res.status(400).json({
        error: "無効なステータスです"
      });
    }

    const { data, error } = await supabase
      .from("domains")
      .update({
        target_url: targetUrl
          ? normalizeTargetUrl(targetUrl)
          : null,
        status
      })
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .select("*")
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "ドメインが見つかりません"
      });
    }

    res.json({
      ok: true,
      domain: data
    });
  } catch {
    res.status(500).json({
      error: "ドメイン更新に失敗しました"
    });
  }
});

app.delete("/api/domains/:id", requireAuth, async (req, res) => {
  try {
    const id = cleanString(req.params.id, 100);

    const { error } = await supabase
      .from("domains")
      .delete()
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (error) {
      return res.status(500).json({
        error: "ドメイン削除に失敗しました"
      });
    }

    res.json({
      ok: true
    });
  } catch {
    res.status(500).json({
      error: "ドメイン削除に失敗しました"
    });
  }
});

app.post("/api/sites", requireAuth, publishLimiter, async (req, res) => {
  try {
    const title = cleanString(req.body.title, 100);
    const description = cleanString(req.body.description, 500);
    const keywords = cleanString(req.body.keywords, 300);
    const category = cleanString(req.body.category, 50);
    const domainId = cleanString(req.body.domain_id, 100);
    const html = typeof req.body.html === "string"
      ? req.body.html
      : "";
    const css = typeof req.body.css === "string"
      ? req.body.css
      : "";
    const javascript = typeof req.body.javascript === "string"
      ? req.body.javascript
      : "";

    if (!title || !html) {
      return res.status(400).json({
        error: "サイト名とHTMLは必須です"
      });
    }

    if (Buffer.byteLength(html, "utf8") > 500000) {
      return res.status(400).json({
        error: "HTMLは500KB以下にしてください"
      });
    }

    if (Buffer.byteLength(css, "utf8") > 500000) {
      return res.status(400).json({
        error: "CSSは500KB以下にしてください"
      });
    }

    if (Buffer.byteLength(javascript, "utf8") > 500000) {
      return res.status(400).json({
        error: "JavaScriptは500KB以下にしてください"
      });
    }

    if (domainId) {
      const { data: domain } = await supabase
        .from("domains")
        .select("id")
        .eq("id", domainId)
        .eq("owner_id", req.user.id)
        .maybeSingle();

      if (!domain) {
        return res.status(400).json({
          error: "指定されたドメインを使用できません"
        });
      }
    }

    const { data: site, error } = await supabase
      .from("sites")
      .insert({
        owner_id: req.user.id,
        domain_id: domainId || null,
        title,
        description,
        keywords,
        category,
        html,
        css,
        javascript,
        status: "published"
      })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({
        error: "サイト公開に失敗しました"
      });
    }

    res.status(201).json({
      ok: true,
      site
    });
  } catch {
    res.status(500).json({
      error: "サイト公開に失敗しました"
    });
  }
});

app.get("/api/sites/mine", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("sites")
      .select(`
        id,
        owner_id,
        domain_id,
        title,
        description,
        keywords,
        category,
        status,
        views,
        created_at,
        updated_at,
        domains (
          domain,
          target_url,
          status
        )
      `)
      .eq("owner_id", req.user.id)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      return res.status(500).json({
        error: "サイト取得に失敗しました"
      });
    }

    res.json({
      sites: data || []
    });
  } catch {
    res.status(500).json({
      error: "サイト取得に失敗しました"
    });
  }
});

app.patch("/api/sites/:id", requireAuth, publishLimiter, async (req, res) => {
  try {
    const id = cleanString(req.params.id, 100);

    const updates = {};

    if (typeof req.body.title === "string") {
      updates.title = cleanString(req.body.title, 100);
    }

    if (typeof req.body.description === "string") {
      updates.description = cleanString(req.body.description, 500);
    }

    if (typeof req.body.keywords === "string") {
      updates.keywords = cleanString(req.body.keywords, 300);
    }

    if (typeof req.body.category === "string") {
      updates.category = cleanString(req.body.category, 50);
    }

    if (typeof req.body.html === "string") {
      if (Buffer.byteLength(req.body.html, "utf8") > 500000) {
        return res.status(400).json({
          error: "HTMLは500KB以下にしてください"
        });
      }

      updates.html = req.body.html;
    }

    if (typeof req.body.css === "string") {
      if (Buffer.byteLength(req.body.css, "utf8") > 500000) {
        return res.status(400).json({
          error: "CSSは500KB以下にしてください"
        });
      }

      updates.css = req.body.css;
    }

    if (typeof req.body.javascript === "string") {
      if (Buffer.byteLength(req.body.javascript, "utf8") > 500000) {
        return res.status(400).json({
          error: "JavaScriptは500KB以下にしてください"
        });
      }

      updates.javascript = req.body.javascript;
    }

    if (typeof req.body.status === "string") {
      if (!["published", "private", "disabled"].includes(req.body.status)) {
        return res.status(400).json({
          error: "無効なステータスです"
        });
      }

      updates.status = req.body.status;
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("sites")
      .update(updates)
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .select("*")
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "サイトが見つかりません"
      });
    }

    res.json({
      ok: true,
      site: data
    });
  } catch {
    res.status(500).json({
      error: "サイト更新に失敗しました"
    });
  }
});

app.delete("/api/sites/:id", requireAuth, async (req, res) => {
  try {
    const id = cleanString(req.params.id, 100);

    const { error } = await supabase
      .from("sites")
      .delete()
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (error) {
      return res.status(500).json({
        error: "サイト削除に失敗しました"
      });
    }

    res.json({
      ok: true
    });
  } catch {
    res.status(500).json({
      error: "サイト削除に失敗しました"
    });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const q = cleanString(req.query.q, 100);
    const category = cleanString(req.query.category, 50);

    if (!q && !category) {
      return res.json({
        results: []
      });
    }

    let query = supabase
      .from("sites")
      .select(`
        id,
        title,
        description,
        keywords,
        category,
        views,
        created_at,
        domains (
          domain,
          target_url,
          status
        )
      `)
      .eq("status", "published")
      .limit(50);

    if (category) {
      query = query.eq("category", category);
    }

    if (q) {
      const safeQ = q.replace(/[%_]/g, "");

      query = query.or(
        `title.ilike.%${safeQ}%,description.ilike.%${safeQ}%,keywords.ilike.%${safeQ}%`
      );
    }

    const { data, error } = await query.order("views", {
      ascending: false
    });

    if (error) {
      return res.status(500).json({
        error: "検索に失敗しました"
      });
    }

    if (q) {
      await supabase
        .from("search_history")
        .insert({
          query: q,
          result_count: data ? data.length : 0
        })
        .then(() => {})
        .catch(() => {});
    }

    res.json({
      results: data || []
    });
  } catch {
    res.status(500).json({
      error: "検索に失敗しました"
    });
  }
});

app.get("/api/sites/public/:domain", async (req, res) => {
  try {
    const domain = cleanString(req.params.domain, 32).toLowerCase();

    const { data: domainData } = await supabase
      .from("domains")
      .select(`
        id,
        domain,
        owner_id,
        target_url,
        status
      `)
      .eq("domain", domain)
      .eq("status", "active")
      .maybeSingle();

    if (!domainData) {
      return res.status(404).send(`
        <!doctype html>
        <html lang="ja">
        <head>
          <meta charset="utf-8">
          <title>SenninNet - Not Found</title>
          <style>
            body {
              font-family: system-ui, sans-serif;
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: #f6f8fb;
              color: #172033;
            }
            main {
              text-align: center;
            }
          </style>
        </head>
        <body>
          <main>
            <h1>404</h1>
            <p>Senninドメインが見つかりません。</p>
          </main>
        </body>
        </html>
      `
      );
    }

    const { data: site } = await supabase
      .from("sites")
      .select(`
        id,
        title,
        description,
        html,
        css,
        javascript,
        status
      `)
      .eq("domain_id", domainData.id)
      .eq("status", "published")
      .maybeSingle();

    if (site) {
      await supabase
        .from("sites")
        .update({
          views: supabase.rpc ? undefined : undefined
        })
        .eq("id", site.id)
        .then(() => {})
        .catch(() => {});

      const html = site.html || "";
      const css = site.css || "";
      const javascript = site.javascript || "";

      const safeDocument = `
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${String(site.description || "").replace(/"/g, "&quot;")}">
<title>${String(site.title || "SenninNet").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</title>
<style>
${css}
</style>
</head>
<body>
${html}
<script>
${javascript}
</script>
</body>
</html>
`;

      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; frame-src https: data: blob:;"
      );

      return res.send(safeDocument);
    }

    if (domainData.target_url) {
      return res.redirect(domainData.target_url);
    }

    res.status(404).send(`
      <!doctype html>
      <html lang="ja">
      <head>
        <meta charset="utf-8">
        <title>SenninNet</title>
      </head>
      <body>
        <h1>SenninNet</h1>
        <p>このドメインにはまだサイトが接続されていません。</p>
      </body>
      </html>
    `);
  } catch {
    res.status(500).send("SenninNet Server Error");
  }
});

app.post("/api/bookmarks", requireAuth, async (req, res) => {
  try {
    const siteId = cleanString(req.body.site_id, 100);

    if (!siteId) {
      return res.status(400).json({
        error: "サイトIDが必要です"
      });
    }

    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("id", siteId)
      .eq("status", "published")
      .maybeSingle();

    if (!site) {
      return res.status(404).json({
        error: "サイトが見つかりません"
      });
    }

    const { data: existing } = await supabase
      .from("bookmarks")
      .select("id")
      .eq("user_id", req.user.id)
      .eq("site_id", siteId)
      .maybeSingle();

    if (existing) {
      return res.json({
        ok: true,
        bookmarked: true
      });
    }

    const { error } = await supabase
      .from("bookmarks")
      .insert({
        user_id: req.user.id,
        site_id: siteId
      });

    if (error) {
      return res.status(500).json({
        error: "ブックマーク保存に失敗しました"
      });
    }

    res.json({
      ok: true,
      bookmarked: true
    });
  } catch {
    res.status(500).json({
      error: "ブックマーク保存に失敗しました"
    });
  }
});

app.delete("/api/bookmarks/:siteId", requireAuth, async (req, res) => {
  try {
    const siteId = cleanString(req.params.siteId, 100);

    const { error } = await supabase
      .from("bookmarks")
      .delete()
      .eq("user_id", req.user.id)
      .eq("site_id", siteId);

    if (error) {
      return res.status(500).json({
        error: "ブックマーク削除に失敗しました"
      });
    }

    res.json({
      ok: true,
      bookmarked: false
    });
  } catch {
    res.status(500).json({
      error: "ブックマーク削除に失敗しました"
    });
  }
});

app.get("/api/bookmarks", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("bookmarks")
      .select(`
        id,
        created_at,
        sites (
          id,
          title,
          description,
          category,
          domains (
            domain
          )
        )
      `)
      .eq("user_id", req.user.id)
      .order("created_at", {
        ascending: false
      });

    if (error) {
      return res.status(500).json({
        error: "ブックマーク取得に失敗しました"
      });
    }

    res.json({
      bookmarks: data || []
    });
  } catch {
    res.status(500).json({
      error: "ブックマーク取得に失敗しました"
    });
  }
});

app.get("/api/stats", requireAuth, async (req, res) => {
  try {
    const { count: siteCount } = await supabase
      .from("sites")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("owner_id", req.user.id);

    const { count: domainCount } = await supabase
      .from("domains")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("owner_id", req.user.id);

    const { data: sites } = await supabase
      .from("sites")
      .select("views")
      .eq("owner_id", req.user.id);

    const totalViews = (sites || []).reduce(
      (total, site) => total + Number(site.views || 0),
      0
    );

    res.json({
      siteCount: siteCount || 0,
      domainCount: domainCount || 0,
      totalViews
    });
  } catch {
    res.status(500).json({
      error: "統計情報の取得に失敗しました"
    });
  }
});

app.use(express.static("public", {
  extensions: ["html"]
}));

app.get("*splat", (req, res) => {
  res.sendFile("index.html", {
    root: "public"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SenninNet running on port ${PORT}`);
});
