// Paste this into Google Ads → Tools → Bulk actions → Scripts, and schedule it Hourly.
// It only READS campaign results and sends them to jentiskitchen.id for the Ads Report. It cannot change ads or budgets.
// Replace PASTE_SECRET_HERE with the value scripts/save-google-ads-secret.sh copied to your clipboard.
var SYNC_URL = 'https://jentiskitchen.id/shop/api/google-ads-sync';
var SYNC_SECRET = 'PASTE_SECRET_HERE';
var DAYS = 14; // Google keeps adjusting recent days, so each run re-sends this many.

function main() {
  var zone = AdsApp.currentAccount().getTimeZone();
  var format = function (d) { return Utilities.formatDate(d, zone, 'yyyy-MM-dd'); };
  var today = new Date();
  var since = new Date(today.getTime() - DAYS * 24 * 3600 * 1000);
  var report = AdsApp.search(
    'SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, ' +
    'metrics.conversions, metrics.conversions_value FROM campaign ' +
    "WHERE segments.date BETWEEN '" + format(since) + "' AND '" + format(today) + "'"
  );
  var rows = [];
  while (report.hasNext()) {
    var r = report.next();
    rows.push({
      date: r.segments.date,
      campaignId: String(r.campaign.id),
      campaignName: r.campaign.name,
      costMicros: Number(r.metrics.costMicros || 0),
      impressions: Number(r.metrics.impressions || 0),
      clicks: Number(r.metrics.clicks || 0),
      conversions: Number(r.metrics.conversions || 0),
      conversionValue: Number(r.metrics.conversionsValue || 0)
    });
  }
  var response = UrlFetchApp.fetch(SYNC_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': SYNC_SECRET },
    payload: JSON.stringify({ rows: rows }),
    muteHttpExceptions: true
  });
  Logger.log('Sent ' + rows.length + ' rows: HTTP ' + response.getResponseCode() + ' ' + response.getContentText());
  if (response.getResponseCode() !== 200) throw new Error('jentiskitchen.id refused the data: ' + response.getResponseCode());
}
