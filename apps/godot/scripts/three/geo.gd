## Geometrias do Golem World, iguais às de apps/mobile/src/three/kit.ts (geo.*), em cache.
##
## Cada função devolve uma "receita" ({k, make}); Kit.mesh escolhe a versão facetada (o
## estilo de barro, com uma normal por triângulo) ou lisa (vidro, metal), conforme o
## material, e guarda as duas em cache.
class_name Geo

static var _cache := {}


static func _spec(key: String, make: Callable) -> Dictionary:
	return {"k": key, "make": make}


## A malha da receita, facetada ou lisa.
static func resolve(spec: Dictionary, smooth: bool) -> Mesh:
	var key := "%s|%s" % [spec.k, "s" if smooth else "f"]
	if _cache.has(key):
		return _cache[key]
	var arrays: Array = (spec.make as Callable).call()
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays if smooth else _flatten(arrays))
	_cache[key] = m
	return m


static func _r3(n: float) -> String:
	return str(snappedf(n, 0.001))


# --- Primitivas do Godot (já com normais lisas) ------------------------------------------


static func _prim(p: PrimitiveMesh) -> Array:
	return p.get_mesh_arrays()


static func box(w: float, h: float, d: float) -> Dictionary:
	return _spec("box|%s|%s|%s" % [_r3(w), _r3(h), _r3(d)], func():
		var b := BoxMesh.new()
		b.size = Vector3(w, h, d)
		return _prim(b))


static func cyl(rt: float, rb: float, h: float, seg := 8) -> Dictionary:
	return _spec("cyl|%s|%s|%s|%d" % [_r3(rt), _r3(rb), _r3(h), seg], func():
		var c := CylinderMesh.new()
		c.top_radius = rt
		c.bottom_radius = rb
		c.height = h
		c.radial_segments = seg
		c.rings = 0
		return _prim(c))


static func cone(r: float, h: float, seg := 7) -> Dictionary:
	return cyl(0.0, r, h, seg)


static func capsule(r: float, length: float, seg := 6) -> Dictionary:
	return _spec("cap|%s|%s|%d" % [_r3(r), _r3(length), seg], func():
		var c := CapsuleMesh.new()
		c.radius = r
		c.height = length + 2.0 * r
		c.radial_segments = maxi(4, seg)
		c.rings = 3
		return _prim(c))


# --- Geradas aqui ------------------------------------------------------------------------


## Esfera de poucas faces (icosaedro subdividido `detail` vezes), como IcosahedronGeometry.
static func ball(r: float, detail := 1) -> Dictionary:
	return _spec("ball|%s|%d" % [_r3(r), detail], func():
		var t := (1.0 + sqrt(5.0)) / 2.0
		var v: Array[Vector3] = []
		for p in [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]:
			v.append(Vector3(p[0], p[1], p[2]).normalized())
		var f: Array = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
		var tris: Array = []
		for face in f:
			tris.append([v[face[0]], v[face[1]], v[face[2]]])
		for _i in detail:
			var next: Array = []
			for tri in tris:
				var a: Vector3 = tri[0]
				var b: Vector3 = tri[1]
				var c: Vector3 = tri[2]
				var ab := ((a + b) / 2.0).normalized()
				var bc := ((b + c) / 2.0).normalized()
				var ca := ((c + a) / 2.0).normalized()
				next.append_array([[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]])
			tris = next
		var st := _Builder.new()
		for tri in tris:
			st.tri(tri[0] * r, tri[1] * r, tri[2] * r, tri[0], tri[1], tri[2])
		return st.arrays())


## Dodecaedro aproximado (as pedrinhas): icosaedro sem subdivisão.
static func dodeca(r: float) -> Dictionary:
	return ball(r, 0)


## Esfera em faixas, com a calota até `theta` (π = inteira; π/2 = cúpula), como SphereGeometry.
static func sphere(r: float, w := 12, h := 8, theta := PI) -> Dictionary:
	return _spec("sph|%s|%d|%d|%s" % [_r3(r), w, h, _r3(theta)], func():
		var st := _Builder.new()
		var at := func(i: int, j: int) -> Vector3:
			var phi := float(i) / w * TAU
			var th := float(j) / h * theta
			return Vector3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th))
		for j in h:
			for i in w:
				var a: Vector3 = at.call(i, j)
				var b: Vector3 = at.call(i + 1, j)
				var c: Vector3 = at.call(i + 1, j + 1)
				var d: Vector3 = at.call(i, j + 1)
				if j > 0:
					st.tri(a * r, b * r, c * r, a, b, c)
				st.tri(a * r, c * r, d * r, a, c, d)
		return st.arrays())


## Toro (ou arco de toro) no plano XY, como TorusGeometry(r, tube, 6, seg, arc).
static func torus(r: float, tube: float, arc := TAU, seg := 16) -> Dictionary:
	return _spec("torus|%s|%s|%s|%d" % [_r3(r), _r3(tube), _r3(arc), seg], func():
		var st := _Builder.new()
		var radial := 6
		var pt := func(i: int, j: int) -> Array:
			var u := float(i) / seg * arc
			var v := float(j) / radial * TAU
			var center := Vector3(r * cos(u), r * sin(u), 0)
			var p := Vector3((r + tube * cos(v)) * cos(u), (r + tube * cos(v)) * sin(u), tube * sin(v))
			return [p, (p - center).normalized()]
		for i in seg:
			for j in radial:
				var a: Array = pt.call(i, j)
				var b: Array = pt.call(i + 1, j)
				var c: Array = pt.call(i + 1, j + 1)
				var d: Array = pt.call(i, j + 1)
				st.tri(a[0], b[0], c[0], a[1], b[1], c[1])
				st.tri(a[0], c[0], d[0], a[1], c[1], d[1])
		return st.arrays())


## Disco virado para +Z (como CircleGeometry).
static func disc(r: float, seg := 16) -> Dictionary:
	return _spec("disc|%s|%d" % [_r3(r), seg], func():
		var st := _Builder.new()
		for i in seg:
			var a := float(i) / seg * TAU
			var b := float(i + 1) / seg * TAU
			st.tri(Vector3.ZERO, Vector3(cos(a) * r, sin(a) * r, 0), Vector3(cos(b) * r, sin(b) * r, 0), Vector3.BACK, Vector3.BACK, Vector3.BACK)
		return st.arrays())


## Retângulo virado para +Z (como PlaneGeometry).
static func plane(w: float, h: float) -> Dictionary:
	return _spec("plane|%s|%s" % [_r3(w), _r3(h)], func():
		var st := _Builder.new()
		var a := Vector3(-w / 2, -h / 2, 0)
		var b := Vector3(w / 2, -h / 2, 0)
		var c := Vector3(w / 2, h / 2, 0)
		var d := Vector3(-w / 2, h / 2, 0)
		var n := Vector3.BACK
		st.tri(a, b, c, n, n, n)
		st.tri(a, c, d, n, n, n)
		return st.arrays())


## Caixa de cantos arredondados (como RoundedBoxGeometry): o corpo e a cabeça do Golem.
static func rbox(w: float, h: float, d: float, radius: float, seg := 2) -> Dictionary:
	return _spec("rbox|%s|%s|%s|%s|%d" % [_r3(w), _r3(h), _r3(d), _r3(radius), seg], func():
		var half := Vector3(w, h, d) / 2.0
		var rr := minf(radius, minf(half.x, minf(half.y, half.z)) * 0.999)
		var axis := func(hh: float) -> PackedFloat32Array:
			var out := PackedFloat32Array()
			for k in seg + 1:
				out.append(-hh + rr - rr * cos(float(k) / seg * PI / 2.0))
			for k in range(seg, -1, -1):
				out.append(hh - rr + rr * cos(float(k) / seg * PI / 2.0))
			return out
		var xs: PackedFloat32Array = axis.call(half.x)
		var ys: PackedFloat32Array = axis.call(half.y)
		var zs: PackedFloat32Array = axis.call(half.z)
		var inner := half - Vector3.ONE * rr
		var round := func(q: Vector3, face_n: Vector3) -> Array:
			var c := Vector3(clampf(q.x, -inner.x, inner.x), clampf(q.y, -inner.y, inner.y), clampf(q.z, -inner.z, inner.z))
			var n := q - c
			n = face_n if n.length_squared() < 1e-12 else n.normalized()
			return [c + n * rr, n]
		var st := _Builder.new()
		# Cada face: (eixo fixo, sinal, eixos u e v).
		for f in [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]:
			var ax: int = f[0]
			var sgn: float = f[1]
			var us: PackedFloat32Array = [ys, xs, xs][ax]
			var vs: PackedFloat32Array = [zs, zs, ys][ax]
			var face_n := Vector3.ZERO
			face_n[ax] = sgn
			var mk := func(u: float, v: float) -> Array:
				var q := Vector3.ZERO
				q[ax] = sgn * half[ax]
				q[[1, 0, 0][ax]] = u
				q[[2, 2, 1][ax]] = v
				return round.call(q, face_n)
			for i in us.size() - 1:
				for j in vs.size() - 1:
					var a: Array = mk.call(us[i], vs[j])
					var b: Array = mk.call(us[i + 1], vs[j])
					var c: Array = mk.call(us[i + 1], vs[j + 1])
					var e: Array = mk.call(us[i], vs[j + 1])
					st.tri(a[0], b[0], c[0], a[1], b[1], c[1])
					st.tri(a[0], c[0], e[0], a[1], c[1], e[1])
		return st.arrays())


## Contorno 2D extrudado em Z, centrado (como geo.shape: letras, chamas, estrelas).
static func shape(key: String, points: PackedVector2Array, depth: float) -> Dictionary:
	return _spec("shape|%s|%s" % [key, _r3(depth)], func():
		var m := MeshKit.extrude(points, depth)
		var arrays := m.surface_get_arrays(0)
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		for i in verts.size():
			verts[i].z -= depth / 2.0
		arrays[Mesh.ARRAY_VERTEX] = verts
		return arrays)


# --- Montagem ----------------------------------------------------------------------------


## Normais por triângulo (o sombreado facetado do barro), mantendo a ordem dos vértices.
static func _flatten(arrays: Array) -> Array:
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL] if arrays[Mesh.ARRAY_NORMAL] != null else PackedVector3Array()
	var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
	var norms_ok := norms.size() == verts.size()
	if not norms_ok:
		norms = PackedVector3Array()
	if idx.is_empty():
		idx.resize(verts.size())
		for i in verts.size():
			idx[i] = i
	var ov := PackedVector3Array()
	var on := PackedVector3Array()
	ov.resize(idx.size())
	on.resize(idx.size())
	for t in range(0, idx.size(), 3):
		var a := verts[idx[t]]
		var b := verts[idx[t + 1]]
		var c := verts[idx[t + 2]]
		var n := (b - a).cross(c - a)
		if n.length_squared() < 1e-14:
			n = norms[idx[t]] if not norms.is_empty() else Vector3.UP
		n = n.normalized()
		if not norms.is_empty() and n.dot(norms[idx[t]] + norms[idx[t + 1]] + norms[idx[t + 2]]) < 0.0:
			n = -n
		for k in 3:
			ov[t + k] = verts[idx[t + k]]
			on[t + k] = n
	var out := []
	out.resize(Mesh.ARRAY_MAX)
	out[Mesh.ARRAY_VERTEX] = ov
	out[Mesh.ARRAY_NORMAL] = on
	return out


## Junta triângulos com normais lisas; acerta a ordem dos vértices para a face da frente
## ficar do lado da normal (o Godot desenha a frente no sentido horário).
class _Builder:
	var v := PackedVector3Array()
	var n := PackedVector3Array()

	func tri(a: Vector3, b: Vector3, c: Vector3, na: Vector3, nb: Vector3, nc: Vector3) -> void:
		var face := (b - a).cross(c - a)
		if face.dot(na + nb + nc) >= 0.0:
			v.append_array([a, c, b])
			n.append_array([na, nc, nb])
		else:
			v.append_array([a, b, c])
			n.append_array([na, nb, nc])

	func arrays() -> Array:
		var out := []
		out.resize(Mesh.ARRAY_MAX)
		out[Mesh.ARRAY_VERTEX] = v
		out[Mesh.ARRAY_NORMAL] = n
		return out
