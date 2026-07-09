import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type CaseSpec, type Leg, type SimResult } from '../sim/types';
import { buildPitTopo, sampleAt, type PitTopo } from '../sim/topo';

// The 3D pit view: the terraced pit shell (benches at their real elevations), the spiral ramp, shovels on
// their bench, dumps at the rim, and trucks moving along the REAL 3D haul path (bench → ramp → surface) at
// the playback time t. Times are the DES's (the 3D path only decides WHERE the truck is drawn at fraction f
// of its leg). Compute discipline: renders ON DEMAND (playback tick / camera interaction / theme change) , 
// zero rAF work when paused with no interaction, and it halts on a hidden tab.
const STATE_COLOR: Record<Leg['state'], number> = { haulFull: 0xd29922, haulEmpty: 0x58a6ff, atShovel: 0x8b949e, atDump: 0x8b949e };

/** Stockpile level (tonnes) at playback time t, from the step series baked into the result. */
function levelAt(series: { t: number; level: number }[] | undefined, t: number): number {
  if (!series || series.length === 0) return 0;
  let lvl = series[0].level;
  for (const p of series) { if (p.t <= t) lvl = p.level; else break; }
  return lvl;
}

/** Build the terraced shell geometry (walls + berms per level + floor) for a topo. */
function shellGeometry(topo: PitTopo): THREE.BufferGeometry {
  const N = 96; // angular segments
  const pos: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.z, -a.y, b.x, b.z, -b.y, c.x, c.z, -c.y); // world (x,y,z-up) → three (x,z-up→y, -y)
  const ring = (rx: number, ry: number, z: number, i: number) => {
    const th = (i / N) * Math.PI * 2;
    const c = topo.spec.center;
    return new THREE.Vector3(c.x + rx * Math.cos(th), c.y + ry * Math.sin(th), z);
  };
  const strip = (rxT: number, ryT: number, zT: number, rxB: number, ryB: number, zB: number) => {
    for (let i = 0; i < N; i++) {
      const a = ring(rxT, ryT, zT, i), b = ring(rxT, ryT, zT, i + 1);
      const c = ring(rxB, ryB, zB, i), d = ring(rxB, ryB, zB, i + 1);
      push(a, c, b); push(b, c, d);
    }
  };
  const B = topo.benches;
  const face = (topo.spec.faceAngleDeg ?? 65) * (Math.PI / 180);
  const setback = topo.spec.benchHeightM / Math.tan(face);
  for (let k = 0; k < B.length - 1; k++) {
    const top = B[k], bot = B[k + 1];
    // wall: from this level's inner edge down to the next crest
    strip(bot.rx + setback, bot.ry + setback, top.z, bot.rx, bot.ry, bot.z);
    // berm: horizontal ring at the top level between its crest and the wall top
    strip(top.rx, top.ry, top.z, bot.rx + setback, bot.ry + setback, top.z);
  }
  // floor: fan at the deepest ring
  const fb = B[B.length - 1];
  const c0 = new THREE.Vector3(topo.spec.center.x, topo.spec.center.y, fb.z);
  for (let i = 0; i < N; i++) push(c0, ring(fb.rx, fb.ry, fb.z, i), ring(fb.rx, fb.ry, fb.z, i + 1));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** The ramp ribbon: a flat strip along the spiral polyline. */
function rampGeometry(topo: PitTopo): THREE.BufferGeometry {
  const w = (topo.spec.rampWidthM ?? 25) / 2;
  const pos: number[] = [];
  const pts = topo.ramp;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    // horizontal normal to the segment
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * w, ny = (dx / L) * w;
    const z = 0.6; // lift slightly above the wall to avoid z-fighting
    const p1 = [a.x - nx, a.z + z, -(a.y - ny)], p2 = [a.x + nx, a.z + z, -(a.y + ny)];
    const p3 = [b.x - nx, b.z + z, -(b.y - ny)], p4 = [b.x + nx, b.z + z, -(b.y + ny)];
    pos.push(...p1, ...p3, ...p2, ...p2, ...p3, ...p4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const toThree = (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x, v.z, -v.y);

export function Pit3D({ c, result, t, lang, playing = false }: { c: CaseSpec; result: SimResult; t: number; lang: 'en' | 'es'; playing?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const es = lang === 'es';
  const topo = useMemo(() => buildPitTopo(c.mine), [c]);
  const byTruck = useMemo(() => {
    const m = new Map<number, Leg[]>();
    for (const l of result.trace ?? []) { const a = m.get(l.truck) ?? []; a.push(l); m.set(l.truck, a); }
    for (const a of m.values()) a.sort((x, y) => x.t0 - y.t0);
    return m;
  }, [result]);
  // refs the render loop reads without re-building the scene
  const tRef = useRef(t); tRef.current = t;
  const sceneRef = useRef<{ render: () => void } | null>(null);

  useEffect(() => {
    const el = mountRef.current; if (!el) return;
    const W = el.clientWidth || 760, H = Math.max(360, Math.round(W * 0.55));
    const dark = (document.documentElement.dataset.theme ?? 'dark') !== 'light';
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(48, W / H, 1, 30000);
    const ctr = toThree({ x: topo.spec.center.x, y: topo.spec.center.y, z: topo.benches[topo.benches.length - 1].z * 0.5 });
    cam.position.set(ctr.x + topo.spec.rimRx * 1.7, topo.spec.rimRx * 1.15, ctr.z + topo.spec.rimRy * 1.7);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.copy(ctr); controls.enableDamping = false; controls.autoRotate = false;

    scene.fog = new THREE.Fog(dark ? 0x0b0f16 : 0xf4f6f9, topo.spec.rimRx * 2.2, topo.spec.rimRx * 8);   // depth cue (#21)
    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x1a2030 : 0x8899aa, dark ? 0.85 : 1.0));
    const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(1, 2, 1.2); scene.add(dl);
    const rim = new THREE.DirectionalLight(dark ? 0x88aaff : 0xfff2cc, 0.25); rim.position.set(-1.5, 0.8, -1); scene.add(rim);

    // sprite text labels (#21): shovels on their bench + dumps at the rim, theme-aware
    const mkLabel = (text: string, v: { x: number; y: number; z: number }, lift: number, scale = 1) => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const cx = cv.getContext('2d')!;
      cx.font = '600 34px system-ui, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.shadowColor = dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)'; cx.shadowBlur = 8;
      cx.fillStyle = dark ? '#e6edf3' : '#1f2328';
      cx.fillText(text, 128, 32);
      const tex = new THREE.CanvasTexture(cv);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      const p3 = toThree(v); sp.position.set(p3.x, p3.y + lift, p3.z);
      sp.scale.set(90 * scale, 22.5 * scale, 1);
      scene.add(sp); disposables.push(sp.material, tex);
    };

    const disposables: { dispose(): void }[] = [];
    // pit shell
    const shellG = shellGeometry(topo);
    const shellM = new THREE.MeshStandardMaterial({ color: dark ? 0x6b5844 : 0x9a805f, roughness: 0.95, metalness: 0.02, flatShading: true, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(shellG, shellM)); disposables.push(shellG, shellM);
    // crest edges for legibility
    for (const b of topo.benches) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) { const th = (i / 96) * Math.PI * 2; pts.push(toThree({ x: topo.spec.center.x + b.rx * Math.cos(th), y: topo.spec.center.y + b.ry * Math.sin(th), z: b.z + 0.4 })); }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineBasicMaterial({ color: dark ? 0x8a7358 : 0x7a6448, transparent: true, opacity: 0.55 });
      scene.add(new THREE.Line(g, m)); disposables.push(g, m);
    }
    // ramp ribbon
    const rampG = rampGeometry(topo);
    const rampM = new THREE.MeshStandardMaterial({ color: dark ? 0xb59a6a : 0xd9c08a, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(rampG, rampM)); disposables.push(rampG, rampM);
    // shovels (boxes on their bench) + dumps (boxes at the rim)
    const mkBox = (v: { x: number; y: number; z: number }, size: number, color: number, hM = 1) => {
      const g = new THREE.BoxGeometry(size, size * hM, size);
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true });
      const mesh = new THREE.Mesh(g, m);
      const p = toThree(v); mesh.position.set(p.x, p.y + (size * hM) / 2, p.z);
      scene.add(mesh); disposables.push(g, m); return mesh;
    };
    for (const s of c.mine.shovels) {
      mkBox(topo.shovelPos3[s.id], 22, s.faceType === 'ore' ? 0xe3b341 : 0x9aa4ae, 0.9);
      mkLabel(`S${s.id}`, topo.shovelPos3[s.id], 42);
    }
    // dumps by kind: crusher = red, waste = slate, stockpile = amber cone-ish box scaled by its FILL level
    const stockMeshes: { id: number; mesh: THREE.Mesh; cap: number }[] = [];
    for (const d of c.mine.dumps) {
      if (d.kind === 'stockpile') {
        const cap = d.areaCapacityT ?? 1;
        const mesh = mkBox(topo.dumpPos3[d.id], 30, 0xe3b341, 1.6);   // nominal FULL height; scaled per frame
        stockMeshes.push({ id: d.id, mesh, cap });
        mkLabel(es ? 'acopio' : 'stockpile', topo.dumpPos3[d.id], 52, 1.1);
        continue;
      }
      const isCr = d.kind === 'crusher';
      mkBox(topo.dumpPos3[d.id], 26, isCr ? 0xf85149 : 0x8b949e, 1.2);
      mkLabel(isCr ? (es ? 'chancador' : 'crusher') : (es ? 'botadero' : 'waste dump'), topo.dumpPos3[d.id], 52, 1.1);
    }

    // pit PORTAL / exit: the ramp rim exit (ramp[0]) is the single node every haul funnels through,
    // shovel -> bench -> ramp -> PORTAL -> surface haul -> destination, and the reverse for the empty return.
    const portalV = topo.ramp[0] ?? { x: topo.spec.center.x, y: topo.spec.center.y, z: 0 };
    { const g = new THREE.CylinderGeometry(10, 16, 10, 6); const m = new THREE.MeshStandardMaterial({ color: dark ? 0x539bf5 : 0x2f6feb, roughness: 0.5, flatShading: true }); const mesh = new THREE.Mesh(g, m); const p = toThree(portalV); mesh.position.set(p.x, p.y + 5, p.z); scene.add(mesh); disposables.push(g, m); }
    mkLabel(es ? 'salida del rajo' : 'pit exit', portalV, 26, 0.95);
    // surface road network (#87): draw the shared TRUNK + curved SPURS so hauls follow visible real
    // roads outside the pit, not straight magic lines. Trucks already travel these via topo.paths.
    {
      const roadM = new THREE.LineBasicMaterial({ color: dark ? 0xc89b6a : 0x6b512f, transparent: true, opacity: 0.95 });
      const drawRoad = (pts: { x: number; y: number; z: number }[]) => {
        const v = pts.map((p) => { const t = toThree(p); return new THREE.Vector3(t.x, t.y + 1.5, t.z); });
        const g = new THREE.BufferGeometry().setFromPoints(v);
        scene.add(new THREE.Line(g, roadM)); disposables.push(g);
      };
      drawRoad(topo.roads.trunk);
      for (const d of c.mine.dumps) if (topo.roads.spurs[d.id]) drawRoad(topo.roads.spurs[d.id]);
      disposables.push(roadM);
      const jm = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 5, 6), new THREE.MeshStandardMaterial({ color: dark ? 0x8a6d47 : 0x6b512f, roughness: 0.7, flatShading: true }));
      const jp = toThree(topo.roads.junction); jm.position.set(jp.x, jp.y + 2.5, jp.z);
      scene.add(jm); disposables.push(jm.geometry, jm.material as THREE.Material);
    }

    // Initial camera: frame ALL the content (the pit + the external nodes reached via the portal),
    // centered on the whole scene with a slightly-elevated overview, so nothing sits off-frame on load.
    {
      const box = new THREE.Box3();
      const add = (v: { x: number; y: number; z: number }) => { const p = toThree(v); box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)); };
      Object.values(topo.shovelPos3).forEach(add);
      Object.values(topo.dumpPos3).forEach(add);
      add(portalV);
      const zb = topo.benches[topo.benches.length - 1].z;
      add({ x: topo.spec.center.x - topo.spec.rimRx, y: topo.spec.center.y - topo.spec.rimRy, z: 0 });
      add({ x: topo.spec.center.x + topo.spec.rimRx, y: topo.spec.center.y + topo.spec.rimRy, z: zb });
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 1) * 0.5;
      const fitDist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.18;   // vertical-fit + padding
      cam.position.set(center.x, center.y + fitDist * 0.62, center.z + fitDist * 0.85);   // centered, a little superior
      controls.target.copy(center);
      controls.update();
    }

    // trucks: one instanced mesh, positions updated per render from the trace at tRef
    const nT = c.fleet.trucks.length;
    const tg = new THREE.BoxGeometry(14, 9, 22);
    const tm = new THREE.MeshStandardMaterial({ roughness: 0.5, flatShading: true });
    const inst = new THREE.InstancedMesh(tg, tm, nT);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const colors = new THREE.Color();
    scene.add(inst); disposables.push(tg, tm);

    const m4 = new THREE.Matrix4();
    const HS = 30 * 1.6;   // nominal full stockpile height (size * hM from mkBox)
    const placeTrucks = () => {
      const now = tRef.current;
      // stockpile fill: scale each pile's height by its current level fraction, keeping the base on the ground
      for (const sm of stockMeshes) {
        const frac = Math.max(0.02, Math.min(1, levelAt(result.stockLevels?.[sm.id], now) / sm.cap));
        sm.mesh.scale.set(1, frac, 1);
        sm.mesh.position.y = (HS * frac) / 2;
      }
      let i = 0;
      for (const [, legs] of byTruck) {
        let active: Leg | undefined;
        for (const l of legs) { if (now >= l.t0 && now < l.t1) { active = l; break; } }
        if (!active) { m4.makeScale(0, 0, 0); inst.setMatrixAt(i++, m4); continue; }
        const f = active.t1 > active.t0 ? (now - active.t0) / (active.t1 - active.t0) : 0;
        let v;
        if (active.state === 'haulFull' || active.state === 'haulEmpty') {
          // haulFull runs shovel→dump (the path's forward direction); haulEmpty renders the same path reversed
          const path = topo.paths[findRouteKey(c, active)] ?? null;
          v = path ? sampleAt(path, f, active.state === 'haulEmpty') : { x: active.x0 + (active.x1 - active.x0) * f, y: active.y0 + (active.y1 - active.y0) * f, z: 0 };
        } else {
          // queued/serving: sit at the node's 3D position
          const at = active.state === 'atShovel' ? topo.shovelPos3[active.node] : topo.dumpPos3[active.node];
          v = at ?? { x: active.x0, y: active.y0, z: 0 };
        }
        const p = toThree(v);
        m4.makeTranslation(p.x, p.y + 6, p.z);
        inst.setMatrixAt(i, m4);
        colors.setHex(STATE_COLOR[active.state]);
        inst.setColorAt(i, colors);
        i++;
      }
      for (; i < nT; i++) { m4.makeScale(0, 0, 0); inst.setMatrixAt(i, m4); }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    };

    // render ON DEMAND: one frame per playback tick / camera interaction / init. No free-running rAF.
    let disposed = false;
    const render = () => { if (disposed || document.hidden) return; placeTrucks(); renderer.render(scene, cam); };
    controls.addEventListener('change', render);
    const onVis = () => { if (!document.hidden) render(); };
    document.addEventListener('visibilitychange', onVis);
    sceneRef.current = { render };
    render();
    // a lost WebGL context (GPU reset, headless resource churn) leaves the canvas blank after
    // three.js restores it, repaint on restoration (field-found via the visual verifier)
    const onRestored = () => requestAnimationFrame(render);
    renderer.domElement.addEventListener('webglcontextrestored', onRestored);

    const ro = new ResizeObserver(() => { const w = el.clientWidth || W; renderer.setSize(w, H); cam.aspect = w / H; cam.updateProjectionMatrix(); render(); });
    ro.observe(el);
    return () => {
      disposed = true; sceneRef.current = null;
      document.removeEventListener('visibilitychange', onVis);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      controls.removeEventListener('change', render);
      ro.disconnect(); controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [c, topo, byTruck]);

  // playback tick → exactly one frame (paused ⇒ t unchanged ⇒ no work)
  useEffect(() => { sceneRef.current?.render(); }, [t]);

  // while PLAYING, drive one render per animation frame. The per-tick effect above can miss the
  // very first Play on a fresh mount (the scene-build effect and the [t] effect race, so the first
  // ticks landed before sceneRef was live, the view stayed static until a tab switch remounted it).
  // A rAF loop bound to `playing` is race-free. It stops on pause / hidden tab, so no CPU burns idle.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      if (document.hidden) { raf = 0; return; }
      sceneRef.current?.render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => { if (!document.hidden && !raf) raf = requestAnimationFrame(loop); };
    document.addEventListener('visibilitychange', onVis);
    return () => { if (raf) cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, [playing]);

  return (
    <div>
      <div ref={mountRef} style={{ width: '100%' }} />
      <p className="dl-note" style={{ marginTop: '0.4rem' }}>
        {es
          ? 'Topografía 2.5D representativa (bancos, bermas y rampa espiral). Los TIEMPOS de ciclo son los del DES (cinemática rimpull sobre distM/pendiente del caso); la vista 3D solo decide dónde se dibuja el camión en su tramo. Arrastra para orbitar.'
          : 'Representative 2.5D topography (benches, berms, spiral ramp). Cycle TIMES are the DES’s (rimpull kinematics over the case’s distM/grade); the 3D view only decides where the truck is drawn along its leg. Drag to orbit.'}
      </p>
    </div>
  );
}

/** Map a haul leg back to its route key: match the leg endpoints to the case's shovel/dump positions. */
function findRouteKey(c: CaseSpec, l: Leg): string {
  const near = (x: number, y: number, p: { x: number; y: number }) => Math.hypot(x - p.x, y - p.y) < 1;
  // haulFull: x0,y0 = shovel, x1,y1 = dump; haulEmpty: x0,y0 = dump, x1,y1 = shovel
  const sx = l.state === 'haulFull' ? { x: l.x0, y: l.y0 } : { x: l.x1, y: l.y1 };
  const dx = l.state === 'haulFull' ? { x: l.x1, y: l.y1 } : { x: l.x0, y: l.y0 };
  const s = c.mine.shovels.find((s) => near(sx.x, sx.y, s.pos));
  const d = c.mine.dumps.find((d) => near(dx.x, dx.y, d.pos));
  return s && d ? `${s.id}->${d.id}` : '';
}
