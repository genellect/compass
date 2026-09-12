import { describe, expect, test } from 'vitest';
import { Navigation } from '../src/components/Explorer/navigation';
import { isPC } from '../src/components/Explorer/policy';
import { FrameWindow, passesEntry } from '../src/components/Explorer/performance';
import type { NavMesh, Point } from '../src/components/Explorer/contracts';
import floor from '../public/habitat/explorer/v1/floor.json';
import manifest from '../public/habitat/explorer/v1/manifest.json';

const navigation=new Navigation({cellSize:floor.cellSize,cells:floor.cells.map(([x,z]):Point=>[x,z])});
describe('authored facility navigation',()=>{
  test('every room is reachable from every other room without crossing blocked floor',()=>{
    for(const origin of manifest.rooms)for(const target of manifest.rooms){
      const a=navigation.nearest([origin.reading[0],origin.reading[2]],4);
      const b=navigation.nearest([target.reading[0],target.reading[2]],4);
      expect(a,origin.id+' reading position').not.toBeNull();expect(b,target.id+' reading position').not.toBeNull();
      const route=navigation.path(a!,b!);
      expect(route,origin.id+' → '+target.id).not.toBeNull();
      let previous=a!;
      for(const p of route!){expect(navigation.clearLine(previous,p),origin.id+' → '+target.id).toBe(true);previous=p;}
    }
  },20000);
  test('diagonal smoothing never crosses a blocked corner',()=>{
    const grid=new Navigation({cellSize:1,cells:[[0,0],[0,1],[0,2],[1,2],[2,2],[2,1],[2,0]]});
    expect(grid.clearLine([0,0],[2,0])).toBe(false);
    const path=grid.path([0,0],[2,0])!;expect(path.length).toBeGreaterThan(1);
    let p:Point=[0,0];for(const next of path){expect(grid.clearLine(p,next)).toBe(true);p=next;}
  });
  test('unreachable destinations fail without inventing a route',()=>{
    const grid=new Navigation({cellSize:1,cells:[[0,0],[10,10]]});expect(grid.path([0,0],[10,10])).toBeNull();
  });
});
test('iPad exclusion includes desktop user-agent and a connected pointer',()=>{
  const input={eligible:true,fine:true,userAgent:'Mozilla/5.0 Macintosh',platform:'MacIntel',touchPoints:5};
  expect(isPC(input)).toBe(false);
  expect(isPC({...input,touchPoints:0})).toBe(true);
  expect(isPC({...input,platform:'Win32',userAgent:'Windows NT'})).toBe(true);
  expect(isPC({...input,fine:false,platform:'Win32'})).toBe(false);
});
test('startup rejects long stalls even with a good median frame rate',()=>{
  const sample=new FrameWindow();let now=1;sample.add(now);
  for(let n=0;n<180;n++){now+=n%10===0?80:1000/60;sample.add(now);}
  expect(passesEntry(sample.result())).toBe(false);
  sample.reset();for(let n=0;n<182;n++)sample.add(1+n*1000/60);
  expect(passesEntry(sample.result(8))).toBe(true);
  expect(passesEntry(sample.result(24))).toBe(true);
  expect(passesEntry(sample.result(50))).toBe(false);
  sample.reset();for(let n=0;n<92;n++)sample.add(1+n*1000/30);
  expect(passesEntry(sample.result(28))).toBe(true);
  // Actual Iris Xe observation from the previous Preview: drawing was possible,
  // but the old 60fps admission rule hid the result from the user.
  expect(passesEntry({fps:59.9,p95:33.5,gpuMs:21.5,frames:150})).toBe(true);
});
