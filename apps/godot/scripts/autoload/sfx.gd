## Sons curtos do jogo (os mesmos arquivos do app, de apps/mobile/scripts/make-sounds.py).
## Vários tocam ao mesmo tempo (o tique do sevivon por cima do zunido, por exemplo).
extends Node

const NAMES := ["bump", "clear", "clock", "coin", "correct", "dot", "jump", "pop", "power", "reveal", "seal", "spin", "tick", "topple", "win", "wrong"]
const VOICES := 8

var muted := false
var _streams := {}
var _players: Array[AudioStreamPlayer] = []
var _next := 0


func _ready() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(I18n.SETTINGS) == OK:
		muted = not bool(cfg.get_value("ui", "sound", true))
	for n in NAMES:
		var s := load("res://assets/sounds/%s.wav" % n)
		if s:
			_streams[n] = s
	for i in VOICES:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)


## Liga ou desliga os sons (guardado no aparelho, como no app).
func set_enabled(on: bool) -> void:
	muted = not on
	var cfg := ConfigFile.new()
	cfg.load(I18n.SETTINGS)
	cfg.set_value("ui", "sound", on)
	cfg.save(I18n.SETTINGS)


## volume: 0..1 (linear, como no app).
func play(sound: String, volume := 1.0) -> void:
	if muted or not _streams.has(sound):
		return
	var p := _players[_next]
	_next = (_next + 1) % VOICES
	p.stream = _streams[sound]
	p.volume_db = linear_to_db(clampf(volume, 0.001, 1.0))
	p.play()
