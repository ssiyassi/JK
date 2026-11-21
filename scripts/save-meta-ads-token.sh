#!/bin/bash
# Saves the Meta "create ads" token (system user Jentis Reports, ads_management) in .meta-ads-token on this laptop
# only: never in git (see .gitignore), never on the website. Used by the campaign helper script, never printed.
set -e
cd "$(dirname "$0")/.."
printf 'Paste the Meta token, then press Enter (it stays hidden): '
read -rs TOKEN
echo
if [ ${#TOKEN} -lt 50 ]; then echo "That does not look like a full token (too short). Nothing saved."; exit 1; fi
umask 077
printf '%s' "$TOKEN" > .meta-ads-token
chmod 600 .meta-ads-token
echo "Saved (${#TOKEN} characters) in .meta-ads-token, readable only by your Mac user."
