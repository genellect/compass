import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import terser from 'next/dist/compiled/terser/bundle.min.js';

const folder='public/habitat/explorer/v1';
const manifest=JSON.parse(await readFile(folder+'/manifest.json','utf8'));
const firstFiles=['manifest.json','navigation.json','concourse.glb','room-shell.glb','signs.glb','exhibits.glb','iss-horizon.webp'];
const delivery=[];
for(const directory of [folder,'public/media/explorer/audio'])for(const name of await readdir(directory)){
  const file=directory+'/'+name;if(!(await stat(file)).isFile())continue;
  const data=await readFile(file);delivery.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
const gateFiles=['src/components/Explorer/ExplorerGate.tsx','src/components/Explorer/policy.ts'];
let minified='';
for(const file of gateFiles){
  const source=await readFile(file,'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  minified+=(await terser.minify(output,{module:true})).code+'\n';
}
const report={version:manifest.version,blender:manifest.blender,
  firstSceneNewAssetsBytes:delivery.filter(asset=>firstFiles.some(name=>asset.file===folder+'/'+name)).reduce((sum,asset)=>sum+asset.bytes,0),
  totalNewDeliveryBytes:delivery.reduce((sum,asset)=>sum+asset.bytes,0),
  gateModuleGzipBytes:gzipSync(minified).length,
  notes:['Gate size is separately transpiled/minified modules, excluding React and Next runtime; not a network trace.','First-scene count excludes production v3 resources and the separately loaded film and sound. A cold manual launch can also fetch its production room assets.','GPU figures and frame rates require runtime measurement; file size does not establish rendering performance.'],delivery};
await writeFile('outputs/explorer-asset-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,delivery:undefined},null,2));
