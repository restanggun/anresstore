// Read-only PostgREST counts. Never print credentials, row contents or customer data.
export function checks(now = Date.now(), mode = 'live') {
  const ago = minutes => new Date(now - minutes * 60000).toISOString();
  return [
    ['payment_unknown', 'sandbox_payments', `status=eq.unknown`, 'critical'],
    ['payment_creating_stale', 'sandbox_payments', `status=eq.creating&created_at=lt.${ago(5)}`, 'warning'],
    ['payment_pending_stale', 'sandbox_payments', `status=eq.pending&created_at=lt.${ago(60)}`, 'warning'],
    ['fulfillment_unknown', 'live_transactions', 'fulfillment_status=eq.unknown', 'critical'],
    ['fulfillment_manual_review', 'live_transactions', 'fulfillment_status=eq.manual_review', 'warning'],
    ['order_review_required', 'live_transactions', 'review_required=eq.true', 'warning'],
    ['fulfillment_dispatching_stale', 'live_transactions', `fulfillment_status=eq.dispatching&updated_at=lt.${ago(3)}`, 'critical'],
    ['fulfillment_ready_stale', 'live_transactions', `payment_status=eq.paid&fulfillment_status=eq.ready&created_at=lt.${ago(15)}`, 'warning'],
    ['fulfillment_processing_stale', 'live_transactions', `fulfillment_status=eq.processing&created_at=lt.${ago(60)}`, 'warning'],
    ['fulfillment_failed_paid', 'live_transactions', 'payment_status=eq.paid&fulfillment_status=eq.failed', 'critical'],
  ].map(([name, table, filter, severity]) => ({name, table, filter: `payment_mode=eq.${mode}&${filter}`, severity}));
}
export async function run(env = process.env, request = fetch) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const mode = env.OPERATIONS_PAYMENT_MODE || 'live';
  if (!url || !key || !['live', 'sandbox'].includes(mode) || new URL(url).protocol !== 'https:') throw new Error('Invalid monitor configuration');
  const results = [];
  for (const check of checks(Date.now(), mode)) {
    const response = await request(`${url.replace(/\/$/, '')}/rest/v1/${check.table}?select=id&${check.filter}`, {
      method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: {apikey: key, ...(key.startsWith('sb_secret_') ? {} : {Authorization: `Bearer ${key}`}), Prefer: 'count=exact', Range: '0-0'},
    });
    const count = response.headers.get('content-range')?.split('/')[1];
    if (!response.ok || !/^\d+$/.test(count || '')) throw new Error('Monitor database unavailable');
    results.push({name: check.name, count: Number(count), severity: check.severity});
  }
  return {at: new Date().toISOString(), mode, status: results.some(r => r.count > 0) ? 'attention' : 'ok', checks: results};
}
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  try { const result = await run(); console.log(JSON.stringify(result)); process.exitCode = result.status === 'ok' ? 0 : 1; }
  catch { console.error(JSON.stringify({status: 'monitor_unavailable'})); process.exitCode = 2; }
}
