const { createDocument } = require('./document');

// @react-pdf/renderer is ESM-only here, so CommonJS loads it with import().
let loading;
const loadPdf = () => {
  loading ??= import('@react-pdf/renderer').then(pdf => {
    // Break very long unbroken words; never URLs, which wrap after `/` on their own.
    pdf.Font.registerHyphenationCallback(w => (w.length > 28 && !/[/.]/.test(w) ? w.match(/.{1,20}/g) ?? [w] : [w]));
    return pdf;
  });
  return loading;
};

async function renderPdf(resume) {
  const pdf = await loadPdf();
  return pdf.renderToBuffer(createDocument(pdf, resume));
}

module.exports = { renderPdf };
