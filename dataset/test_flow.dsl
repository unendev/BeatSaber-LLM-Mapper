# ==============================================================================
# BeatSaber-LLM-Mapper: Benchmark Kinematic DSL (test_flow.dsl)
# 128 BPM | 4/4 Time Signature | 8 Bars (Beats 0.0 to 32.0)
# ==============================================================================

# Bar 0: Intro - Down cuts on Kick (Beats 0, 2), Up swing returns on Snare (Beats 1, 3)
0.0: R101 | B201    # Kick: Both hands down-cut
1.0: R110 | B210    # Snare: Both hands return up-cut
2.0: R101 | B201    # Kick: Both hands down-cut
3.0: R110 | B210    # Snare: Both hands return up-cut

# Bar 1: Alternating Flow & Side Slashes
4.0: R006 | B307    # Kick: Left down-left, Right down-right (outward flow)
5.0: R124 | B225    # Snare: Left up-left, Right up-right (diagonal recoil)
6.0: R107 | B206    # Kick: Down-right / Down-left cross recoil
7.0: R125 | B224    # Snare: Up-right / Up-left recoil

# Bar 2: Syncopated 1/2 Beat Rhythms (Verse)
8.0: R101 | B201    # Beat 8.0: Dual down
8.5: | B210         # Beat 8.5: Right hand quick up-cut
9.0: R110 |         # Beat 9.0: Left hand up-cut
9.5: | B201         # Beat 9.5: Right hand down-cut
10.0: R101 | B210   # Beat 10.0: Left down, Right up (Natural recoil)
11.0: R118 | B218   # Beat 11.0: Dual Dots (Hi-hat transition)

# Bar 3: Wide Cross & Recovery (Safe ergonomic stretch)
12.0: R011 | B311   # Beat 12.0: Wide down
13.0: R020 | B320   # Beat 13.0: Wide up
14.0: R106 | B207   # Beat 14.0: Center outward down
15.0: R114 | B215   # Beat 15.0: Center outward up

# Bar 4: Chorus Drop - Fast 1/2 beat alternating stream
16.0: R101 |        # Left down
16.5: | B201        # Right down
17.0: R110 |        # Left up
17.5: | B210        # Right up
18.0: R101 |        # Left down
18.5: | B201        # Right down
19.0: R110 |        # Left up
19.5: | B210        # Right up

# Bar 5: Rollers / Circular wrists
20.0: R106 | B207   # Dual down-diagonal
21.0: R114 | B215   # Natural uncrossed recoil
22.0: R101 | B201   # Dual down
23.0: R120 | B220   # Dual high up

# Bar 6: Tech Staccato (Dot touches on synths)
24.0: R118 | B218   # Dual Dot
25.0: R101 | B201   # Dual down
26.0: R118 | B218   # Dual Dot
27.0: R120 | B220   # Dual high up

# Bar 7: Outro Finale Impact
28.0: R001 | B301   # Wide heavy down
29.0: R020 | B320   # Wide heavy up
30.0: R101 | B201   # Center down
31.0: R110 | B210   # Center up
