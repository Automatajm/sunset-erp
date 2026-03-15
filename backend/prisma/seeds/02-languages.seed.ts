import { PrismaClient } from '@prisma/client';

export async function seedLanguages(prisma: PrismaClient) {
  console.log('🌍 Seeding languages...');

  const languages = [
    { code: 'en-US', name: 'English (US)', nativeName: 'English', isRtl: false },
    { code: 'es-ES', name: 'Spanish (Spain)', nativeName: 'Español', isRtl: false },
    { code: 'es-DO', name: 'Spanish (Dominican Republic)', nativeName: 'Español (RD)', isRtl: false },
    { code: 'fr-FR', name: 'French', nativeName: 'Français', isRtl: false },
  ];

  for (const language of languages) {
    await prisma.language.create({ data: language });
  }

  console.log(`   ✅ ${languages.length} languages created`);
}
