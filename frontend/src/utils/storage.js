const STORAGE_KEY = 'carbonlens:profile';

export function getStoredProfile() {
  if (typeof window === 'undefined') return { gmailEmail: '', outlookEmail: '' };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { gmailEmail: '', outlookEmail: '' };
    const parsed = JSON.parse(raw);
    return {
      gmailEmail: parsed.gmailEmail || '',
      outlookEmail: parsed.outlookEmail || '',
    };
  } catch (error) {
    console.warn('Failed to parse stored profile', error);
    return { gmailEmail: '', outlookEmail: '' };
  }
}

export function setStoredProfile({ gmailEmail, outlookEmail }) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ gmailEmail: gmailEmail || '', outlookEmail: outlookEmail || '' })
  );
}
