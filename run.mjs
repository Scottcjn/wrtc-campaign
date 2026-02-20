#!/usr/bin/env node
import fs from "fs";
import os from "os";
import path from "path";
import { request } from "playwright";
import {
  WRTC,
  LINKS,
  pickVariantByIndex,
  buildCampaignLinkPack,
} from "./messages.mjs";

function parseArgs(argv) {
  const out = {
    daemon: false,
    once: false,
    live: false,
    platforms: null,
    hours: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--daemon") out.daemon = true;
    else if (a === "--once") out.once = true;
    else if (a === "--live") out.live = true;
    else if (a === "--dry-run") out.live = false;
    else if (a === "--platforms") out.platforms = (argv[++i] || "").trim();
    else if (a === "--hours") out.hours = Number(argv[++i] || "");
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function localDayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseEnvFile(p) {
  const env = {};
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

function loadDotEnvIfPresent() {
  const candidates = [
    path.join(process.cwd(), "wrtc-campaign", ".env"),
    path.join(process.cwd(), ".env"),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const parsed = parseEnvFile(p);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function defaultStatePath() {
  const base = path.join(os.homedir(), ".cache", "wrtc-campaign");
  ensureDir(base);
  return path.join(base, "state.json");
}

function readJsonOr(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(p, obj) {
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

function acquireLock(lockPath) {
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, `${process.pid}\n${nowIso()}\n`);
    return fd;
  } catch {
    return null;
  }
}

function releaseLock(fd, lockPath) {
  try {
    if (fd) fs.closeSync(fd);
  } catch {}
  try {
    if (lockPath) fs.unlinkSync(lockPath);
  } catch {}
}

function buildLogger(logPath) {
  return (line) => {
    const msg = `[${nowIso()}] ${line}`;
    // eslint-disable-next-line no-console
    console.log(msg);
    if (!logPath) return;
    try {
      fs.appendFileSync(logPath, msg + "\n");
    } catch {
      // ignore
    }
  };
}

function envInt(name, def) {
  const v = process.env[name];
  if (v === undefined || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function envCsv(name, defCsv) {
  const v = (process.env[name] || defCsv || "").trim();
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function platformListFromArgsOrEnv(args) {
  const raw = (args.platforms || process.env.WRTC_PLATFORMS || "").trim();
  if (!raw) return ["moltbook", "fourclaw", "clawsta", "clawcities"];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function initPlatformState(state, platform) {
  if (!state.platforms) state.platforms = {};
  if (!state.platforms[platform]) {
    state.platforms[platform] = {
      day: localDayKey(),
      dailyCount: 0,
      lastPostAt: null,
      nextVariant: 0,
      backoffUntil: null,
      nextBoard: 0,
    };
  }
  // Backwards compat: older runs may have stored ISO timestamps here.
  const bu = state.platforms[platform].backoffUntil;
  if (typeof bu === "string") {
    const ts = Date.parse(bu);
    state.platforms[platform].backoffUntil = Number.isFinite(ts) ? ts : null;
  } else if (!Number.isFinite(bu)) {
    state.platforms[platform].backoffUntil = null;
  }
  // Reset daily counter if the day rolled over (local time)
  if (state.platforms[platform].day !== localDayKey()) {
    state.platforms[platform].day = localDayKey();
    state.platforms[platform].dailyCount = 0;
  }
  return state.platforms[platform];
}

function eligible(state, platform, cooldownMs, dailyLimit) {
  const p = initPlatformState(state, platform);
  const now = Date.now();
  if (Number.isFinite(p.backoffUntil) && now < p.backoffUntil) return { ok: false, reason: "backoff" };
  if (p.dailyCount >= dailyLimit) return { ok: false, reason: "daily_limit" };
  if (!p.lastPostAt) return { ok: true };
  const last = Date.parse(p.lastPostAt);
  if (!Number.isFinite(last)) return { ok: true };
  if (now - last < cooldownMs) return { ok: false, reason: "cooldown" };
  return { ok: true };
}

function bumpBackoff(state, platform, ms) {
  const p = initPlatformState(state, platform);
  p.backoffUntil = Date.now() + ms;
}

function markPosted(state, platform) {
  const p = initPlatformState(state, platform);
  p.lastPostAt = nowIso();
  p.dailyCount += 1;
  p.backoffUntil = null;
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    try {
      return { raw: await resp.text() };
    } catch {
      return { raw: "" };
    }
  }
}

async function postMoltbook(api, { key, submolt, title, content }) {
  const resp = await api.post("https://www.moltbook.com/api/v1/posts", {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: { title, content, submolt },
  });
  const data = await safeJson(resp);
  return { status: resp.status(), ok: resp.ok(), data };
}

async function postFourclaw(api, { key, board, title, content, anon = false }) {
  const resp = await api.post(`https://www.4claw.org/api/v1/boards/${board}/threads`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: { title, content, anon },
  });
  const data = await safeJson(resp);
  return { status: resp.status(), ok: resp.ok(), data };
}

async function postClawsta(api, { key, content }) {
  const resp = await api.post("https://clawsta.io/v1/posts", {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: { caption: content, content, imageUrl: process.env.CLAWSTA_IMAGE_URL || "https://rustchain.org/wrtc/og.png" },
  });
  const data = await safeJson(resp);
  return { status: resp.status(), ok: resp.ok(), data };
}

async function postClawCities(api, { key, site, body }) {
  const resp = await api.post(`https://clawcities.com/api/v1/sites/${site}/comments`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: { body },
  });
  const data = await safeJson(resp);
  return { status: resp.status(), ok: resp.ok(), data };
}

function renderFor(platform, variantIdx, options) {
  const source = platform;
  const v = pickVariantByIndex(variantIdx);
  const L = buildCampaignLinkPack(source);

  if (platform === "moltbook") {
    return {
      title: v.title.slice(0, 120),
      content: v.long({ source }),
    };
  }

  if (platform === "fourclaw") {
    const intro = (v.short || "")
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) || "wRTC on Solana (Wrapped RTC)";
    const lines = [
      intro,
      "",
      `Mint: ${WRTC.mint}`,
      `Verify: ${L.verify}`,
      `Bridge: ${L.bridge}`,
      `BoTTube: ${L.bottubeCredits}`,
      `Swap: ${LINKS.raydium} | ${LINKS.jupiter}`,
      `Charts: ${LINKS.dexscreener}`,
      "",
      "RustChain is Proof of Antiquity (real hardware + vintage bonuses).",
    ];
    return {
      title: v.title.slice(0, 80),
      content: lines.join("\n").trim(),
    };
  }

  if (platform === "clawsta") {
    const text = [
      (v.short || "").split("\n")[0]?.trim() || "wRTC is live on Solana.",
      `Mint: ${WRTC.mint}`,
      `Verify: ${L.verify}`,
      `Bridge: ${L.bridge}`,
      `BoTTube: ${L.bottubeCredits}`,
      `Swap: ${LINKS.raydium}`,
    ].join(" ");
    return { content: text };
  }

  if (platform === "clawcities") {
    const intro = (v.short || "").split("\n")[0]?.trim() || "wRTC on Solana.";
    const text = `${intro} Mint: ${WRTC.mint} Verify: ${L.verify} Bridge: ${L.bridge} BoTTube: ${L.bottubeCredits}`;
    return { body: text };
  }

  throw new Error(`Unknown platform: ${platform}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(
      [
        "Usage:",
        "  node wrtc-campaign/run.mjs --once [--live] [--platforms moltbook,fourclaw,...]",
        "  node wrtc-campaign/run.mjs --daemon --hours 8 --live",
        "",
        "Notes:",
        "  - Put secrets in wrtc-campaign/.env (see config.example.env).",
        "  - Default is dry-run unless WRTC_LIVE=1 or --live is provided.",
      ].join("\n")
    );
    process.exit(0);
  }

  loadDotEnvIfPresent();

  const live = args.live || (process.env.WRTC_LIVE || "") === "1";
  const statePath = (process.env.WRTC_STATE_PATH || "").trim() || defaultStatePath();
  const lockPath = `${statePath}.lock`;
  const logPath = (process.env.WRTC_LOG_PATH || "").trim() || null;
  const log = buildLogger(logPath);

  const lockFd = acquireLock(lockPath);
  if (!lockFd) {
    log(`Lock already held (${lockPath}). Exiting.`);
    process.exit(2);
  }
  process.on("exit", () => releaseLock(lockFd, lockPath));
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  const platforms = platformListFromArgsOrEnv(args);

  const cooldowns = {
    moltbook: envInt("MOLTBOOK_COOLDOWN_MIN", 31) * 60 * 1000,
    fourclaw: envInt("FOURCLAW_COOLDOWN_MIN", 60) * 60 * 1000,
    clawsta: envInt("CLAWSTA_COOLDOWN_MIN", 180) * 60 * 1000,
    clawcities: envInt("CLAWCITIES_COOLDOWN_MIN", 720) * 60 * 1000,
  };

  const dailyLimits = {
    moltbook: envInt("MOLTBOOK_DAILY_LIMIT", 4),
    fourclaw: envInt("FOURCLAW_DAILY_LIMIT", 3),
    clawsta: envInt("CLAWSTA_DAILY_LIMIT", 6),
    clawcities: envInt("CLAWCITIES_DAILY_LIMIT", 4),
  };

  const keys = {
    moltbook: (process.env.MOLTBOOK_API_KEY || "").trim(),
    fourclaw: (process.env.FOURCLAW_API_KEY || "").trim(),
    clawsta: (process.env.CLAWSTA_API_KEY || "").trim(),
    clawcities: (process.env.CLAWCITIES_API_KEY || "").trim(),
  };

  const moltbookSubmolt = (process.env.MOLTBOOK_SUBMOLT || "general").trim() || "general";
  const fourclawBoards = envCsv("FOURCLAW_BOARDS", "crypto");
  const clawcitiesSites = envCsv("CLAWCITIES_SITES", "");

  let state = readJsonOr(statePath, { version: 1, createdAt: nowIso(), platforms: {} });
  writeJson(statePath, state);

  log(`Mode: ${args.daemon ? "daemon" : "once"} | Posting: ${live ? "LIVE" : "DRY-RUN"}`);
  log(`Platforms: ${platforms.join(", ")}`);
  log(`State: ${statePath}`);

  const api = await request.newContext({
    extraHTTPHeaders: { "User-Agent": "wrtc-campaign/1.0 (Playwright request)" },
  });

  const deadline = args.daemon && Number.isFinite(args.hours) && args.hours > 0
    ? Date.now() + args.hours * 60 * 60 * 1000
    : null;

  const runOnce = async () => {
    let didPost = false;

    for (const platform of platforms) {
      if (!keys[platform]) {
        log(`Skip ${platform}: missing API key env var.`);
        continue;
      }

      const gate = eligible(state, platform, cooldowns[platform], dailyLimits[platform]);
      if (!gate.ok) {
        log(`Skip ${platform}: ${gate.reason}`);
        continue;
      }

      const pState = initPlatformState(state, platform);
      const variantIdx = pState.nextVariant || 0;
      const payload = renderFor(platform, variantIdx, {});

      if (platform === "fourclaw") {
        if (!fourclawBoards.length) {
          log("Skip fourclaw: no boards configured (FOURCLAW_BOARDS).");
          continue;
        }
        const board = fourclawBoards[pState.nextBoard % fourclawBoards.length];
        payload.board = board;
        pState.nextBoard = (pState.nextBoard || 0) + 1;
      }

      pState.nextVariant = (pState.nextVariant || 0) + 1;
      writeJson(statePath, state);

      if (!live) {
        const preview = platform === "moltbook"
          ? `title="${payload.title}" submolt="${moltbookSubmolt}"`
          : platform === "fourclaw"
            ? `board="${payload.board}" title="${payload.title}"`
            : platform === "clawcities"
              ? `sites="${clawcitiesSites.join(",") || "(none)"}"`
              : "";
        log(`DRY-RUN ${platform}: would post (${preview}).`);
        didPost = true;
        continue;
      }

      try {
        if (platform === "moltbook") {
          const r = await postMoltbook(api, {
            key: keys.moltbook,
            submolt: moltbookSubmolt,
            title: payload.title,
            content: payload.content,
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 500)}`);
          const url = r.data?.post?.url ? `https://www.moltbook.com${r.data.post.url}` : "(no url)";
          log(`POSTED moltbook: ${url}`);
          markPosted(state, "moltbook");
          didPost = true;
        } else if (platform === "fourclaw") {
          const r = await postFourclaw(api, {
            key: keys.fourclaw,
            board: payload.board,
            title: payload.title,
            content: payload.content,
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 500)}`);
          const id = r.data?.thread?.id || r.data?.id || "(no id)";
          log(`POSTED fourclaw /${payload.board}/: thread ${id}`);
          markPosted(state, "fourclaw");
          didPost = true;
        } else if (platform === "clawsta") {
          const r = await postClawsta(api, { key: keys.clawsta, content: payload.content });
          if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 500)}`);
          const id = r.data?.id || "(no id)";
          log(`POSTED clawsta: ${id}`);
          markPosted(state, "clawsta");
          didPost = true;
        } else if (platform === "clawcities") {
          if (!clawcitiesSites.length) {
            log("Skip clawcities: no sites configured (CLAWCITIES_SITES).");
            continue;
          }
          for (const site of clawcitiesSites) {
            const r = await postClawCities(api, { key: keys.clawcities, site, body: payload.body });
            if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 500)}`);
            const id = r.data?.comment?.id || r.data?.id || "(no id)";
            log(`POSTED clawcities ${site}: comment ${id}`);
            await sleep(1500);
          }
          markPosted(state, "clawcities");
          didPost = true;
        }
        writeJson(statePath, state);
      } catch (err) {
        const msg = err?.message || String(err);
        log(`ERROR ${platform}: ${msg}`);
        // Conservative backoff on any error to avoid hammering endpoints.
        bumpBackoff(state, platform, 30 * 60 * 1000);
        writeJson(statePath, state);
      }

      // Small delay between platforms to avoid looking spammy or tripping per-IP limits.
      await sleep(10_000);
    }

    return didPost;
  };

  if (!args.daemon) {
    await runOnce();
    await api.dispose();
    releaseLock(lockFd, lockPath);
    return;
  }

  while (true) {
    if (deadline && Date.now() > deadline) {
      log("Daemon window reached (--hours). Exiting.");
      break;
    }
    const did = await runOnce();
    // If we posted, wait a bit longer; if not, poll sooner.
    const waitMs = did ? 90_000 : 45_000;
    await sleep(waitMs);
    state = readJsonOr(statePath, state);
  }

  await api.dispose();
  releaseLock(lockFd, lockPath);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
