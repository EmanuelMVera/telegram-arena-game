extends CharacterBody2D

const SPEED := 220.0
const JUMP_VELOCITY := -420.0
const GRAVITY := 1200.0

const MELEE_COOLDOWN := 0.45
const CAST_COOLDOWN := 0.85

const MAGIC_SLASH_SCENE := preload("res://scenes/objects/MagicSlash.tscn")
const ENERGY_PROJECTILE_SCENE := preload("res://scenes/objects/EnergyProjectile.tscn")

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
	var slash := MAGIC_SLASH_SCENE.instantiate()

	var spawn_offset := Vector2(34 * facing_direction, -30)
	slash.global_position = global_position + spawn_offset

	get_tree().current_scene.add_child(slash)
	slash.setup(facing_direction)

func spawn_projectile() -> void:
	var projectile := ENERGY_PROJECTILE_SCENE.instantiate()

	var spawn_offset := Vector2(34 * facing_direction, -26)
	projectile.global_position = global_position + spawn_offset

	get_tree().current_scene.add_child(projectile)
	projectile.setup(Vector2(facing_direction, 0))