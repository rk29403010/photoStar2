# Grouping Fixture Pack

Generated fixture set for manual grouping-system testing.

## Coverage

- Non-people grouping hierarchy: `duplicate -> near_duplicate -> variant_set -> burst`
- 16 case folders
- 49 image files

## Naming

`NN__combo__subject__role.ext`

## Cases

- `01__solo__blue-circle`: expected groups none
- `02__dup__red-triangle`: expected groups dup
- `03__near__green-square`: expected groups near
- `04__variant__yellow-circle`: expected groups variant
- `05__burst__orange-star`: expected groups burst
- `06__dup-near__purple-hex`: expected groups dup -> near
- `07__dup-variant__teal-diamond`: expected groups dup -> variant
- `08__dup-burst__pink-cross`: expected groups dup -> burst
- `09__near-variant__lime-pentagon`: expected groups near -> variant
- `10__near-burst__navy-arrow`: expected groups near -> burst
- `11__variant-burst__brown-moon`: expected groups variant -> burst
- `12__dup-near-variant__black-ring`: expected groups dup -> near -> variant
- `13__dup-near-burst__cyan-wave`: expected groups dup -> near -> burst
- `14__dup-variant-burst__olive-bolt`: expected groups dup -> variant -> burst
- `15__near-variant-burst__maroon-fan`: expected groups near -> variant -> burst
- `16__dup-near-variant-burst__silver-clover`: expected groups dup -> near -> variant -> burst

## Machine-readable manifest

- `manifest.json`
