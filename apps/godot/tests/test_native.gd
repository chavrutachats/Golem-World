## Cliente instalado (fora da web): o endereço da API vem do server.cfg gravado pelo script de
## exportação Android, e o jogador pode trocar (com a normalização do que ele digitar).
## Uso: godot --headless --path apps/godot tests/test_native.tscn
extends Node

var _fails := 0
var _checks := 0


func _ok(cond: bool, what: String) -> void:
	_checks += 1
	if not cond:
		_fails += 1
		printerr("FALHOU " + what)


func _ready() -> void:
	var user_cfg := ProjectSettings.globalize_path(Api.SERVER_USER)
	DirAccess.remove_absolute(user_cfg)
	_ok(Api.can_choose_server(), "fora da web dá para escolher o servidor")
	# Sem nada gravado: o padrão do projeto.
	_ok(Api._detect_base_url() == str(ProjectSettings.get_setting("trivia/api_url")), "padrão do projeto")
	var cases := {
		"192.168.0.10": "http://192.168.0.10:3000",
		"192.168.0.10:8080": "http://192.168.0.10:8080",
		" http://10.0.0.5:3000/ ": "http://10.0.0.5:3000",
		"https://trivia.example.com": "https://trivia.example.com",
	}
	for typed in cases:
		Api.set_base_url(typed)
		_ok(Api.base_url == cases[typed], "normaliza %s -> %s (veio %s)" % [typed, cases[typed], Api.base_url])
		_ok(Api._detect_base_url() == cases[typed], "guarda %s" % typed)
	# Trocar de servidor esquece a sessão (ela é de outro servidor).
	_ok(not Api.has_stored_session(), "trocar de servidor esquece a sessão")
	DirAccess.remove_absolute(user_cfg)
	# Chanucá não depende da web.
	var c := Hanukkah.build(3)
	_ok(c.get_child_count() > 10, "chanukiá monta")
	c.free()
	print("%d verificações, %d falhas" % [_checks, _fails])
	get_tree().quit(1 if _fails > 0 else 0)
