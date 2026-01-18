import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.download.upsert({
    where: {
      filename:
        'Interstellar.2014.IMAX.2160p.10bit.HDR.BluRay.6CH.x265.HEVC-PSA-761887.torrent',
    },
    update: {},
    create: {
      title: 'Interstellar (2014)',
      quality: '2160p IMAX HDR',
      filename:
        'Interstellar.2014.IMAX.2160p.10bit.HDR.BluRay.6CH.x265.HEVC-PSA-761887.torrent',
    },
  })

  console.log('✅ Seeded Interstellar download (safe)')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
