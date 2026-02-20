#!/usr/bin/env python3
"""Watch specific 4claw threads for wallet replies and queue RTC reward requests.

Current targets:
- Dudulu on node-host thread
- Sassbot on Beacon Atlas thread

When a valid RTC-native wallet/miner ID is detected, this script posts a
queue request comment to rustchain-bounties ledger issue #104.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

API_BASE = "https://www.4claw.org/api/v1"
UA = "elyanlabs-reward-watch/1.0"
LEDGER_REPO = "Scottcjn/rustchain-bounties"
LEDGER_ISSUE = "104"


@dataclass(frozen=True)
class RewardTarget:
    thread_id: str
    author: str
    reward_rtc: float
    reason: str


TARGETS: List[RewardTarget] = [
    RewardTarget(
        thread_id="3c1e8b9d-9a39-40ae-91e6-a34c2b2ad0d8",
        author="Dudulu",
        reward_rtc=5.0,
        reason="4claw critique: node-host preflight checklist quality feedback",
    ),
    RewardTarget(
        thread_id="991e64b5-0de1-4a86-9555-be1fd394fac1",
        author="Sassbot",
        reward_rtc=5.0,
        reason="4claw critique: mechanism + falsification test pushback",
    ),
]


def load_env_file(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def fourclaw_key() -> str:
    env = load_env_file(Path(__file__).resolve().parent / ".env")
    key = env.get("FOURCLAW_API_KEY") or os.environ.get("FOURCLAW_API_KEY") or ""
    if not key:
        raise SystemExit("Missing FOURCLAW_API_KEY")
    return key


def state_path() -> Path:
    root = Path(os.environ.get("XDG_STATE_HOME") or (Path.home() / ".local" / "state"))
    p = root / "elyanlabs"
    p.mkdir(parents=True, exist_ok=True)
    return p / "fourclaw_reward_watch_state.json"


def load_state() -> Dict[str, Any]:
    p = state_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: Dict[str, Any]) -> None:
    state_path().write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")


def get_thread(session: requests.Session, headers: Dict[str, str], thread_id: str) -> Dict[str, Any]:
    r = session.get(f"{API_BASE}/threads/{thread_id}", headers=headers, timeout=20)
    r.raise_for_status()
    data = r.json()
    if not isinstance(data, dict):
        raise RuntimeError("unexpected thread payload")
    return data


def extract_wallet(text: str) -> Optional[str]:
    s = text or ""
    patterns = [
        r"(?i)\b(?:rtc\s*)?(?:wallet|miner[_\-\s]?id|address)\b\s*[:：\-]\s*`?([A-Za-z0-9_\-]{4,80})`?",
        r"(?i)\bpayout\s*id\b\s*[:：\-]\s*`?([A-Za-z0-9_\-]{4,80})`?",
    ]
    for pat in patterns:
        m = re.search(pat, s)
        if m:
            return m.group(1).strip()

    # Fallback: single-token line often used in replies after a prompt.
    lines = [ln.strip() for ln in s.splitlines() if ln.strip()]
    if len(lines) <= 3:
        for ln in lines:
            m = re.fullmatch(r"`?([A-Za-z0-9_\-]{4,80})`?", ln)
            if m:
                return m.group(1)
    return None


def wallet_looks_external(wallet: str) -> bool:
    # Heuristic from triage: long alnum/base58 likely external address.
    if re.fullmatch(r"[1-9A-HJ-NP-Za-km-z]{28,64}", wallet):
        return True
    if re.fullmatch(r"[A-Za-z0-9]{30,64}", wallet):
        return True
    return False


def post_ledger_queue_request(target: RewardTarget, wallet: str, reply_id: str, dry_run: bool) -> None:
    body = f"""### Queue Request: 4claw quality critique reward ({target.author})

Prepared payout queue item:
- Source: 4claw thread `{target.thread_id}` reply `{reply_id}`
- Recipient: `{wallet}`
- Amount: `{target.reward_rtc:g} RTC`
- Reason: `{target.reason}`

Operator command (Node1):

```bash
curl -sS -X POST http://localhost:8099/wallet/transfer \\
  -H 'Content-Type: application/json' \\
  -H \"X-Admin-Key: $RC_ADMIN_KEY\" \\
  -d '{{
    "from_miner": "founder_community",
    "to_miner": "{wallet}",
    "amount_rtc": {target.reward_rtc:g},
    "reason": "{target.reason}"
  }}'
```

After execution, post `pending_id`, `tx_hash`, and `confirms_at` here.
"""
    if dry_run:
        print("[dry-run] would post ledger queue request:\n")
        print(body)
        return

    subprocess.run(
        [
            "gh",
            "issue",
            "comment",
            LEDGER_ISSUE,
            "--repo",
            LEDGER_REPO,
            "--body",
            body,
        ],
        check=True,
    )


def main() -> int:
    dry_run = "--dry-run" in os.sys.argv
    key = fourclaw_key()
    headers = {"Authorization": f"Bearer {key}", "User-Agent": UA}
    session = requests.Session()

    state = load_state()
    state.setdefault("targets", {})

    for target in TARGETS:
        t_state = state["targets"].setdefault(
            target.thread_id,
            {
                "last_seen_reply_id": "",
                "awarded_reply_ids": [],
            },
        )

        payload = get_thread(session, headers, target.thread_id)
        replies = payload.get("replies") or []
        if not isinstance(replies, list):
            replies = []

        last_seen = t_state.get("last_seen_reply_id") or ""
        new_replies: List[Dict[str, Any]] = []
        if last_seen:
            seen = False
            for rr in replies:
                if not isinstance(rr, dict):
                    continue
                rid = str(rr.get("id") or "")
                if not rid:
                    continue
                if rid == last_seen:
                    seen = True
                    continue
                if seen:
                    new_replies.append(rr)
        else:
            # first run: don't process backlog, just set watermark
            if replies:
                t_state["last_seen_reply_id"] = str(replies[-1].get("id") or "")
            continue

        for rr in new_replies:
            rid = str(rr.get("id") or "")
            author = str(rr.get("author") or "")
            content = str(rr.get("content") or "")

            if author.lower() != target.author.lower():
                continue
            if rid in set(t_state.get("awarded_reply_ids") or []):
                continue

            wallet = extract_wallet(content)
            if not wallet:
                continue
            if wallet_looks_external(wallet):
                print(f"[{target.author}] external-looking wallet ignored: {wallet}")
                continue

            print(f"[{target.author}] wallet detected: {wallet} (reply {rid})")
            post_ledger_queue_request(target, wallet, rid, dry_run=dry_run)
            t_state.setdefault("awarded_reply_ids", []).append(rid)

        if replies:
            t_state["last_seen_reply_id"] = str(replies[-1].get("id") or t_state.get("last_seen_reply_id") or "")

    save_state(state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
