## Dados das Pedras do Choshen (data/puzzle.json, gerado do app por godot-puzzle-data): as
## 60 fases (as mesmas que o servidor usa para conferir) e os nomes das seis pedras.
class_name PuzzleData

const LEVELS := 60
const CHAPTER_SIZE := 10
const SOURCE_URL := "https://www.sefaria.org/Exodus.28.17-18"

static var _data: Dictionary = {}


static func data() -> Dictionary:
	if _data.is_empty():
		_data = JSON.parse_string(FileAccess.get_file_as_string("res://data/puzzle.json"))
	return _data


static func level(n: int) -> Dictionary:
	return data().levels[clampi(n, 1, LEVELS) - 1]


static func stone_name(kind: int) -> String:
	if kind < 0 or kind >= 6:
		return "Urim"
	return JourneyData.loc(data().stones[kind].name)


static func stone_he(kind: int) -> String:
	return str(data().stones[kind].he)


## Capítulo (1 a 6) de uma fase.
static func chapter(n: int) -> int:
	return int((n - 1) / CHAPTER_SIZE) + 1
