import { authenticator } from 'otplib'
import qrcode from 'qrcode'

// One-off enrollment helper: generates a fresh TOTP secret, prints the
// otpauth:// URI as a scannable terminal QR code, and tells you what to put
// in backend/.env. Run once per admin device: `bun scripts/setup-admin-totp.ts`.

const secret = authenticator.generateSecret()
const otpauthUrl = authenticator.keyuri('admin', 'StreamVault', secret)

console.log('\nScan this QR code with Google Authenticator, Authy, 1Password, etc:\n')
console.log(await qrcode.toString(otpauthUrl, { type: 'terminal', small: true }))
console.log(`Or enter this key manually: ${secret}\n`)
console.log('Add this to backend/.env:\n')
console.log(`ADMIN_TOTP_SECRET=${secret}\n`)
