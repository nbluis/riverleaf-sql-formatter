# Example dictionary — astronomy vocabulary

Every SQL **example** in this project (test-case `input`/`expected`, README snippets, docs) is written
using names from this dictionary. Real queries are always rewritten onto these names before they
become examples. Two goals:

1. **Isomorphism.** Examples share one vocabulary, so they read as variations of the same world and
   the reader focuses on the *formatting*, not on inventing table names.
2. **Abstraction / safety.** No real business table, column, or value ever leaks into the repo — we
   overwrite objects, columns, aliases, and literals with dictionary names.

The theme is **astronomy**. Everything below is `lower_snake_case` (identifiers) or a short quoted
string (literals), matching how SQL is actually written.

## How to use it (when rewriting a real query into an example)

- **Substitute by role, not by spelling.** Find the role each real object plays (main entity, child
  rows, a joined lookup, a numeric measure, a date, a status literal, …) and pick the matching
  dictionary word. The "Suggested role mapping" table below gives sensible defaults so independent
  rewrites stay consistent.
- **Keep the shape identical.** Same number of columns, joins, conditions, CTEs, nesting. Only the
  *names and literals* change — never the structure being demonstrated.
- **Reuse the canonical alias** for a table (see Aliases) so `p.mass`, `ms.status`, `obs.observed_at`
  look the same across every example.
- **Prefer the first name in a list** as the default; reach for the others when an example needs a
  second/third distinct object of the same kind (e.g. two joined tables → `planet` + `star`).
- **Pad to the length you need.** River alignment is about column widths, so when an example must
  exercise a wide clause head or a long column, pick a longer dictionary word (`constellation`,
  `orbital_period`, `apparent_magnitude`) rather than inventing a name.
- Don't introduce non-astronomy names. If a role isn't covered here, add it to this file first.

## Tables

```yaml
tables:
  # Primary entities — the "nouns" a query is about. planet is the default main
  # table; star is the default second/joined table.
  primary:
    - planet          # default main entity
    - star            # default joined entity
    - galaxy          # default grouping/parent (org / tenant / category)
    - moon            # default child rows (line items of a planet)
    - satellite
    - asteroid
    - comet
    - spacecraft
    - mission         # default transactional entity (has status + dates)
    - astronaut       # default "person" (customer / user / employee)
    - station
    - observatory
    - observation     # default detail/line-item of a mission
    - constellation   # a long name, for wide-head examples
    - nebula
    - telescope

  # Junction / many-to-many tables (naming: <a>_<b>, singular, alphabetical-ish).
  junction:
    - star_planet
    - planet_moon
    - mission_astronaut
    - mission_spacecraft
    - observatory_telescope

  # Lookup / type / status tables (small reference tables joined for a label).
  lookup:
    - planet_type
    - star_type
    - mission_type
    - mission_status
    - orbit_type

  # Time-bucketed summary / rollup tables (the analog of monthly_*_summaries or
  # *_visit_months — a per-period aggregate keyed by an entity + a period).
  summary:
    - monthly_observation_summaries
    - planet_transit_months
    - star_visibility_months
    - daily_observation_counts

  # Staging / scratch inputs (the analog of staging_*).
  staging:
    - observation_staging
    - planet_import
```

## Columns

```yaml
columns:
  # Identity
  identifiers:
    - id
    - code
    - name

  # Foreign keys — <entity>_id. parent_id for self-references.
  foreign_keys:
    - galaxy_id
    - star_id
    - planet_id
    - moon_id
    - satellite_id
    - mission_id
    - astronaut_id
    - spacecraft_id
    - station_id
    - observatory_id
    - observation_id
    - constellation_id
    - nebula_id
    - parent_id

  # Numeric measures — use for any amount / total / value / price / balance.
  # Default "amount" -> mass; secondary numeric -> distance; a "price"-like ->
  # magnitude. Pick a longer one when you need a wide column.
  measures:
    - mass
    - radius
    - diameter
    - distance
    - temperature
    - gravity
    - velocity
    - luminosity
    - orbital_period
    - rotation_period
    - apparent_magnitude
    - absolute_magnitude
    - eccentricity
    - albedo
    - surface_pressure
    - age

  # Counts — use for any quantity / count column.
  counts:
    - moon_count
    - satellite_count
    - observation_count
    - transit_count
    - visit_count      # kept for parity with real "visit_count" shapes

  # Text / descriptive columns.
  text:
    - name
    - designation
    - catalog_number
    - call_sign        # astronaut / mission handle
    - given_name       # astronaut first name
    - family_name      # astronaut last name
    - email
    - spectral_class
    - summary
    - notes

  # Classification / type / status columns (the label columns).
  descriptive:
    - classification
    - type
    - status
    - phase

  # Dates / timestamps.
  dates:
    - discovered_at
    - cataloged_at
    - launched_at
    - landed_at
    - completed_at
    - observed_at
    - perihelion_at
    - created_at
    - updated_at
    - deleted_at

  # Boolean flags — is_<adjective>.
  flags:
    - is_active
    - is_confirmed
    - is_habitable
    - is_dwarf
    - is_visible
    - is_named
    - is_binary
```

## Aliases

Canonical short aliases (used verbatim in examples). These astronomy aliases are meaningful, so they
override the general "no single-letter alias" note in `testing.md`.

```yaml
aliases:
  galaxy: g
  star: s
  planet: p
  moon: m
  satellite: sat
  asteroid: a
  comet: c
  spacecraft: sc
  mission: ms
  astronaut: ast
  station: st
  observatory: oby     # 'obs' is reserved for observation
  observation: obs
  constellation: con
  nebula: neb
  telescope: tel
```

## Views & materialized views

```yaml
views:
  - active_missions
  - mission_summary
  - mission_statistics
  - nearby_stars
  - habitable_planets
  - largest_planets
  - planet_summary
  - planet_statistics
  - recent_discoveries
  - star_catalog
  - observation_summary

materialized_views:
  - planet_metrics
  - mission_metrics
  - star_metrics
  - daily_observations
  - yearly_discoveries
```

## Functions & procedures

```yaml
functions:
  scalar:
    - calculate_gravity
    - calculate_density
    - calculate_escape_velocity
    - calculate_orbital_speed
    - distance_between
  table:
    - nearby_planets
    - nearby_stars
    - planets_by_star
    - missions_by_status
    - visible_constellations
  aggregate:
    - average_planet_mass
    - largest_planet
    - oldest_star
    - longest_mission

procedures:
  - discover_planet
  - launch_mission
  - complete_mission
  - assign_astronaut
  - register_observation
  - update_orbits
```

## Indexes & constraints

```yaml
indexes:
  - idx_planet_name
  - idx_planet_star_id
  - idx_mission_status
  - idx_observation_observed_at
  - idx_star_name

constraints:
  primary_keys:
    - pk_planet
    - pk_star
    - pk_mission
  foreign_keys:
    - fk_planet_star
    - fk_moon_planet
    - fk_mission_spacecraft
    - fk_observation_planet
  unique:
    - uq_planet_code
    - uq_star_code
  checks:
    - chk_planet_radius
    - chk_star_temperature
```

## Values / literals (for the right-hand side of conditions)

```yaml
values:
  galaxies: [Milky Way, Andromeda, Triangulum]
  stars: [Sun, Sirius, Vega, Polaris, Rigel]
  planets: [Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune]
  missions: [Apollo, Voyager, Artemis, Pioneer, Cassini]
  # mission_status column values
  statuses: [planned, active, completed, cancelled]
  # planet classification values
  classifications: [terrestrial, gas_giant, ice_giant, dwarf]
  # discovery / observation status (analog of new/returning/recovered)
  discovery: [confirmed, candidate, disputed]
  # tiers / segments (analog of customer segments, brightness classes)
  tiers: [supergiant, giant, subgiant, dwarf]
  spectral_classes: [O, B, A, F, G, K, M]
  booleans: [true, false]
  # dates: use ISO literals, e.g. '2026-01-01', '2026-07-01'
```

## Suggested role mapping (defaults, to keep rewrites consistent)

| Real-world role in a query                                   | Dictionary default            | Alias |
| ------------------------------------------------------------ | ----------------------------- | ----- |
| main entity being selected (`orders`, `products`)            | `planet`                      | `p`   |
| a second joined entity (`customers`, `table2`)               | `star`                        | `s`   |
| a parent / grouping / tenant (`organization`, `salon`)       | `galaxy`                      | `g`   |
| child / line-item rows (`order_items`, `order_services`)     | `moon` (or `observation`)     | `m`   |
| a transactional entity with status + dates (`orders`)        | `mission`                     | `ms`  |
| a person (`customers`, `users`, `employees`)                 | `astronaut`                   | `ast` |
| detail rows of the transaction (`order_items`)               | `observation`                 | `obs` |
| a lookup/type table (`status`, `*_type`)                     | `mission_status`/`planet_type`| —     |
| a many-to-many bridge                                        | `mission_astronaut`           | —     |
| a per-period summary (`monthly_*_summaries`, `*_months`)     | `monthly_observation_summaries` / `planet_transit_months` | — |
| a staging input (`staging_*`)                                | `observation_staging`         | —     |
| an amount / total / value / balance                          | `mass` (2nd: `distance`)      | —     |
| a price-like measure                                         | `magnitude` (`apparent_magnitude`) | — |
| a quantity / count                                           | `moon_count` / `observation_count` | — |
| a status/label column                                        | `status` / `classification`   | —     |
| a "name" / free text                                         | `name` / `designation`        | —     |
| a boolean flag (`active`, `valid`)                           | `is_active` / `is_confirmed`   | —     |

If a real query has more objects of one kind than the defaults cover, keep going down the relevant
list (e.g. a third joined table → `moon`; a fourth measure → `temperature`). When nothing fits, add
the new name to this file rather than inventing an off-theme one.
