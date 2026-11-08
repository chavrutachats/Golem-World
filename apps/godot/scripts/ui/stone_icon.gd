## Uma pedra (ou a estrela, ou o barro) num controle do tamanho pedido, para os rótulos.
class_name StoneIcon
extends Control

## kind >= 0: pedra; -2: estrela; -3: barro.
var kind := 0
var special := ""
var dim := false
var _t := 0.0


func _init(k := 0, px := 30.0, sp := "") -> void:
	kind = k
	special = sp
	custom_minimum_size = Vector2(px, px)
	size_flags_vertical = Control.SIZE_SHRINK_CENTER
	size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _process(dt: float) -> void:
	if special != "":
		_t += dt
		queue_redraw()


func _draw() -> void:
	var s := minf(size.x, size.y)
	var r := Rect2((size - Vector2(s, s)) / 2.0, Vector2(s, s))
	if kind == -2:
		draw_star(self, r.get_center(), s * 0.48, dim)
	elif kind == -3:
		var st := StyleBoxFlat.new()
		st.bg_color = Color("#B98256")
		st.set_corner_radius_all(int(s * 0.16))
		st.border_color = Color(Color("#E3B588"), 0.75)
		st.set_border_width_all(2)
		draw_style_box(st, r.grow(-s * 0.04))
		draw_polyline(PackedVector2Array([r.position + Vector2(0.18, 0.3) * s, r.position + Vector2(0.34, 0.42) * s, r.position + Vector2(0.3, 0.58) * s]), Color("#5E3B22", 0.4), 2.0, true)
		draw_polyline(PackedVector2Array([r.position + Vector2(0.7, 0.18) * s, r.position + Vector2(0.62, 0.36) * s, r.position + Vector2(0.76, 0.48) * s]), Color("#5E3B22", 0.4), 2.0, true)
	else:
		Stone.draw(self, r, kind, special, _t)


## Estrela de cinco pontas (dourada, ou apagada).
static func draw_star(ci: CanvasItem, c: Vector2, radius: float, off := false) -> void:
	var pts := PackedVector2Array()
	for i in 10:
		var a := -PI / 2.0 + i * PI / 5.0
		var rr := radius if i % 2 == 0 else radius * 0.45
		pts.append(c + Vector2(cos(a), sin(a)) * rr)
	var shadow := PackedVector2Array()
	for p in pts:
		shadow.append(p + Vector2(0, radius * 0.1))
	if off:
		ci.draw_colored_polygon(pts, Color(1, 1, 1, 0.16))
		return
	ci.draw_colored_polygon(shadow, Color("#B07C0A"))
	ci.draw_colored_polygon(pts, Color("#F5C51F"))
	var inner := PackedVector2Array()
	for p in pts:
		inner.append(c + (p - c) * 0.55 - Vector2(0, radius * 0.08))
	ci.draw_colored_polygon(inner, Color("#FFEC8F", 0.7))
