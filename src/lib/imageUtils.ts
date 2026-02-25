export async function convertUrlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[convertUrlToBase64]', err);
    return null;
  }
}

