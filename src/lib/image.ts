/** 사용자가 올린 포스터 사진을 적당한 크기의 JPEG 로 줄여서 저장 공간을 아낀다. */
export async function resizeImage(file: Blob, maxSide = 1200, quality = 0.88): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있어요.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('이 사진 형식은 열 수 없어요. JPG나 PNG로 다시 시도해 주세요.');
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1_500_000 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이미지를 처리하지 못했어요.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('이미지를 처리하지 못했어요.'))), 'image/jpeg', quality),
    );
  } finally {
    bitmap.close();
  }
}
