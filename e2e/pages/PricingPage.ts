import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class PricingPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async goto() {
    await super.goto('/pricing')
    await this.waitForAppMount()
  }

  // ─── Heading ─────────────────────────────────────────────────────────────

  get pageHeading(): Locator {
    return this.page.locator('h1').first()
  }

  // ─── Plan Cards ───────────────────────────────────────────────────────────

  get planCards(): Locator {
    return this.page.locator('[data-testid*="plan"], [class*="plan"], h2:has-text("Premium"), h2:has-text("Basic"), h2:has-text("Family")').filter({ hasText: /plan|premium|basic|family|₹|INR/i })
  }

  get premiumPlanCard(): Locator {
    return this.page.locator('h2:has-text("Premium"), [aria-label*="Premium"], [data-testid="plan-premium"]').first()
  }

  get basicPlanCard(): Locator {
    return this.page.locator('h2:has-text("Basic"), [aria-label*="Basic"], [data-testid="plan-basic"]').first()
  }

  // ─── CTAs ─────────────────────────────────────────────────────────────────

  get subscribeButtons(): Locator {
    return this.page.locator('button:has-text("Pay via"), button:has-text("Subscribe"), button:has-text("Get Started"), button:has-text("Choose Plan")')
  }

  get firstSubscribeButton(): Locator {
    return this.subscribeButtons.first()
  }

  // ─── Error / Fallback State ───────────────────────────────────────────────

  get errorState(): Locator {
    return this.page.locator('text=Unable to load, text=Failed to fetch, button:has-text("Retry")').first()
  }

  get retryButton(): Locator {
    return this.page.locator('button:has-text("Retry")').first()
  }

  // ─── Plan Features List ───────────────────────────────────────────────────

  get featureItems(): Locator {
    return this.page.locator('li:has-text("Streaming"), li:has-text("Screen"), li:has-text("Download")').first()
  }

  // ─── FAQ Section ──────────────────────────────────────────────────────────

  get faqSection(): Locator {
    return this.page.locator('section:has-text("FAQ"), [class*="faq"], h2:has-text("FAQ"), h2:has-text("Frequently")').first()
  }
}
