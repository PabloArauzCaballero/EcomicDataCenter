import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const maximumInputBytes = 5_000_000;
const maximumPages = 100;
const maximumTextCharacters = 1_000_000;
const maximumMetadataCharacters = 500;

function metadataString(info, key) {
  const value = info?.[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, maximumMetadataCharacters);
  return normalized || undefined;
}

async function readStandardInput() {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    totalBytes += chunk.length;
    if (totalBytes > maximumInputBytes) throw new Error('PDF input exceeds the byte limit');
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks, totalBytes));
}

function itemText(item) {
  return typeof item === 'object' && item !== null && typeof item.str === 'string' ? item.str : '';
}

async function main() {
  const data = await readStandardInput();
  const loadingTask = getDocument({
    data,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
  });
  try {
    const document = await loadingTask.promise;
    if (document.numPages > maximumPages) throw new Error('PDF exceeds the page limit');
    const { info } = await document.getMetadata();
    const pages = [];
    let totalCharacters = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(itemText).filter(Boolean).join(' ');
      totalCharacters += text.length;
      if (totalCharacters > maximumTextCharacters) throw new Error('PDF text exceeds the limit');
      pages.push(text);
      page.cleanup();
    }
    process.stdout.write(
      JSON.stringify({
        text: pages.join('\n'),
        metadata: {
          title: metadataString(info, 'Title'),
          author: metadataString(info, 'Author'),
          creator: metadataString(info, 'Creator'),
          producer: metadataString(info, 'Producer'),
          creationDate: metadataString(info, 'CreationDate'),
          modificationDate: metadataString(info, 'ModDate'),
        },
      }),
    );
  } finally {
    await loadingTask.destroy();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message.slice(0, 500)}\n`);
  process.exitCode = 1;
});
