#!/bin/bash
# Makes the key the Google Ads script uses to send results to the live Ads Report, without showing it:
# saves it on the live site as GOOGLE_ADS_SYNC_SECRET and copies it to the clipboard, to paste into the
# Google Ads script (scripts/google-ads-script.js) in place of PASTE_SECRET_HERE.
set -e
cd "$(dirname "$0")/.."
export PATH="/Users/lbn/Desktop/.nvm/versions/node/v22.23.3/bin:$PATH"

printf 'Make a new Google key? A new key stops a script already in Google Ads until you paste it there again (y/N): '
read -r MAKE
if [ "$MAKE" != "y" ]; then echo "Nothing changed."; exit 0; fi

SECRET=$(openssl rand -hex 32)
printf '%s' "$SECRET" | npx wrangler secret put GOOGLE_ADS_SYNC_SECRET --env=""
printf '%s' "$SECRET" | pbcopy
unset SECRET
echo "Google key saved and copied. In Google Ads, select PASTE_SECRET_HERE in the script and press Cmd+V."
