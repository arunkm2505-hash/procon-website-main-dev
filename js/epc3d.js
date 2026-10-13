// PROCON INFRA LLP — interactive 3D EPC plant model
// A procedural industrial facility that assembles through the five EPC delivery stages.
// Mount points: any element with [data-epc3d]. Options (data attributes):
//   data-focus="steel,envelope"  highlight disciplines, ghost the rest
//   data-rail                    render the stage rail + stage info card
//   data-scrub="#section"        drive build progress from scrolling through that (sticky) section
//   data-label="..."             legend text for the highlighted discipline
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const STAGES = [
  { key:'civil',    num:'01', title:'Civil works',           text:'Setting out, isolated footings, plinth beams and a level industrial floor slab.' },
  { key:'steel',    num:'02', title:'Steel erection',        text:'Portal frames, crane girders and bracing lifted and bolted bay by bay.' },
  { key:'envelope', num:'03', title:'Envelope and floors',   text:'Purlins, roof sheeting, wall cladding and composite deck slabs close the building.' },
  { key:'mep',      num:'04', title:'MEP and utilities',     text:'HVAC ducting, cable trays, fire protection and the utility yard, fully coordinated.' },
  { key:'handover', num:'05', title:'Commissioning',         text:'EOT crane load tested, external works complete, facility handed over.' }
];

const PARTS = {
  footing:   ['civil', 'Isolated footing', 'RCC footing sized for frame reactions'],
  plinth:    ['civil', 'Plinth beam', 'Ties footings and supports wall cladding'],
  slab:      ['civil', 'Industrial floor slab', 'Trowelled RCC floor for heavy traffic'],
  pad:       ['civil', 'Equipment foundation', 'Dedicated pads for utility equipment'],
  paving:    ['civil', 'External works', 'Roads, paving and drainage'],
  column:    ['steel', 'Built up column', 'Primary portal frame column'],
  rafter:    ['steel', 'Tapered rafter', 'Primary portal frame rafter'],
  girder:    ['steel', 'Crane girder', 'Carries EOT crane wheel loads'],
  bracing:   ['steel', 'Rod bracing', 'Wall and roof bracing for lateral stability'],
  purlin:    ['envelope', 'Z purlin', 'Secondary member supporting roof sheets'],
  roof:      ['envelope', 'Roof sheeting', 'Profiled metal roof with skylights'],
  cladding:  ['envelope', 'Wall cladding', 'Insulated metal wall panels'],
  cbeam:     ['composite', 'Composite beam', 'Steel beam acting with the slab via shear studs'],
  ccol:      ['composite', 'Annex column', 'Steel column of the G+2 office annex'],
  deck:      ['composite', 'Deck slab', 'Metal deck with concrete topping'],
  duct:      ['mep', 'HVAC duct', 'Supply air main with branch drops'],
  tray:      ['mep', 'Cable tray', 'Power and control cabling route'],
  sprinkler: ['mep', 'Sprinkler main', 'Fire protection pipework'],
  light:     ['mep', 'High bay light', 'LED high bay luminaire'],
  utility:   ['mep', 'Utility yard', 'Transformer, DG set and HVAC plant'],
  crane:     ['handover', 'EOT crane', 'Overhead travelling crane, load tested'],
  green:     ['handover', 'Landscaping', 'Soft landscaping and site finishing']
};

const easeOut = t => 1 - Math.pow(1 - t, 3);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;   // touch devices: lighter rendering + tap interactions

function webglOK(){
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
  catch(e){ return false; }
}

/* ---------------------------------------------------------
   MODEL
--------------------------------------------------------- */
function buildModel(){
  const items = [];
  const root = new THREE.Group();

  const M = {
    concrete: new THREE.MeshStandardMaterial({ color:0xdcd8d0, roughness:.95 }),
    concreteDk: new THREE.MeshStandardMaterial({ color:0xc4beb3, roughness:.95 }),
    steel: new THREE.MeshStandardMaterial({ color:0x2f3b4f, roughness:.55, metalness:.35 }),
    steel2: new THREE.MeshStandardMaterial({ color:0x6b778a, roughness:.5, metalness:.35 }),
    girder: new THREE.MeshStandardMaterial({ color:0xb4531f, roughness:.55, metalness:.3 }),
    roof: new THREE.MeshStandardMaterial({ color:0xe6ebf1, roughness:.6, metalness:.2, transparent:true, opacity:.62, side:THREE.DoubleSide, depthWrite:false }),
    clad: new THREE.MeshStandardMaterial({ color:0xd3dbe5, roughness:.6, metalness:.15, transparent:true, opacity:.78, side:THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ color:0xb9b4aa, roughness:.9 }),
    duct: new THREE.MeshStandardMaterial({ color:0xa7b3c2, roughness:.35, metalness:.6 }),
    tray: new THREE.MeshStandardMaterial({ color:0xd9a441, roughness:.5, metalness:.3 }),
    pipe: new THREE.MeshStandardMaterial({ color:0xd62f2f, roughness:.45, metalness:.2 }),
    light: new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0xfff3d6, emissiveIntensity:.9 }),
    utility: new THREE.MeshStandardMaterial({ color:0x8795a8, roughness:.5, metalness:.3 }),
    crane: new THREE.MeshStandardMaterial({ color:0xe8a817, roughness:.45, metalness:.3 }),
    paving: new THREE.MeshStandardMaterial({ color:0xe9e7e2, roughness:1 }),
    green: new THREE.MeshStandardMaterial({ color:0xa9c7a1, roughness:1 })
  };

  function register(mesh, part, stage, order, kind, matKey){
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.part = part;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), null);
    mesh.add(edges);
    root.add(mesh);
    items.push({ mesh, edges, part, cat:PARTS[part][0], stage, order:clamp(order,0,1), kind, mat:M[matKey],
      target:mesh.position.clone(), scale:mesh.scale.clone() });
    return mesh;
  }
  // box whose base sits at y (grows upward)
  function block(w, h, d, x, y, z, part, stage, order, matKey, kind='grow'){
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h/2, 0);
    const m = new THREE.Mesh(g, M[matKey]); m.position.set(x, y, z);
    return register(m, part, stage, order, kind, matKey);
  }
  // prismatic member between two points (length along local X)
  function member(a, b, w, h, part, stage, order, matKey, kind='drop'){
    const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
    const g = new THREE.BoxGeometry(len, h, w);
    const m = new THREE.Mesh(g, M[matKey]);
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0), dir.normalize());
    return register(m, part, stage, order, kind, matKey);
  }
  function pipe(a, b, r, part, stage, order, matKey, kind='extend'){
    const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, 14, 1); g.rotateZ(-Math.PI/2);
    const m = new THREE.Mesh(g, M[matKey]);
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0), dir.normalize());
    return register(m, part, stage, order, kind, matKey);
  }
  const V = (x,y,z) => new THREE.Vector3(x,y,z);

  // geometry of the main shed
  const SPAN = 24, HALF = SPAN/2, EAVE = 8, RIDGE = 10.4, BAY = 6, NB = 6;
  const L = BAY*NB, Z0 = -L/2;
  const frames = []; for(let i=0;i<=NB;i++) frames.push(Z0 + i*BAY);
  const zo = z => (z - Z0)/L;                      // build order front to back
  const roofY = x => EAVE + (RIDGE-EAVE) * (1 - Math.abs(x)/HALF);

  /* ---- stage 0 : civil ---- */
  block(SPAN+8, .12, L+22, 0, -.12, 3, 'paving', 0, 0, 'paving');
  frames.forEach(z => [-HALF, HALF].forEach(x => block(1.6, .7, 1.6, x, 0, z, 'footing', 0, .05 + zo(z)*.45, 'concreteDk')));
  [-HALF, HALF].forEach(x => block(.35, .45, L, x, .25, 0, 'plinth', 0, .45, 'concrete'));
  block(SPAN-.4, .22, L-.2, 0, 0, 0, 'slab', 0, .62, 'concrete');
  // annex footings
  const AX0 = -HALF, AX1 = -1, AZ0 = L/2 + .5, AZ1 = L/2 + 9;
  [AX0, (AX0+AX1)/2, AX1].forEach(x => [AZ0, AZ1].forEach(z => block(1.3, .6, 1.3, x, 0, z, 'footing', 0, .5, 'concreteDk')));
  // utility pads
  block(5, .35, 7, HALF+6.5, 0, -8, 'pad', 0, .7, 'concreteDk');

  /* ---- stage 1 : steel ---- */
  frames.forEach(z => {
    const o = zo(z)*.7;
    [-HALF, HALF].forEach(x => member(V(x,.7,z), V(x,EAVE,z), .45, .7, 'column', 1, o, 'steel'));
    member(V(-HALF,EAVE,z), V(0,RIDGE,z), .45, .75, 'rafter', 1, o+.12, 'steel');
    member(V(HALF,EAVE,z),  V(0,RIDGE,z), .45, .75, 'rafter', 1, o+.12, 'steel');
  });
  [-HALF+.7, HALF-.7].forEach(x => member(V(x,6,Z0), V(x,6,-Z0), .45, .8, 'girder', 1, .78, 'girder', 'extend'));
  // wall + roof bracing in end bays
  [0, NB-1].forEach(b => {
    const za = frames[b], zb = frames[b+1];
    [-HALF, HALF].forEach(x => {
      pipe(V(x,.8,za), V(x,EAVE,zb), .06, 'bracing', 1, .82, 'steel2');
      pipe(V(x,EAVE,za), V(x,.8,zb), .06, 'bracing', 1, .82, 'steel2');
    });
    [-1,1].forEach(s => {
      pipe(V(s*HALF,EAVE,za), V(0,RIDGE,zb), .06, 'bracing', 1, .88, 'steel2');
      pipe(V(0,RIDGE,za), V(s*HALF,EAVE,zb), .06, 'bracing', 1, .88, 'steel2');
    });
  });
  // composite annex steel frame (G+2)
  const AL = [3.8, 7.6, 11];
  [AX0, (AX0+AX1)/2, AX1].forEach(x => [AZ0, AZ1].forEach(z => member(V(x,.6,z), V(x,11,z), .4, .4, 'ccol', 1, .55, 'steel')));
  AL.forEach((y, i) => {
    [AZ0, AZ1].forEach(z => member(V(AX0,y,z), V(AX1,y,z), .3, .5, 'cbeam', 1, .6 + i*.1, 'steel'));
    [AX0, (AX0+AX1)/2, AX1].forEach(x => member(V(x,y,AZ0), V(x,y,AZ1), .3, .5, 'cbeam', 1, .62 + i*.1, 'steel'));
  });

  /* ---- stage 2 : envelope + composite decks ---- */
  const nP = 5;
  [-1,1].forEach(s => {
    for(let i=0;i<=nP;i++){
      const x = s*(HALF - i*(HALF/nP)*.98), y = roofY(x) + .45;
      member(V(x,y,Z0-.3), V(x,y,-Z0+.3), .18, .22, 'purlin', 2, i/nP*.3, 'steel2', 'extend');
    }
  });
  // roof sheets per slope, bay by bay (leave one bay open as a skylight cut to see inside)
  frames.slice(0,-1).forEach((z, b) => {
    if(b === 2) return;
    [-1,1].forEach(s => {
      const g = new THREE.BoxGeometry(Math.hypot(HALF, RIDGE-EAVE)+.3, .08, BAY);
      const m = new THREE.Mesh(g, M.roof);
      m.position.set(s*HALF/2, (EAVE+RIDGE)/2 + .62, z + BAY/2);
      m.rotation.z = s * -Math.atan2(RIDGE-EAVE, HALF);
      register(m, 'roof', 2, .3 + b/NB*.4, 'drop', 'roof');
    });
  });
  // back wall (gable) + left side wall cladding, the right side stays open so the interior reads
  frames.slice(0,-1).forEach((z, b) => {
    const g = new THREE.BoxGeometry(.1, EAVE-.8, BAY); g.translate(0, (EAVE-.8)/2, 0);
    const m = new THREE.Mesh(g, M.clad); m.position.set(-HALF-.3, .8, z + BAY/2);
    register(m, 'cladding', 2, .35 + b/NB*.35, 'grow', 'clad');
  });
  {
    const shape = new THREE.Shape();
    shape.moveTo(-HALF, 0); shape.lineTo(HALF, 0); shape.lineTo(HALF, EAVE-.8); shape.lineTo(0, RIDGE-.8); shape.lineTo(-HALF, EAVE-.8); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth:.1, bevelEnabled:false });
    const m = new THREE.Mesh(g, M.clad); m.position.set(0, .8, Z0 - .35);
    register(m, 'cladding', 2, .7, 'grow', 'clad');
  }
  AL.forEach((y, i) => block(AX1-AX0+.6, .28, AZ1-AZ0+.6, (AX0+AX1)/2, y+.25, (AZ0+AZ1)/2, 'deck', 2, .2 + i*.18, 'deck', 'drop'));

  /* ---- stage 3 : MEP ---- */
  [-4.5, 4.5].forEach((x, k) => {
    pipe(V(x,7.1,Z0+1), V(x,7.1,-Z0-1), .5, 'duct', 3, k*.1, 'duct');
    frames.slice(1,-1).forEach((z, i) => pipe(V(x,6.6,z), V(x,4.8,z), .22, 'duct', 3, .25 + i*.05, 'duct'));
  });
  [-HALF+1.4, HALF-1.4].forEach(x => member(V(x,4.6,Z0+.5), V(x,4.6,-Z0-.5), .7, .14, 'tray', 3, .3, 'tray', 'extend'));
  [-8, 0, 8].forEach((x, k) => pipe(V(x,8.5 + (x===0 ? 1.4 : .4),Z0+.6), V(x,8.5 + (x===0 ? 1.4 : .4),-Z0-.6), .09, 'sprinkler', 3, .4 + k*.06, 'pipe'));
  frames.slice(0,-1).forEach((z, i) => [-6, 6].forEach(x => block(.9, .18, .9, x, roofY(x) - 1.6, z + BAY/2, 'light', 3, .55 + i*.05, 'light', 'drop')));
  // utility yard: transformer, DG set, chillers
  block(2.2, 2.1, 2.4, HALF+5.2, .35, -10, 'utility', 3, .6, 'utility', 'drop');
  block(2.6, 1.8, 4.2, HALF+7.6, .35, -8.5, 'utility', 3, .66, 'utility', 'drop');
  block(2.2, 1.4, 2.2, HALF+5.2, .35, -6.2, 'utility', 3, .72, 'utility', 'drop');
  pipe(V(HALF+4, 1.6, -10), V(HALF+.2, 1.6, -10), .12, 'utility', 3, .8, 'pipe');

  /* ---- stage 4 : handover ---- */
  const crane = new THREE.Group();
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(SPAN-1.4, .7, .8), M.crane);
  const bridge2 = bridge.clone(); bridge.position.set(0,6.75,-.6); bridge2.position.set(0,6.75,.6);
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.8, .7, 2.2), M.crane); trolley.position.set(3,7.2,0);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,3,6), M.steel); hook.position.set(3,5.4,0);
  [bridge, bridge2, trolley, hook].forEach(m => { m.castShadow = true; m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), null)); crane.add(m); m.userData.part = 'crane'; });
  crane.userData.part = 'crane';
  crane.position.set(0, 0, 4);
  root.add(crane);
  items.push({ mesh:crane, edges:null, group:true, part:'crane', cat:'handover', stage:4, order:.1, kind:'drop', mat:M.crane, target:crane.position.clone(), scale:crane.scale.clone(), trolley });
  [[HALF+6.5, 6], [-HALF-4, 10], [-HALF-4, -12]].forEach(([x, z], i) => block(4.5, .15, 6, x, 0, z, 'green', 4, .4 + i*.12, 'green'));

  const craneItem = items[items.length - 1 - 3];
  return {
    root, items, M, parts:PARTS,
    aria:'Interactive 3D model of an industrial facility built through the EPC stages. Drag to rotate.',
    // the commissioned EOT crane travels the bay once handover is reached
    tick(t, P){
      if(P < 4.3) return false;
      if(crane.visible && P >= 4.95){
        crane.position.z = craneItem.target.z + Math.sin(t * .35) * 13;
        trolley.position.x = 3 + Math.sin(t * .6) * 6;
        hook.position.x = trolley.position.x;
      }
      return true;
    }
  };
}

/* ---------------------------------------------------------
   SHARED KIT for the secondary scenes
--------------------------------------------------------- */
function createKit(){
  const root = new THREE.Group(), items = [], cache = {};
  const mat = (hex, o = {}) => {
    const k = hex + JSON.stringify(o);
    return cache[k] || (cache[k] = new THREE.MeshStandardMaterial(Object.assign({ color:hex, roughness:.7, metalness:.15 }, o)));
  };
  function register(mesh, part, stage, order, kind, material, extra = {}){
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = part;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), null);
    mesh.add(edges); root.add(mesh);
    const it = Object.assign({ mesh, edges, part, cat:part, stage, order:clamp(order, 0, 1), kind, mat:material,
      target:mesh.position.clone(), scale:mesh.scale.clone() }, extra);
    items.push(it); return it;
  }
  function block(w, h, d, x, y, z, part, stage, order, material, kind = 'grow', extra){
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h/2, 0);
    const m = new THREE.Mesh(g, material); m.position.set(x, y, z);
    return register(m, part, stage, order, kind, material, extra);
  }
  function member(a, b, w, h, part, stage, order, material, kind = 'drop', extra){
    const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, w), material);
    m.position.copy(a).add(b).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0), dir.normalize());
    return register(m, part, stage, order, kind, material, extra);
  }
  function sphere(r, x, y, z, part, stage, order, material, extra){
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), material); m.position.set(x, y, z);
    return register(m, part, stage, order, 'drop', material, extra);
  }
  // flat pulsing ring (not an item: drawn on top of everything, animated in tick)
  function ring(x, z, color){
    const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.25, 48), new THREE.MeshBasicMaterial({ color, transparent:true, opacity:.8, side:THREE.DoubleSide, depthWrite:false }));
    m.rotation.x = -Math.PI/2; m.position.set(x, .06, z); m.visible = false; root.add(m);
    return m;
  }
  function pulse(rings, t){
    rings.forEach((r, i) => {
      const k = ((t * .45) + i / rings.length) % 1;
      r.scale.setScalar(1 + k * 4.5); r.material.opacity = .75 * (1 - k);
    });
  }
  // a simple portal frame shed (used by the portfolio scene)
  function shed(o){
    const { cx, cz, span, len, eave, ridge, bay, part, stage = 1, orderBase = 0, M, roofBays = Infinity, girderY = 0, cladSides = [] } = o;
    const V = (x,y,z) => new THREE.Vector3(x,y,z);
    const half = span/2, n = Math.round(len / bay), z0 = cz - len/2;
    for(let i = 0; i <= n; i++){
      const z = z0 + i*bay, oo = orderBase + i/n*.35;
      [-half, half].forEach(x => member(V(cx+x,.3,z), V(cx+x,eave,z), .4, .55, part, stage, oo, M.steel));
      member(V(cx-half,eave,z), V(cx,ridge,z), .4, .6, part, stage, oo+.08, M.steel);
      member(V(cx+half,eave,z), V(cx,ridge,z), .4, .6, part, stage, oo+.08, M.steel);
    }
    if(girderY) [-half+.6, half-.6].forEach(x => member(V(cx+x,girderY,z0), V(cx+x,girderY,z0+len), .4, .7, part, stage, orderBase+.45, M.girder, 'extend'));
    const pitch = Math.atan2(ridge-eave, half), slope = Math.hypot(half, ridge-eave) + .3;
    for(let b = 0; b < Math.min(n, roofBays); b++){
      [-1, 1].forEach(s => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(slope, .08, bay), M.roof);
        m.position.set(cx + s*half/2, (eave+ridge)/2 + .4, z0 + b*bay + bay/2);
        m.rotation.z = s * -pitch;
        register(m, part, stage + 1, .1 + b/n*.5, 'drop', M.roof);
      });
    }
    cladSides.forEach(s => {
      for(let b = 0; b < n; b++) block(.1, eave-.3, bay, cx + s*(half+.2), .3, z0 + b*bay + bay/2, part, stage + 1, .3 + b/n*.4, M.clad);
    });
  }
  return { root, items, mat, register, block, member, sphere, ring, pulse, shed };
}
const V3 = (x,y,z) => new THREE.Vector3(x,y,z);

/* ---------------------------------------------------------
   SCENE: PROJECT PORTFOLIO — the three flagship projects on one estate
--------------------------------------------------------- */
function buildPortfolio(){
  const K = createKit(); const { mat, block, member, sphere, ring, shed } = K;
  const M = {
    base: mat(0xdfe3e8, { roughness:1 }), plot: mat(0xeceae5, { roughness:1 }), green: mat(0xb5cfae, { roughness:1 }),
    steel: mat(0x2f3b4f, { roughness:.55, metalness:.35 }), slab: mat(0xcdc8be, { roughness:.9 }),
    glass: mat(0x9cc2df, { roughness:.15, metalness:.3, transparent:true, opacity:.5 }),
    roof: mat(0xe6ebf1, { transparent:true, opacity:.65, side:THREE.DoubleSide, depthWrite:false }),
    clad: mat(0xd3dbe5, { transparent:true, opacity:.8, side:THREE.DoubleSide }),
    girder: mat(0xb4531f, { roughness:.55, metalness:.3 }), crane: mat(0xe8a817, { roughness:.45, metalness:.3 }),
    teal: mat(0x179a8b, { roughness:.35, emissive:0x0f7a6e, emissiveIntensity:.25 }),
    gold: mat(0xc8902f, { roughness:.35, emissive:0x9e6d17, emissiveIntensity:.25 })
  };
  const parts = {
    estate: ['Portfolio', 'Industrial projects', 'Manufacturing, life sciences and heavy industrial facilities'],
    p1: ['Completed · life sciences', 'SAFETAB Life Sciences', 'G+3 industrial facility. Structural steel and building works, completed in 75 days. Click to open the case study.'],
    p2: ['Under progress · manufacturing', 'Sai Nadha Plastics', 'Industrial manufacturing facility. PEB, roofing and cladding, now under execution. Click to open the case study.'],
    p3: ['Completed · heavy industrial', 'Schwing Stetter', 'Two heavy industrial buildings with structural systems and crane support infrastructure. Click to open the case study.']
  };

  block(96, .12, 84, 2, -.12, -4, 'estate', 0, 0, M.base);

  /* P1 — SAFETAB, G+3 steel framed facility */
  const a = { x:-24, z:18 };
  block(20, .15, 16, a.x, 0, a.z, 'p1', 0, .1, M.plot);
  const xs = [-7, 0, 7], zs = [-5, 5], lv = [0, 3.8, 7.6, 11.4, 15.2];
  xs.forEach(x => zs.forEach(z => member(V3(a.x+x,.2,a.z+z), V3(a.x+x,15.2,a.z+z), .45, .45, 'p1', 1, .05, M.steel)));
  lv.slice(1).forEach((y, i) => {
    zs.forEach(z => member(V3(a.x-7,y,a.z+z), V3(a.x+7,y,a.z+z), .35, .55, 'p1', 1, .15 + i*.12, M.steel));
    xs.forEach(x => member(V3(a.x+x,y,a.z-5), V3(a.x+x,y,a.z+5), .35, .55, 'p1', 1, .18 + i*.12, M.steel));
    block(14.6, .3, 10.6, a.x, y - .1, a.z, 'p1', 2, i*.12, M.slab, 'drop');
  });
  lv.slice(0, 4).forEach((y, i) => {
    block(14, 3.3, .12, a.x, y + .35, a.z + 5.2, 'p1', 2, .5 + i*.08, M.glass);
    block(.12, 3.3, 10, a.x + 7.2, y + .35, a.z, 'p1', 2, .55 + i*.08, M.glass);
  });

  /* P2 — Sai Nadha Plastics, PEB shed under construction */
  const b = { x:2, z:-4 };
  block(26, .15, 36, b.x, 0, b.z, 'p2', 0, .25, M.plot);
  shed({ cx:b.x, cz:b.z, span:18, len:30, eave:7, ridge:8.8, bay:6, part:'p2', M, roofBays:3, cladSides:[-1] });
  // mobile crane lifting the next roof panel
  block(3, 1.4, 6, b.x + 13.5, .15, b.z + 8, 'p2', 2, .6, M.crane, 'drop');
  member(V3(b.x+13.5,1.8,b.z+7), V3(b.x+7,13,b.z+10), .45, .45, 'p2', 2, .7, M.crane);
  member(V3(b.x+7,13,b.z+10), V3(b.x+7,9.8,b.z+10), .06, .06, 'p2', 2, .8, M.steel);
  block(6, .1, 3, b.x + 7, 9.3, b.z + 10, 'p2', 2, .85, M.roof, 'drop');

  /* P3 — Schwing Stetter, two heavy industrial bays with EOT cranes */
  const c = { x:28, z:-28 };
  block(30, .15, 30, c.x, 0, c.z, 'p3', 0, .4, M.plot);
  [-7, 7].forEach((dx, k) => {
    shed({ cx:c.x+dx, cz:c.z, span:13, len:24, eave:12, ridge:13.8, bay:6, part:'p3', M, girderY:9, cladSides:[k ? 1 : -1], orderBase:k*.2 });
    block(12, .8, 1.4, c.x+dx, 9.4, c.z - 3 + k*6, 'p3', 3, .1 + k*.1, M.crane, 'drop');
  });

  // green buffers
  [[-26, 2], [-8, 24], [22, 4]].forEach(([x, z], i) => block(8, .12, 5, x, 0, z, 'estate', 3, .2 + i*.1, M.green));

  // location pins + status rings
  const pins = [
    { part:'p1', x:a.x, z:a.z, y:15.6, m:M.teal, c:0x179a8b, name:'SAFETAB Life Sciences', sub:'Completed · G+3 in 75 days' },
    { part:'p2', x:b.x, z:b.z, y:9.4, m:M.gold, c:0xc8902f, name:'Sai Nadha Plastics', sub:'Under progress · PEB' },
    { part:'p3', x:c.x, z:c.z, y:14.2, m:M.teal, c:0x179a8b, name:'Schwing Stetter', sub:'Completed · heavy industrial' }
  ];
  const rings = [];
  pins.forEach((p, i) => {
    member(V3(p.x,p.y,p.z), V3(p.x,p.y+5,p.z), .12, .12, p.part, 3.4, i*.2, p.m);
    sphere(.9, p.x, p.y + 5.9, p.z, p.part, 3.4, i*.2 + .1, p.m);
    rings.push(ring(p.x, p.z, p.c));
  });

  return {
    root:K.root, items:K.items, parts,
    aria:'Interactive 3D portfolio of Procon projects: SAFETAB Life Sciences, Sai Nadha Plastics and Schwing Stetter. Drag to rotate and select a project.',
    hint:'Drag to rotate · click a project',
    touchHint:'Swipe to rotate · tap a project twice to open it',
    view:{ target:[3, 3, -5], dist:1.62, shadow:62 },
    labels: pins.map(p => ({ text:p.name, sub:p.sub, anchor:V3(p.x, p.y + 7.4, p.z), stage:3.6, part:p.part })),
    onClick(part){
      const id = { p1:'project-safetab', p2:'project-sainadha', p3:'project-schwing' }[part];
      const el = id && document.getElementById(id);
      if(el) el.scrollIntoView({ behavior:reduceMotion ? 'auto' : 'smooth', block:'center' });
    },
    tick(t, P){ rings.forEach(r => r.visible = P > 3.8); if(P > 3.8 && !reduceMotion) K.pulse(rings, t); return P > 3.8; }
  };
}

/* ---------------------------------------------------------
   SCENE: INTEGRATED DELIVERY — exploded axonometric of every discipline
   held together by one accountable team
--------------------------------------------------------- */
function buildLayers(){
  const K = createKit(); const { mat, block, member } = K;
  const M = {
    concrete: mat(0xdcd8d0, { roughness:.95 }), concreteDk: mat(0xc4beb3, { roughness:.95 }),
    steel: mat(0x2f3b4f, { roughness:.55, metalness:.35 }), steel2: mat(0x6b778a, { roughness:.5, metalness:.35 }),
    deck: mat(0xb9b4aa, { roughness:.9 }), duct: mat(0xa7b3c2, { roughness:.35, metalness:.6 }),
    tray: mat(0xd9a441, { roughness:.5, metalness:.3 }), pipe: mat(0xd62f2f, { roughness:.45 }),
    roof: mat(0xe2e8f0, { roughness:.6, metalness:.2, transparent:true, opacity:.8, side:THREE.DoubleSide }),
    clad: mat(0xd3dbe5, { roughness:.6, transparent:true, opacity:.8, side:THREE.DoubleSide }),
    core: new THREE.MeshStandardMaterial({ color:0xe2b25a, emissive:0xc8902f, emissiveIntensity:.5, roughness:.3 })
  };
  const parts = {
    civil: ['Layer 01 · civil', 'Foundations and floor slab', 'Engineered by our own civil team for durability and constructability.'],
    steel: ['Layer 02 · structural steel', 'Primary steel frame', 'Designed and fabricated within the Royal Fab Group ecosystem.'],
    comp: ['Layer 03 · composite', 'Composite mezzanine', 'Steel and concrete engineered to act as one system.'],
    mep: ['Layer 04 · MEP', 'Building services', 'Coordinated with the structure before anything reaches site.'],
    env: ['Layer 05 · envelope', 'Roof and cladding', 'PEB envelope detailed with the frame it sits on.'],
    core: ['Why Procon', 'One accountable team', 'A single point of responsibility connecting every discipline from design to handover.']
  };
  const up = { civil:0, steel:3, comp:7, mep:10, env:13.5 };
  const E = k => ({ explode:V3(0, up[k], 0) });
  const xs = [-6, 0, 6], zs = [-9, -3, 3, 9];

  xs.forEach(x => zs.forEach(z => block(1.4, .6, 1.4, x, 0, z, 'civil', 0, .1 + (z+9)/18*.4, M.concreteDk, 'grow', E('civil'))));
  block(12.6, .25, 18.6, 0, .3, 0, 'civil', 0, .7, M.concrete, 'grow', E('civil'));

  xs.forEach(x => zs.forEach(z => member(V3(x,.6,z), V3(x,8.4,z), .4, .4, 'steel', 1, (z+9)/18*.5, M.steel, 'drop', E('steel'))));
  [4.2, 8.4].forEach((y, i) => {
    xs.forEach(x => member(V3(x,y,-9), V3(x,y,9), .3, .5, 'steel', 1, .45 + i*.15, M.steel, 'drop', E('steel')));
    zs.forEach(z => member(V3(-6,y,z), V3(6,y,z), .3, .5, 'steel', 1, .5 + i*.15, M.steel, 'drop', E('steel')));
  });
  [[V3(-6,.6,-9), V3(-6,8.4,-3)], [V3(-6,8.4,-9), V3(-6,.6,-3)], [V3(6,.6,3), V3(6,8.4,9)], [V3(6,8.4,3), V3(6,.6,9)]]
    .forEach(([p, q]) => member(p, q, .12, .12, 'steel', 1, .85, M.steel2, 'drop', E('steel')));

  block(12.2, .12, 12.2, 0, 4.45, -3, 'comp', 2, .1, M.steel2, 'drop', E('comp'));
  block(12.2, .3, 12.2, 0, 4.57, -3, 'comp', 2, .35, M.deck, 'drop', E('comp'));

  [-2.8, 2.8].forEach((x, i) => {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 18, 16).rotateX(Math.PI/2), M.duct);
    d.position.set(x, 7.2, 0); K.register(d, 'mep', 3, i*.15, 'drop', M.duct, E('mep'));
  });
  block(.8, .14, 18, -4.8, 6.4, 0, 'mep', 3, .35, M.tray, 'drop', E('mep'));
  block(.8, .14, 18, 4.8, 6.4, 0, 'mep', 3, .4, M.tray, 'drop', E('mep'));
  const sp = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 18, 8).rotateX(Math.PI/2), M.pipe);
  sp.position.set(0, 7.9, 0); K.register(sp, 'mep', 3, .55, 'drop', M.pipe, E('mep'));

  const pitch = Math.atan2(1.4, 6);
  [-1, 1].forEach((s, i) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 1.4) + .4, .12, 18.8), M.roof);
    r.position.set(s*3, 9.3, 0); r.rotation.z = s * -pitch;
    K.register(r, 'env', 3.6, i*.2, 'drop', M.roof, E('env'));
  });
  block(.1, 7.8, 18.4, -6.25, .6, 0, 'env', 3.6, .5, M.clad, 'grow', E('env'));

  // the accountable-team spine: visible while the stack is exploded
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 1, 12), M.core);
  core.userData.part = 'core'; core.position.set(0, 0, 0); core.visible = false; K.root.add(core);
  const nodes = Object.keys(up).map(k => {
    const n = new THREE.Mesh(new THREE.SphereGeometry(.42, 20, 14), M.core);
    n.userData.part = 'core'; n.userData.k = k; n.visible = false; K.root.add(n); return n;
  });
  const levelY = { civil:.55, steel:8.4, comp:4.9, mep:7.2, env:9.9 };

  return {
    root:K.root, items:K.items, parts,
    aria:'Interactive exploded 3D diagram of the disciplines Procon integrates: civil, structural steel, composite, MEP and envelope. Drag to rotate.',
    hint:'Drag to rotate · hover a layer',
    touchHint:'Swipe to rotate · tap a layer', labelAlign:'left',
    view:{ target:[0, 12.5, 0], dist:.98, mobileDist:.74 }, autoRotate:false,
    explodable:true, explodeDefault:1,
    labels:[
      { text:'Civil', sub:'Foundations and slab', anchor:V3(-7, .6, 9.8), explode:V3(0, up.civil, 0), stage:.8, part:'civil' },
      { text:'Structural steel', sub:'Frame fabricated in group', anchor:V3(-7, 6, 9.8), explode:V3(0, up.steel, 0), stage:1.8, part:'steel' },
      { text:'Composite', sub:'Mezzanine deck', anchor:V3(-7, 4.9, 3.4), explode:V3(0, up.comp, 0), stage:2.6, part:'comp' },
      { text:'MEP', sub:'Coordinated services', anchor:V3(-6, 7.2, 9.8), explode:V3(0, up.mep, 0), stage:3.4, part:'mep' },
      { text:'Envelope', sub:'Roof and cladding', anchor:V3(-7, 9, 9.8), explode:V3(0, up.env, 0), stage:4.2, part:'env' },
      { text:'One accountable team', sub:'Design to handover', anchor:V3(0, 26, 0), stage:4.6, part:'core', core:true }
    ],
    tick(t, P, ex){
      const on = P > 4.4 && ex > .05;
      const top = levelY.env + up.env * ex + 1.2;
      core.visible = on; core.scale.y = Math.max(.01, top); core.position.y = top/2;
      nodes.forEach(n => { n.visible = on; n.position.y = levelY[n.userData.k] + up[n.userData.k] * ex; });
      return false;
    }
  };
}

/* ---------------------------------------------------------
   SCENE: OFFICE LOCATOR — Puducherry head office on the Bay of Bengal coast
--------------------------------------------------------- */
function buildLocator(){
  const K = createKit(); const { mat, block, member, sphere, ring } = K;
  const M = {
    street: mat(0xe3e6ea, { roughness:1 }), bldg: mat(0xf4f5f7, { roughness:.9 }), bldg2: mat(0xe7eaee, { roughness:.9 }),
    park: mat(0xb9d2b1, { roughness:1 }), sand: mat(0xeee4cc, { roughness:1 }),
    sea: mat(0xbcd8ea, { roughness:.25, metalness:.1, transparent:true, opacity:.9 }),
    office: mat(0xe2b25a, { roughness:.4, metalness:.2, emissive:0xc8902f, emissiveIntensity:.2 }),
    glass: mat(0x9cc2df, { roughness:.15, metalness:.3, transparent:true, opacity:.55 }),
    pin: mat(0x0e1626, { roughness:.4 }), pinHead: mat(0xc8902f, { roughness:.3, emissive:0x9e6d17, emissiveIntensity:.35 })
  };
  const parts = {
    city: ['Puducherry', 'City grid', 'Our head office is a short drive from the East Coast Road.'],
    office: ['Head office', 'Procon Infra LLP', 'No. 252, Ananda Ranga Pillai Nagar, Kamaraj Salai, Puducherry 605008. Click to view the map.'],
    coast: ['Coastline', 'Bay of Bengal', 'Puducherry sits on the Coromandel coast.']
  };
  // deterministic pseudo random so the city looks the same on every visit
  let seed = 252;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const P = 7, N = 5, maxD = Math.hypot(N, N) * P;
  block(P*(2*N+1) + 4, .12, P*(2*N+1) + 4, 0, -.12, 0, 'city', 0, 0, M.street);
  for(let i = -N; i <= N; i++){
    for(let j = -N; j <= N; j++){
      const x = i*P, z = j*P, d = Math.hypot(x, z);
      if(i >= 3){ continue; }                       // east of the grid is the coast
      const stage = d / maxD * 2.2;
      if(i === 0 && j === 0){
        block(5, 7.5, 5, x, 0, z, 'office', 2.4, 0, M.office);
        block(5.1, .9, 5.1, x, 2.2, z, 'office', 2.5, 0, M.glass, 'grow');
        block(5.1, .9, 5.1, x, 4.4, z, 'office', 2.55, 0, M.glass, 'grow');
        block(5.1, .9, 5.1, x, 6.4, z, 'office', 2.6, 0, M.glass, 'grow');
        continue;
      }
      const r = rnd();
      if(r < .1){ block(5, .15, 5, x, 0, z, 'city', stage, 0, M.park); continue; }
      const h = (1 + Math.pow(rnd(), 1.8) * 4.2) * (.55 + .45 * clamp(d / (P*3), 0, 1));
      if(r < .45){
        block(2.3, h, 5, x - 1.35, 0, z, 'city', stage, 0, M.bldg);
        block(2.3, h * (.5 + rnd()*.6), 5, x + 1.35, 0, z, 'city', stage, .1, M.bldg2);
      } else block(5, h, 5, x, 0, z, 'city', stage, 0, rnd() > .5 ? M.bldg : M.bldg2);
    }
  }
  block(5, .14, P*(2*N+1) + 4, 3*P - 1.5, 0, 0, 'coast', 1.6, 0, M.sand);
  block(40, .06, P*(2*N+1) + 4, 3*P + 21, -.05, 0, 'coast', 1.7, 0, M.sea);

  member(V3(0,7.6,0), V3(0,14.5,0), .14, .14, 'office', 3.2, 0, M.pin);
  sphere(1.2, 0, 15.5, 0, 'office', 3.2, .2, M.pinHead);
  const rings = [ring(0, 0, 0xc8902f), ring(0, 0, 0xc8902f), ring(0, 0, 0xc8902f)];

  return {
    root:K.root, items:K.items, parts,
    aria:'Interactive 3D map of Puducherry showing the Procon Infra LLP head office. Drag to rotate.',
    hint:'Drag to rotate · click the office',
    touchHint:'Swipe to rotate · tap the office twice for the map',
    view:{ target:[4, 2, 0], dist:1.55, shadow:55 },
    labels:[
      { text:'Procon Infra LLP', sub:'Kamaraj Salai, Puducherry', anchor:V3(0, 17.4, 0), stage:3.5, part:'office' },
      { text:'Bay of Bengal', sub:'', anchor:V3(3*P + 14, .5, -18), stage:2, part:'coast', muted:true }
    ],
    onClick(part){
      if(part !== 'office') return;
      const el = document.getElementById('office-map');
      if(el) el.scrollIntoView({ behavior:reduceMotion ? 'auto' : 'smooth', block:'center' });
    },
    tick(t, P){ rings.forEach(r => r.visible = P > 3.4); if(P > 3.4 && !reduceMotion) K.pulse(rings, t); return P > 3.4; }
  };
}

const SCENES = { plant:buildModel, portfolio:buildPortfolio, layers:buildLayers, locator:buildLocator };

/* ---------------------------------------------------------
   VIEWER
--------------------------------------------------------- */
class EPCViewer{
  constructor(el){
    this.el = el;
    this.focus = (el.dataset.focus || '').split(',').map(s => s.trim()).filter(Boolean);
    this.scrubEl = el.dataset.scrub ? document.querySelector(el.dataset.scrub) : null;
    this.P = reduceMotion ? 5 : 0;         // animated build progress 0..5
    this.target = reduceMotion ? 5 : 0;
    this.blueprint = false;
    this.hoverPart = null;
    this.visible = false;
    this.autoplay = !this.scrubEl;
    this.ex = this.exTarget = 0;
    this.clock = new THREE.Clock();
    // ?epc=2.5 freezes the build at a given stage (for reviews and screenshots)
    const fixed = new URLSearchParams(location.search).get('epc');
    if(fixed !== null){ this.P = this.target = clamp(+fixed || 0, 0, 5); this.scrubEl = null; this.autoplay = false; }
    this.init();
  }

  init(){
    const el = this.el;
    el.classList.add('epc3d');
    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:coarse ? 'default' : 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'epc3d__canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    el.appendChild(this.renderer.domElement);

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, .5, 400);
    const dist = el.dataset.distance ? +el.dataset.distance : 1;
    this.camera.position.set(46*dist, 30*dist, 52*dist);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dde4, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(-30, 50, 25); sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    const model = this.model = (SCENES[el.dataset.scene] || buildModel)();
    const view = this.view = model.view || {};
    const sb = view.shadow || 40;
    Object.assign(sun.shadow.camera, { left:-sb, right:sb, top:sb, bottom:-sb, near:1, far:160 });
    this.renderer.domElement.setAttribute('aria-label', model.aria);
    if(model.explodable) this.ex = this.exTarget = model.explodeDefault || 0;
    sun.shadow.bias = -.0005;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.ShadowMaterial({ opacity:.1 }));
    ground.rotation.x = -Math.PI/2; ground.position.y = -.13; ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(120, 60, 0xc9d1dc, 0xe3e8ee);
    grid.position.y = -.14; grid.material.transparent = true; grid.material.opacity = .55;
    scene.add(grid); this.grid = grid;

    if(!el.dataset.scene) model.root.position.z = -3;
    scene.add(model.root);

    this.lineMat = new THREE.LineBasicMaterial({ color:0x0e1626, transparent:true, opacity:.16 });
    this.lineGhost = new THREE.LineBasicMaterial({ color:0x0e1626, transparent:true, opacity:.07 });
    this.lineBlue = new THREE.LineBasicMaterial({ color:0x2563eb, transparent:true, opacity:.75 });
    this.ghostMat = new THREE.MeshBasicMaterial({ color:0xdfe5ec, transparent:true, opacity:.22, depthWrite:false });
    this.blueFill = new THREE.MeshBasicMaterial({ color:0xdbe7fb, transparent:true, opacity:.25, depthWrite:false, side:THREE.DoubleSide });
    this.hlMat = new THREE.MeshStandardMaterial({ color:0xe2b25a, emissive:0xc8902f, emissiveIntensity:.45, roughness:.4 });
    this.applyMaterials();

    const controls = this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.target.fromArray(view.target || [0, 3.5, 2]);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.enableZoom = false; controls.enablePan = false;
    controls.minPolarAngle = .35; controls.maxPolarAngle = 1.35;
    controls.autoRotate = !reduceMotion && model.autoRotate !== false; controls.autoRotateSpeed = .45;
    controls.addEventListener('start', () => { controls.autoRotate = false; this.syncTools(); el.classList.add('is-dragging'); });
    controls.addEventListener('end', () => el.classList.remove('is-dragging'));
    this.renderer.domElement.style.touchAction = 'pan-y';   // vertical swipes scroll the page, sideways swipes orbit

    this.buildUI();
    this.bindPointer();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(el);

    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if(this.visible && this.autoplay && this.target < 5 && !this.startedAt) this.startedAt = performance.now();
      if(this.visible) this.loop();
    }, { threshold:.05 }).observe(el);

    if(this.scrubEl) this.bindScrub();
    el.classList.add('is-ready');
    el.closest('.page-hero, .hx')?.classList.add('has-3d');
  }

  /* ---------- materials by mode ---------- */
  materialFor(it){
    if(this.hoverPart && it.part === this.hoverPart) return this.hlMat;
    if(this.blueprint) return this.blueFill;
    if(this.focus.length && !this.focus.includes(it.cat)) return this.ghostMat;
    return it.mat;
  }
  lineFor(it){
    if(this.blueprint) return this.lineBlue;
    if(this.focus.length && !this.focus.includes(it.cat)) return this.lineGhost;
    return this.lineMat;
  }
  applyMaterials(){
    for(const it of this.model.items){
      if(it.group){
        it.mesh.children.forEach(c => { c.material = this.materialFor(it); c.children[0].material = this.lineFor(it); });
      } else { it.mesh.material = this.materialFor(it); it.edges.material = this.lineFor(it); }
    }
    this.grid.material.opacity = this.blueprint ? .9 : .55;
    this.el.classList.toggle('is-blueprint', this.blueprint);
  }

  /* ---------- UI ---------- */
  buildUI(){
    const el = this.el;
    const tools = document.createElement('div');
    tools.className = 'epc3d__tools';
    tools.innerHTML = `
      <button type="button" class="epc3d__tool" data-act="rotate" aria-pressed="true" title="Auto rotate">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><polyline points="20 4 20 9 15 9"/></svg><span>Rotate</span></button>
      <button type="button" class="epc3d__tool" data-act="blueprint" aria-pressed="false" title="Blueprint view">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg><span>Blueprint</span></button>
      <button type="button" class="epc3d__tool" data-act="replay" title="Replay the build">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polygon points="7 4 19 12 7 20 7 4"/></svg><span>Replay</span></button>`;
    el.appendChild(tools);
    this.tools = tools;
    if(this.scrubEl) tools.querySelector('[data-act="replay"]').remove();
    if(this.model.explodable){
      tools.insertAdjacentHTML('afterbegin', `<button type="button" class="epc3d__tool" data-act="explode" aria-pressed="true" title="Explode or assemble the layers">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4-8 4-8-4 8-4z"/><path d="M4 13l8 4 8-4"/><path d="M4 17.5l8 4 8-4"/></svg><span>Assemble</span></button>`);
    }
    tools.addEventListener('click', e => {
      const b = e.target.closest('button'); if(!b) return;
      const act = b.dataset.act;
      if(act === 'rotate') this.controls.autoRotate = !this.controls.autoRotate;
      if(act === 'blueprint'){ this.blueprint = !this.blueprint; this.applyMaterials(); }
      if(act === 'explode'){ this.exTarget = this.exTarget > .5 ? 0 : 1; }
      if(act === 'replay'){ this.P = 0; this.target = 0; this.startedAt = performance.now(); this.autoplay = true; }
      this.syncTools(); this.loop();
    });

    const tip = document.createElement('div');
    tip.className = 'epc3d__tip'; tip.setAttribute('role', 'status');
    el.appendChild(tip); this.tip = tip;

    const hint = document.createElement('div');
    hint.className = 'epc3d__hint';
    hint.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V4a1.5 1.5 0 0 1 3 0v6.5"/><path d="M15 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3L3.6 13a1.5 1.5 0 0 1 2.6-1.5L9 15"/></svg> ' + (coarse ? (this.model.touchHint || 'Swipe sideways to rotate · tap a part') : (this.model.hint || 'Drag to rotate · hover a component'));
    el.appendChild(hint);

    this.labels = (this.model.labels || []).map(l => {
      const d = document.createElement('div');
      d.className = 'epc3d__label' + (l.muted ? ' is-muted' : '') + (l.core ? ' is-core' : '');
      d.innerHTML = `<b>${l.text}</b>${l.sub ? `<span>${l.sub}</span>` : ''}`;
      el.appendChild(d);
      return Object.assign({ el:d, v:new THREE.Vector3() }, l);
    });

    if(el.dataset.label){
      const lg = document.createElement('div');
      lg.className = 'epc3d__legend';
      lg.innerHTML = `<i></i>${el.dataset.label}`;
      el.appendChild(lg);
    }

    if(el.hasAttribute('data-rail')){
      const rail = document.createElement('div');
      rail.className = 'epc3d__rail';
      rail.setAttribute('role', 'tablist');
      rail.setAttribute('aria-label', 'EPC delivery stages');
      rail.innerHTML = STAGES.map((s, i) => `
        <button type="button" role="tab" class="epc3d__stage" data-i="${i}" aria-selected="false">
          <span class="epc3d__bar"><i></i></span>
          <span class="epc3d__num">${s.num}</span><span class="epc3d__name">${s.title}</span>
        </button>`).join('');
      const info = document.createElement('div');
      info.className = 'epc3d__info';
      info.innerHTML = '<span class="epc3d__info-k"></span><b class="epc3d__info-t"></b><p class="epc3d__info-p"></p>';
      el.append(info);
      (el.dataset.railTarget ? document.querySelector(el.dataset.railTarget) : el).append(rail);
      this.rail = rail; this.info = info;
      rail.addEventListener('click', e => {
        const b = e.target.closest('.epc3d__stage'); if(!b) return;
        this.goToStage(+b.dataset.i);
      });
    }
    this.syncTools();
  }
  syncTools(){
    const r = this.tools.querySelector('[data-act="rotate"]');
    const bp = this.tools.querySelector('[data-act="blueprint"]');
    const xb = this.tools.querySelector('[data-act="explode"]');
    if(xb){ xb.setAttribute('aria-pressed', String(this.exTarget > .5)); xb.querySelector('span').textContent = this.exTarget > .5 ? 'Assemble' : 'Explode'; }
    r.setAttribute('aria-pressed', this.controls ? String(this.controls.autoRotate) : 'true');
    bp.setAttribute('aria-pressed', String(this.blueprint));
  }
  goToStage(i){
    const tgt = i + 1;
    if(this.scrubEl && this.scrubActive()){
      const r = this.scrubEl.getBoundingClientRect();
      const top = window.scrollY + r.top;
      const span = this.scrubEl.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + span * (tgt/5) - 2, behavior: reduceMotion ? 'auto' : 'smooth' });
    } else {
      this.autoplay = false; this.target = tgt;
    }
    this.loop();
  }
  updateRail(){
    if(!this.rail) return;
    const cur = Math.min(4, Math.floor(Math.max(0, this.P - .001)));
    this.rail.querySelectorAll('.epc3d__stage').forEach((b, i) => {
      const f = clamp(this.P - i, 0, 1);
      b.querySelector('i').style.transform = `scaleX(${f})`;
      b.setAttribute('aria-selected', String(i === cur));
      b.classList.toggle('is-done', f >= 1);
    });
    if(this.infoStage !== cur){
      this.infoStage = cur;
      const s = STAGES[cur];
      this.info.classList.remove('is-in'); void this.info.offsetWidth;
      this.info.querySelector('.epc3d__info-k').textContent = `Stage ${s.num} of 05`;
      this.info.querySelector('.epc3d__info-t').textContent = s.title;
      this.info.querySelector('.epc3d__info-p').textContent = s.text;
      this.info.classList.add('is-in');
    }
  }

  /* ---------- floating HTML labels ---------- */
  updateLabels(){
    if(!this.labels.length) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    for(const l of this.labels){
      l.v.copy(l.anchor);
      if(l.explode) l.v.addScaledVector(l.explode, this.ex);
      this.model.root.localToWorld(l.v);
      l.v.project(this.camera);
      const show = this.P >= l.stage && l.v.z < 1 && (!l.core || this.ex > .3);
      l.el.classList.toggle('show', show);
      l.el.classList.toggle('is-hot', this.hoverPart === l.part);
      if(show){
        let x = (l.v.x + 1) / 2 * w, y = (1 - l.v.y) / 2 * h;
        const lw = l.el.offsetWidth, lh = l.el.offsetHeight;
        if(this.model.labelAlign === 'left') x = Math.max(x, lw + 12);
        else x = clamp(x, lw/2 + 6, w - lw/2 - 6);
        y = clamp(y, lh + 6, h - 6);
        l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    }
  }

  /* ---------- hover picking ---------- */
  bindPointer(){
    const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    let queued = null;
    const pick = (direct) => {
      const e = direct || queued; queued = null; if(!e) return null;
      const r = this.renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left)/r.width)*2 - 1, -((e.clientY - r.top)/r.height)*2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const meshes = [];
      this.model.root.traverse(o => { if(o.isMesh && o.visible) meshes.push(o); });
      const hit = ray.intersectObjects(meshes, false)[0];
      const part = hit ? (hit.object.userData.part || hit.object.parent.userData.part) : null;
      if(part !== this.hoverPart){ this.hoverPart = part; this.applyMaterials(); this.loop(); }
      if(part){
        const [cat, name, desc] = (this.model.parts || PARTS)[part];
        const disc = { civil:'Civil', steel:'Structural steel', envelope:'PEB envelope', composite:'Composite', mep:'MEP', handover:'Commissioning' }[cat] || cat;
        this.tip.innerHTML = `<span>${disc}</span><b>${name}</b>${desc}`;
        const x = clamp(e.clientX - r.left + 16, 8, r.width - 230), y = clamp(e.clientY - r.top + 16, 8, r.height - 90);
        this.tip.style.transform = `translate(${x}px, ${y}px)`;
        this.tip.classList.add('show');
        this.renderer.domElement.style.cursor = this.model.onClick ? 'pointer' : 'grab';
      } else { this.tip.classList.remove('show'); this.renderer.domElement.style.cursor = ''; }
      return part;
    };
    this.renderer.domElement.addEventListener('pointermove', e => {
      if(e.pointerType === 'touch') return;
      if(!queued) requestAnimationFrame(pick);
      queued = e;
    });
    // click a component (ignored when the pointer moved, i.e. an orbit drag)
    let down = null;
    this.renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    let lastTap = null, tipTimer = 0;
    this.renderer.domElement.addEventListener('pointerup', e => {
      if(!down) return;
      const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]); down = null;
      if(moved >= 8) return;
      if(e.pointerType === 'touch'){
        // first tap inspects a part, a second tap on the same part runs its action
        const part = pick(e);
        if(part && part === lastTap && this.model.onClick) this.model.onClick(part);
        lastTap = part;
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => { this.tip.classList.remove('show'); lastTap = null; if(this.hoverPart){ this.hoverPart = null; this.applyMaterials(); this.loop(); } }, 4000);
        return;
      }
      if(this.hoverPart && this.model.onClick) this.model.onClick(this.hoverPart);
    });
    this.renderer.domElement.addEventListener('pointerleave', e => {
      if(e.pointerType === 'touch') return;
      this.tip.classList.remove('show');
      if(this.hoverPart){ this.hoverPart = null; this.applyMaterials(); this.loop(); }
    });
  }

  /* ---------- scroll scrub (sticky hero) ---------- */
  scrubActive(){ return window.matchMedia('(min-width: 1041px)').matches && !reduceMotion; }
  bindScrub(){
    let ticking = false;
    const read = () => {
      ticking = false;
      if(!this.scrubActive()){ if(this.target === 0 && !this.startedAt){ this.autoplay = true; this.startedAt = performance.now(); } return; }
      this.autoplay = false;
      const r = this.scrubEl.getBoundingClientRect();
      const span = this.scrubEl.offsetHeight - window.innerHeight;
      const t = clamp(-r.top / Math.max(1, span), 0, 1);
      this.target = .35 + t * 4.65;
      this.scrubEl.style.setProperty('--scrub', t.toFixed(4));
      this.loop();
    };
    const onScroll = () => { if(!ticking){ ticking = true; requestAnimationFrame(read); } };
    window.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll);
    read();
  }

  resize(){
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if(!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w/h;
    // pull back on narrow/tall containers so the whole plant stays framed
    const base = this.el.dataset.distance ? +this.el.dataset.distance : 1;
    const vd = (w < 640 && this.view.mobileDist) || this.view.dist || 1;
    const k = base * vd * 1.38 * clamp(1.2 / this.camera.aspect, 1, 1.9);
    this.camera.position.setLength(new THREE.Vector3(46, 30, 52).length() * k);
    // optional horizontal framing offset so the plant clears overlaid copy
    const shift = window.innerWidth > 1040 ? +(this.el.dataset.shift || 0) : 0;
    if(shift) this.camera.setViewOffset(w, h, -w * shift, 0, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.loop();
  }

  /* ---------- per frame ---------- */
  apply(){
    const P = this.P;
    for(const it of this.model.items){
      const local = clamp((P - it.stage - it.order*.6) / .4, 0, 1);
      const e = easeOut(local);
      const m = it.mesh;
      m.visible = local > 0;
      if(!m.visible) continue;
      m.position.copy(it.target); m.scale.copy(it.scale);
      if(it.explode) m.position.addScaledVector(it.explode, this.ex);
      if(it.kind === 'drop'){ m.position.y += (1 - e) * 7; }
      else if(it.kind === 'grow'){ m.scale.y = Math.max(.001, e); }
      else if(it.kind === 'extend'){ m.scale.x = Math.max(.001, e); }
    }
  }

  loop(){
    if(this.raf) return;
    const tick = () => {
      this.raf = null;
      const dt = Math.min(this.clock.getDelta(), .2);
      if(this.autoplay && this.startedAt && !reduceMotion){
        const elapsed = (performance.now() - this.startedAt) / 1000;
        this.target = Math.min(5, elapsed * .95);
      }
      const prevEx = this.ex;
      this.ex += (this.exTarget - this.ex) * Math.min(1, dt * (reduceMotion ? 60 : 3.2));
      if(Math.abs(this.exTarget - this.ex) < .001) this.ex = this.exTarget;
      const prev = this.P;
      this.P += (this.target - this.P) * Math.min(1, dt * 5);
      if(Math.abs(this.target - this.P) < .0005) this.P = this.target;
      this.apply();
      this.updateRail();

      const live = this.model.tick ? !!this.model.tick(performance.now() / 1000, this.P, this.ex) : false;
      const moving = this.controls.update() || this.controls.autoRotate || prev !== this.P || prevEx !== this.ex || (live && !reduceMotion);
      this.renderer.render(this.scene, this.camera);
      this.updateLabels();
      if(this.visible && !document.hidden && moving) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}

function mount(){
  const els = document.querySelectorAll('[data-epc3d]');
  if(!els.length) return;
  if(!webglOK()){ document.documentElement.classList.add('no-webgl'); return; }
  window.__epc = [];
  els.forEach(el => { try { window.__epc.push(new EPCViewer(el)); } catch(err){ console.warn('EPC 3D viewer failed', err); } });
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
