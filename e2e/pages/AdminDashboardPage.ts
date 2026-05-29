import { type Page, type Locator, expect } from '@playwright/test'
import { BasePage } from './BasePage'

export class AdminDashboardPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  async goto() {
    await this.page.addInitScript(() => {
      window.localStorage.setItem('adminToken', 'mock-admin-jwt-token-v2')
    })
    await super.goto('/admin/dashboard')
    await this.waitForAppMount()
  }

  // ─── Requests Table ───────────────────────────────────────────────────────

  get requestRows(): Locator {
    return this.page.locator('tr:has(td), [data-testid*="request-row"]').filter({ hasText: /@/ })
  }

  get firstRequestRow(): Locator {
    return this.requestRows.first()
  }

  rowByEmail(email: string): Locator {
    return this.page.locator(`td:has-text("${email}")`).first()
  }

  statusBadge(status: 'PENDING' | 'APPROVED' | 'REJECTED'): Locator {
    return this.page.locator(`div:has-text("${status}"), span:has-text("${status}")`).first()
  }

  // ─── Action Buttons ───────────────────────────────────────────────────────

  /** First green Approve button in the table */
  get firstApproveButton(): Locator {
    return this.page.locator('button.bg-green-600, button[aria-label*="Approve"], button:has-text("Approve")').first()
  }

  /** First red Reject button in the table */
  get firstRejectButton(): Locator {
    return this.page.locator('button.bg-red-600, button[aria-label*="Reject"], button:has-text("Reject")').first()
  }

  async approveFirstRequest() {
    await expect(this.firstApproveButton).toBeVisible({ timeout: 10_000 })
    await this.firstApproveButton.click()
  }

  async rejectFirstRequest() {
    await expect(this.firstRejectButton).toBeVisible({ timeout: 10_000 })
    await this.firstRejectButton.click()
  }

  // ─── Feedback Toast ───────────────────────────────────────────────────────

  get successToast(): Locator {
    return this.page.getByText(/Approved|processed|success/i).first()
  }

  get rejectToast(): Locator {
    return this.page.getByText(/Rejected|declined/i).first()
  }

  // ─── Dashboard Stats ──────────────────────────────────────────────────────

  get statsCards(): Locator {
    return this.page.locator('[class*="stat"], [data-testid*="stat"], [class*="metric"]')
  }
}
