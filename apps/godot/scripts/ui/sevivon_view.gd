## O sevivon 3D como peça de interface: um SubViewport com a cena (SevivonStage) que ocupa
## o retângulo deste controle. `active = false` para de desenhar (pergunta aberta por cima).
class_name SevivonView
extends SubViewportContainer

var stage := SevivonStage.new()
var viewport := SubViewport.new()
var active := true:
	set(v):
		active = v
		viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if v else SubViewport.UPDATE_DISABLED
		stage.process_mode = Node.PROCESS_MODE_INHERIT if v else Node.PROCESS_MODE_DISABLED


func _init() -> void:
	stretch = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	viewport.transparent_bg = false
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	viewport.add_child(stage)
	# Quadro alto (tela cheia): fixa a largura; quadro largo (cartão): fixa a altura.
	resized.connect(func():
		if stage.camera and size.y > 0:
			stage.camera.keep_aspect = Camera3D.KEEP_WIDTH if size.x / size.y < 1.0 else Camera3D.KEEP_HEIGHT)
