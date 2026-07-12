extends RefCounted
class_name CelestialProjection

## Orthographic celestial globe — unit-sphere coords, view-space projection, turntable orientation.

const NCP_RA_DEG := 0.0
const NCP_DEC_DEG := 90.0


static func unit_vector_from_ra_dec_deg(ra_deg: float, dec_deg: float) -> Vector3:
	var ra_rad := deg_to_rad(ra_deg)
	var dec_rad := deg_to_rad(dec_deg)
	var cos_dec := cos(dec_rad)
	return Vector3(cos_dec * cos(ra_rad), cos_dec * sin(ra_rad), sin(dec_rad))


static func ra_dec_deg_from_unit_vector(direction: Vector3) -> Vector2:
	var unit := direction
	if unit.length_squared() > 1e-12:
		unit = unit.normalized()
	var dec_deg := rad_to_deg(asin(clampf(unit.z, -1.0, 1.0)))
	var ra_deg := rad_to_deg(atan2(unit.y, unit.x))
	if ra_deg < 0.0:
		ra_deg += 360.0
	return Vector2(ra_deg, dec_deg)


## Maps celestial coords (Z = north pole) into globe model space (Y = up, Z = depth).
static func celestial_to_model_space(unit: Vector3) -> Vector3:
	return Vector3(unit.x, unit.z, -unit.y)


static func celestial_unit_to_globe_view(unit: Vector3, globe_orientation: Basis) -> Vector3:
	return globe_orientation * celestial_to_model_space(unit)


static func is_visible_in_view(view_pos: Vector3, epsilon: float = 1e-6) -> bool:
	return view_pos.z > epsilon


static func orthographic_view_xy(view_pos: Vector3, scale: float) -> Vector2:
	return Vector2(view_pos.x * scale, -view_pos.y * scale)


static func orthographic_ra_dec_deg_to_view(
	ra_deg: float,
	dec_deg: float,
	globe_orientation: Basis
) -> Vector3:
	return celestial_unit_to_globe_view(
		unit_vector_from_ra_dec_deg(ra_deg, dec_deg),
		globe_orientation
	)


## Returns screen offset from globe center, or null when the point lies on the hidden hemisphere.
static func orthographic_ra_dec_deg_to_xy(
	ra_deg: float,
	dec_deg: float,
	scale: float,
	globe_orientation: Basis
) -> Variant:
	var view_pos := orthographic_ra_dec_deg_to_view(ra_deg, dec_deg, globe_orientation)
	if not is_visible_in_view(view_pos):
		return null
	return orthographic_view_xy(view_pos, scale)


static func limb_fade(view_pos: Vector3, fade_width: float = 0.12) -> float:
	if view_pos.z <= 0.0:
		return 0.0
	if fade_width <= 1e-6:
		return 1.0
	return clampf(view_pos.z / fade_width, 0.0, 1.0)


## Clips a segment on the unit sphere to the visible hemisphere in view space.
## Returns 0–2 view-space unit vectors.
static func clip_unit_segment_to_visible_hemisphere(
	start_unit: Vector3,
	end_unit: Vector3,
	globe_orientation: Basis
) -> Array:
	var a := celestial_unit_to_globe_view(start_unit.normalized(), globe_orientation)
	var b := celestial_unit_to_globe_view(end_unit.normalized(), globe_orientation)
	if a.length_squared() > 1e-12:
		a = a.normalized()
	if b.length_squared() > 1e-12:
		b = b.normalized()

	var vis_a := is_visible_in_view(a)
	var vis_b := is_visible_in_view(b)
	if vis_a and vis_b:
		return [a, b]
	if not vis_a and not vis_b:
		return []

	var denom := a.z - b.z
	var t := 0.5 if absf(denom) < 1e-9 else a.z / denom
	t = clampf(t, 0.0, 1.0)
	var clipped := a.lerp(b, t)
	if clipped.length_squared() > 1e-12:
		clipped = clipped.normalized()
	else:
		return []

	if vis_a:
		return [a, clipped]
	return [clipped, b]


## Yaw/pitch that place model_direction on the view +Z axis (screen center) via turntable rotation.
static func yaw_pitch_from_model_direction(model_direction: Vector3) -> Vector2:
	var forward := model_direction.normalized()
	if forward.length_squared() < 1e-12:
		return Vector2.ZERO

	var yaw: float
	if absf(forward.x) > 1e-9 or absf(forward.z) > 1e-9:
		yaw = atan2(-forward.x, forward.z)
	else:
		yaw = 0.0

	var cos_yaw := cos(yaw)
	var sin_yaw := sin(yaw)
	var yaw_rotated := Vector3(
		cos_yaw * forward.x + sin_yaw * forward.z,
		forward.y,
		-sin_yaw * forward.x + cos_yaw * forward.z
	)

	var pitch: float
	if absf(yaw_rotated.y) > 1e-9 or absf(yaw_rotated.z) > 1e-9:
		pitch = atan2(-yaw_rotated.y, yaw_rotated.z)
	else:
		pitch = 0.0

	return Vector2(yaw, pitch)


static func yaw_pitch_facing_celestial(ra_deg: float, dec_deg: float) -> Vector2:
	return yaw_pitch_from_model_direction(
		celestial_to_model_space(unit_vector_from_ra_dec_deg(ra_deg, dec_deg))
	)


## Physical globe: spin around Y, then tilt around X. NCP/SCP stay on a fixed screen meridian.
static func globe_orientation_from_yaw_pitch(yaw_rad: float, pitch_rad: float) -> Basis:
	return Basis(Vector3.RIGHT, -pitch_rad) * Basis(Vector3.UP, yaw_rad)


## Turntable drag: accumulate yaw/pitch scalars; roll cannot creep in.
static func apply_globe_drag_turntable(
	yaw_rad: float,
	pitch_rad: float,
	delta_pixels: Vector2,
	sensitivity_rad: float,
	pitch_limit_rad: float
) -> Vector2:
	yaw_rad += delta_pixels.x * sensitivity_rad
	pitch_rad -= delta_pixels.y * sensitivity_rad
	pitch_rad = clampf(pitch_rad, -pitch_limit_rad, pitch_limit_rad)
	return Vector2(yaw_rad, pitch_rad)
