## Idiomas do jogo: português, inglês e hebraico.
##
## Como no app React Native, o texto fica escrito em português no código e t() devolve a
## tradução do idioma escolhido. As traduções vêm de i18n/ui.json, gerado a partir das
## mesmas tabelas do app (pnpm --filter @trivia/mobile godot-i18n). Sem tradução, volta o
## português.
extends Node

signal changed

const LOCALES: Array[String] = ["pt", "en", "he"]
const NATIVE_NAMES := {"pt": "Português", "en": "English", "he": "עברית"}
const SETTINGS := "user://settings.cfg"

var locale := "pt"
## O jogador já escolheu (senão vale o idioma do aparelho).
var chosen := false
var _dicts := {}


func _ready() -> void:
	# ui.json: gerado das tabelas do app; extra.json: frases só deste cliente.
	for file in ["res://i18n/ui.json", "res://i18n/extra.json"]:
		var f := FileAccess.open(file, FileAccess.READ)
		if not f:
			continue
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		if parsed is Dictionary:
			for loc in parsed:
				if not _dicts.has(loc):
					_dicts[loc] = {}
				(_dicts[loc] as Dictionary).merge(parsed[loc], true)
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS) == OK and LOCALES.has(cfg.get_value("ui", "locale", "")):
		locale = cfg.get_value("ui", "locale")
		chosen = true
	else:
		locale = Util.locale_from_tag(OS.get_locale())


func set_locale(value: String) -> void:
	if not LOCALES.has(value):
		return
	locale = value
	chosen = true
	var cfg := ConfigFile.new()
	cfg.load(SETTINGS)
	cfg.set_value("ui", "locale", value)
	cfg.save(SETTINGS)
	changed.emit()


func rtl() -> bool:
	return locale == "he"


## Traduz uma frase; {nome} no texto é trocado por vars["nome"].
func t(pt: String, vars: Dictionary = {}) -> String:
	var text := pt
	if locale != "pt":
		var dict: Dictionary = _dicts.get(locale, {})
		text = dict.get(pt, pt)
	return Util.fill(text, vars)


## Singular ou plural ("{n} ponto" / "{n} pontos"), com o número formatado.
func tn(n: int, one: String, many: String, vars: Dictionary = {}) -> String:
	var all := vars.duplicate()
	all["n"] = number(n)
	return t(one if n == 1 else many, all)


## 1234 → "1.234" em português, "1,234" em inglês e hebraico.
func number(n: int) -> String:
	var sep := "." if locale == "pt" else ","
	var digits := str(absi(n))
	var out := ""
	while digits.length() > 3:
		out = sep + digits.substr(digits.length() - 3) + out
		digits = digits.substr(0, digits.length() - 3)
	return ("-" if n < 0 else "") + digits + out
