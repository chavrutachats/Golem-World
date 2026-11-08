## Pré-visualização da pergunta com dados de exemplo (?preview=question), para conferir o
## visual e as fontes do hebraico (vocalização e cantilação) sem depender do sorteio.
class_name QuestionPreview
extends Control


func _ready() -> void:
	var now := Time.get_datetime_string_from_system(true) + "Z"
	var q := {
		"playId": "00000000-0000-0000-0000-000000000000", "category": "torah", "difficulty": "medium",
		"isCrownChallenge": false, "optionsDirection": "rtl", "timeLimitSeconds": 30,
		"serverNow": now, "deadlineAt": Time.get_datetime_string_from_unix_time(int(Time.get_unix_time_from_system()) + 30) + "Z",
		"context": {"label": "Bereshit 1:1", "language": "he", "text": "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים אֵ֥ת הַשָּׁמַ֖יִם וְאֵ֥ת הָאָֽרֶץ׃"},
		"text": "Qual é a palavra que abre a Torá?",
		"options": ["בְּרֵאשִׁ֖ית", "וַיְדַבֵּ֥ר", "וַיִּקְרָ֖א", "אֵ֣לֶּה הַדְּבָרִ֗ים"],
	}
	var v := QuestionView.new(q, "preview")
	add_child(v)
