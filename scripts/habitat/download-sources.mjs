/** Optional authoring setup; never called by the website or its build. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory=path.resolve(process.argv[2]??'../habitat-source-materials');
const manifest=JSON.parse(await readFile(new URL('./source-assets.json',import.meta.url),'utf8'));
const digest=(bytes,algorithm)=>createHash(algorithm).update(bytes).digest('hex');
for(const asset of manifest.assets){
  const target=path.resolve(directory,asset.file);
  if(!target.startsWith(directory+path.sep))throw new Error('Authoring path escapes destination');
  const algorithm=asset.sha256?'sha256':'md5',expected=asset[algorithm];
  let bytes;try{bytes=await readFile(target);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(bytes&&digest(bytes,algorithm)===expected){console.log('Verified '+asset.file);continue;}
  if(bytes)throw new Error('Existing source differs from its recorded checksum: '+asset.file);
  const url=new URL(asset.url);
  if(url.protocol!=='https:'||!['dl.polyhaven.org','assets.science.nasa.gov'].includes(url.hostname))throw new Error('Unexpected source host');
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error('Source download failed: '+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
  if(digest(bytes,algorithm)!==expected)throw new Error('Downloaded source checksum mismatch: '+asset.file);
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);
  console.log('Downloaded and verified '+asset.file);
}
