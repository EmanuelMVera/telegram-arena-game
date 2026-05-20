extends CharacterBody2D

const SPEED := 220.0
const JUMP_VELOCITY := -420.0
const GRAVITY := 1200.0

const PROJECTILE_SPEED := 520.0
const PROJECTILE_LIFETIME := 1.2

const MELEE_COOLDOWN := 0.45
const CAST_COOLDOWN := 0.85

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

var facing_direction := 1

var is_action_locked := false
var can_melee_attack := true
var can_cast := true


func _ready() -> void:
	sprite.play("idle")


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y += GRAVITY * delta

	var direction := Input.get_axis("ui_left", "ui_right")

	if direction != 0:
		velocity.x = direction * SPEED
		facing_direction = sign(direction)
		sprite.flip_h = facing_direction < 0
	else:
		velocity.x = move_toward(velocity.x, 0, SPEED)

	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = JUMP_VELOCITY

	if Input.is_action_just_pressed("attack"):
		melee_attack()

	if Input.is_action_just_pressed("cast"):
		cast_projectile()

	move_and_slide()
	update_animation(direction)


func update_animation(direction: float) -> void:
	if is_action_locked:
		return

	if not is_on_floor():
		return

	if direction != 0:
		if sprite.animation != "walk":
			sprite.play("walk")
	else:
		if sprite.animation != "idle":
			sprite.play("idle")


func melee_attack() -> void:
	if not can_melee_attack or is_action_locked:
		return

	can_melee_attack = false
	is_action_locked = true

	sprite.play("attack")

	await get_tree().create_timer(0.14).timeout
	spawn_melee_slash()

	await sprite.animation_finished
	is_action_locked = false

	await get_tree().create_timer(MELEE_COOLDOWN).timeout
	can_melee_attack = true


func cast_projectile() -> void:
	if not can_cast or is_action_locked:
		return

	can_cast = false
	is_action_locked = true

	sprite.play("cast")

	await get_tree().create_timer(0.25).timeout
	spawn_projectile()

	await sprite.animation_finished
	is_action_locked = false

	await get_tree().create_timer(CAST_COOLDOWN).timeout
	can_cast = true


func spawn_melee_slash() -> void:
	var slash := Area2D.new()
	slash.name = "MagicMeleeSlash"

	var collision := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(42, 76)
	collision.shape = shape

	var visual := ColorRect.new()
	visual.color = Color(0.3, 0.95, 1.0, 0.55)
	visual.size = Vector2(42, 76)
	visual.position = Vector2(-21, -38)

	slash.add_child(visual)
	slash.add_child(collision)

	var spawn_offset := Vector2(34 * facing_direction, -30)
	slash.global_position = global_position + spawn_offset

	get_tree().current_scene.add_child(slash)

	var slash_ref: WeakRef = weakref(slash)

	var start_y := slash.global_position.y + 24
	var end_y := slash.global_position.y - 34
	slash.global_position.y = start_y

	slash.body_entered.connect(func(_body: Node) -> void:
		var s := slash_ref.get_ref() as Area2D
		if s != null:
			print("Melee hit")
	)

	var tween := create_tween()
	tween.parallel().tween_property(slash, "global_position:y", end_y, 0.12)
	tween.parallel().tween_property(slash, "modulate:a", 0.0, 0.12)

	tween.finished.connect(func() -> void:
		var s := slash_ref.get_ref() as Area2D
		if s != null and not s.is_queued_for_deletion():
			s.queue_free()
	)


func spawn_projectile() -> void:
	var projectile := Area2D.new()
	projectile.name = "EnergyProjectile"

	var collision := CollisionShape2D.new()
	var shape := CircleShape2D.new()
	shape.radius = 8
	collision.shape = shape

	var visual := ColorRect.new()
	visual.color = Color(0.3, 0.95, 1.0, 1.0)
	visual.size = Vector2(18, 18)
	visual.position = Vector2(-9, -9)

	projectile.add_child(visual)
	projectile.add_child(collision)

	var spawn_offset := Vector2(34 * facing_direction, -26)
	projectile.global_position = global_position + spawn_offset

	get_tree().current_scene.add_child(projectile)

	var projectile_ref: WeakRef = weakref(projectile)

	var direction := Vector2(facing_direction, 0)
	var lifetime := PROJECTILE_LIFETIME

	projectile.body_entered.connect(func(_body: Node) -> void:
		var p := projectile_ref.get_ref() as Area2D
		if p != null and not p.is_queued_for_deletion():
			p.queue_free()
	)

	var tween := create_tween()
	tween.tween_property(
		projectile,
		"global_position",
		projectile.global_position + direction * PROJECTILE_SPEED * lifetime,
		lifetime
	)

	tween.finished.connect(func() -> void:
		var p := projectile_ref.get_ref() as Area2D
		if p != null and not p.is_queued_for_deletion():
			p.queue_free()
	)
