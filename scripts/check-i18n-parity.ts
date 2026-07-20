// Asserts the DE and EN translation objects in src/lib/i18n.tsx have identical
// key shapes. `satisfies Record<Locale, unknown>` on `translations` only checks
// each locale exists, not that their keys match — this is the actual check.
// Run via `npm run check:i18n`.

function keyPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key)
  );
}

async function main() {
  const { translations } = await import('../src/lib/translations');

  const dePaths = new Set(keyPaths(translations.de));
  const enPaths = new Set(keyPaths(translations.en));

  const missingInEn = [...dePaths].filter((p) => !enPaths.has(p));
  const missingInDe = [...enPaths].filter((p) => !dePaths.has(p));

  if (missingInEn.length === 0 && missingInDe.length === 0) {
    console.log(`i18n key parity OK (${dePaths.size} keys).`);
    return;
  }

  if (missingInEn.length > 0) {
    console.error('Keys present in DE but missing in EN:');
    missingInEn.forEach((p) => console.error(`  - ${p}`));
  }
  if (missingInDe.length > 0) {
    console.error('Keys present in EN but missing in DE:');
    missingInDe.forEach((p) => console.error(`  - ${p}`));
  }
  process.exit(1);
}

main();
