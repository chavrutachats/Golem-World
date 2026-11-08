## Contas pequenas sem dependência do resto do jogo (testáveis sem janela).
class_name Util


## "2026-11-04T20:15:03.250Z" → milissegundos desde 1970 (UTC).
static func iso_ms(iso: String) -> float:
	if iso == "":
		return 0.0
	var s := iso.strip_edges()
	var offset_min := 0
	if s.ends_with("Z"):
		s = s.substr(0, s.length() - 1)
	elif s.length() > 6 and (s[s.length() - 6] == "+" or s[s.length() - 6] == "-"):
		var sign := 1 if s[s.length() - 6] == "+" else -1
		offset_min = sign * (int(s.substr(s.length() - 5, 2)) * 60 + int(s.substr(s.length() - 2, 2)))
		s = s.substr(0, s.length() - 6)
	var frac := 0.0
	var dot := s.find(".")
	if dot >= 0:
		frac = float("0" + s.substr(dot))
		s = s.substr(0, dot)
	var secs := Time.get_unix_time_from_datetime_string(s)
	return (float(secs) + frac - offset_min * 60.0) * 1000.0


static func now_ms() -> float:
	return Time.get_unix_time_from_system() * 1000.0


## Troca {nome} por vars["nome"].
static func fill(text: String, vars: Dictionary) -> String:
	if vars.is_empty():
		return text
	var out := text
	for k in vars:
		out = out.replace("{%s}" % k, str(vars[k]))
	return out


## "pt_BR", "en-US", "iw", "he_IL" → idioma do jogo (português se não reconhecer).
static func locale_from_tag(tag: String) -> String:
	var lang := tag.to_lower().substr(0, 2)
	if lang == "iw":
		return "he"
	return lang if lang in ["pt", "en", "he"] else "pt"
