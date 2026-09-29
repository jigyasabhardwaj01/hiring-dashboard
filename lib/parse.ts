export class CvParseError extends Error {}

export async function parseCv(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();
  let text = '';
  try {
    if (ext === 'pdf') {
      const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default;
      text = (await pdf(buffer)).text;
    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (ext === 'txt') {
      text = buffer.toString('utf8');
    } else {
      throw new CvParseError('Unsupported file type. Please upload a PDF or DOCX.');
    }
  } catch (e) {
    if (e instanceof CvParseError) throw e;
    throw new CvParseError(`Could not read "${filename}". The file may be corrupted or password-protected. (${(e as Error).message})`);
  }
  if (text.replace(/\s/g, '').length < 200) {
    throw new CvParseError(`"${filename}" has almost no readable text. It may be a scanned image; please upload a text-based PDF or DOCX.`);
  }
  return text;
}
