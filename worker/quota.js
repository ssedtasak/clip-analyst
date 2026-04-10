/**
 * Simple quota monitoring for Gemini API
 * Budget: ~300 THB/month (~$8.50 USD)
 * 
 * Gemini 2.5 Flash pricing (approx):
 * - Input: $0.075 per 1M tokens
 * - Output: $0.30 per 1M tokens
 * 
 * With $8.50/month budget:
 * - ~85M input tokens OR
 * - ~21M output tokens OR
 * - ~17 full video analyses (500K input + 50K output each)
 * 
 * This module tracks request count and logs warnings.
 * For persistent tracking, use Cloudflare KV.
 */

const MONTHLY_BUDGET_TOKENS = 500000; // Conservative estimate: 50 full analyses
const WARNING_THRESHOLD = 0.7; // Warn at 70% usage

// Simple in-memory tracking (resets on worker cold start)
let requestCount = 0;
let monthStart = new Date().getMonth();

// Reset on new month
function checkMonthReset() {
  const currentMonth = new Date().getMonth();
  if (currentMonth !== monthStart) {
    requestCount = 0;
    monthStart = currentMonth;
  }
}

export function getQuotaStatus() {
  checkMonthReset();
  const usage = requestCount / MONTHLY_BUDGET_TOKENS;
  const remaining = Math.max(0, MONTHLY_BUDGET_TOKENS - requestCount);
  
  return {
    used: requestCount,
    remaining,
    usagePercent: Math.round(usage * 100),
    isWarning: usage >= WARNING_THRESHOLD,
    isOverBudget: requestCount >= MONTHLY_BUDGET_TOKENS
  };
}

export function incrementQuota() {
  checkMonthReset();
  requestCount++;
  
  const status = getQuotaStatus();
  
  if (status.isOverBudget) {
    console.warn(`[QUOTA] OVER BUDGET: ${status.usagePercent}% used (${requestCount}/${MONTHLY_BUDGET_TOKENS})`);
  } else if (status.isWarning) {
    console.warn(`[QUOTA] WARNING: ${status.usagePercent}% used (${requestCount}/${MONTHLY_BUDGET_TOKENS})`);
  }
  
  return status;
}

export function formatQuotaMessage(status) {
  if (status.isOverBudget) {
    return `⚠️ Monthly quota exceeded. Used ${status.used}/${MONTHLY_BUDGET_TOKENS} analyses.`;
  }
  if (status.isWarning) {
    return `📊 Monthly quota at ${status.usagePercent}%. ${status.remaining} analyses remaining.`;
  }
  return null;
}
