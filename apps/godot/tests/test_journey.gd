## Testes do Golem World com o jogo carregado (precisam dos módulos globais).
## Uso: godot --headless --path apps/godot res://tests/test_journey.tscn
## Conferem contra o TypeScript (tests/sevivon_vectors.json): o sorteio com semente e o
## hash de texto, e o obstáculo e o cenário de cada pergunta; e montam todas as peças 3D.
extends Node

var _fails := 0
var _checks := 0


func _ok(cond: bool, what: String) -> void:
	_checks += 1
	if not cond:
		_fails += 1
		printerr("FALHOU " + what)


func _ready() -> void:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/sevivon_vectors.json"))
	for h in data.kit.hashes:
		_ok(Kit.hash_string(str(h.text)) == int(h.hash), "hash_string(%s)" % h.text)
	for s in data.kit.seeded:
		var r := Kit.seeded(int(s.seed))
		for v in s.values:
			_ok(absf(r.next() - float(v)) < 1e-9, "seeded(%d)" % int(s.seed))
	for l in data.levels:
		var tag := "%s #%d" % [l.nodeId, int(l.index)]
		_ok(str(JourneyData.obstacle_at(str(l.nodeId), int(l.index), int(l.count)).obstacle) == str(l.obstacle), tag + " obstáculo")
		var st := JourneyData.stage_at(str(l.nodeId), int(l.index), int(l.count))
		_ok(str(st.sky) == str(l.sky) and str(st.ground) == str(l.ground), tag + " céu e chão")
		_ok(PackedStringArray(st.props) == PackedStringArray(l.props), tag + " peças (%s × %s)" % [st.props, l.props])
	# Todas as peças 3D montam sem malha vazia.
	var empty := 0
	var built: Array[Node3D] = []
	for id in ["rock", "serpent", "thorns", "tree", "darkness", "wave", "fish", "frog", "locust", "scorpion", "bird", "cow", "calf", "camel", "donkey", "sheep", "lion", "grapes", "jar", "pot", "fire", "pit", "planks", "bricks", "wheat", "basket", "wagon", "cloth", "cloud", "banner"]:
		built.append(Story.obstacle(id))
	for id in ["ark", "tower", "city", "mishkan", "ladder", "cloud-pillar", "candles", "bush-fire", "tablets", "rainbow", "sun", "moon", "palms", "trees", "tents", "hills", "mountain", "pyramids"]:
		built.append(Story.prop(id))
	for s in ["yeshiva", "tent", "beit-midrash", "desert-yeshiva", "synagogue"]:
		built.append(WorldMap.beit_midrash(s))
	built.append(Golem.build({"equipped": {"head": "kipa-azul", "face": "oculos", "body": "tzitzit", "hand": "shofar", "companion": "chavruta"}}))
	for w in JourneyData.worlds():
		built.append(WorldMap.island(w, 0.0))
	# Uma cena para cada parashá (menos Bereshit, contada pela Criação), e a Criação.
	var scenes := 0
	for w in JourneyData.worlds():
		for p in w.parashot:
			var v := Vignettes.vignette(str(p.id))
			if v:
				scenes += 1
				Vignettes.animate(v.get_meta("scene"), 3.7)
				built.append(v)
	_ok(scenes == 53, "%d cenas no mapa (esperava 53)" % scenes)
	var creation := Vignettes.Creation.new()
	for t in [0.5, 2.0, 5.0, 9.0, 12.0]:
		creation.update(t)
	_ok(creation.earth.visible and creation.animals.all(func(a): return a.visible), "a Criação termina com a terra e os bichos")
	built.append(creation)
	for b in built:
		for m in b.find_children("*", "MeshInstance3D", true, false):
			if (m as MeshInstance3D).mesh == null or (m as MeshInstance3D).mesh.get_surface_count() == 0:
				empty += 1
		b.free()
	_ok(empty == 0, "%d malhas vazias" % empty)
	print("%d verificações, %d falhas" % [_checks, _fails])
	get_tree().quit(1 if _fails > 0 else 0)
