// Render real, lit Three.js geometry once at authoring time. The site needs no
// extra WebGL contexts, animation loops or interaction to show these diagrams.
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const directory = 'public/images/founder-portfolio/models';
await mkdir(directory, { recursive: true });
const server = http.createServer(async (req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<style>html,body{margin:0;background:transparent}</style><script type="importmap">{"imports":{"three":"/three.module.js"}}</script>');
  } else if (['/three.module.js', '/three.core.js'].includes(req.url)) {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(await readFile(`node_modules/three/build${req.url}`));
  } else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 560, height: 420 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const language of ['ja', 'en']) {
    for (const kind of ['bio', 'ai', 'education']) {
      await page.evaluate(async ({ language, kind }) => {
        const T = await import('three');
        const color = (language === 'ja' ? {bio:0x38a77f, ai:0x4d72ed, education:0xd28a38} : {bio:0xb6ef7a, ai:0x8b78f0, education:0xd4ba79})[kind];
        const scene = new T.Scene();
        const camera = new T.OrthographicCamera(-3.3, 3.3, 2.475, -2.475, .1, 100);
        camera.position.set(5, 4.5, 8); camera.lookAt(0, .15, 0);
        const renderer = new T.WebGLRenderer({alpha:true, antialias:true, preserveDrawingBuffer:true});
        renderer.setSize(560,420); renderer.setClearColor(0xffffff,0);
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.35;
        scene.add(new T.HemisphereLight(0xffffff, 0x52616e, 2.1));
        const key = new T.DirectionalLight(0xffffff, 4); key.position.set(-4, 7, 6); scene.add(key);
        const rim = new T.DirectionalLight(0xffffff, 2); rim.position.set(5, 2, -4); scene.add(rim);
        const material = new T.MeshStandardMaterial({color, metalness:.28, roughness:.24});
        const pearl = new T.MeshStandardMaterial({color:0xe9edef, metalness:.36, roughness:.27});
        const group = new T.Group(); scene.add(group);
        const mesh = (geometry, mat, x=0,y=0,z=0) => { const m=new T.Mesh(geometry,mat); m.position.set(x,y,z);group.add(m);return m; };
        const rod = (a,b,r=.055,mat=pearl) => {
          const A=new T.Vector3(...a), B=new T.Vector3(...b), d=B.clone().sub(A);
          const m=mesh(new T.CylinderGeometry(r,r,d.length(),16),mat);
          m.position.copy(A.add(B).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
        };
        if(kind==='bio') {
          // Paired strands: molecular structure, not a claim about a specific protein.
          let previous;
          for(let i=0;i<11;i++) {
            const t=i*.58, y=(i-5)*.34;
            const a=[Math.cos(t)*.86,y,Math.sin(t)*.86], b=[-a[0],y,-a[2]];
            mesh(new T.SphereGeometry(.18,24,16),material,...a);
            mesh(new T.SphereGeometry(.18,24,16),pearl,...b);
            rod(a,b,.045);
            if(previous){rod(previous[0],a,.085,material);rod(previous[1],b,.085,pearl);}
            previous=[a,b];
          }
          group.rotation.z=-.24;
        } else if(kind==='ai') {
          // An assembled architecture: separate modules connected across layers.
          for(let level=0;level<3;level++) {
            const plate=mesh(new T.BoxGeometry(2.7,.14,2),level===1?material:pearl,0,(level-1)*.83,0);
            const edges = new T.LineSegments(new T.EdgesGeometry(plate.geometry),new T.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.45}));plate.add(edges);
            for(let i=0;i<3;i++)mesh(new T.BoxGeometry(.55,.26,.63),material,(i-1)*.79,(level-1)*.83+.2,0);
          }
          for(const x of [-1.1,1.1]) for(const z of [-.72,.72])rod([x,-.85,z],[x,1.04,z],.035);
        } else {
          // A shared centre connects three open learning surfaces at equal height.
          mesh(new T.SphereGeometry(.36,32,24),material,0,.35,0);
          for(let i=0;i<3;i++) {
            const angle=i*Math.PI*2/3, x=Math.cos(angle)*1.45, z=Math.sin(angle)*1.45;
            rod([0,.35,0],[x,.35,z],.065,material);
            const book=new T.Group();book.position.set(x,.28,z);book.rotation.y=-angle;group.add(book);
            for(const side of [-1,1]) {
              const leaf=new T.Mesh(new T.BoxGeometry(.55,.13,.88),pearl);leaf.position.set(side*.275,0,0);leaf.rotation.z=side*.18;book.add(leaf);
              const cover=new T.Mesh(new T.BoxGeometry(.58,.055,.94),material);cover.position.set(side*.275,-.1,0);cover.rotation.z=side*.18;book.add(cover);
            }
          }
        }
        document.querySelector('canvas')?.remove();document.body.append(renderer.domElement);
        renderer.render(scene,camera);
        renderer.dispose();
        scene.traverse(o=>{o.geometry?.dispose(); if(o.material) for(const m of [o.material].flat())m.dispose();});
      }, {language,kind});
      const png = await page.screenshot({omitBackground:true});
      await sharp(png).webp({quality:88}).toFile(`${directory}/${language}-${kind}.webp`);
    }
  }
} finally { await browser.close(); server.close(); }
console.log('Rendered six static Three.js study models.');
