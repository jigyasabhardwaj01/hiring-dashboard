import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { CvParseError, parseCv } from '@/lib/parse';
import { extractCv } from '@/lib/extract';
import { sample } from './helpers';

async function makeDocx(text: string) {
  const JSZip = (await import('jszip')).default;
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  z.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split('\n').map((l) => `<w:p><w:r><w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}

describe('parseCv', () => {
  it('reads a real PDF and the result still de-identifies', async () => {
    const text = await parseCv(fs.readFileSync(path.join(__dirname, 'fixtures/aisha.pdf')), 'aisha.pdf');
    expect(text).toContain('Lumen Payments');
    const cv = extractCv(text);
    expect(cv.name).toBe('Aisha Rahman');
    expect(cv.sanitized.toLowerCase()).not.toContain('aisha');
  });
  it('reads a DOCX', async () => {
    const text = await parseCv(await makeDocx(sample('daniel-okafor.txt')), 'd.docx');
    expect(extractCv(text).name).toBe('Daniel Okafor');
  });
  it('REGRESSION: a PDF still parses after a DOCX was parsed in the same process', async () => {
    await parseCv(await makeDocx(sample('daniel-okafor.txt')), 'd.docx');
    const text = await parseCv(fs.readFileSync(path.join(__dirname, 'fixtures/aisha.pdf')), 'aisha.pdf');
    expect(text).toContain('Lumen Payments');
  });
  it('REGRESSION: parses several different PDFs / DOCX / PDFs in a row', async () => {
    const pdf = fs.readFileSync(path.join(__dirname, 'fixtures/aisha.pdf'));
    for (let i = 0; i < 3; i++) {
      expect(await parseCv(pdf, 'a.pdf')).toContain('Lumen Payments');
      expect(await parseCv(await makeDocx(sample('mei-lin-zhou.txt')), 'm.docx')).toContain('Ledgerly');
    }
  });
  it('reads plain text', async () => {
    expect(await parseCv(Buffer.from(sample('mei-lin-zhou.txt')), 'm.txt')).toContain('Ledgerly');
  });
  it('rejects corrupt PDFs, unsupported types and near-empty files with readable errors', async () => {
    await expect(parseCv(Buffer.from('hello'), 'x.pdf')).rejects.toThrow(CvParseError);
    await expect(parseCv(Buffer.from('hello'), 'x.pdf')).rejects.toThrow(/corrupted|password/);
    await expect(parseCv(Buffer.from('x'), 'x.exe')).rejects.toThrow(/Unsupported/);
    await expect(parseCv(Buffer.from('short'), 'x.txt')).rejects.toThrow(/scanned|readable/);
  });
});
