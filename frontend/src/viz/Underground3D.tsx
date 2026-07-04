// Underground 3D (#21): renders the REAL generated mine skeleton from minehaulsim.minetopo/v1 , 
// the decline as a tube, level platforms, drawpoints, ore-pass tips→chute drops and the shaft
// bin, and animates the truck fleet along the DECLINE for haul legs (queued/serving trucks sit
// at their marker). Same compute discipline as Pit3D: render ON DEMAND only (playback tick,
// camera interaction, theme change); no free-running rAF; halts on a hidden tab.
//
// Honesty (stated in the panel note): cycle TIMES come from the replayed log; the 3D decides
// only WHERE a truck is drawn along its leg. Shovel markers map to chutes (or level drawpoints)
// in id order, representational when the sample carries more loading points than the topo.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type CaseSpec, type Leg, type MineTopo, type SimResult } from '../sim/types';

const STATE_COLOR: Record<Leg['state'], number> = {
  haulFull: 0xf85149, haulEmpty: 0x58a6ff, atShovel: 0xe3b341, atDump: 0x3fb950,
};

const toThree = (v: number[]) => new THREE.Vector3(v[0], v[2], -v[1]);   // world z-up → three y-up

/** Arc-length parametrization of the decline: fraction f (0=surface, 1=deep end) → point. */
function declineSampler(decline: number[][]) {
  const pts = decline.map(toThree);
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1] || 1;
  return (f: number): THREE.Vector3 => {
    const s = Math.min(1, Math.max(0, f)) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    return pts[i - 1].clone().lerp(pts[i], (s - cum[i - 1]) / seg);
  };
}

/** Sprite text label (canvas texture; theme-aware color). */
function makeLabel(text: string, dark: boolean, scale = 1): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const cx = cv.getContext('2d')!;
  cx.font = '600 34px system-ui, sans-serif';
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.shadowColor = dark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)'; cx.shadowBlur = 8;
  cx.fillStyle = dark ? '#e6edf3' : '#1f2328';
  cx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(90 * scale, 22.5 * scale, 1);
  return sp;
}

export function Underground3D({ c, result, t, lang }: { c: CaseSpec; result: SimResult; t: number; lang: 'en' | 'es' }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const es = lang === 'es';
  const topo = c.mine.minetopo as MineTopo;
  const byTruck = useMemo(() => {
    const m = new Map<number, Leg[]>();
    for (const l of result.trace ?? []) { const a = m.get(l.truck) ?? []; a.push(l); m.set(l.truck, a); }
    for (const a of m.values()) a.sort((x, y) => x.t0 - y.t0);
    return m;
  }, [result]);
  const tRef = useRef(t); tRef.current = t;
  const sceneRef = useRef<{ render: () => void } | null>(null);

  useEffect(() => {
    const el = mountRef.current; if (!el || !topo) return;
    const W = el.clientWidth || 760, H = Math.max(380, Math.round(W * 0.6));
    const dark = (document.documentElement.dataset.theme ?? 'dark') !== 'light';
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(dark ? 0x0b0f16 : 0xf4f6f9, 900, 4200);

    // frame the whole skeleton
    const box = new THREE.Box3();
    for (const p of topo.decline) box.expandByPoint(toThree(p));
    for (const lv of topo.levels) for (const d of lv.drawpoints) box.expandByPoint(toThree(d));
    const ctr = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 600;
    const cam = new THREE.PerspectiveCamera(50, W / H, 1, 30000);
    cam.position.set(ctr.x + size * 0.75, ctr.y + size * 0.45, ctr.z + size * 0.75);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H); renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.copy(ctr); controls.enableDamping = false;

    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x141a26 : 0x8899aa, dark ? 0.9 : 1.0));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(1, 2, 1.2); scene.add(dl);

    const disposables: { dispose(): void }[] = [];
    const add = (o: THREE.Object3D, ...ds: { dispose(): void }[]) => { scene.add(o); disposables.push(...ds); };

    // the DECLINE: a tube along the real polyline (the mine's spine)
    const declinePts = topo.decline.map(toThree);
    const curve = new THREE.CatmullRomCurve3(declinePts, false, 'catmullrom', 0.02);
    const tubeG = new THREE.TubeGeometry(curve, Math.min(400, declinePts.length * 3), 7.5, 10, false);
    const tubeM = new THREE.MeshStandardMaterial({ color: dark ? 0xb59a6a : 0xcaa76a, roughness: 0.85, flatShading: true });
    add(new THREE.Mesh(tubeG, tubeM), tubeG, tubeM);

    // LEVEL platforms: translucent discs at each level (centered on the level's drawpoint centroid
    // or the decline crossing), + a level label
    for (const lv of topo.levels) {
      const pts = lv.drawpoints.length ? lv.drawpoints : [topo.decline.reduce((a, p) => (Math.abs(p[2] - lv.z) < Math.abs(a[2] - lv.z) ? p : a), topo.decline[0])];
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const center = toThree([cx, cy, lv.z]);
      const r = Math.max(90, 40 + 30 * pts.length);
      const dg = new THREE.CircleGeometry(r, 40);
      const dm = new THREE.MeshStandardMaterial({ color: dark ? 0x2c3646 : 0xb9c4d4, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
      const disc = new THREE.Mesh(dg, dm);
      disc.rotation.x = -Math.PI / 2; disc.position.copy(center);
      add(disc, dg, dm);
      const ring = new THREE.RingGeometry(r - 2, r, 48);
      const rm = new THREE.MeshBasicMaterial({ color: dark ? 0x58a6ff : 0x0969da, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
      const rmesh = new THREE.Mesh(ring, rm); rmesh.rotation.x = -Math.PI / 2; rmesh.position.copy(center);
      add(rmesh, ring, rm);
      const lb = makeLabel(`L${lv.index + 1} · ${lv.z.toFixed(0)} m`, dark, 1.3);
      lb.position.set(center.x - r - 55, center.y + 8, center.z); add(lb, lb.material);
      // drawpoints: small amber markers
      for (const d of lv.drawpoints) {
        const g = new THREE.SphereGeometry(6, 10, 8);
        const m = new THREE.MeshStandardMaterial({ color: 0xe3b341, roughness: 0.5 });
        const s = new THREE.Mesh(g, m); s.position.copy(toThree(d)); add(s, g, m);
      }
    }

    // ORE PASSES: vertical drop lines tips → chute + chute box; SHAFT bin box
    for (const op of topo.ore_passes) {
      const chute = toThree(op.chute);
      for (const tip of op.tips) {
        const a = toThree(tip);
        const g = new THREE.BufferGeometry().setFromPoints([a, new THREE.Vector3(a.x, chute.y, a.z)]);
        const m = new THREE.LineDashedMaterial({ color: 0xf85149, dashSize: 10, gapSize: 8, transparent: true, opacity: 0.8 });
        const line = new THREE.Line(g, m); line.computeLineDistances(); add(line, g, m);
      }
      const bg = new THREE.BoxGeometry(22, 22, 22);
      const bm = new THREE.MeshStandardMaterial({ color: 0xf85149, roughness: 0.5, flatShading: true });
      const bx = new THREE.Mesh(bg, bm); bx.position.copy(chute).y += 11; add(bx, bg, bm);
      const lb = makeLabel(es ? 'chute' : 'chute', dark); lb.position.copy(chute).y += 42; add(lb, lb.material);
    }
    for (const sh of topo.shafts) {
      const bin = toThree(sh.bin);
      const bg = new THREE.BoxGeometry(26, 30, 26);
      const bm = new THREE.MeshStandardMaterial({ color: 0x3fb950, roughness: 0.5, flatShading: true });
      const bx = new THREE.Mesh(bg, bm); bx.position.copy(bin).y += 15; add(bx, bg, bm);
      const lb = makeLabel(es ? 'pique (bin)' : 'shaft bin', dark); lb.position.copy(bin).y += 52; add(lb, lb.material);
    }
    // portal + surface labels
    const portal = declinePts[0];
    const plb = makeLabel(es ? 'portal' : 'portal', dark, 1.2); plb.position.copy(portal).y += 30; add(plb, plb.material);

    // shovel markers (chutes in id order when available, else level drawpoint centroids)
    const shovelPos = new Map<number, THREE.Vector3>();
    const chutes = topo.ore_passes.map((op) => toThree(op.chute));
    const producing = topo.levels.filter((lv) => lv.drawpoints.length);
    c.mine.shovels.forEach((s, i) => {
      const p = chutes[i] ?? (producing[i % Math.max(1, producing.length)]
        ? toThree([
          producing[i % producing.length].drawpoints[0][0],
          producing[i % producing.length].drawpoints[0][1],
          producing[i % producing.length].z])
        : portal.clone());
      shovelPos.set(s.id, p);
      const g = new THREE.BoxGeometry(20, 18, 20);
      const m = new THREE.MeshStandardMaterial({ color: 0xe3b341, roughness: 0.55, flatShading: true });
      const bx = new THREE.Mesh(g, m); bx.position.copy(p).y += 9; add(bx, g, m);
      const lb = makeLabel(`S${s.id}`, dark); lb.position.copy(p).y += 40; add(lb, lb.material);
    });
    const dumpPos = new Map<number, THREE.Vector3>();
    c.mine.dumps.forEach((d, i) => {
      const p = topo.shafts.length ? toThree(topo.shafts[Math.min(i, topo.shafts.length - 1)].bin)
        : portal.clone().add(new THREE.Vector3(140 + i * 60, 0, 90));
      dumpPos.set(d.id, p);
      if (!topo.shafts.length) {
        const g = new THREE.BoxGeometry(24, 22, 24);
        const m = new THREE.MeshStandardMaterial({ color: 0x8b949e, roughness: 0.6, flatShading: true });
        const bx = new THREE.Mesh(g, m); bx.position.copy(p).y += 11; add(bx, g, m);
        const lb = makeLabel(es ? 'botadero' : 'dump', dark); lb.position.copy(p).y += 44; add(lb, lb.material);
      }
    });

    // trucks: instanced, animated ALONG THE DECLINE on haul legs (fraction of the leg), at their
    // marker while queued/serving. Representational; times come from the replay.
    const sampler = declineSampler(topo.decline);
    const declineDeepY = declinePts[declinePts.length - 1].y;
    const declineSpanY = Math.max(1, declinePts[0].y - declineDeepY);
    const nT = c.fleet.trucks.length;
    const tg = new THREE.BoxGeometry(13, 9, 20);
    const tm = new THREE.MeshStandardMaterial({ roughness: 0.5, flatShading: true });
    const inst = new THREE.InstancedMesh(tg, tm, nT);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const colors = new THREE.Color();
    add(inst, tg, tm);

    const m4 = new THREE.Matrix4();
    const placeTrucks = () => {
      const now = tRef.current;
      let i = 0;
      for (const [, legs] of byTruck) {
        let active: Leg | undefined;
        for (const l of legs) { if (now >= l.t0 && now < l.t1) { active = l; break; } }
        if (!active) { m4.makeScale(0, 0, 0); inst.setMatrixAt(i++, m4); continue; }
        const f = active.t1 > active.t0 ? (now - active.t0) / (active.t1 - active.t0) : 0;
        let p: THREE.Vector3;
        if (active.state === 'haulFull' || active.state === 'haulEmpty') {
          // haulFull: from the shovel's DEPTH up the decline to the surface; haulEmpty reversed
          const from = shovelPos.get(active.state === 'haulFull' ? legFromShovel(legs, active) : active.node) ?? declinePts[declinePts.length - 1];
          const depthF = Math.min(1, Math.max(0, (declinePts[0].y - from.y) / declineSpanY));
          const frac = active.state === 'haulFull' ? depthF * (1 - f) : depthF * f;
          p = sampler(frac);
        } else if (active.state === 'atShovel') {
          p = shovelPos.get(active.node) ?? declinePts[declinePts.length - 1];
        } else {
          p = dumpPos.get(active.node) ?? portal;
        }
        m4.makeTranslation(p.x, p.y + 12, p.z);
        inst.setMatrixAt(i, m4);
        colors.setHex(STATE_COLOR[active.state]);
        inst.setColorAt(i, colors);
        i++;
      }
      for (; i < nT; i++) { m4.makeScale(0, 0, 0); inst.setMatrixAt(i, m4); }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    };

    let disposed = false;
    const render = () => { if (disposed || document.hidden) return; placeTrucks(); renderer.render(scene, cam); };
    controls.addEventListener('change', render);
    const onVis = () => { if (!document.hidden) render(); };
    document.addEventListener('visibilitychange', onVis);
    sceneRef.current = { render };
    render();
    // repaint after a restored WebGL context (GPU reset / headless churn), see Pit3D
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
  }, [c, topo, byTruck, es]);

  useEffect(() => { sceneRef.current?.render(); }, [t]);

  return (
    <div>
      <div ref={mountRef} style={{ width: '100%' }} />
      <p className="dl-note" style={{ marginTop: '0.4rem' }}>
        {es
          ? 'Mina subterránea REAL generada (minetopo/v1): rampa de acceso, niveles, puntos de extracción, piques de traspaso y bin. Los TIEMPOS son del log reproducido; el 3D solo decide dónde se dibuja el camión en su tramo (marcadores representacionales). Arrastra para orbitar.'
          : 'REAL generated underground mine (minetopo/v1): access decline, levels, drawpoints, ore passes and bin. TIMES come from the replayed log; the 3D only decides where the truck is drawn along its leg (markers representational). Drag to orbit.'}
      </p>
    </div>
  );
}

/** The shovel a haulFull leg departs from: the last atShovel node before it. */
function legFromShovel(legs: Leg[], active: Leg): number {
  let last = active.node;
  for (const l of legs) {
    if (l.t0 >= active.t0) break;
    if (l.state === 'atShovel') last = l.node;
  }
  return last;
}
