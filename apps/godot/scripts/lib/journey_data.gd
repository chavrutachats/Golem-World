## Dados do Golem World (data/journey.json, gerado do app por godot-journey-data): mundos,
## parashiot, trilhas e o desenho de cada ilha, mais as contas de nomes das fases.
class_name JourneyData

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://data/journey.json"))
	return _data


static func worlds() -> Array:
	return data().worlds


static func world(book: String) -> Dictionary:
	for w in worlds():
		if w.id == book:
			return w
	return {}


static func track(id: String) -> Dictionary:
	for t in data().tracks:
		if t.id == id:
			return t
	return {}


static func parasha(id: String) -> Dictionary:
	for w in worlds():
		for p in w.parashot:
			if p.id == id:
				return p
	return {}


## Texto no idioma do jogador a partir de {pt, en, he}.
static func loc(d: Variant) -> String:
	if d is Dictionary:
		return str(d.get(I18n.locale, d.get("pt", "")))
	return str(d)


## O que mostrar de uma fase: {kind, book, parashaId, track, title, titleHe, subtitle, color}.
static func level_info(node_id: String) -> Dictionary:
	var parts := node_id.split(":")
	if parts.size() != 2:
		return {}
	if parts[0] == "beit-midrash":
		var w := world(parts[1])
		return {
			"kind": "beitMidrash", "book": parts[1], "parashaId": "", "track": "",
			"title": loc(w.beitMidrash.name), "titleHe": "" if I18n.rtl() else str(w.nameHe),
			"subtitle": I18n.t("Revisão de {book}: o livro inteiro", {"book": loc(w.name)}),
			"color": "#FFD541",
		}
	var p := parasha(parts[0])
	if p.is_empty():
		return {}
	var tr := track(parts[1])
	var book := ""
	for w in worlds():
		for x in w.parashot:
			if x.id == p.id:
				book = w.id
	var name := loc(p.name)
	var main := parts[1] == "torah"
	return {
		"kind": "main" if main else "track", "book": book, "parashaId": p.id, "track": parts[1],
		"title": name if main else "%s: %s" % [name, loc(tr.label)],
		"titleHe": "" if I18n.rtl() else (str(p.nameHe) if main else "%s · %s" % [p.nameHe, tr.labelHe]),
		"subtitle": loc(p.meaning) if main else loc(tr.description),
		"color": str(tr.color),
	}


static func _events_of(node_id: String) -> Array:
	var parts := node_id.split(":")
	if parts[0] == "beit-midrash":
		var all: Array = []
		for p in world(parts[1]).parashot:
			all.append_array(p.events)
		return all
	return parasha(parts[0]).get("events", [])


## Obstáculo da pergunta `index` de `count` (porte de obstacleAt): {obstacle, caption, ref}.
static func obstacle_at(node_id: String, index: int, count: int) -> Dictionary:
	var events := _events_of(node_id)
	if events.is_empty():
		return {"obstacle": "rock", "caption": "", "ref": ""}
	var e: Dictionary
	if node_id.begins_with("beit-midrash:"):
		e = events[(index * 5) % events.size()]
	else:
		var i := floori(float(index * events.size()) / count) if count > events.size() else index % events.size()
		e = events[clampi(i, 0, events.size() - 1)]
	return {"obstacle": str(e.obstacle), "caption": loc(e.caption), "ref": loc(e.ref)}


const TRACK_SKY := {"kabbalah": "night", "talmud": "dusk", "midrash": "dawn"}


## Cenário do trecho atual (porte de stageAt): {sky, ground, props, caption}.
static func stage_at(node_id: String, index: int, count: int) -> Dictionary:
	var parts := node_id.split(":")
	if parts.size() != 2:
		return {"sky": "day", "ground": "grass", "props": [], "caption": ""}
	if parts[0] == "beit-midrash":
		return {"sky": "gold", "ground": "stone", "props": ["hills", "city"], "caption": ""}
	var p := parasha(parts[0])
	var scene: Dictionary = p.scene
	var stages: Array = scene.stages
	var pick := func(st: Dictionary) -> Dictionary:
		return {"sky": st.sky, "ground": st.ground, "props": st.props, "caption": loc(st.caption) if st.get("caption") != null else ""}
	if parts[1] == "torah":
		if stages.is_empty():
			return pick.call(scene)
		var i := clampi(floori(float(index * stages.size()) / maxi(1, count)), 0, stages.size() - 1)
		return pick.call(stages[i])
	var base: Dictionary = stages[stages.size() - 1] if not stages.is_empty() else scene
	var sky: String = TRACK_SKY.get(parts[1], "")
	if sky == "" or base.sky == "void" or base.sky == "storm":
		return {"sky": base.sky, "ground": base.ground, "props": base.props, "caption": ""}
	var props: Array = (base.props as Array).duplicate()
	if sky == "night":
		props = props.filter(func(x): return x != "sun")
		props.append_array(["stars", "moon"])
	return {"sky": sky, "ground": base.ground, "props": props, "caption": ""}


## Ponto de chegada (porte de goalOf): {model, caption}.
static func goal_of(node_id: String) -> Dictionary:
	var parts := node_id.split(":")
	if parts[0] == "beit-midrash":
		var w := world(parts[1])
		return {"model": {"kind": "beitMidrash", "style": w.beitMidrash.style}, "caption": loc(w.beitMidrash.name)}
	var p := parasha(parts[0])
	if parts[1] != "torah":
		var tr := track(parts[1])
		return {"model": {"kind": "signpost", "color": tr.color}, "caption": I18n.t("Fim do caminho: {track}", {"track": loc(tr.label)})}
	return {"model": {"kind": "prop", "prop": p.goal.prop}, "caption": loc(p.goal.caption)}


static func item(id: String) -> Dictionary:
	for i in data().items:
		if i.id == id:
			return i
	return {}
