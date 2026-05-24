import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export function renderMarkdown(text) {
  if (!text || typeof text !== 'string') return '';
  if (text.startsWith('{') && text.includes('"iv"')) return escapeHtml(text);
  try {
    const html = marked.parse(text, { async: false });
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '');
  } catch {
    return escapeHtml(text);
  }
}

export function isProbablyMarkdown(text) {
  return /[*_`#>\[\]]/.test(text || '');
}
