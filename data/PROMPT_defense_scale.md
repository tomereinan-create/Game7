# game7 — defense rating scale fix (the Pippen bug)

Elite defenders were capped ~70-75: defense was the ONLY attribute left as a raw composite instead of a
within-season scale, and its components anticorrelate for tall/high-usage elite wings. Fixed with a
two-population, evidence-respecting scale (attached build_ratings.py + regenerated players_stats.json + compute_ovr.py):
- Players with REAL defensive selections (career-window drep >= 0.25, i.e. actual All-D teams / DPOY-level shares) are
  percentiled against each other on 55-99. Pippen/Jrue/Payton/Bowen/Kawhi now 91-97.
- No-vote players keep the shrunk composite, capped at 54 — stray vote shares do NOT buy the floor
  (this kept Iverson ~45, Luka 35, Trae 28 — the gambler separation survives).
- OVR regenerated downstream.

Apply: replace pipeline + data, regenerate multi-season versions (both steps), then RE-RUN the defense/matchup
acceptance tests: the defimpact distribution widened, so pinned NUMBERS will shift — update numbers, never orderings.
Hunted-man and weak-link logic get sharper for free (real turnstiles now separate further from elite stoppers).
