"""Topic classification prompts with disambiguation rules."""

CHEMISTRY_PROMPT = """You are classifying IGCSE Chemistry (0620) exam questions into exactly one of 12 topics.

## TOPICS

CHEM_T1: States of matter
- Solids, liquids, gases and their properties
- Melting points, boiling points, physical states at given temperatures
- Diffusion (movement of particles in gases/liquids)
- Particle model, kinetic theory
- NOT acids/bases (→T7), NOT bonding explanations (→T2)

CHEM_T2: Atoms, electrons and compounds
- Atomic structure: protons, neutrons, electrons, electron shells
- Isotopes, atomic/proton/nucleon number
- Ionic bonding, covalent bonding, metallic bonding
- Dot-and-cross diagrams, electronic configuration
- Giant structures (ionic lattice, giant covalent)
- NOT calculations with moles (→T3), NOT electrolysis (→T4)

CHEM_T3: Stoichiometry
- Mole calculations, relative atomic/formula mass
- Balancing equations (when focus is on the CALCULATION)
- Concentration (mol/dm³), volume calculations
- Avogadro constant, empirical/molecular formulae
- NOT bond energy calculations (→T5), NOT identifying substances (→topic of the substance)

CHEM_T4: Electrochemistry
- Electrolysis: products at cathode/anode, ionic half-equations
- Electrolytes, electrodes (graphite, platinum, copper)
- Fuel cells (hydrogen-oxygen)
- NOT acid reactions making salts (→T7), NOT metal extraction by carbon (→T9)

CHEM_T5: Chemical energetics
- Exothermic/endothermic reactions
- Energy level diagrams, reaction pathway diagrams
- Bond energy calculations (breaking/forming bonds, ΔH)
- Enthalpy change
- NOT equilibrium/Le Chatelier (→T6), NOT rates of reaction (→T6)

CHEM_T6: Chemical reactions
- Rates of reaction, collision theory, surface area/concentration/temperature effects
- Catalysts (what they do, naming specific catalysts like V₂O₅)
- Reversible reactions, equilibrium, Le Chatelier's principle
- Redox: oxidation/reduction, oxidation numbers, oxidising/reducing agents
- Industrial processes (Haber, Contact) when asking about conditions/equilibrium
- NOT naming products of acid reactions (→T7), NOT organic reactions (→T11)

CHEM_T7: Acids, bases and salts
- Acids, bases, alkalis, pH, indicators
- Neutralisation reactions
- Titrations
- Making salts (acid + metal, acid + base, acid + carbonate, precipitation)
- Properties of acids/bases (H⁺ ions, OH⁻ ions)
- Identifying ions using NaOH/NH₃ (precipitate tests for cations)
- NOT electrochemistry (→T4), NOT organic acids like ethanoic in organic context (→T11)

CHEM_T8: The periodic table
- Groups (I, VII, 0/VIII), periods, trends
- Alkali metals properties and reactions
- Halogens: properties, displacement reactions, reactivity trends
- Noble gases
- Transition metals (coloured compounds, catalysts, variable oxidation states)
- NOT metal extraction (→T9), NOT bonding explanation (→T2)

CHEM_T9: Metals
- Reactivity series
- Metal extraction (blast furnace, electrolysis of aluminium)
- Alloys (steel, brass, bronze)
- Corrosion, rusting, galvanising, sacrificial protection
- Metal displacement reactions (when about reactivity, not halogens)
- NOT periodic table group trends (→T8), NOT electrolysis theory (→T4)

CHEM_T10: Chemistry of the environment
- Water treatment/purification
- Air composition, pollution (CO, SO₂, NOₓ, particulates)
- Greenhouse effect, global warming, climate change
- Acid rain
- Fertilisers (NPK, Haber process product USE)
- Carbon cycle (environmental context)
- NOT nitrogen/oxygen separation by distillation (→T1 if about states)

CHEM_T11: Organic chemistry
- Alkanes, alkenes, alcohols, carboxylic acids, esters, polymers
- Crude oil, fractional distillation OF CRUDE OIL, cracking
- Fermentation (making ethanol)
- Addition/substitution/condensation reactions of organic compounds
- Structural formulae, isomers, functional groups, homologous series
- NOT "define acid" in general (→T7), NOT combustion products for pollution (→T10)

CHEM_T12: Experimental techniques and chemical analysis
- Chromatography (paper, Rf values)
- Separation: filtration, distillation, crystallisation, separating funnel
- Tests for gases (H₂, O₂, CO₂, Cl₂, NH₃)
- Tests for ions (flame tests, precipitate tests with NaOH/NH₃ WHEN the question is specifically about the TEST METHOD)
- Tests for water (anhydrous CuSO₄, cobalt chloride paper)
- NOT if question is about making/identifying a specific compound (→topic of that compound)

## DISAMBIGUATION RULES (apply these STRICTLY)
1. "acid + metal/base/carbonate → salt + water/CO₂/H₂" → CHEM_T7
2. "electrolysis/anode/cathode/electrode" → CHEM_T4
3. "exothermic/endothermic/ΔH/bond energy/energy level diagram" → CHEM_T5
4. "rate of reaction/catalyst/equilibrium/Le Chatelier" → CHEM_T6
5. "pH/neutralisation/titration/indicator" → CHEM_T7
6. "Group I/VII/0 trends/halogen displacement" → CHEM_T8
7. "reactivity series/metal extraction/rust/alloy" → CHEM_T9
8. "pollution/greenhouse/acid rain/water treatment/fertiliser USE" → CHEM_T10
9. "alkane/alkene/alcohol/polymer/crude oil/fermentation/ester" → CHEM_T11
10. "chromatography/flame test/test for gas/Rf value" → CHEM_T12
11. "isotope/proton number/electron shell/dot-and-cross/bonding type" → CHEM_T2
12. "moles/Mr/Ar/concentration calculation/Avogadro" → CHEM_T3

For each question, output ONLY: question_id|TOPIC_ID
"""

PHYSICS_PROMPT = """You are classifying IGCSE Physics (0625) exam questions into exactly one of 6 topics.

## TOPICS

PHYS_T1: Motion, forces, and energy
- Speed, velocity, acceleration, distance-time/speed-time graphs
- Forces: Newton's laws, resultant force, friction, air resistance
- Mass, weight (W=mg), gravitational field strength
- Density (ρ=m/V)
- Pressure (p=F/A, liquid pressure p=ρgh)
- Momentum (p=mv), impulse, conservation of momentum
- Energy: kinetic (½mv²), gravitational potential (mgh), elastic potential
- Work done (W=Fd), power (P=W/t, P=Fv)
- Energy resources and efficiency (when about mechanical/general energy)
- Hooke's law, spring constant
- Moments, turning effect, centre of gravity
- NOT thermal energy transfer (→T2), NOT electrical energy/power (→T4)

PHYS_T2: Thermal physics
- States of matter changes (melting, boiling, evaporation — thermal context)
- Specific heat capacity (E=mcΔT), specific latent heat (E=mL)
- Thermal expansion of solids/liquids/gases
- Gas laws (pressure-volume-temperature relationships)
- Conduction, convection, radiation (thermal energy transfer)
- Thermometers (liquid-in-glass, thermocouple)
- NOT wave properties of light/sound (→T3)

PHYS_T3: Waves
- General wave properties: frequency, wavelength, amplitude, wave speed (v=fλ)
- Transverse and longitudinal waves
- Reflection, refraction (Snell's law), total internal reflection, critical angle
- Diffraction
- Sound: speed, echoes, pitch, loudness, ultrasound
- Light: lenses (converging/diverging), mirrors, ray diagrams
- Electromagnetic spectrum (radio, microwave, infrared, visible, UV, X-ray, gamma)
- Optical fibres (total internal reflection context)
- NOT static electricity (→T4), NOT nuclear radiation (→T5)

PHYS_T4: Electricity and magnetism
- Current (I), voltage/EMF (V), resistance (R), Ohm's law (V=IR)
- Series and parallel circuits
- Electrical power (P=IV, P=I²R), energy (E=IVt, E=Pt)
- Kilowatt-hour (kW h), electricity bills/costs
- Fuses, circuit breakers, earthing, electrical safety
- Static electricity, charging, electric fields
- Magnets, magnetic fields, plotting compasses
- Electromagnets, relays, magnetic effect of current
- Motors (DC motor, force on current-carrying conductor, F=BIl)
- Generators (AC generator), electromagnetic induction
- Transformers (Vp/Vs = Np/Ns), power transmission
- Logic gates (AND, OR, NOT, NAND, NOR, truth tables)
- Digital vs analogue signals
- NOT radioactive sources in circuits (→T5)

PHYS_T5: Nuclear physics
- Atomic structure (Rutherford scattering, protons/neutrons/electrons IN NUCLEUS)
- Radioactivity: alpha, beta, gamma — properties, penetration, ionisation
- Radioactive decay, half-life, decay equations
- Nuclear fission, nuclear fusion
- Background radiation
- Uses and dangers of radioactivity (medical, industrial, carbon dating)
- Nuclide notation, isotopes IN NUCLEAR CONTEXT
- NOT atomic structure for bonding/chemistry (→Chemistry topic)

PHYS_T6: Space physics
- Solar system: planets, moons, asteroids, comets, dwarf planets
- Orbits: circular, elliptical, orbital speed
- Stars: life cycle, main sequence, red giant, white dwarf, supernova, neutron star, black hole
- Galaxies, Milky Way
- Universe: Big Bang theory, expansion
- Redshift, cosmic microwave background radiation (CMBR)
- Hubble constant, age of universe
- NOT nuclear reactions in stars unless specifically about stellar physics (→T5 if about fission/fusion mechanism)

## DISAMBIGUATION RULES (apply these STRICTLY)
1. "kWh/electricity bill/cost of electricity/fuse rating" → PHYS_T4
2. "circuit/current/voltage/resistance/ammeter/voltmeter" → PHYS_T4
3. "transformer/generator/motor/electromagnetic induction" → PHYS_T4
4. "logic gate/truth table/AND/OR/NOT/NAND/NOR" → PHYS_T4
5. "static charge/charging/discharging/electric field" → PHYS_T4
6. "radioactive/alpha/beta/gamma/half-life/decay/nuclide" → PHYS_T5
7. "Rutherford/gold foil/atomic nucleus structure" → PHYS_T5
8. "orbit/planet/star/galaxy/redshift/Big Bang/CMBR/Hubble" → PHYS_T6
9. "wave/frequency/wavelength/reflection/refraction/lens/mirror/sound/light/spectrum" → PHYS_T3
10. "specific heat/latent heat/conduction/convection/radiation(thermal)/thermometer/gas law" → PHYS_T2
11. "speed/velocity/acceleration/force/momentum/density/pressure/energy(mechanical)/work/power(mechanical)" → PHYS_T1
12. "energy resources (solar/wind/tidal/geothermal/nuclear AS RESOURCE)" → PHYS_T1

For each question, output ONLY: question_id|TOPIC_ID
"""
