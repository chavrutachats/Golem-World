## Geometrias montadas no código (sem arquivo de modelo): sólidos de revolução facetados e
## polígonos extrudados.
class_name MeshKit


## Sólido de revolução com `sides` lados e faces planas (cada lado com a sua normal).
## profile: pontos (raio, altura) de baixo para cima. As quinas ficam nos ângulos
## (i + 0,5)·2π/sides, então as faces ficam centradas em 0°, 45°, 90°… (como o sevivon).
## Ponto no ângulo a: (r·sen a, y, r·cos a).
static func lathe_flat(profile: PackedVector2Array, sides: int, caps := true) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var step := TAU / sides
	var at := func(p: Vector2, i: int) -> Vector3:
		var a := (i + 0.5) * step
		return Vector3(p.x * sin(a), p.y, p.x * cos(a))
	for s in profile.size() - 1:
		var p0 := profile[s]
		var p1 := profile[s + 1]
		for i in sides:
			var a0: Vector3 = at.call(p0, i)
			var a1: Vector3 = at.call(p0, i + 1)
			var b0: Vector3 = at.call(p1, i)
			var b1: Vector3 = at.call(p1, i + 1)
			var n := (a1 - a0).cross(b0 - a0)
			if n.length_squared() < 1e-12:
				n = (b1 - a1).cross(b0 - a1)
			n = n.normalized()
			# Normal para fora (do eixo para a face).
			var mid := (a0 + a1 + b0 + b1) / 4.0
			if n.dot(Vector3(mid.x, 0, mid.z)) < 0:
				n = -n
			_quad(st, a0, a1, b1, b0, n)
	if caps:
		for end in [0, profile.size() - 1]:
			var p := profile[end]
			if p.x < 1e-3:
				continue
			var n := Vector3.DOWN if end == 0 else Vector3.UP
			var c := Vector3(0, p.y, 0)
			for i in sides:
				var a0: Vector3 = at.call(p, i)
				var a1: Vector3 = at.call(p, i + 1)
				_tri_any(st, c, a0, a1, n)
	return st.commit()


static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, n: Vector3) -> void:
	# Godot desenha a face da frente no sentido horário visto de fora.
	for v in [a, c, b]:
		st.set_normal(n)
		st.set_uv(Vector2(v.x, v.y))
		st.add_vertex(v)


static func _quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3) -> void:
	# Ordem a→b→c→d no sentido anti-horário visto de fora (com a normal n para fora).
	var face_n := (b - a).cross(c - a)
	if face_n.dot(n) < 0:
		_tri(st, a, c, b, n)
		_tri(st, a, d, c, n)
	else:
		_tri(st, a, b, c, n)
		_tri(st, a, c, d, n)


## Polígono 2D (x, y) extrudado em Z, de 0 a `depth`, com laterais planas.
static func extrude(points: PackedVector2Array, depth: float) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var tris := Geometry2D.triangulate_polygon(points)
	for k in range(0, tris.size(), 3):
		var a := points[tris[k]]
		var b := points[tris[k + 1]]
		var c := points[tris[k + 2]]
		var front := [Vector3(a.x, a.y, depth), Vector3(b.x, b.y, depth), Vector3(c.x, c.y, depth)]
		var back := [Vector3(a.x, a.y, 0), Vector3(b.x, b.y, 0), Vector3(c.x, c.y, 0)]
		_tri_any(st, front[0], front[1], front[2], Vector3.BACK)
		_tri_any(st, back[0], back[1], back[2], Vector3.FORWARD)
	var count := points.size()
	for i in count:
		var p := points[i]
		var q := points[(i + 1) % count]
		var a0 := Vector3(p.x, p.y, 0)
		var a1 := Vector3(q.x, q.y, 0)
		var b0 := Vector3(p.x, p.y, depth)
		var b1 := Vector3(q.x, q.y, depth)
		var edge := q - p
		var n := Vector3(edge.y, -edge.x, 0).normalized()
		if Geometry2D.is_polygon_clockwise(points):
			n = -n
		_quad(st, a0, a1, b1, b0, n)
	return st.commit()


## Triângulo virado para `n`, qualquer que seja a ordem dos vértices.
static func _tri_any(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, n: Vector3) -> void:
	if (b - a).cross(c - a).dot(n) >= 0:
		_tri(st, a, b, c, n)
	else:
		_tri(st, a, c, b, n)


## Junta as malhas paradas de um grupo numa só (uma superfície por material), como o
## mergeStatic do app: a ilha inteira vira poucas chamadas de desenho.
static func merge(root: Node3D, cast_shadow := true) -> MeshInstance3D:
	var buckets := {}
	var order: Array[Material] = []
	var stack: Array = [[root, Transform3D.IDENTITY]]
	while not stack.is_empty():
		var item: Array = stack.pop_back()
		var node: Node3D = item[0]
		var xf: Transform3D = item[1]
		for c in node.get_children():
			if c is Node3D:
				var cx: Transform3D = xf * (c as Node3D).transform
				if c is MeshInstance3D and (c as MeshInstance3D).mesh:
					var mi := c as MeshInstance3D
					var m: Material = mi.material_override
					if not buckets.has(m):
						buckets[m] = [PackedVector3Array(), PackedVector3Array()]
						order.append(m)
					var arrays := mi.mesh.surface_get_arrays(0)
					var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
					var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
					var idx: Variant = arrays[Mesh.ARRAY_INDEX]
					# Sem índices, o Godot devolve uma lista vazia (e não null).
					if idx is PackedInt32Array and (idx as PackedInt32Array).is_empty():
						idx = null
					var nb := cx.basis.inverse().transposed()
					var flip := cx.basis.determinant() < 0.0
					# As listas compactadas são copiadas ao serem lidas: junta aqui e grava de volta.
					var bv: PackedVector3Array = buckets[m][0]
					var bn: PackedVector3Array = buckets[m][1]
					var count: int = (idx as PackedInt32Array).size() if idx != null else verts.size()
					var tri := [0, 1, 2] if not flip else [0, 2, 1]
					for t in range(0, count, 3):
						for k in tri:
							var i: int = (idx as PackedInt32Array)[t + k] if idx != null else t + k
							bv.append(cx * verts[i])
							bn.append((nb * norms[i]).normalized())
					buckets[m] = [bv, bn]
				stack.append([c, cx])
	var out := ArrayMesh.new()
	for m in order:
		if (buckets[m][0] as PackedVector3Array).is_empty():
			continue
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = buckets[m][0]
		arrays[Mesh.ARRAY_NORMAL] = buckets[m][1]
		out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		out.surface_set_material(out.get_surface_count() - 1, m)
	var mi := MeshInstance3D.new()
	mi.mesh = out
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if cast_shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.free()
	return mi
