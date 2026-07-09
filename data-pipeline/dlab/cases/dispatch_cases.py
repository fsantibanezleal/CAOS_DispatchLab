"""DispatchLab cases spanning CATEGORIES (the truck-shovel dispatch problem-type taxonomy). The App shows ONE
selected case; Experiments/Benchmark show cross-case summaries by category. The 8 cases MIRROR the SPA's
src/sim/cases.ts (ids + counts must match, or the registry-vs-bake check fails).

Round-2 corpus (#67): a domain-correct multi-source / multi-destination truck-shovel-stockpile network. Every
haul passes through a single pit EXIT/PORTAL (shovel -> internal pit roads -> portal -> direct surface haul ->
destination; the empty return reverses it). Two/three SIMPLE teaching cases (C01-C03: >= 4 shovels, >= 2
destinations, routing + match factor + the multi-plant decision); every OTHER case is COMPLEX and DYNAMIC
(>= 6 shovels scaling to 12, an intermediate ore STOCKPILE that is actively cycled by rehandle + a reclaimer,
multiple plants + waste dumps, plus breakdowns / stochastic cycle times / blend windows / shift breaks /
phases). C08 is the large 12-shovel, 3-phase showcase. All results are DES-SIMULATION outputs, NOT a real
plant, stated openly. The correctness anchors (the closed-form 1x1 oracle + the tie / positive controls) live
as TEST fixtures (frontend/test/fixtures.ts), not as user tiles."""
from __future__ import annotations

from dataclasses import dataclass

SHIFT_SEC = 28800   # 8-hour shift (matches src/sim/cases.ts SHIFT)

SIMPLE = "simple teaching (routing + match factor + the multi-plant decision)"
NETWORK = "complex dynamic network (active ore stockpile + breakdowns / stochastic / blend / phases)"
BOSS = "the showcase (full multi-phase network, every node type + every dynamic)"


@dataclass(frozen=True)
class Case:
    id: str                       # matches src/sim/cases.ts CASES
    name: str
    category: str
    n_shovels: int
    n_trucks: int
    truck_model: str
    expected_band: str
    validation_anchor: str
    shift_sec: int = SHIFT_SEC
    real_or_synthetic: str = "simulation"   # deterministic DES, not a real plant


CASES: list[Case] = [
    Case("C01", "Ore + waste routing (shallow pit)", SIMPLE, 4, 12, "793F",
         "two destinations on a shallow compact pit: ore routes to the crusher, waste to the waste dump; the "
         "decision to learn is 'which dump' by face type, plus reading the match factor",
         "multi-destination routing (ore vs waste); shovel-bound shallow pit"),
    Case("C02", "Two plants (independent feeds)", SIMPLE, 4, 14, "793F",
         "two ore plants on a round pit, each side of the pit feeds its plant; each plant carries its own feed "
         "KPI and the ore lane balances them across cycles",
         "multiple-crusher routing + per-plant feed"),
    Case("C03", "Asymmetric roads (dispatch matters)", SIMPLE, 4, 12, "793F",
         "strong haul asymmetry (near / mid / far ore faces down a tilted pit + a waste face): greedy over-loads "
         "the near shovel, a look-ahead does real work",
         "asymmetric multi-shovel pit (dispatch gain)"),
    Case("C04", "Deep narrow pit (stockpile + stochastic cycles)", NETWORK, 6, 34, "793F",
         "a DEEP narrow pit: long steep internal ramps make per-truck productivity far lower than a shallow "
         "pit; a slow 2-bay crusher backs up so ore constantly rehandles onto a stockpile the reclaimer draws "
         "back down; high load/travel variance drives the bunching a rollout can hedge",
         "deep-geometry per-truck productivity << shallow; stockpile fills >=30% and cycles"),
    Case("C05", "Shallow wide pit (shovel-bound, active stockpile)", NETWORK, 8, 17, "793F",
         "a SHALLOW wide pit: short flat roads, the shovels bind; the slow crusher cannot take all the ore so a "
         "large stockpile buffers it and the reclaimer draws it down (visible fill + draw across the shift)",
         "shovel-bound shallow pit; stockpile fills >=30% and cycles"),
    Case("C06", "Two-plant network (breakdown + mixed fleet + stockpile)", NETWORK, 8, 30, "793F+930E",
         "two plants (a 2-bay Plant A buffered by a stockpile + a 1-bay Plant B), a waste dump, a near ore "
         "shovel that fails on a Poisson clock, and a mixed 793F + 930E fleet",
         "breakdown hedging + mixed payloads land; stockpile fills >=30% and cycles"),
    Case("C07", "Crusher-limited blend (heavy rehandle)", NETWORK, 8, 18, "793F",
         "a throughput-limited plant: the slow crusher forces heavy rehandle onto a large stockpile the "
         "reclaimer feeds back, under a blend window and a mid-shift break",
         "crusher-throughput bottleneck; stockpile fills >=30% and cycles"),
    Case("C08", "Boss: 12 shovels, 3 phases, all node types + dynamics", BOSS, 12, 32, "793F+930E",
         "everything at once: 12 shovels across upper/mid/lower phases, two plants (2-bay + 1-bay), two waste "
         "dumps, an active stockpile, a mixed 793F + 930E fleet, a Poisson breakdown, high cycle variance, a "
         "blend window and a mid-shift break; a recognizably real open-pit network",
         "full multi-source / multi-destination network (all primitives + all dynamics)"),
]
