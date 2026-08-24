# game7 — rimprot purified: rebounding extracted (was triple-counted)

drb was: its own attribute + 0.30 of rimprot + (via rimprot) the team-defense anchor term, while ALSO feeding the
glass term. One rebound, paid three times. Fixed (attached build_ratings.py, compute_ovr.py, players_stats.json):
- rimprot = 0.55 block% + 0.25 height + 0.20 DBPM (within-season percentiles) + the big-vote bonus. Pure shot deterrence.
- Big-class d_ovr rebalanced: 0.40 perdef + 0.40 rimprot + 0.17 drb + 0.03 discipline — rebounding credit moves to the
  honestly-named source, so glass-based defenders (Rodman-types) keep their D through drb, not through a mislabeled rimprot.
- Team engine: the anchor term now reads pure deterrence; the glass term was already separate — the double-dip is gone.
- UI: update the RIMPROT tooltip/formula text to the new definition.
Regenerate all versions through both steps; re-run defense/matchup acceptance (anchor didx values shift slightly for
low-block rebounding bigs — update pinned numbers, never orderings). Resolver untouched.
