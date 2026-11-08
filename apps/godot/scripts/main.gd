## Raiz do jogo: escolhe a tela, troca uma pela outra com um esmaecimento curto e aplica a
## direção do texto (o hebraico espelha a interface inteira).
##
## Na web, ?preview=<nome> abre uma peça isolada (para conferir o visual com capturas):
## stage (a cena do sevivon), welcome, home.
class_name Main
extends Control

static var instance: Main

var _current: Control
var _current_name := ""
var _stack := Control.new()

## Para onde o botão Voltar do Android leva a partir de cada tela ("" = sai do jogo).
const BACK := {
	"home": "", "welcome": "", "splash": "", "offline": "",
	"login": "welcome", "game": "home", "journey": "home", "puzzle": "home", "ranking": "home",
	"profile": "home", "join": "home", "shop": "journey", "run": "journey", "puzzle_level": "puzzle",
	"account": "profile", "question": "home", "stage": "home",
}


func _ready() -> void:
	instance = self
	theme = Ui.theme
	var bg := ColorRect.new()
	bg.color = Ui.NIGHT
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	_stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_stack)
	# No celular: o Voltar do Android navega em vez de fechar o jogo, e a interface fica
	# fora da barra de status e do recorte da câmera.
	get_tree().set_quit_on_go_back(false)
	if OS.has_feature("mobile"):
		get_viewport().size_changed.connect(_apply_safe_area)
		_apply_safe_area.call_deferred()
	I18n.changed.connect(_apply_direction)
	_apply_direction()
	var preview := query("preview")
	if preview == "stage":
		go("stage")
	elif preview != "":
		go(preview)
	else:
		_boot()


func _boot() -> void:
	go("splash")
	# Voltando de um login com Google ou Facebook: termina o login antes de tudo.
	var social := await Social.finish_redirect()
	if not social.is_empty():
		if bool(social.ok):
			go(str(social.back) if str(social.back) != "welcome" else "home")
			Economy.notify(str(social.message))
			return
		Economy.notify(str(social.message))
	var state := await Api.restore()
	if state == 1:
		go("home")
	elif state == -1:
		go("offline")
	else:
		go("welcome")


func _apply_direction() -> void:
	layout_direction = Control.LAYOUT_DIRECTION_RTL if I18n.rtl() else Control.LAYOUT_DIRECTION_LTR


## Parâmetro da URL (só na web).
static func query(key: String) -> String:
	if not OS.has_feature("web"):
		return ""
	var location: JavaScriptObject = JavaScriptBridge.get_interface("location")
	if not location:
		return ""
	var search := str(location.search).trim_prefix("?")
	for pair in search.split("&", false):
		var kv := pair.split("=", true, 1)
		if kv[0].uri_decode() == key:
			return kv[1].uri_decode() if kv.size() > 1 else ""
	return ""


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		_back()


## Voltar: fecha a folha aberta; nas partidas, pede para sair como o botão da tela; nas
## outras telas, vai para a tela de cima; no início, sai do jogo.
func _back() -> void:
	for holder in [self, _current]:
		if holder == null:
			continue
		for c in holder.get_children():
			if c is Sheet:
				c.queue_free()
				return
	if _current and _current_name in ["run"] and _current.has_method("_leave"):
		_current.call("_leave")
		return
	if _current and _current_name == "puzzle_level" and _current.has_method("_quit"):
		_current.call("_quit")
		return
	var to: String = BACK.get(_current_name, "home")
	if to == "":
		get_tree().quit()
	else:
		go(to)


## Margens da área segura (barra de status, recorte da câmera, barra de gestos), em pixels
## da interface.
func _apply_safe_area() -> void:
	var safe := DisplayServer.get_display_safe_area()
	var screen := DisplayServer.screen_get_size()
	if screen.x <= 0 or safe.size.x <= 0:
		return
	var k := get_viewport().get_visible_rect().size.y / float(screen.y)
	_stack.offset_top = safe.position.y * k
	_stack.offset_bottom = -(screen.y - safe.end.y) * k


func go(screen: String, params: Dictionary = {}) -> void:
	_current_name = screen
	var next: Control = _make(screen)
	next.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if next.has_method("setup"):
		next.call("setup", params)
	var old := _current
	_current = next
	_stack.add_child(next)
	next.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(next, "modulate:a", 1.0, 0.22)
	if old:
		old.mouse_filter = Control.MOUSE_FILTER_IGNORE
		tw.parallel().tween_property(old, "modulate:a", 0.0, 0.18)
		tw.tween_callback(old.queue_free)


func _make(screen: String) -> Control:
	match screen:
		"splash":
			return SplashScreen.new()
		"offline":
			return SplashScreen.new(true)
		"welcome":
			return WelcomeScreen.new()
		"home":
			return HomeScreen.new()
		"game":
			return GameScreen.new()
		"journey":
			return JourneyScreen.new()
		"shop":
			return ShopScreen.new()
		"puzzle":
			return PuzzleMapScreen.new()
		"ranking":
			return RankingScreen.new()
		"profile":
			return ProfileScreen.new()
		"login":
			return LoginScreen.new()
		"join":
			return JoinScreen.new()
		"account":
			return AccountScreen.new()
		"puzzle_level":
			return PuzzleScreen.new()
		"run":
			return RunScreen.new()
		"question":
			return QuestionPreview.new()
		"stage":
			return StagePreview.new()
	return SplashScreen.new()
