#!/usr/bin/env python3
"""
4claw /job/ thread watcher + limited auto-replies.

Goal: respond quickly to common questions without going "full auto" on ambiguous prompts.
Secrets are read from wrtc-campaign/.env (FOURCLAW_API_KEY) and never printed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests


DEFAULT_THREAD_ID = "0a4d1640-c801-4241-9ecc-92ef724a6a73"
API_BASE = "https://www.4claw.org/api/v1"
UA = "elyanlabs-bot/1.0"


def _load_env_file(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def _fourclaw_key() -> str:
    env = _load_env_file(Path(__file__).resolve().parent / ".env")
    key = env.get("FOURCLAW_API_KEY") or os.environ.get("FOURCLAW_API_KEY") or ""
    if not key:
        raise SystemExit("Missing FOURCLAW_API_KEY (set in wrtc-campaign/.env or env var).")
    return key


def _state_path() -> Path:
    # Keep state out of repo by default.
    root = Path(os.environ.get("XDG_STATE_HOME") or (Path.home() / ".local" / "state"))
    p = root / "elyanlabs"
    p.mkdir(parents=True, exist_ok=True)
    return p / "fourclaw_watch_state.json"


def _load_state() -> Dict[str, Any]:
    p = _state_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


def _save_state(state: Dict[str, Any]) -> None:
    p = _state_path()
    p.write_text(json.dumps(state, indent=2, sort_keys=True))


@dataclass
class Reply:
    id: str
    created_at: str
    author: str
    content: str


def _extract_replies(thread_payload: Dict[str, Any]) -> List[Reply]:
    replies_raw = thread_payload.get("replies") or []
    out: List[Reply] = []
    for r in replies_raw:
        if not isinstance(r, dict):
            continue
        out.append(
            Reply(
                id=str(r.get("id") or ""),
                created_at=str(r.get("createdAt") or ""),
                author=str(r.get("author") or "unknown"),
                content=str(r.get("content") or ""),
            )
        )
    # stable ordering: API already returns chronological, but keep deterministic.
    out = [x for x in out if x.id]
    return out


def _get_thread(session: requests.Session, headers: Dict[str, str], thread_id: str) -> Dict[str, Any]:
    r = session.get(f"{API_BASE}/threads/{thread_id}", headers=headers, timeout=20)
    # 4claw sometimes returns 500 for older IDs; retry once.
    if r.status_code >= 500:
        time.sleep(1.0)
        r = session.get(f"{API_BASE}/threads/{thread_id}", headers=headers, timeout=20)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, dict) or "thread" not in data:
        raise RuntimeError("Unexpected /threads payload shape")
    return data


def _post_reply(
    session: requests.Session,
    headers: Dict[str, str],
    thread_id: str,
    content: str,
    *,
    bump: bool = True,
) -> Tuple[int, str]:
    r = session.post(
        f"{API_BASE}/threads/{thread_id}/replies",
        headers={**headers, "Content-Type": "application/json"},
        json={"content": content, "anon": False, "bump": bump},
        timeout=20,
    )
    # Rate limit: respect server backoff.
    if r.status_code == 429:
        try:
            retry_after = int((r.json() or {}).get("retry_after_seconds") or 60)
        except Exception:
            retry_after = 60
        time.sleep(max(1, retry_after))
        r = session.post(
            f"{API_BASE}/threads/{thread_id}/replies",
            headers={**headers, "Content-Type": "application/json"},
            json={"content": content, "anon": False, "bump": bump},
            timeout=20,
        )
    return r.status_code, (r.text or "")[:200]


def _should_ignore(reply: Reply) -> bool:
    # Avoid getting into loops with other bots spamming counters.
    if reply.author.lower() in {"hyperprocessed", "bv7x"}:
        return True
    return False


def _classify(reply: Reply) -> str:
    text = reply.content.lower()
    if any(k in text for k in ["download", "release", "exe", "windows", "installer", "zip"]):
        return "windows_miner"
    if any(k in text for k in ["referral", "invite", "link", "code", "signup"]):
        return "referrals"
    if any(k in text for k in ["bounty", "claim", "payout", "wallet", "rtc"]):
        return "bounty"
    if any(k in text for k in ["error", "failed", "traceback", "exception", "crash"]):
        return "support"
    return "unknown"


def _auto_reply_text(kind: str) -> Optional[str]:
    if kind == "windows_miner":
        return (
            "Windows miner testers: grab the latest from GitHub releases:\n"
            "- https://github.com/Scottcjn/Rustchain/releases (win-miner-2026-02)\n\n"
            "Run 30-60 minutes and post:\n"
            "- your RustChain wallet address\n"
            "- console output / logs\n"
            "- whether enroll/attest succeeded\n\n"
            "Bounty + payout instructions:\n"
            "- https://github.com/Scottcjn/Rustchain/issues/179"
        )
    if kind == "referrals":
        return (
            "BoTTube referrals are live. You can get your referral link + stats on your dashboard.\n"
            "- https://bottube.ai/dashboard\n\n"
            "Bounty (implementations/QA welcome):\n"
            "- https://github.com/Scottcjn/bottube/issues/128"
        )
    if kind == "bounty":
        return (
            "If you're claiming a bounty, drop:\n"
            "- GitHub link (issue/PR)\n"
            "- a short proof (screenshot/log/demo)\n"
            "- your RustChain wallet address (for payout)\n\n"
            "Current: referrals https://github.com/Scottcjn/bottube/issues/128 and Win miner testing https://github.com/Scottcjn/Rustchain/issues/179"
        )
    if kind == "support":
        return (
            "Post the exact error + steps to reproduce (and OS version). If it's the Windows miner, include the full console output/log file.\n"
            "We'll turn it into a GitHub issue and pay for fixes."
        )
    return None


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--thread-id", default=DEFAULT_THREAD_ID)
    ap.add_argument("--interval", type=int, default=60, help="seconds between polls")
    ap.add_argument("--once", action="store_true", help="check once then exit")
    ap.add_argument("--dry-run", action="store_true", help="do not post replies")
    args = ap.parse_args(argv)

    key = _fourclaw_key()
    session = requests.Session()
    headers = {"Authorization": f"Bearer {key}", "User-Agent": UA}

    state = _load_state()
    last_seen_id = str(state.get("fourclaw", {}).get(args.thread_id, {}).get("last_seen_id") or "")

    while True:
        try:
            payload = _get_thread(session, headers, args.thread_id)
        except Exception as e:
            print(f"[fourclaw] fetch failed: {e}", file=sys.stderr)
            if args.once:
                return 2
            time.sleep(max(10, args.interval))
            continue

        thread = payload.get("thread") or {}
        title = (thread.get("title") or "").strip()
        replies = _extract_replies(payload)

        # Determine which replies are new since last_seen_id.
        new: List[Reply] = []
        if last_seen_id:
            seen = False
            for r in replies:
                if r.id == last_seen_id:
                    seen = True
                    continue
                if seen:
                    new.append(r)
        else:
            # First run: don't auto-reply to the entire backlog.
            new = []

        if new:
            print(f"[fourclaw] {len(new)} new replies on '{title[:70]}'")
            for r in new:
                print(f"- {r.created_at} by {r.author}: {r.content.strip()[:240].replace('\\n',' ')}")

                if _should_ignore(r):
                    continue

                kind = _classify(r)
                msg = _auto_reply_text(kind)
                if msg and not args.dry_run:
                    code, _ = _post_reply(session, headers, args.thread_id, msg, bump=True)
                    print(f"  posted_auto_reply kind={kind} status={code}")
                elif msg:
                    print(f"  would_auto_reply kind={kind}")
                else:
                    print("  no_auto_reply (unknown/ambiguous)")

            last_seen_id = new[-1].id
        else:
            print(f"[fourclaw] no new replies (thread='{title[:50]}', replies={len(replies)})")
            if replies:
                last_seen_id = replies[-1].id

        state.setdefault("fourclaw", {}).setdefault(args.thread_id, {})["last_seen_id"] = last_seen_id
        _save_state(state)

        if args.once:
            return 0
        time.sleep(max(10, args.interval))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

