#!/bin/bash
# Saves the Jentis CMO Telegram bot token in .telegram-cmo-token on this laptop only (gitignored, never printed).
# Used by scripts/send-content-package.mjs to send KVs and captions to the owner.
set -e
cd "$(dirname "$0")/.."
printf 'Paste the CMO bot token from @BotFather, then press Enter (it stays hidden): '
read -rs TOKEN
echo
if ! [[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]]; then echo "That does not look like a Telegram bot token. Nothing saved."; exit 1; fi
umask 077
printf '%s' "$TOKEN" > .telegram-cmo-token
chmod 600 .telegram-cmo-token
echo "Saved in .telegram-cmo-token, readable only by your Mac user. You can close this tab."
