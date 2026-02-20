export const WRTC = Object.freeze({
  name: "Wrapped RTC",
  symbol: "wRTC",
  mint: "12TAdKXxcGf6oCv4rqDz2NkgxjyHq6HQKoxKZYGf5i4X",
  // Raydium CPMM pool (wRTC/SOL). Useful for chart links.
  raydiumPool: "8CF2Q8nSCxRacDShbtF86XTSrYjueBMKmfdR3MLdnYzb",
  decimals: 6,
});

export const LINKS = Object.freeze({
  verify: "https://rustchain.org/wrtc/",
  bridge: "https://bottube.ai/bridge",
  bottubeCredits: "https://bottube.ai/bridge/wrtc",
  raydium: `https://raydium.io/swap/?inputMint=sol&outputMint=${WRTC.mint}`,
  jupiter: `https://jup.ag/swap/SOL-${WRTC.mint}`,
  solscan: `https://solscan.io/token/${WRTC.mint}`,
  dexscreener: `https://dexscreener.com/solana/${WRTC.raydiumPool}`,
});

export function withUtm(url, { source, medium = "social", campaign = "wrtc_launch" }) {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

export function buildCampaignLinkPack(source) {
  return {
    verify: withUtm(LINKS.verify, { source }),
    bridge: withUtm(LINKS.bridge, { source }),
    bottubeCredits: withUtm(LINKS.bottubeCredits, { source }),
    raydium: LINKS.raydium,
    jupiter: LINKS.jupiter,
    solscan: LINKS.solscan,
    dexscreener: LINKS.dexscreener,
  };
}

const BASE_FACTS = [
  `Official mint: ${WRTC.mint}`,
  `Verify mint: ${LINKS.verify}`,
  `Bridge: ${LINKS.bridge}`,
];

export const VARIANTS = Object.freeze([
  {
    id: "bottube_tipping",
    title: "Use wRTC to tip creators on BoTTube (deposit/withdraw)",
    short: `BoTTube tipping is live: deposit Solana wRTC to get RTC credits, tip creators, withdraw anytime.\n\nMint: ${WRTC.mint}\nVerify: ${LINKS.verify}\nBoTTube: ${LINKS.bottubeCredits}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "If you want a simple real-usecase for wRTC:",
        "",
        "**BoTTube now supports wRTC deposits for RTC tipping credits.**",
        "",
        `- Deposit / withdraw page: ${L.bottubeCredits}`,
        "",
        "Verify the official mint before swapping:",
        `- Mint: \`${WRTC.mint}\``,
        `- Verify: ${L.verify}`,
        "",
        "Bridge / trade:",
        `- Bridge (RTC <-> wRTC): ${L.bridge}`,
        `- Raydium: ${L.raydium}`,
        `- Jupiter: ${L.jupiter}`,
        "",
        "Idea: bring wRTC to places where creators already exist, then let tips pull people back onto RustChain.",
      ].join("\n");
    },
  },
  {
    id: "launch_short_1",
    title: "wRTC is live on Solana (official mint inside)",
    short: `wRTC is live on Solana.\n\n${BASE_FACTS.join("\n")}\nSwap: ${LINKS.raydium} | ${LINKS.jupiter}\nCharts: ${LINKS.dexscreener}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "We wrapped RustChain's native token (RTC) onto Solana as **wRTC**.",
        "",
        "If you do *anything* with it, do this first:",
        "",
        `- Official wRTC mint: \`${WRTC.mint}\``,
        `- Verify it here: ${L.verify}`,
        "",
        "Links:",
        `- Bridge (RTC <-> wRTC): ${L.bridge}`,
        `- Raydium: ${L.raydium}`,
        `- Jupiter: ${L.jupiter}`,
        `- Solscan: ${L.solscan}`,
        `- Dexscreener: ${L.dexscreener}`,
        "",
        "RustChain is a Proof of Antiquity network: real hardware only (anti-VM), with higher rewards for vintage systems.",
        "",
        "What hardware would you mine on if the chain paid extra for old machines?",
      ].join("\n");
    },
  },
  {
    id: "bridge_howto",
    title: "How to bridge RTC to Solana (wRTC)",
    short: `Bridge guide: RTC <-> wRTC.\nVerify mint: ${LINKS.verify}\nBridge: ${LINKS.bridge}\nMint: ${WRTC.mint}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "Quick bridge overview for **RTC <-> wRTC (Solana)**.",
        "",
        "1. Verify the official mint (avoid fakes):",
        `   - \`${WRTC.mint}\``,
        `   - ${L.verify}`,
        "",
        "2. Bridge:",
        `   - ${L.bridge}`,
        "",
        "3. Swap (optional):",
        `   - Raydium: ${L.raydium}`,
        `   - Jupiter: ${L.jupiter}`,
        "",
        "If you want one link that always stays up to date, use the verify page above.",
        "",
        "What would you want from the bridge next: faster unlocks, a trustless design, or multi-chain (Base/Arbitrum)?",
      ].join("\n");
    },
  },
  {
    id: "why_wrap",
    title: "Why we wrapped RTC to Solana (wRTC)",
    short: `Why wRTC: easier swaps + reach.\nOfficial mint: ${WRTC.mint}\nVerify: ${LINKS.verify}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "We wrapped RTC to Solana as **wRTC** for a simple reason: the Solana DEX ecosystem makes discovery, swapping, and basic liquidity way easier.",
        "",
        "That said, mint confusion is the #1 failure mode, so here are the only two things you need:",
        "",
        `- Official mint: \`${WRTC.mint}\``,
        `- Verify page: ${L.verify}`,
        "",
        "From there:",
        `- Bridge: ${L.bridge}`,
        `- Swap: ${L.raydium} (Raydium) / ${L.jupiter} (Jupiter)`,
        "",
        "If you are into the core chain itself: RustChain is Proof of Antiquity, with anti-VM mining and bonus multipliers for vintage hardware.",
        "",
        "Would you rather see wRTC bridged to EVM next (Base/Arbitrum), or focus on mining UX first?",
      ].join("\n");
    },
  },
  {
    id: "links_only",
    title: "Official wRTC links (verify, bridge, swaps)",
    short: `Official wRTC links:\nVerify: ${LINKS.verify}\nBridge: ${LINKS.bridge}\nRaydium: ${LINKS.raydium}\nJupiter: ${LINKS.jupiter}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "**Official wRTC links** (bookmark these):",
        "",
        `- Mint: \`${WRTC.mint}\``,
        `- Verify: ${L.verify}`,
        `- Bridge: ${L.bridge}`,
        `- Raydium: ${L.raydium}`,
        `- Jupiter: ${L.jupiter}`,
        `- Solscan: ${L.solscan}`,
        `- Dexscreener: ${L.dexscreener}`,
        "",
        "If you see a different mint, it is not wRTC.",
      ].join("\n");
    },
  },
  {
    id: "miner_angle",
    title: "If you mine RTC, wRTC is the easiest way to swap on Solana",
    short: `Mining RTC? wRTC lets you bridge to Solana for swapping.\nMint: ${WRTC.mint}\nBridge: ${LINKS.bridge}\nVerify: ${LINKS.verify}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "If you are mining **RTC** on RustChain, **wRTC** is the easiest bridge into Solana liquidity (Raydium/Jupiter).",
        "",
        `- Verify mint: ${L.verify}`,
        `- Bridge: ${L.bridge}`,
        `- Mint: \`${WRTC.mint}\``,
        "",
        "RustChain context: Proof of Antiquity rewards real hardware and gives vintage systems multipliers (anti-VM).",
        "",
        "What do you care about more: price discovery (DEX), or the mining side (hardware attestation + rewards)?",
      ].join("\n");
    },
  },
  {
    id: "anti_fake_short",
    title: "Do not buy fake wRTC: verify the mint",
    short: `Do not buy fake wRTC.\nOfficial mint: ${WRTC.mint}\nVerify: ${LINKS.verify}\nSolscan: ${LINKS.solscan}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "Not advice, just operational hygiene:",
        "",
        "If you are about to swap for wRTC, verify the mint first.",
        "",
        `- Mint: \`${WRTC.mint}\``,
        `- Verify: ${L.verify}`,
        `- Solscan: ${L.solscan}`,
        "",
        "Everything else is secondary.",
      ].join("\n");
    },
  },
  {
    id: "vintage_angle",
    title: "Vintage hardware miners: we just wrapped RTC to Solana (wRTC)",
    short: `If you like weird hardware: RustChain rewards vintage machines (G4/G5/POWER) more than modern x86.\n\nwRTC (Wrapped RTC) is live on Solana.\nMint: ${WRTC.mint}\nVerify: ${LINKS.verify}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "This is a niche one, but it is real:",
        "",
        "RustChain pays *more* to old hardware. The idea is to route incentives away from cloud farms and toward machines people already own (or would otherwise scrap).",
        "",
        "To make it easier to trade/bridge, we wrapped RTC to Solana as **wRTC**.",
        "",
        "Verify before you swap:",
        `- Mint: \`${WRTC.mint}\``,
        `- Official verify page: ${L.verify}`,
        "",
        `Bridge: ${L.bridge}`,
        `Raydium: ${L.raydium}`,
        `Jupiter: ${L.jupiter}`,
        "",
        "Question for the retro crowd: what is the oldest machine you could keep online 24/7 without it driving you insane?",
      ].join("\n");
    },
  },
  {
    id: "security_angle",
    title: "wRTC on Solana: how to verify the mint and avoid fakes",
    short: `PSA: verify the wRTC mint before swapping.\nMint: ${WRTC.mint}\nVerify: ${LINKS.verify}\nSolscan: ${LINKS.solscan}`,
    long: ({ source }) => {
      const L = buildCampaignLinkPack(source);
      return [
        "PSA because fake mints are everywhere:",
        "",
        "**Official wRTC mint**",
        `\`${WRTC.mint}\``,
        "",
        "How to verify quickly:",
        `- Official page: ${L.verify}`,
        `- Solscan token page: ${L.solscan}`,
        "",
        "Trade / bridge:",
        `- Bridge: ${L.bridge}`,
        `- Raydium: ${L.raydium}`,
        `- Jupiter: ${L.jupiter}`,
        "",
        "If the mint differs, it is not wRTC.",
      ].join("\n");
    },
  },
]);

export function pickVariantByIndex(i) {
  const idx = ((i % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  return VARIANTS[idx];
}
