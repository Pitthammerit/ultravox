const UMLAUT_MAP = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
  Ä: 'ae', Ö: 'oe', Ü: 'ue',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  á: 'a', à: 'a', â: 'a',
  í: 'i', ì: 'i', î: 'i',
  ó: 'o', ò: 'o', ô: 'o',
  ú: 'u', ù: 'u', û: 'u',
  ñ: 'n', ç: 'c',
};

export function slugify(input, { maxLen = 60 } = {}) {
  if (!input) return 'untitled';
  let s = String(input);
  s = s.replace(/[äöüÄÖÜßéèêëáàâíìîóòôúùûñç]/g, ch => UMLAUT_MAP[ch] ?? ch);
  s = s.normalize('NFKD').replace(/\p{Diacritic}/gu, '');
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > maxLen) {
    const cut = s.lastIndexOf('-', maxLen);
    s = (cut > maxLen / 2 ? s.slice(0, cut) : s.slice(0, maxLen)).replace(/-+$/, '');
  }
  return s || 'untitled';
}

export function datedSlug(title, date) {
  const d = date ? new Date(date) : new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${slugify(title)}`;
}
