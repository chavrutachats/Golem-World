/**
 * Junta as peças paradas de um cenário numa malha por material: o mapa tem centenas
 * de árvores e pedras, e cada malha separada custaria uma chamada de desenho. Depois
 * de juntar, um mundo inteiro sai em poucas dezenas.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeStatic(root: THREE.Object3D, { castShadow = true, receiveShadow = false }: { castShadow?: boolean; receiveShadow?: boolean } = {}): THREE.Group {
  root.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const keep: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Points).isPoints) {
      keep.push(o);
      return;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(m.matrixWorld);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const list = byMaterial.get(m.material);
    if (list) list.push(g);
    else byMaterial.set(m.material, [g]);
  });
  const out = new THREE.Group();
  for (const [material, list] of byMaterial) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  for (const o of keep) {
    const world = o.matrixWorld.clone();
    o.removeFromParent();
    world.decompose(o.position, o.quaternion, o.scale);
    out.add(o);
  }
  return out;
}
