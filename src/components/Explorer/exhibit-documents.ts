import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseMessageMarkdown } from '../../app/(official)/messages/messageParser';
import { chapterIds } from './experience-content';

/** Read the actual chapters at build time; browser downloads no filesystem code. */
export async function exhibitDocuments() {
  const source = await readFile(path.join(process.cwd(), 'src/app/(official)/messages/message.md'), 'utf8');
  const chapters = parseMessageMarkdown(source).chapters;
  return chapterIds.map(id => {
    const chapter = chapters.find(item => item.id === id);
    if (!chapter) throw new Error('Missing exhibit source chapter: ' + id);
    return chapter;
  });
}
