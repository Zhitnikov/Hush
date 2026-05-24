function stripHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function sanitizeMessageContent(content) {
  if (content == null) return content;
  if (typeof content !== 'string') return content;
  if (content.startsWith('{') && content.includes('"iv"')) return content;
  return stripHtml(content).slice(0, 50000);
}

module.exports = { stripHtml, sanitizeMessageContent };
