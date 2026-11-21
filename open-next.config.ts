import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Defaults are right for this app: every data page is dynamic, so no incremental cache is needed.
export default defineCloudflareConfig();
