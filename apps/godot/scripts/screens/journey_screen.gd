## Golem World: o mapa da jornada pelas 54 parashiot (porte de app/journey/index.tsx).
## Cada livro é uma ilha; toque numa fase e o Golem anda até ela pelas pedrinhas, e a ficha
## mostra o que se estuda ali. Nada aqui conta para o ranking: as moedas compram itens.
##
## A cena 3D fica atrás; por cima, os nomes das fases e mundos, posicionados a cada
## quadro pela câmera, e o toque/arrasto para rolar.
class_name JourneyScreen
extends Control

var state: Dictionary = {}
var view := SubViewportContainer.new()
var viewport := SubViewport.new()
var stage: MapStage
var _labels := Control.new()
var _node_labels: Array = []
var _banners: Array = []
var _standing := ""
var _sheet: Sheet
# Rolagem por arrasto, com inércia.
var _dragging := false
var _drag_moved := 0.0
var _press_pos := Vector2.ZERO
var _velocity := 0.0
var _top_bar: Control
var _coins: PanelContainer
var _loading: Label
var _continue: Button


func _ready() -> void:
	view.stretch = true
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	view.mouse_filter = Control.MOUSE_FILTER_IGNORE
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	view.add_child(viewport)
	add_child(view)
	_labels.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_labels.mouse_filter = Control.MOUSE_FILTER_STOP
	_labels.gui_input.connect(_on_input)
	add_child(_labels)
	_top_bar = _build_top_bar()
	add_child(_top_bar)
	# A loja, num botão flutuante no canto de baixo.
	var shop := Ui.button(I18n.t("Loja do Golem"), "gold", "md")
	shop.anchor_left = 1.0
	shop.anchor_right = 1.0
	shop.anchor_top = 1.0
	shop.anchor_bottom = 1.0
	shop.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	shop.grow_vertical = Control.GROW_DIRECTION_BEGIN
	shop.offset_right = -16
	shop.offset_bottom = -24
	shop.pressed.connect(func(): Main.instance.go("shop"))
	add_child(shop)
	Ui.mark("journey-shop", shop)
	_loading = Ui.label(I18n.t("Abrindo o mapa…"), 17, Ui.ON, "semibold", HORIZONTAL_ALIGNMENT_CENTER)
	_loading.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_loading.grow_horizontal = Control.GROW_DIRECTION_BOTH
	add_child(_loading)
	_load()


func _build_top_bar() -> Control:
	var bar := PanelContainer.new()
	var s := Ui.box(Color(Ui.NIGHT, 0.88), 0, Ui.LINE, 0, 0)
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 10
	s.content_margin_bottom = 10
	bar.add_theme_stylebox_override("panel", s)
	bar.anchor_right = 1.0
	var row := Ui.hbox(8)
	bar.add_child(row)
	var back := Ui.button(I18n.t("Voltar"), "ghost", "sm")
	back.pressed.connect(func(): Main.instance.go("home"))
	row.add_child(back)
	var title := Ui.title(I18n.t("Golem World"), 22, Ui.ON)
	title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(title)
	_coins = Ui.pill(I18n.tn(0, "{n} moeda", "{n} moedas"), Ui.GOLD, 14)
	_coins.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_coins)

	return bar


func _load() -> void:
	var r := await Api.journey()
	if not is_inside_tree():
		return
	if not r.ok:
		_loading.text = r.message
		var again := Ui.button(I18n.t("Tentar de novo"), "gold")
		again.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
		again.position.y -= 120
		again.pressed.connect(func(): Main.instance.go("journey"))
		add_child(again)
		return
	state = r.data
	_loading.visible = false
	(_coins.get_child(0) as Label).text = I18n.tn(int(state.coins), "{n} moeda", "{n} moedas")
	stage = MapStage.new()
	viewport.add_child(stage)
	stage.setup(state.worlds, state.golem)
	_build_labels()
	_build_bottom()
	var at := _find_node(str(state.currentNodeId))
	if not at.is_empty():
		_standing = at.node.id
		stage.place_golem(_node_pos(at))
		stage.set_scroll_z(_node_pos(at).z)
	await get_tree().process_frame
	if not at.is_empty():
		var sp := stage.camera.unproject_position(_node_pos(at))
		print("MARK node-current %d %d" % [roundi(sp.x), roundi(sp.y)])
	print("JOURNEY_READY")


# --- Fases -------------------------------------------------------------------------------


func _find_node(node_id: String) -> Dictionary:
	for p in stage.placed:
		for n in p.world.layout.nodes:
			if n.id == node_id:
				return {"placed": p, "node": n}
	return {}


func _node_pos(at: Dictionary) -> Vector3:
	var n: Dictionary = at.node
	var pos := WorldMap.to_world(float(n.x), float(at.placed.top) + float(n.y))
	if n.kind == "beitMidrash":
		pos.z += 1.6
	return pos


func _status(node_id: String) -> Dictionary:
	for w in state.worlds:
		if w.beitMidrash.nodeId == node_id:
			return w.beitMidrash
		for p in w.parashot:
			if p.main.nodeId == node_id:
				return p.main
			for tr in p.tracks:
				if tr.nodeId == node_id:
					return tr
	return {}


func _tracks_of(parasha_id: String) -> Array:
	for w in state.worlds:
		for p in w.parashot:
			if p.parashaId == parasha_id:
				return p.tracks
	return []


func _build_labels() -> void:
	# A Criação no topo: "No princípio".
	var pro := PanelContainer.new()
	var ps := Ui.box(Color("#FFF8E1", 0.95), 999, Color(0, 0, 0, 0), 0, 0)
	ps.content_margin_left = 14
	ps.content_margin_right = 14
	ps.content_margin_top = 5
	ps.content_margin_bottom = 6
	pro.add_theme_stylebox_override("panel", ps)
	pro.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var pl := Ui.label(I18n.t("No princípio"), 16, Color("#2A2117"), "bold")
	pl.autowrap_mode = TextServer.AUTOWRAP_OFF
	pro.add_child(pl)
	_labels.add_child(pro)
	_banners.append({"node": pro, "world": WorldMap.to_world(60, 6)})
	for p in stage.placed:
		var w: Dictionary = p.world
		var banner := PanelContainer.new()
		var bs := Ui.box(Color("#FFF8E7"), 999, Color("#E9D9B5"), 1, 0)
		bs.content_margin_left = 16
		bs.content_margin_right = 16
		bs.content_margin_top = 6
		bs.content_margin_bottom = 7
		bs.shadow_color = Color(0, 0, 0, 0.25)
		bs.shadow_size = 6
		bs.shadow_offset = Vector2(0, 3)
		banner.add_theme_stylebox_override("panel", bs)
		banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var row := Ui.hbox(8)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var small := Ui.label(I18n.t("Mundo {n}", {"n": int(w.number)}).to_upper(), 12, Color("#C98A12"), "bold")
		var big := Ui.label(JourneyData.loc(w.name), 19, Color("#2A2117"), "bold")
		var he := Ui.label("" if I18n.rtl() else str(w.nameHe), 18, Color("#2A2117"), "serif")
		for l in [small, big, he]:
			l.autowrap_mode = TextServer.AUTOWRAP_OFF
			l.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			if l.text != "":
				row.add_child(l)
		he.text_direction = Control.TEXT_DIRECTION_RTL
		banner.add_child(row)
		if not bool(p.status.unlocked):
			var lock := Ui.label("· " + I18n.t("Fechada por enquanto."), 13, Color("#6E5E45"), "medium")
			lock.autowrap_mode = TextServer.AUTOWRAP_OFF
			row.add_child(lock)
		_labels.add_child(banner)
		_banners.append({"node": banner, "world": WorldMap.to_world(60, float(p.top) - 9)})
		for n in w.layout.nodes:
			var info := JourneyData.level_info(str(n.id))
			var st := _status(str(n.id))
			var stars := int(st.get("stars", 0))
			var current := str(n.id) == str(state.currentNodeId)
			var box := PanelContainer.new()
			var ls := Ui.box(Color(Ui.GOLD) if current else Color("#1E2A63", 0.88), 999, Color(0, 0, 0, 0), 0, 0)
			ls.content_margin_left = 10
			ls.content_margin_right = 10
			ls.content_margin_top = 3
			ls.content_margin_bottom = 4
			box.add_theme_stylebox_override("panel", ls)
			box.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var line := Ui.hbox(6)
			line.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var name := Ui.label(str(info.get("title", "")), 14, Ui.ON_GOLD if current else Color.WHITE, "semibold")
			name.autowrap_mode = TextServer.AUTOWRAP_OFF
			line.add_child(name)
			if str(st.get("state", "")) == "completed":
				var s := Ui.label("★".repeat(stars) + "☆".repeat(3 - stars), 13, Ui.ON_GOLD if current else Ui.GOLD, "bold")
				s.autowrap_mode = TextServer.AUTOWRAP_OFF
				line.add_child(s)
			box.add_child(line)
			var beit: bool = n.kind == "beitMidrash"
			# Embaixo do nome, uma bolinha por caminho de estudo (cheia quando concluído).
			var holder: Control = box
			var tracks := _tracks_of(str(n.get("parashaId", ""))) if not beit else []
			if not tracks.is_empty():
				var col := Ui.vbox(1)
				col.mouse_filter = Control.MOUSE_FILTER_IGNORE
				col.add_child(box)
				box.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN if str(n.labelSide) == "right" else Control.SIZE_SHRINK_END
				var dots := ""
				for tr in tracks:
					dots += "●" if str(tr.state) == "completed" else "○"
				var dl := Ui.label(dots, 10, Color("#E9ECF8"), "bold", HORIZONTAL_ALIGNMENT_LEFT if str(n.labelSide) == "right" else HORIZONTAL_ALIGNMENT_RIGHT)
				dl.autowrap_mode = TextServer.AUTOWRAP_OFF
				dl.add_theme_constant_override("outline_size", 4)
				dl.add_theme_color_override("font_outline_color", Color("#1B2350"))
				col.add_child(dl)
				holder = col
			var side := "center" if beit else str(n.labelSide)
			_labels.add_child(holder)
			var at := {"placed": p, "node": n}
			_node_labels.append({"node": holder, "world": _node_pos(at), "side": side, "id": str(n.id), "at": at, "beit": beit})


static func _outline(l: Label, size: int) -> void:
	l.add_theme_color_override("font_outline_color", Color("#1B2350"))
	l.add_theme_constant_override("outline_size", size)


func _build_bottom() -> void:
	if state.get("activeRunId") == null:
		return
	_continue = Ui.button(I18n.t("Continuar a fase"), "emerald", "lg")
	_continue.anchor_left = 0.0
	_continue.anchor_right = 1.0
	_continue.anchor_top = 1.0
	_continue.anchor_bottom = 1.0
	_continue.offset_left = 18
	_continue.offset_right = -200
	_continue.offset_top = -86
	_continue.offset_bottom = -22
	_continue.pressed.connect(func(): Main.instance.go("run", {"id": str(state.activeRunId)}))
	add_child(_continue)


func _process(dt: float) -> void:
	if stage == null:
		return
	if not _dragging and absf(_velocity) > 0.01:
		stage.set_scroll_z(stage.scroll_z() + _velocity * dt)
		_velocity *= pow(0.04, dt)
	var cam := stage.camera
	var off := Vector2(0, 0)
	for b in _banners:
		var c: Control = b.node
		var sp := cam.unproject_position(b.world) + off
		c.size = c.get_combined_minimum_size()
		c.position = Vector2(sp.x - c.size.x / 2, sp.y - c.size.y / 2)
	for l in _node_labels:
		var c: Control = l.node
		var sp := cam.unproject_position(l.world)
		c.size = c.get_combined_minimum_size()
		if l.beit:
			c.position = Vector2(sp.x - c.size.x / 2, sp.y - 128)
		elif l.side == "right":
			c.position = Vector2(sp.x + 24, sp.y - c.size.y / 2)
		else:
			c.position = Vector2(sp.x - 24 - c.size.x, sp.y - c.size.y / 2)
		c.visible = sp.y > 40 and sp.y < size.y + 40


# --- Toque e rolagem -------------------------------------------------------------------


func _units_per_pixel() -> float:
	return 1.0 / (stage.pixels_per_unit(size.x) * MapStage.SIN)


func _on_input(e: InputEvent) -> void:
	if stage == null:
		return
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			stage.set_scroll_z(stage.scroll_z() + 50 * _units_per_pixel())
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			stage.set_scroll_z(stage.scroll_z() - 50 * _units_per_pixel())
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				_dragging = true
				_drag_moved = 0.0
				_press_pos = mb.position
				_velocity = 0.0
			else:
				_dragging = false
				if _drag_moved < 12.0:
					_tap(mb.position)
	elif e is InputEventMouseMotion and _dragging:
		var mm := e as InputEventMouseMotion
		_drag_moved += absf(mm.relative.y) + absf(mm.relative.x)
		var dz := -mm.relative.y * _units_per_pixel()
		stage.set_scroll_z(stage.scroll_z() + dz)
		_velocity = dz / maxf(get_process_delta_time(), 0.008)


func _tap(at: Vector2) -> void:
	var best: Dictionary = {}
	var best_d := 38.0
	for l in _node_labels:
		var sp := stage.camera.unproject_position(l.world)
		var d := sp.distance_to(at)
		if d < best_d:
			best_d = d
			best = l
	if not best.is_empty():
		_on_node(best)


func _walk_points(p: Dictionary, from: int, to: int) -> Array:
	var layout: Dictionary = p.world.layout
	var nodes: Array = layout.nodes
	var pts: Array = [nodes[from]]
	var step := 1 if to > from else -1
	var i := from
	while i != to:
		var seg: Array = (layout.dots[i] as Array).duplicate() if step > 0 else (layout.dots[i - 1] as Array).duplicate()
		if step < 0:
			seg.reverse()
		pts.append_array(seg)
		pts.append(nodes[i + step])
		i += step
	var out: Array = []
	for q in pts:
		out.append(WorldMap.to_world(float(q.x), float(p.top) + float(q.y)))
	if nodes[to].kind == "beitMidrash":
		out[out.size() - 1].z += 1.6
	return out


func _on_node(l: Dictionary) -> void:
	var st := _status(str(l.id))
	var target: Dictionary = l.at
	if not st.is_empty() and str(st.state) != "locked" and _standing != str(l.id):
		var from := _find_node(_standing)
		if not from.is_empty() and from.placed == target.placed:
			await stage.walk(_walk_points(target.placed, int(from.node.index), int(target.node.index)))
		else:
			stage.place_golem(_node_pos(target))
		_standing = str(l.id)
	else:
		Sfx.play("pop", 0.5)
	_open_sheet(str(l.id))


# --- Ficha da fase (porte de components/journey/NodeSheet.tsx) ---------------------------


func _open_sheet(node_id: String) -> void:
	if _sheet and is_instance_valid(_sheet):
		_sheet.queue_free()
	var info := JourneyData.level_info(node_id)
	if info.is_empty():
		return
	var st := _status(node_id)
	var state_s := str(st.get("state", "locked"))
	_sheet = Sheet.new()
	var v := _sheet.body
	var head := Ui.hbox(10)
	var titles := Ui.vbox(2)
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_child(Ui.title(str(info.title), 26, Ui.ON))
	if str(info.titleHe) != "":
		var he := Ui.label(str(info.titleHe), 18, Ui.GOLD, "serif")
		he.text_direction = Control.TEXT_DIRECTION_RTL
		he.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		he.autowrap_mode = TextServer.AUTOWRAP_OFF
		titles.add_child(he)
	head.add_child(titles)
	if state_s == "completed":
		var stars := int(st.get("stars", 0))
		var s := Ui.label("★".repeat(stars) + "☆".repeat(3 - stars), 24, Ui.GOLD, "bold")
		s.autowrap_mode = TextServer.AUTOWRAP_OFF
		s.size_flags_horizontal = Control.SIZE_SHRINK_END
		head.add_child(s)
	v.add_child(head)
	var w := JourneyData.world(str(info.book))
	var p := JourneyData.parasha(str(info.parashaId))
	var subtitle := JourneyData.loc(w.beitMidrash.subtitle) if info.kind == "beitMidrash" else str(info.subtitle)
	if info.kind == "main" and not p.is_empty():
		subtitle += " · " + JourneyData.loc(p.shortRef)
	v.add_child(Ui.label(subtitle, 15, Color("#DDE3FA")))
	if info.kind == "track":
		var tr := JourneyData.track(str(info.track))
		v.add_child(Ui.label(I18n.t("Fontes: {list}", {"list": JourneyData.loc(tr.sources)}), 13, Color("#9FAAD6")))
	if info.kind == "main" and not p.is_empty():
		var events := Ui.vbox(4)
		for e in (p.events as Array).slice(0, 3):
			events.add_child(Ui.label("•  %s  %s" % [JourneyData.loc(e.caption), JourneyData.loc(e.ref)], 14, Ui.ON))
		v.add_child(events)
	if info.kind == "beitMidrash":
		var reward: Variant = w.beitMidrash.get("reward")
		var text := I18n.t("Uma revisão com perguntas de todas as parashiot de {book}. No fim, um siyum e um prêmio para o Golem: {item}.", {"book": JourneyData.loc(w.name), "item": JourneyData.loc(reward)}) if reward != null else I18n.t("Uma revisão com perguntas de todas as parashiot de {book}. No fim, um siyum.", {"book": JourneyData.loc(w.name)})
		v.add_child(Ui.label(text, 15, Color("#DDE3FA")))
	var err := Ui.label("", 14, Ui.ERROR)
	err.visible = false
	if state_s == "locked":
		var why := I18n.t("Fechada por enquanto.")
		if info.kind == "track":
			why = I18n.t("Este caminho abre quando você completar a Torá de {parasha}. Todo estudo parte da Torá.", {"parasha": JourneyData.loc(p.name)})
		else:
			var pre := _prerequisite(node_id)
			if pre != "":
				why = I18n.t("Fechada: complete antes {level}.", {"level": str(JourneyData.level_info(pre).get("title", ""))})
		v.add_child(Ui.label(why, 15, Ui.GOLD, "medium"))
	elif not bool(st.get("available", true)):
		v.add_child(Ui.label(I18n.t("Em preparo: os textos desta fase ainda não foram carregados no servidor."), 15, Ui.GOLD))
	else:
		var resumable := state.get("activeRunId") != null and str(state.currentNodeId) == node_id
		var play := Ui.button(I18n.t("Continuar a fase") if resumable else (I18n.t("Jogar de novo") if state_s == "completed" else I18n.t("Jogar")), "emerald", "lg")
		play.pressed.connect(func(): _start(node_id, play, err, resumable))
		v.add_child(play)
		Ui.mark("journey-play", play)
	v.add_child(err)
	if info.kind == "main":
		if state_s == "completed":
			var tracks := _tracks_of(str(info.parashaId))
			if not tracks.is_empty():
				v.add_child(Ui.label(I18n.t("Caminhos de estudo"), 16, Ui.ON, "semibold"))
				var grid := GridContainer.new()
				grid.columns = 2
				grid.add_theme_constant_override("h_separation", 8)
				grid.add_theme_constant_override("v_separation", 8)
				for tr in tracks:
					var tinfo := JourneyData.track(str(tr.track))
					var locked := str(tr.state) == "locked"
					var label := JourneyData.loc(tinfo.label) + ("  " + "★".repeat(int(tr.stars)) if str(tr.state) == "completed" else "")
					var b := Ui.button(label, "velvet", "sm")
					b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
					b.disabled = locked
					var tid := str(tr.nodeId)
					b.pressed.connect(func(): _open_sheet(tid))
					grid.add_child(b)
				v.add_child(grid)
		else:
			v.add_child(Ui.label(I18n.t("Mishná, Talmud, Midrash, comentaristas, Cabalá e mitzvot abrem depois desta fase."), 13, Color("#9FAAD6")))
	_sheet.closed.connect(func(): _sheet = null)
	add_child(_sheet)


## A fase que precisa vir antes (porte de prerequisitesOf), para explicar o cadeado.
func _prerequisite(node_id: String) -> String:
	var parts := node_id.split(":")
	if parts[0] == "beit-midrash":
		return ""
	if parts[1] != "torah":
		return parts[0] + ":torah"
	var prev := ""
	var prev_book := ""
	for w in JourneyData.worlds():
		for p in w.parashot:
			if p.id == parts[0]:
				if prev == "":
					return ""
				var my_book := str(w.id)
				return ("beit-midrash:" + prev_book) if prev_book != my_book else (prev + ":torah")
			prev = str(p.id)
			prev_book = str(w.id)
	return ""


func _start(node_id: String, button: Button, err: Label, resumable: bool) -> void:
	button.disabled = true
	err.visible = false
	if resumable:
		Main.instance.go("run", {"id": str(state.activeRunId)})
		return
	button.text = I18n.t("Carregando…")
	# Antes da fase, o servidor prepara as perguntas no idioma do jogador.
	var prep := await Api.journey_prepare(node_id)
	var deadline := Time.get_ticks_msec() + 5 * 60_000
	while prep.ok and str(prep.data.status) == "preparing" and Time.get_ticks_msec() < deadline:
		button.text = I18n.t("Preparando as perguntas no seu idioma… {done} de {total}", {"done": int(prep.data.done), "total": int(prep.data.total)})
		await get_tree().create_timer(1.2).timeout
		if not is_inside_tree():
			return
		prep = await Api.journey_prepare(node_id)
	var r := await Api.journey_start(node_id) if (prep.ok and str(prep.data.status) != "unavailable") else prep
	if r.ok and r.data.has("runId"):
		Sfx.play("power", 0.7)
		Main.instance.go("run", {"id": str(r.data.runId)})
		return
	button.disabled = false
	button.text = I18n.t("Jogar")
	err.text = r.message if not r.ok else I18n.t("Ainda não há perguntas neste idioma.")
	err.visible = true
