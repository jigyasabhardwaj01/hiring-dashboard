declare module 'pdf-parse/lib/pdf-parse.js' {
  const pdf: (data: Buffer) => Promise<{ text: string }>;
  export default pdf;
}
