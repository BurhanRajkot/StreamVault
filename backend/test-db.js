const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function test() {
  // create user if not exists
  const user = await prisma.user.upsert({
    where: { id: 'auth0|test-user-123' },
    update: {},
    create: {
      id: 'auth0|test-user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
  })

  console.log('User:', user)

  // add favorite
  const favorite = await prisma.favorite.create({
    data: {
      userId: user.id,
      tmdbId: 550,
      mediaType: 'movie',
    },
  })

  console.log('Favorite:', favorite)

  // fetch favorites
  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
  })

  console.log('Favorites list:', favorites)
}

test()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
