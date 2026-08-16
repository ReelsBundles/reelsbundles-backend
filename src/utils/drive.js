/**
 * Google Drive Helper
 * Production Version
 */

export function extractFileId(input) {
  if (!input) return null;

  const value = input.trim();

  // Already File ID
  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) {
    return value;
  }

  const patterns = [
    /\/file\/d\/([A-Za-z0-9_-]+)/,
    /id=([A-Za-z0-9_-]+)/,
    /\/folders\/([A-Za-z0-9_-]+)/,
    /\/d\/([A-Za-z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

export function isValidFileId(fileId) {
  return /^[A-Za-z0-9_-]{20,}$/.test(fileId);
}

export function createViewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function createDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export function createPreviewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}