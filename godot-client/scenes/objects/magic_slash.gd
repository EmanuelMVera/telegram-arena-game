extends Area2D

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var direction := 1


func _ready() -> void:
	body_entered.connect(_on_body_entered)

	if sprite.sprite_frames and sprite.sprite_frames.has_animation("slash"):
		sprite.play("slash")
	else:
		sprite.play()

	sprite.animation_finished.connect(_on_animation_finished)


func setup(new_direction: int) -> void:
	direction = new_direction

	if direction < 0:
		scale.x = -abs(scale.x)
	else:
		scale.x = abs(scale.x)


func _on_body_entered(_body: Node) -> void:
	print("Melee hit")


func _on_animation_finished() -> void:
	queue_free()