## Peças pequenas da partida, desenhadas à mão (nítidas em qualquer tela).
class_name GamePieces


## Os 6 selos: cheio na cor da categoria quando conquistado, só o contorno quando não.
class SealRow:
	extends Control
	var seals: Array = []
	var dot := 14.0

	func _init(earned: Array = [], size_px := 14.0) -> void:
		seals = earned
		dot = size_px
		custom_minimum_size = Vector2(6 * dot + 5 * 4, dot + 2)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_seals(earned: Array) -> void:
		seals = earned
		queue_redraw()

	func _draw() -> void:
		var i := 0
		var ids := Ui.WHEEL_SLICES.slice(0, 6)
		if is_layout_rtl():
			ids.reverse()
		for id in ids:
			var c: Color = Ui.CATEGORIES[id].color
			var center := Vector2(dot / 2 + i * (dot + 4), size.y / 2)
			if seals.has(id):
				draw_circle(center, dot / 2, c, true, -1.0, true)
				draw_circle(center + Vector2(0, -dot * 0.12), dot * 0.18, Color(1, 1, 1, 0.45), true, -1.0, true)
			else:
				draw_circle(center, dot / 2 - 1, Color(c, 0.9), false, 1.5, true)
			i += 1


## Coroa: 3 acertos seguidos enchem (pontos de ouro).
class CrownMeter:
	extends Control
	var progress := 0

	func _init(p := 0) -> void:
		progress = p
		custom_minimum_size = Vector2(3 * 12 + 2 * 6, 14)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func set_progress(p: int) -> void:
		progress = p
		queue_redraw()

	func _draw() -> void:
		for i in Ui.CROWN_STREAK:
			var x := 6.0 + i * 18.0
			if is_layout_rtl():
				x = size.x - x
			var center := Vector2(x, size.y / 2)
			if i < progress:
				draw_circle(center, 6, Ui.GOLD, true, -1.0, true)
			else:
				draw_circle(center, 5, Color(Ui.GOLD, 0.6), false, 1.5, true)


## O ponto da vez: dourado e pulsando para quem joga agora.
class TurnDot:
	extends Control
	var active := false
	var _t := 0.0

	func _init() -> void:
		custom_minimum_size = Vector2(14, 14)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _process(dt: float) -> void:
		if active:
			_t += dt
			queue_redraw()

	func _draw() -> void:
		var c := size / 2
		if active:
			var k := fmod(_t, 1.4) / 1.4
			draw_circle(c, 5 + 7 * k, Color(Ui.GOLD, 0.6 * (1.0 - k)), true, -1.0, true)
			draw_circle(c, 5, Ui.GOLD, true, -1.0, true)
		else:
			draw_circle(c, 4.5, Ui.LINE, false, 1.5, true)


## Iniciais num disco (avatar simples do jogador).
class Avatar:
	extends Control
	var text := "?"
	var color := Ui.RAISED

	func _init(name: String, bot := false) -> void:
		var parts := name.strip_edges().split(" ", false)
		if parts.size() > 1:
			text = (parts[0].substr(0, 1) + parts[parts.size() - 1].substr(0, 1)).to_upper()
		elif parts.size() == 1:
			text = parts[0].substr(0, 2).to_upper()
		color = Color("#3B2A6E") if bot else Ui.RAISED
		custom_minimum_size = Vector2(42, 42)
		size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		var c := size / 2
		draw_circle(c, 20, color, true, -1.0, true)
		draw_circle(c, 20, Ui.LINE, false, 1.0, true)
		var f: Font = Ui.fonts.semibold
		var s := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 15)
		draw_string(f, Vector2(c.x - s.x / 2, c.y + 5.5), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Ui.ON)


## Confete: uma explosão de papeizinhos nas cores das categorias, que giram e caem.
static func confetti(parent: Control, at: Vector2, amount := 70) -> void:
	var c := Confetti.new(at, amount)
	parent.add_child(c)


class Confetti:
	extends Control
	const COLORS := [Color("#B4233F"), Color("#F0BE4E"), Color("#2774C0"), Color("#3DBB86"), Color("#6B45C2"), Color("#D9822B"), Color("#F4EAD3")]
	var _p: Array[Dictionary] = []
	var _age := 0.0

	func _init(at: Vector2, amount: int) -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		for i in amount:
			var a := deg_to_rad(-90.0 + randf_range(-65.0, 65.0))
			var speed := randf_range(420.0, 820.0)
			_p.append({
				"pos": at, "vel": Vector2(cos(a), sin(a)) * speed,
				"rot": randf() * TAU, "spin": randf_range(-9.0, 9.0),
				"flip": randf() * TAU, "size": Vector2(randf_range(6, 10), randf_range(9, 15)),
				"color": COLORS[i % COLORS.size()],
			})

	func _process(dt: float) -> void:
		_age += dt
		for p in _p:
			p.vel.y += 1100.0 * dt
			p.vel *= 1.0 - 1.6 * dt
			p.pos += p.vel * dt
			p.rot += p.spin * dt
			p.flip += 7.0 * dt
		queue_redraw()
		if _age > 2.6:
			queue_free()

	func _draw() -> void:
		var fade := clampf((2.6 - _age) / 0.6, 0.0, 1.0)
		for p in _p:
			var s: Vector2 = p.size
			s.x *= absf(cos(p.flip))
			draw_set_transform(p.pos, p.rot)
			draw_rect(Rect2(-s / 2.0, s), Color(p.color, fade))
		draw_set_transform(Vector2.ZERO)
