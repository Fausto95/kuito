// Use an offline document only if its file is still present.
import { fileSystem } from 'kuito';

const uri = fileSystem.cache + 'article.txt';
const article = (await fileSystem.exists(uri)) ? await fileSystem.read(uri) : null;
console.log(article ?? 'Download the article first');
