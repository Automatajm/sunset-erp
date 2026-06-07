import { PrismaClient } from '@prisma/client';

export async function seedLanguages(prisma: PrismaClient) {
  console.log('🌍 Seeding languages...');

  const languages = [
    { code: 'en-US', name: 'English (US)', nativeName: 'English', isRtl: false },
    { code: 'es-ES', name: 'Spanish (Spain)', nativeName: 'Español', isRtl: false },
    { code: 'es-DO', name: 'Spanish (Dominican Republic)', nativeName: 'Español (RD)', isRtl: false },
    { code: 'fr-FR', name: 'French', nativeName: 'Français', isRtl: false },
  ];

  // spec-028 — additive seed: upsert on the natural key so re-runs are no-ops.
  for (const language of languages) {
    await prisma.language.upsert({
      where: { code: language.code },
      update: {},
      create: language,
    });
  }

  console.log(`   ✅ ${languages.length} languages ensured`);
}
