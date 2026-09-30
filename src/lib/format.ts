import type { ScanSource } from './ticket';

const FORMAT_LABELS: Record<string, string> = {
  qr_code: 'QR 코드',
  code_128: '바코드 · Code 128',
  code_39: '바코드 · Code 39',
  code_93: '바코드 · Code 93',
  codabar: '바코드 · Codabar',
  itf: '바코드 · ITF',
  ean_13: '바코드 · EAN-13',
  ean_8: '바코드 · EAN-8',
  upc_a: '바코드 · UPC-A',
  pdf417: 'PDF417',
  data_matrix: 'Data Matrix',
  aztec: 'Aztec',
};

export function formatLabel(format?: string): string {
  if (!format) return '직접 입력';
  return FORMAT_LABELS[format] ?? format;
}

export const SOURCE_LABELS: Record<ScanSource, string> = {
  camera: '카메라 스캔',
  image: '사진 인식',
  manual: '직접 입력',
};
