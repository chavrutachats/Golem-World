## O tabuleiro das Pedras do Choshen (porte de components/puzzle/PuzzleBoard.tsx): uma placa
## de barro com as pedras, desenhada inteira num só _draw. Arraste uma pedra para a vizinha,
## ou toque numa e depois na vizinha. As pedras deslizam, estouram, caem e descem do alto
## conforme os quadros que a tela monta a partir de PuzzleEngine.play.
## A grade não espelha no hebraico: as jogadas são por linha e coluna.
class_name PuzzleBoard
extends Control

signal swap_requested(move: Array)

const PAD := 8.0
const STONE_SCALE := 0.86

var rows := 8
var cols := 7
var disabled := false
var hint: Array = []
var reduced_motion := false
var cell := 40.0

var _board: Array = []
var _clay: Array = []
## id -> {kind, special, from: Vector2, to: Vector2, t0, dur, fall}
var _tiles := {}
var _pops: Array = []
var _blasts: Array = []
var _selected := Vector2i(-1, -1)
var _press := Vector2i(-1, -1)
var _press_at := Vector2.ZERO
var _fired := false
var _t := 0.0
## As pedras ficam numa camada recortada no tamanho da grade: as que descem do alto só
## aparecem quando entram na placa.
var _layer := Control.new()


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	layout_direction = Control.LAYOUT_DIRECTION_LTR
	_layer.clip_contents = true
	_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_layer.draw.connect(_draw_layer)
	add_child(_layer)


func _get_minimum_size() -> Vector2:
	return Vector2(0, _inner_h() + PAD * 2)


func _inner_h() -> float:
	return cell * rows


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		var c := floorf((size.x - PAD * 2.0) / cols)
		if c > 0 and c != cell:
			cell = c
			update_minimum_size()
		_layer.position = _origin()
		_layer.size = Vector2(cell * cols, cell * rows)


func _origin() -> Vector2:
	return Vector2((size.x - cell * cols) / 2.0, PAD)


## Mostra um quadro: o tabuleiro, o barro, as pedras estourando e as explosões.
## spawn_from: id -> linha (negativa) de onde a pedra nova começa a cair.
func show_frame(board: Array, clay: Array, popping: Array = [], blasts: Array = [], spawn_from: Dictionary = {}) -> void:
	_board = board
	_clay = clay
	var seen := {}
	for r in rows:
		for c in cols:
			var tile: Variant = board[r][c]
			if tile == null:
				continue
			var id := int(tile.id)
			seen[id] = true
			var to := Vector2(c, r)
			var cur: Dictionary = _tiles.get(id, {})
			var from: Vector2
			if cur.is_empty():
				from = Vector2(c, float(spawn_from.get(id, r)))
			else:
				from = _pos_of(cur)
			var rows_moved := absf(to.y - from.y)
			var cols_moved := absf(to.x - from.x)
			var fall := rows_moved > cols_moved
			var dur := 0.06 if reduced_motion else (minf(0.52, 0.14 + rows_moved * 0.055) if fall else 0.15)
			_tiles[id] = {"kind": int(tile.kind), "special": str(tile.special), "from": from, "to": to, "t0": _t, "dur": dur, "fall": fall}
	for id in _tiles.keys():
		if not seen.has(id):
			_tiles.erase(id)
	for p in popping:
		_pops.append({"tile": p, "t0": _t})
	if not reduced_motion:
		for b in blasts:
			_blasts.append({"b": b, "t0": _t})
	if disabled:
		_selected = Vector2i(-1, -1)
	queue_redraw()


func _pos_of(a: Dictionary) -> Vector2:
	var k := clampf((_t - float(a.t0)) / maxf(0.001, float(a.dur)), 0.0, 1.0)
	var from: Vector2 = a.from
	var to: Vector2 = a.to
	if a.fall:
		# Cai acelerando e quica de leve no fim (a mesma curva do app).
		var e := _bezier_y(k, 0.55, 0.0, 0.85, 1.15)
		return Vector2(to.x, lerpf(from.y, to.y, e))
	var q := 1.0 - (1.0 - k) * (1.0 - k)
	return from.lerp(to, q)


## Curva cúbica (0,0)-(x1,y1)-(x2,y2)-(1,1): acha o t pelo x e devolve o y.
static func _bezier_y(x: float, x1: float, y1: float, x2: float, y2: float) -> float:
	var t := x
	for i in 8:
		var cx := 3.0 * (1 - t) * (1 - t) * t * x1 + 3.0 * (1 - t) * t * t * x2 + t * t * t
		var dx := 3.0 * (1 - t) * (1 - t) * x1 + 6.0 * (1 - t) * t * (x2 - x1) + 3.0 * t * t * (1 - x2)
		if absf(dx) < 1e-5:
			break
		t = clampf(t - (cx - x) / dx, 0.0, 1.0)
	return 3.0 * (1 - t) * (1 - t) * t * y1 + 3.0 * (1 - t) * t * t * y2 + t * t * t


func _process(dt: float) -> void:
	_t += dt
	_pops = _pops.filter(func(p): return _t - float(p.t0) < 0.3)
	_blasts = _blasts.filter(func(b): return _t - float(b.t0) < 0.34)
	queue_redraw()
	_layer.queue_redraw()


func _draw() -> void:
	var o := _origin()
	var w := cell * cols
	var h := cell * rows
	# A placa de barro: borda de baixo mais escura (o lábio) e o fundo da grade.
	var frame := Rect2(o - Vector2(PAD, PAD), Vector2(w + PAD * 2, h + PAD * 2))
	draw_style_box(_rounded(Color("#4A2A18"), 26), Rect2(frame.position + Vector2(0, 6), frame.size))
	draw_style_box(_rounded(Color("#6E4329"), 26), frame)
	draw_style_box(_rounded(Color("#3E2516"), 18), Rect2(o, Vector2(w, h)))
	for r in rows:
		for c in cols:
			var rect := Rect2(o + Vector2(c, r) * cell, Vector2(cell, cell))
			draw_rect(rect, Color(1, 0.925, 0.82, 0.07 if (r + c) % 2 else 0.025))
			var hp := int(_clay[r][c]) if r < _clay.size() else 0
			if hp > 0:
				_draw_clay(rect, hp)


func _draw_layer() -> void:
	var o := Vector2.ZERO
	var w := cell * cols
	var h := cell * rows
	var ci := _layer
	var s := cell * STONE_SCALE
	var ids := _tiles.keys()
	ids.sort()
	for id in ids:
		var a: Dictionary = _tiles[id]
		var p := _pos_of(a)
		if p.y < -1.0:
			continue
		var cell_i := Vector2i(roundi(float(a.to.x)), roundi(float(a.to.y)))
		var scale := 1.0
		var selected := cell_i == _selected and _pos_settled(a)
		if _is_hint(cell_i) and not reduced_motion:
			scale = 1.0 + 0.06 * (1.0 - cos(_t * TAU / 0.76))
		elif selected:
			scale = 1.14
		var center := o + (p + Vector2(0.5, 0.5)) * cell
		if selected:
			var ring := Rect2(center - Vector2(cell, cell) / 2.0 + Vector2.ONE, Vector2(cell - 2, cell - 2))
			var st := _rounded(Color(1, 0.79, 0.24, 0.18), int(cell * 0.28))
			st.border_color = Color("#FFC93C")
			st.set_border_width_all(3)
			ci.draw_style_box(st, ring)
		var ss := s * scale
		Stone.draw(ci, Rect2(center - Vector2(ss, ss) / 2.0, Vector2(ss, ss)), int(a.kind), str(a.special), _t)
	for pop in _pops:
		var k := clampf((_t - float(pop.t0)) / (0.12 if reduced_motion else 0.26), 0.0, 1.0)
		var tile: Dictionary = pop.tile
		var center := o + (Vector2(int(tile.col), int(tile.row)) + Vector2(0.5, 0.5)) * cell
		var sc := 1.0 + k * 0.6 if k < 0.3 else maxf(0.0, 1.18 - (k - 0.3) * 1.7)
		var ss := s * sc
		if ss > 1.0:
			Stone.draw(ci, Rect2(center - Vector2(ss, ss) / 2.0, Vector2(ss, ss)), int(tile.kind), str(tile.special), _t, 1.0 - k)
		if not reduced_motion and k > 0.15:
			var spark: Color = Color(Stone.COLORS[int(tile.kind)][0]) if int(tile.kind) >= 0 else Color("#FFF4C2")
			for i in 5:
				var ang := deg_to_rad(72.0 * i)
				var at := center + Vector2(cos(ang), sin(ang)) * cell * 0.55 * k
				ci.draw_circle(at, cell * 0.08 * (1.0 - k * 0.5), Color(spark, 1.0 - k), true, -1.0, true)
	for e in _blasts:
		var k := clampf((_t - float(e.t0)) / 0.32, 0.0, 1.0)
		var ease := 1.0 - pow(1.0 - k, 3)
		var b: Dictionary = e.b
		var br := int(b.row)
		var bc := int(b.col)
		var beam := Color(1, 0.97, 0.84, 0.9 * (1.0 - ease))
		match str(b.special):
			"row":
				var len := w * (0.2 + ease * 0.8)
				ci.draw_style_box(_rounded(beam, int(cell * 0.25)), Rect2(o + Vector2((w - len) / 2.0, br * cell + cell * 0.25), Vector2(len, cell * 0.5)))
			"col":
				var len := h * (0.2 + ease * 0.8)
				ci.draw_style_box(_rounded(beam, int(cell * 0.25)), Rect2(o + Vector2(bc * cell + cell * 0.25, (h - len) / 2.0), Vector2(cell * 0.5, len)))
			"urim":
				var r := maxf(rows, cols) * cell * (0.4 + ease * 1.1)
				ci.draw_circle(o + Vector2(bc + 0.5, br + 0.5) * cell, r, Color(1, 0.98, 0.9, 0.55 * (1.0 - ease)), true, -1.0, true)
			_:
				var r := cell * 1.6 * (0.4 + ease * 1.1)
				ci.draw_arc(o + Vector2(bc + 0.5, br + 0.5) * cell, r, 0, TAU, 48, Color(1, 0.84, 0.4, 0.95 * (1.0 - ease)), 6.0, true)


func _pos_settled(a: Dictionary) -> bool:
	return _t - float(a.t0) >= float(a.dur)


func _is_hint(c: Vector2i) -> bool:
	return hint.size() == 4 and ((hint[0] == c.y and hint[1] == c.x) or (hint[2] == c.y and hint[3] == c.x))


func _draw_clay(rect: Rect2, hp: int) -> void:
	var deep := hp >= 2
	var k := rect.size.x / 100.0
	var inner := Rect2(rect.position + Vector2(3, 3) * k, Vector2(94, 94) * k)
	var st := _rounded(Color("#8E5A35") if deep else Color("#B98256"), int(16 * k))
	st.border_color = Color(Color("#F0C79A") if deep else Color("#E3B588"), 0.75)
	st.set_border_width_all(maxi(1, roundi((5.0 if deep else 3.0) * k)))
	draw_style_box(st, inner)
	var crack := Color("#5E3B22", 0.5 if deep else 0.35)
	for line in [[Vector2(18, 30), Vector2(34, 42), Vector2(30, 58)], [Vector2(70, 18), Vector2(62, 36), Vector2(76, 48)], [Vector2(58, 80), Vector2(66, 66), Vector2(84, 72)]]:
		var pts := PackedVector2Array()
		for p in line:
			pts.append(rect.position + p * k)
		draw_polyline(pts, crack, maxf(1.0, 3.0 * k), true)


static func _rounded(color: Color, r: int) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(r)
	s.anti_aliasing = true
	return s


# --- Toques -------------------------------------------------------------------------------


func _cell_at(p: Vector2) -> Vector2i:
	var q := (p - _origin()) / cell
	var c := floori(q.x)
	var r := floori(q.y)
	if r >= 0 and r < rows and c >= 0 and c < cols:
		return Vector2i(c, r)
	return Vector2i(-1, -1)


func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and (e as InputEventMouseButton).button_index == MOUSE_BUTTON_LEFT:
		var mb := e as InputEventMouseButton
		if mb.pressed:
			_press = _cell_at(mb.position)
			_press_at = mb.position
			_fired = false
		else:
			if not _fired and not disabled and _press.x >= 0 and mb.position.distance_to(_press_at) < 6.0:
				_tap(_press)
			_press = Vector2i(-1, -1)
		accept_event()
	elif e is InputEventMouseMotion and _press.x >= 0 and not _fired and not disabled:
		var d := (e as InputEventMouseMotion).position - _press_at
		if maxf(absf(d.x), absf(d.y)) < cell * 0.32:
			return
		_fired = true
		var to := _press + (Vector2i(signi(roundi(d.x)), 0) if absf(d.x) > absf(d.y) else Vector2i(0, signi(roundi(d.y))))
		_selected = Vector2i(-1, -1)
		if to.x >= 0 and to.x < cols and to.y >= 0 and to.y < rows:
			swap_requested.emit([_press.y, _press.x, to.y, to.x])
		accept_event()


func _tap(at: Vector2i) -> void:
	if _selected.x >= 0 and absi(_selected.x - at.x) + absi(_selected.y - at.y) == 1:
		var from := _selected
		_selected = Vector2i(-1, -1)
		swap_requested.emit([from.y, from.x, at.y, at.x])
	elif _selected == at:
		_selected = Vector2i(-1, -1)
	else:
		_selected = at
		Sfx.play("dot", 0.3)
	queue_redraw()


## Centro de uma casa na tela (para os testes no navegador).
func cell_center(r: int, c: int) -> Vector2:
	return get_global_rect().position + _origin() + (Vector2(c, r) + Vector2(0.5, 0.5)) * cell
