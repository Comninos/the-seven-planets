extends RefCounted
class_name OrbitalMechanics

## J2000.0 mean Keplerian elements with secular rates (NASA/JPL approximate positions).
## Heliocentric ecliptic rectangular coords (AU) -> geocentric -> J2000 equatorial RA/Dec.
## Matches the fixed J2000 star catalog used by the sky map.

const J2000_EPOCH := 2451545.0
const UNIX_EPOCH_JD := 2440587.5
const OBLIQUITY_J2000 := 0.40909280422297297  # 23.439291°
const KEPLER_ITERATIONS := 10


static func julian_date_from_unix(unix_time: float) -> float:
	return UNIX_EPOCH_JD + unix_time / 86400.0


static func julian_date_to_gregorian(jd: float) -> Dictionary:
	var z := int(floor(jd + 0.5))
	var f := jd + 0.5 - z
	var a := z
	if z >= 2299161:
		var alpha := int(floor((z - 1867216.25) / 36524.25))
		a = z + 1 + alpha - int(floor(alpha / 4.0))
	var b := a + 1524
	var c := int(floor((b - 122.1) / 365.25))
	var d := int(floor(365.25 * c))
	var e := int(floor((b - d) / 30.6001))
	var day := b - d - int(floor(30.6001 * e)) + int(floor(f))
	var month := e - 1 if e < 14 else e - 13
	var year := c - 4716 if month > 2 else c - 4715
	return {"year": year, "month": month, "day": day}


## Inverse of julian_date_to_gregorian() for historical dates.
## Uses the Julian calendar before the Oct 1582 reform; Gregorian thereafter.
## Matches menu_sky_overview_globe JD_1453_01_01 (2251766.5) for 1453-01-01.
static func julian_date_from_gregorian(year: int, month: int, day: int) -> float:
	var y := year
	var m := month
	if m <= 2:
		y -= 1
		m += 12
	var b := 0
	if y >= 1583 or (y == 1582 and m > 10) or (y == 1582 and m == 10 and day >= 15):
		var century := int(floor(float(y) / 100.0))
		b = 2 - century + int(floor(century / 4.0))
	return float(int(floor(365.25 * (y + 4716))) + int(floor(30.6001 * (m + 1))) + day + b) - 1524.5


static func wrap_angle(rad: float) -> float:
	return fmod(rad + PI, TAU) - PI


static func _element_at_epoch(planet: Dictionary, key: String, rate_key: String, centuries: float) -> float:
	return float(planet[key]) + float(planet.get(rate_key, 0.0)) * centuries


static func _solve_kepler(mean_anomaly: float, eccentricity: float) -> float:
	var eccentric_anomaly: float = mean_anomaly
	for _i in range(KEPLER_ITERATIONS):
		eccentric_anomaly = mean_anomaly + eccentricity * sin(eccentric_anomaly)
	return eccentric_anomaly


static func heliocentric_ecliptic(planet: Dictionary, julian_date: float) -> Vector3:
	var centuries: float = (julian_date - J2000_EPOCH) / 36525.0
	var semi_major: float = _element_at_epoch(planet, "a", "a_t", centuries)
	var eccentricity: float = _element_at_epoch(planet, "e", "e_t", centuries)
	var inclination: float = deg_to_rad(_element_at_epoch(planet, "i", "i_t", centuries))
	var node: float = deg_to_rad(_element_at_epoch(planet, "node", "node_t", centuries))
	var long_perihelion: float = deg_to_rad(_element_at_epoch(planet, "w", "w_t", centuries))
	var mean_longitude: float = deg_to_rad(_element_at_epoch(planet, "L", "L_t", centuries))
	var arg_perihelion: float = wrap_angle(long_perihelion - node)
	var mean_anomaly: float = wrap_angle(mean_longitude - long_perihelion)

	var eccentric_anomaly: float = _solve_kepler(mean_anomaly, eccentricity)
	var x_orbit: float = semi_major * (cos(eccentric_anomaly) - eccentricity)
	var y_orbit: float = semi_major * sqrt(maxf(0.0, 1.0 - eccentricity * eccentricity)) * sin(eccentric_anomaly)

	# Rotate from orbital plane into J2000 ecliptic frame (Meeus 33.7).
	var cos_node: float = cos(node)
	var sin_node: float = sin(node)
	var cos_arg: float = cos(arg_perihelion)
	var sin_arg: float = sin(arg_perihelion)
	var cos_inc: float = cos(inclination)
	var sin_inc: float = sin(inclination)

	var a11: float = cos_node * cos_arg - sin_node * sin_arg * cos_inc
	var a12: float = -cos_node * sin_arg - sin_node * cos_arg * cos_inc
	var a21: float = sin_node * cos_arg + cos_node * sin_arg * cos_inc
	var a22: float = -sin_node * sin_arg + cos_node * cos_arg * cos_inc
	var a31: float = sin_arg * sin_inc
	var a32: float = cos_arg * sin_inc

	return Vector3(
		a11 * x_orbit + a12 * y_orbit,
		a21 * x_orbit + a22 * y_orbit,
		a31 * x_orbit + a32 * y_orbit
	)


static func geocentric_ecliptic(
	planet_name: String,
	orbital_data: Dictionary,
	julian_date: float,
	earth_position: Variant = null
) -> Vector3:
	if not orbital_data.has(planet_name):
		return Vector3.ZERO
	var earth: Vector3
	if earth_position is Vector3:
		earth = earth_position
	elif not orbital_data.has("earth"):
		return Vector3.ZERO
	else:
		earth = heliocentric_ecliptic(orbital_data["earth"] as Dictionary, julian_date)
	var heliocentric := heliocentric_ecliptic(orbital_data[planet_name] as Dictionary, julian_date)
	return heliocentric - earth


static func ecliptic_to_equatorial_rad(ecliptic: Vector3) -> Vector2:
	var longitude := atan2(ecliptic.y, ecliptic.x)
	var latitude := atan2(
		ecliptic.z,
		Vector2(ecliptic.x, ecliptic.y).length()
	)
	var sin_obliquity := sin(OBLIQUITY_J2000)
	var cos_obliquity := cos(OBLIQUITY_J2000)
	var ra := atan2(
		sin(longitude) * cos_obliquity - tan(latitude) * sin_obliquity,
		cos(longitude)
	)
	var dec := asin(clampf(
		sin(latitude) * cos_obliquity + cos(latitude) * sin_obliquity * sin(longitude),
		-1.0,
		1.0
	))
	return Vector2(ra, dec)


static func ecliptic_lon_lat_to_equatorial_rad(longitude: float, latitude: float) -> Vector2:
	var cos_lat := cos(latitude)
	return ecliptic_to_equatorial_rad(Vector3(
		cos_lat * cos(longitude),
		cos_lat * sin(longitude),
		sin(latitude)
	))


static func geocentric_equatorial_rad(
	planet_name: String,
	orbital_data: Dictionary,
	julian_date: float,
	earth_position: Variant = null
) -> Vector2:
	return ecliptic_to_equatorial_rad(
		geocentric_ecliptic(planet_name, orbital_data, julian_date, earth_position)
	)


static func geocentric_ecliptic_latitude_deg(
	planet_name: String,
	orbital_data: Dictionary,
	julian_date: float,
	earth_position: Variant = null
) -> float:
	var geo := geocentric_ecliptic(planet_name, orbital_data, julian_date, earth_position)
	return rad_to_deg(atan2(
		geo.z,
		Vector2(geo.x, geo.y).length()
	))


static func sun_geocentric_equatorial_rad(orbital_data: Dictionary, julian_date: float) -> Vector2:
	if not orbital_data.has("earth"):
		return Vector2.ZERO
	var earth := heliocentric_ecliptic(orbital_data["earth"] as Dictionary, julian_date)
	return ecliptic_to_equatorial_rad(-earth)


## Meeus Ch. 47 low-precision geocentric Moon; accurate to ~0.1 deg in J2000 ecliptic frame.
static func moon_geocentric_equatorial_rad(julian_date: float) -> Vector2:
	var centuries: float = (julian_date - J2000_EPOCH) / 36525.0
	var centuries_sq: float = centuries * centuries
	var mean_longitude: float = fposmod(
		218.3164477 + 481267.88123421 * centuries - 0.0015786 * centuries_sq,
		360.0
	)
	var mean_elongation: float = fposmod(
		297.8501921 + 445267.1114034 * centuries - 0.0018819 * centuries_sq,
		360.0
	)
	var mean_solar_anomaly: float = fposmod(
		357.5291092 + 35999.0502909 * centuries - 0.0001536 * centuries_sq,
		360.0
	)
	var mean_lunar_anomaly: float = fposmod(
		134.9633964 + 477198.8675055 * centuries + 0.0087414 * centuries_sq,
		360.0
	)
	var mean_argument_latitude: float = fposmod(
		93.2720950 + 483202.0175233 * centuries - 0.0036539 * centuries_sq,
		360.0
	)

	var d: float = deg_to_rad(mean_elongation)
	var m: float = deg_to_rad(mean_solar_anomaly)
	var mp: float = deg_to_rad(mean_lunar_anomaly)
	var f: float = deg_to_rad(mean_argument_latitude)

	var longitude_deg: float = mean_longitude
	longitude_deg += 6.289 * sin(mp)
	longitude_deg += 1.274 * sin(2.0 * d - mp)
	longitude_deg += 0.658 * sin(2.0 * d)
	longitude_deg += 0.214 * sin(2.0 * mp)
	longitude_deg -= 0.186 * sin(m)
	longitude_deg -= 0.114 * sin(2.0 * f)

	var latitude_deg: float = 0.0
	latitude_deg += 5.128 * sin(f)
	latitude_deg += 0.281 * sin(mp + f)
	latitude_deg -= 0.278 * sin(mp - f)
	latitude_deg += 0.173 * sin(2.0 * d - f)

	return ecliptic_lon_lat_to_equatorial_rad(deg_to_rad(longitude_deg), deg_to_rad(latitude_deg))

