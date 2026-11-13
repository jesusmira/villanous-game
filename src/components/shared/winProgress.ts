/** Convierte la etiqueta de `VillainPlugin.getWinProgress` ("✅ Foo | ❌ Bar") en pasos tipados. */
export function parseProgress(label: string | null): { done: boolean; text: string }[] {
  if (!label) return [];
  return label.split(' | ').map(item => ({
    done: item.startsWith('✅'),
    text: item.replace(/^[✅❌]\s*/, '').trim(),
  }));
}
