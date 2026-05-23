extends Area2D

const SPEED := 520.0
const LIFETIME := 1.2

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var direction: Vector2 = Vector2.RIGHT


func _ready() -> void:
	body_entered.connect(_on_body_entered)

	if sprite.sprite_frames and sprite.sprite_frames.has_animation("travel"):
		sprite.play("travel")
	else:
		sprite.play()

	var tween := create_tween()
	tween.tween_property(
		self,
		"global_position",
		global_position + direction * SPEED * LIFETIME,
		LIFETIME
	)

	tween.finished.connect(_on_lifetime_finished)


func setup(new_direction: Vector2) -> void:
	direction = new_direction.normalized()

	if direction.x < 0:
		scale.x = -abs(scale.x)
	else:
		scale.x = abs(scale.x)


func _on_body_entered(_body: Node) -> void:
	queue_free()


func _on_lifetime_finished() -> void:
	if not is_queued_for_deletion():
		queue_free()
