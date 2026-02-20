#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { request } from "playwright";

function parseArgs(argv) {
  const out = {
    platforms: "",
    live: false,
    fourclawBoard: "",
    fourclawTitle: "",
    fourclawAnon: false,
    content: "",
    clawcitiesSites: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--platforms") out.platforms = (argv[++i] || "").trim();
    else if (a === "--live") out.live = true;
    else if (a === "--fourclaw-board") out.fourclawBoard = (argv[++i] || "").trim();
    else if (a === "--fourclaw-title") out.fourclawTitle = (argv[++i] || "").trim();
    else if (a === "--fourclaw-anon") out.fourclawAnon = true;
    else if (a === "--content") out.content = (argv[++i] || "").trim();
    else if (a === "--clawcities-sites") out.clawcitiesSites = (argv[++i] || "").trim();
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
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

function loadDotEnv() {
  const p = path.join(process.cwd(), "wrtc-campaign", ".env");
  if (!fs.existsSync(p)) return;
  const parsed = parseEnvFile(p);
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function csv(v) {
  const t = (v || "").trim();
  if (!t) return [];
  return t.split(",").map((s) => s.trim()).filter(Boolean);
}

async function postFourclaw(api, { key, board, title, content, anon = false }) {
  const resp = await api.post(`https://www.4claw.org/api/v1/boards/${board}/threads`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: { title, content, anon },
  });
  return { ok: resp.ok(), status: resp.status(), data: await resp.json().catch(() => ({})) };
}

async function postClawsta(api, { key, content }) {
  const resp = await api.post("https://clawsta.io/v1/posts", {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: { caption: content, content, imageUrl: process.env.CLAWSTA_IMAGE_URL || "https://rustchain.org/wrtc/og.png" },
  });
  return { ok: resp.ok(), status: resp.status(), data: await resp.json().catch(() => ({})) };
}

async function postClawCities(api, { key, site, body }) {
  const resp = await api.post(`https://clawcities.com/api/v1/sites/${site}/comments`, {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: { body },
  });
  return { ok: resp.ok(), status: resp.status(), data: await resp.json().catch(() => ({})) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.platforms || !args.content) {
    // eslint-disable-next-line no-console
    console.log(
      [
        "Usage:",
        "  node wrtc-campaign/post_custom.mjs --platforms fourclaw,clawsta,clawcities --content \"...\" --live",
        "",
        "Options:",
        "  --fourclaw-board crypto",
        "  --fourclaw-title \"Title\"",
        "  --fourclaw-anon",
        "  --clawcities-sites site1,site2   (defaults to CLAWCITIES_SITES from .env)",
      ].join("\n")
    );
    process.exit(args.help ? 0 : 2);
  }

  loadDotEnv();
  const live = args.live || (process.env.WRTC_LIVE || "") === "1";
  if (!live) {
    throw new Error("Refusing to post without --live (or WRTC_LIVE=1).");
  }

  const platforms = csv(args.platforms.toLowerCase());
  const api = await request.newContext({
    extraHTTPHeaders: { "User-Agent": "wrtc-campaign/custom (Playwright request)" },
  });

  for (const p of platforms) {
    if (p === "fourclaw") {
      const key = (process.env.FOURCLAW_API_KEY || "").trim();
      if (!key) throw new Error("Missing FOURCLAW_API_KEY in .env");
      const board = (args.fourclawBoard || process.env.FOURCLAW_BOARD || "crypto").trim();
      const title = (args.fourclawTitle || "BCOS + BoTTube referrals + Windows miner testers").trim();
      const r = await postFourclaw(api, { key, board, title, content: args.content, anon: args.fourclawAnon });
      if (!r.ok) throw new Error(`fourclaw HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
      // eslint-disable-next-line no-console
      console.log(`[fourclaw] posted thread ${(r.data?.thread?.id || r.data?.id || "(no id)")}`);
    } else if (p === "clawsta") {
      const key = (process.env.CLAWSTA_API_KEY || "").trim();
      if (!key) throw new Error("Missing CLAWSTA_API_KEY in .env");
      const r = await postClawsta(api, { key, content: args.content });
      if (!r.ok) throw new Error(`clawsta HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
      // eslint-disable-next-line no-console
      console.log(`[clawsta] posted ${(r.data?.id || "(no id)")}`);
    } else if (p === "clawcities") {
      const key = (process.env.CLAWCITIES_API_KEY || "").trim();
      if (!key) throw new Error("Missing CLAWCITIES_API_KEY in .env");
      const sites = csv(args.clawcitiesSites || process.env.CLAWCITIES_SITES || "");
      if (!sites.length) throw new Error("No ClawCities sites configured (CLAWCITIES_SITES or --clawcities-sites).");
      for (const site of sites) {
        const r = await postClawCities(api, { key, site, body: args.content });
        if (!r.ok) throw new Error(`clawcities(${site}) HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
        // eslint-disable-next-line no-console
        console.log(`[clawcities] posted ${site} ${(r.data?.comment?.id || r.data?.id || "(no id)")}`);
      }
    } else {
      throw new Error(`Unknown platform: ${p}`);
    }
  }

  await api.dispose();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e?.message || String(e));
  process.exit(1);
});

