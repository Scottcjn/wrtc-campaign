# wRTC Campaign Autoposter (Playwright)

[![BCOS Certified](https://img.shields.io/badge/BCOS-Certified-brightgreen?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0xMiAxTDMgNXY2YzAgNS41NSAzLjg0IDEwLjc0IDkgMTIgNS4xNi0xLjI2IDktNi40NSA5LTEyVjVsLTktNHptLTIgMTZsLTQtNCA1LjQxLTUuNDEgMS40MSAxLjQxTDEwIDE0bDYtNiAxLjQxIDEuNDFMMTAgMTd6Ii8+PC9zdmc+)](BCOS.md)
Posts the wRTC launch info to multiple platforms using Playwright's HTTP client (`playwright.request`) so it can run headless, unattended, and on a schedule.

Targets included:
- Moltbook (post)
- 4claw (thread)
- Clawsta (post)
- ClawCities (guestbook comment)

Manual drafts (for sites that are hard to automate without breaking rules/ToS) live in `wrtc-campaign/drafts/`.

## Setup

1. Create `wrtc-campaign/.env`:

```bash
cp wrtc-campaign/config.example.env wrtc-campaign/.env
```

2. Edit `wrtc-campaign/.env` and fill keys for the platforms you want.

Notes:
- Leave a platform key blank to disable that platform.
- Keep `WRTC_LIVE=0` until you are ready.

## Run Once (Dry Run)

```bash
node wrtc-campaign/run.mjs --once
```

## Run Once (Live Posting)

```bash
WRTC_LIVE=1 node wrtc-campaign/run.mjs --once --live
```

## Run Overnight (Daemon)

Runs for 8 hours, respecting cooldowns and daily caps in `.env`:

```bash
WRTC_LIVE=1 nohup node wrtc-campaign/run.mjs --daemon --hours 8 --live >> /tmp/wrtc_campaign.log 2>&1 &
```

State is stored in `~/.cache/wrtc-campaign/state.json` by default so the script can resume without duplicating.

## Optional: systemd (User)

Unit files are in `wrtc-campaign/systemd/`.

```bash
mkdir -p ~/.config/systemd/user
cp -f wrtc-campaign/systemd/wrtc-campaign.* ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now wrtc-campaign.timer
```

The service reads keys from `/home/scott/wrtc-campaign/.env` via `EnvironmentFile=...` and writes logs to `/tmp/wrtc_campaign.log`.

## Platform Notes

- Moltbook: configured for `MOLTBOOK_SUBMOLT=general` by default. The script posts at most one Moltbook post per `MOLTBOOK_COOLDOWN_MIN` and stops at `MOLTBOOK_DAILY_LIMIT`.
- 4claw: rotates boards from `FOURCLAW_BOARDS` and posts one thread when eligible.
- Clawsta: requires an `imageUrl` (set `CLAWSTA_IMAGE_URL` or it will default to `https://rustchain.org/wrtc/og.png`).
- ClawCities: posts the same short comment to each site in `CLAWCITIES_SITES`.

## Safety

- This is designed for your agent accounts and API keys. Do not automate Scott's human accounts.
- The script defaults to dry-run unless `WRTC_LIVE=1` or `--live` is used.
