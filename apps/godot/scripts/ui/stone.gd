## As seis pedras do peitoral (Shemot 28:17-18), desenhadas (porte de components/puzzle/
## Stone.tsx): cada uma tem cor E forma próprias, para quem não distingue bem as cores.
## Especiais: Raio (faixas de luz na linha ou na coluna), Estrondo (aro dourado) e Urim
## (uma luz branca com raios, sem cor). Nenhuma pedra tem letra ou texto.
class_name Stone

const COLORS := [
	["#FF8A94", "#E5374A", "#9E1C2E"], ["#FFEC8F", "#F5C51F", "#B07C0A"], ["#8AF0A8", "#23B85A", "#11733A"],
	["#DDB0FF", "#9B4FE0", "#5C2499"], ["#9CCBFF", "#2F7BEA", "#1B4BA8"], ["#FFFFFF", "#DCEEF9", "#86AECB"],
]

static var _outlines: Array = []


## Contorno de cada pedra numa caixa de 100×100 (os mesmos do app).
static func outline(kind: int) -> PackedVector2Array:
	if _outlines.is_empty():
		var rounded := func(pts: Array, r: float) -> PackedVector2Array:
			# Cantos macios: corta cada canto e arredonda com alguns pontos.
			var out := PackedVector2Array()
			var n := pts.size()
			for i in n:
				var p: Vector2 = pts[i]
				var a: Vector2 = pts[(i - 1 + n) % n]
				var b: Vector2 = pts[(i + 1) % n]
				var p1 := p + (a - p).normalized() * r
				var p2 := p + (b - p).normalized() * r
				for k in 5:
					var t := k / 4.0
					out.append(p1.lerp(p, t).lerp(p.lerp(p2, t), t))
			return out
		var circle := PackedVector2Array()
		for i in 40:
			var a := float(i) / 40.0 * TAU
			circle.append(Vector2(50 + 41 * cos(a), 50 + 41 * sin(a)))
		_outlines = [
			rounded.call([Vector2(12, 12), Vector2(88, 12), Vector2(88, 88), Vector2(12, 88)], 18.0),
			PackedVector2Array([Vector2(50, 6), Vector2(92, 50), Vector2(50, 94), Vector2(8, 50)]),
			PackedVector2Array([Vector2(50, 7), Vector2(88, 28.5), Vector2(88, 71.5), Vector2(50, 93), Vector2(12, 71.5), Vector2(12, 28.5)]),
			rounded.call([Vector2(50, 8), Vector2(93, 88), Vector2(7, 88)], 9.0),
			circle,
			PackedVector2Array([Vector2(33, 8), Vector2(67, 8), Vector2(92, 33), Vector2(92, 67), Vector2(67, 92), Vector2(33, 92), Vector2(8, 67), Vector2(8, 33)]),
		]
	return _outlines[kind]


## Desenha a pedra em `rect` num CanvasItem (degradê de cima para baixo, faceta clara,
## brilho e o especial por cima).
static func draw(ci: CanvasItem, rect: Rect2, kind: int, special: String, t := 0.0, alpha := 1.0) -> void:
	var k := rect.size.x / 100.0
	var map := func(p: Vector2) -> Vector2: return rect.position + p * k
	if kind < 0 or special == "urim":
		_draw_urim(ci, rect, t, alpha)
		return
	var c: Array = COLORS[kind]
	var light := Color(c[0])
	var base := Color(c[1])
	var dark := Color(c[2])
	var A := func(col: Color) -> Color: return Color(col, col.a * alpha)
	var pts := outline(kind)
	var screen := PackedVector2Array()
	var colors := PackedColorArray()
	for p in pts:
		screen.append(map.call(p))
		var y := p.y / 100.0
		colors.append(A.call(base.lerp(light, clampf(0.55 - y, 0, 1) * 1.2).lerp(dark, clampf(y - 0.45, 0, 1) * 1.3)))
	# Sombra embaixo.
	var shadow := PackedVector2Array()
	for p in pts:
		shadow.append(map.call(p + Vector2(0, 4)))
	ci.draw_colored_polygon(shadow, Color(0, 0, 0, 0.28 * alpha))
	ci.draw_polygon(screen, colors)
	# Faceta de cima: o mesmo contorno, menor e mais claro (dá o volume).
	var facet := PackedVector2Array()
	for p in pts:
		var q := Vector2(50, 44) + (p - Vector2(50, 50)) * Vector2(0.62, 0.42)
		facet.append(map.call(q))
	ci.draw_colored_polygon(facet, Color(light, 0.55 * alpha))
	var outline_pts := screen.duplicate()
	outline_pts.append(screen[0])
	ci.draw_polyline(outline_pts, A.call(dark.darkened(0.2)), maxf(1.0, k * 2.2), true)
	# Brilho.
	ci.draw_circle(map.call(Vector2(36, 30)), k * 6.5, Color(1, 1, 1, 0.75 * alpha), true, -1.0, true)
	match special:
		"row", "col":
			var pulse := 0.6 + 0.4 * sin(t * 6.0)
			for off in [-14.0, 14.0]:
				var a: Vector2
				var b: Vector2
				if special == "row":
					a = map.call(Vector2(6, 50 + off))
					b = map.call(Vector2(94, 50 + off))
				else:
					a = map.call(Vector2(50 + off, 6))
					b = map.call(Vector2(50 + off, 94))
				ci.draw_line(a, b, Color(1, 1, 1, 0.85 * pulse * alpha), k * 7.0, true)
				ci.draw_line(a, b, Color(1, 0.95, 0.7, 0.9 * alpha), k * 2.5, true)
		"bomb":
			ci.draw_arc(map.call(Vector2(50, 50)), k * 40.0, 0, TAU, 40, A.call(Color("#F0BE4E")), k * 7.0, true)
			ci.draw_arc(map.call(Vector2(50, 50)), k * 40.0, 0, TAU, 40, A.call(Color("#FFF1B8")), k * 2.5, true)


static func _draw_urim(ci: CanvasItem, rect: Rect2, t: float, alpha := 1.0) -> void:
	var k := rect.size.x / 100.0
	var c := rect.position + Vector2(50, 50) * k
	for i in 12:
		var a := float(i) / 12.0 * TAU + t * 0.8
		ci.draw_line(c + Vector2(cos(a), sin(a)) * k * 14, c + Vector2(cos(a), sin(a)) * k * (40 + 6 * sin(t * 4 + i)), Color(1, 0.97, 0.85, 0.75 * alpha), k * 5.0, true)
	ci.draw_circle(c, k * 30, Color(Color("#FFF7D6"), alpha), true, -1.0, true)
	ci.draw_circle(c, k * 20, Color(1, 1, 1, alpha), true, -1.0, true)
	ci.draw_arc(c, k * 30, 0, TAU, 40, Color(Color("#E9C46A"), alpha), k * 3.0, true)
