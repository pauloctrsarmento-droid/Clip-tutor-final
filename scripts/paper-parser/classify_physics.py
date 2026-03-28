import json

# All 102 physics questions with their classifications
# Duplicates in the source data are handled by deduplication
classifications = [
    # PHYS_T1: Motion, forces, energy
    # mercury barometer -> pressure -> PHYS_T1
    {'id': '0625_m19_qp42_q4b', 'topic_id': 'PHYS_T1'},

    # PHYS_T2: thermometer -> thermal physics
    {'id': '0625_m19_qp42_q5b_i',   'topic_id': 'PHYS_T2'},
    {'id': '0625_m19_qp42_q5b_ii',  'topic_id': 'PHYS_T2'},
    {'id': '0625_m19_qp42_q5b_iii', 'topic_id': 'PHYS_T2'},
    {'id': '0625_m19_qp42_q5c_i',   'topic_id': 'PHYS_T2'},  # thermocouple thermometer

    # liquid pumped lifting cube -> pressure/force -> PHYS_T1
    {'id': '0625_s19_qp41_q3c_ii', 'topic_id': 'PHYS_T1'},

    # precaution in waves experiment -> PHYS_T3
    {'id': '0625_s19_qp42_q5b_ii', 'topic_id': 'PHYS_T3'},

    # charging sphere -> static electricity -> PHYS_T4
    {'id': '0625_s19_qp42_q8a', 'topic_id': 'PHYS_T4'},
    # electronic component (diode) -> PHYS_T4
    {'id': '0625_s19_qp42_q8b', 'topic_id': 'PHYS_T4'},
    # NAND gate truth table -> PHYS_T4
    {'id': '0625_s19_qp42_q8c', 'topic_id': 'PHYS_T4'},
    # logic gates truth table -> PHYS_T4
    {'id': '0625_s19_qp42_q8d', 'topic_id': 'PHYS_T4'},

    # boat docking: momentum/impulse -> PHYS_T1
    {'id': '0625_s19_qp43_q2d', 'topic_id': 'PHYS_T1'},

    # vacuum flask, thermal insulation -> PHYS_T2
    {'id': '0625_s19_qp43_q5b', 'topic_id': 'PHYS_T2'},

    # electronic component -> PHYS_T4
    {'id': '0625_s19_qp43_q9a', 'topic_id': 'PHYS_T4'},
    # NOR gate truth table -> PHYS_T4
    {'id': '0625_s19_qp43_q9b', 'topic_id': 'PHYS_T4'},
    # logic gates combination -> PHYS_T4
    {'id': '0625_s19_qp43_q9c', 'topic_id': 'PHYS_T4'},

    # charge distribution on sphere -> static electricity -> PHYS_T4
    {'id': '0625_w19_qp41_q5b_i',   'topic_id': 'PHYS_T4'},
    {'id': '0625_w19_qp41_q5b_ii',  'topic_id': 'PHYS_T4'},
    {'id': '0625_w19_qp41_q5b_iii', 'topic_id': 'PHYS_T4'},
    {'id': '0625_w19_qp41_q5c',     'topic_id': 'PHYS_T4'},  # conductor vs insulator

    # calculate depth of pool from volume -> density/pressure -> PHYS_T1
    {'id': '0625_w19_qp42_q1a', 'topic_id': 'PHYS_T1'},
    # instrument for measuring dimensions -> PHYS_T1
    {'id': '0625_w19_qp42_q1d', 'topic_id': 'PHYS_T1'},

    # coin visible due to refraction -> PHYS_T3
    {'id': '0625_w19_qp42_q6a_i', 'topic_id': 'PHYS_T3'},

    # volume of water in tank -> PHYS_T1
    {'id': '0625_w19_qp43_q1a', 'topic_id': 'PHYS_T1'},

    # waterfall, GPE to KE assumption -> PHYS_T1
    {'id': '0625_w19_qp43_q3a_iii', 'topic_id': 'PHYS_T1'},

    # region around magnet -> magnetism -> PHYS_T4
    {'id': '0625_w19_qp43_q6a_i',  'topic_id': 'PHYS_T4'},
    {'id': '0625_w19_qp43_q6a_ii', 'topic_id': 'PHYS_T4'},

    # nature of image through lens -> PHYS_T3
    {'id': '0625_w19_qp43_q7b', 'topic_id': 'PHYS_T3'},

    # logic gate symbol -> PHYS_T4
    {'id': '0625_m20_qp42_q9a', 'topic_id': 'PHYS_T4'},
    # logic gate from truth table -> PHYS_T4
    {'id': '0625_m20_qp42_q9b', 'topic_id': 'PHYS_T4'},

    # deceleration of aeroplane -> PHYS_T1
    {'id': '0625_s20_qp41_q1a_i', 'topic_id': 'PHYS_T1'},

    # Hooke's law, spring constant -> PHYS_T1 (forces)
    {'id': '0625_s20_qp41_q2a',     'topic_id': 'PHYS_T1'},
    {'id': '0625_s20_qp41_q2b',     'topic_id': 'PHYS_T1'},
    {'id': '0625_s20_qp41_q2c_ii',  'topic_id': 'PHYS_T1'},
    {'id': '0625_s20_qp41_q2c_iii', 'topic_id': 'PHYS_T1'},

    # distance travelled from speed-time graph -> PHYS_T1
    {'id': '0625_s20_qp42_q1a_i', 'topic_id': 'PHYS_T1'},

    # liquid-in-glass thermometer design -> PHYS_T2
    {'id': '0625_s20_qp42_q4a',    'topic_id': 'PHYS_T2'},
    {'id': '0625_s20_qp42_q4c_i',  'topic_id': 'PHYS_T2'},
    {'id': '0625_s20_qp42_q4c_ii', 'topic_id': 'PHYS_T2'},
    {'id': '0625_s20_qp42_q4d',    'topic_id': 'PHYS_T2'},

    # liquid evaporates (molecules) -> PHYS_T2
    {'id': '0625_s20_qp43_q4a', 'topic_id': 'PHYS_T2'},

    # electric field -> PHYS_T4
    {'id': '0625_s20_qp43_q8a_i', 'topic_id': 'PHYS_T4'},

    # thermocouple thermometer -> PHYS_T2
    {'id': '0625_w20_qp42_q4a', 'topic_id': 'PHYS_T2'},

    # wave trough on diagram -> PHYS_T3
    {'id': '0625_w20_qp42_q6a_ii', 'topic_id': 'PHYS_T3'},

    # electrical sockets safety -> PHYS_T4
    {'id': '0625_w20_qp42_q8a', 'topic_id': 'PHYS_T4'},

    # X-ray precautions (EM spectrum / radiation safety) -> PHYS_T3
    {'id': '0625_w20_qp43_q7b', 'topic_id': 'PHYS_T3'},

    # logic gate -> PHYS_T4
    {'id': '0625_w20_qp43_q8b',    'topic_id': 'PHYS_T4'},
    {'id': '0625_w20_qp43_q8c_ii', 'topic_id': 'PHYS_T4'},

    # scalar and vector quantities -> PHYS_T1
    {'id': '0625_m21_qp42_q2b_ii', 'topic_id': 'PHYS_T1'},

    # ammeter reading, wire not moving (EM induction) -> PHYS_T4
    {'id': '0625_m21_qp42_q7a',   'topic_id': 'PHYS_T4'},
    {'id': '0625_m21_qp42_q7c_i', 'topic_id': 'PHYS_T4'},

    # deceleration of skydiver -> PHYS_T1
    {'id': '0625_s21_qp41_q1a_i', 'topic_id': 'PHYS_T1'},

    # impulse on trolley -> PHYS_T1
    {'id': '0625_s21_qp41_q2a_i', 'topic_id': 'PHYS_T1'},

    # e.m.f. of rotating coil (generator) -> PHYS_T4
    {'id': '0625_s21_qp41_q7a_ii',  'topic_id': 'PHYS_T4'},
    {'id': '0625_s21_qp41_q7a_iii', 'topic_id': 'PHYS_T4'},

    # thermistor circuit, voltmeter -> PHYS_T4
    {'id': '0625_s21_qp41_q8a',    'topic_id': 'PHYS_T4'},
    {'id': '0625_s21_qp41_q8c_ii', 'topic_id': 'PHYS_T4'},

    # compass needle (magnetism) -> PHYS_T4
    {'id': '0625_s21_qp42_q7b_ii', 'topic_id': 'PHYS_T4'},

    # evaporation of sweat (molecules) -> PHYS_T2
    {'id': '0625_s21_qp43_q4b_i',  'topic_id': 'PHYS_T2'},
    {'id': '0625_s21_qp43_q4b_ii', 'topic_id': 'PHYS_T2'},

    # NOR gate, logic gates -> PHYS_T4
    {'id': '0625_s21_qp43_q8b',    'topic_id': 'PHYS_T4'},
    {'id': '0625_s21_qp43_q8c_i',  'topic_id': 'PHYS_T4'},
    {'id': '0625_s21_qp43_q8c_ii', 'topic_id': 'PHYS_T4'},

    # alpha, beta, gamma particle paths -> PHYS_T5
    {'id': '0625_s21_qp43_q9c_i',   'topic_id': 'PHYS_T5'},
    {'id': '0625_s21_qp43_q9c_ii',  'topic_id': 'PHYS_T5'},
    {'id': '0625_s21_qp43_q9c_iii', 'topic_id': 'PHYS_T5'},

    # thermocouple vs liquid-in-glass thermometer benefits -> PHYS_T2
    {'id': '0625_w21_qp42_q5c', 'topic_id': 'PHYS_T2'},

    # compression and rarefaction in sound wave -> PHYS_T3
    {'id': '0625_w21_qp42_q6a_i',  'topic_id': 'PHYS_T3'},
    {'id': '0625_w21_qp42_q6a_ii', 'topic_id': 'PHYS_T3'},

    # charge distribution, static electricity -> PHYS_T4
    {'id': '0625_w21_qp42_q8a_i',  'topic_id': 'PHYS_T4'},
    {'id': '0625_w21_qp42_q8a_ii', 'topic_id': 'PHYS_T4'},

    # sweating, evaporation (molecules) -> PHYS_T2
    {'id': '0625_m22_qp42_q3c', 'topic_id': 'PHYS_T2'},

    # evaporation cools water (molecules) -> PHYS_T2
    {'id': '0625_s22_qp41_q3a', 'topic_id': 'PHYS_T2'},

    # logic gate truth table -> PHYS_T4
    {'id': '0625_s22_qp41_q9b', 'topic_id': 'PHYS_T4'},

    # similarity in nuclei composition -> PHYS_T5 (nuclear physics)
    {'id': '0625_s22_qp41_q9a_i', 'topic_id': 'PHYS_T5'},

    # liquid-in-glass thermometer linearity -> PHYS_T2
    {'id': '0625_s22_qp42_q4a', 'topic_id': 'PHYS_T2'},

    # pendulum time period -> PHYS_T3 (waves / oscillations)
    {'id': '0625_w22_qp42_q2a', 'topic_id': 'PHYS_T3'},

    # thermometer sensitivity/range -> PHYS_T2
    {'id': '0625_w22_qp43_q4a_ii',  'topic_id': 'PHYS_T2'},
    {'id': '0625_w22_qp43_q4a_iii', 'topic_id': 'PHYS_T2'},

    # voltmeter reading in circuit -> PHYS_T4
    {'id': '0625_s23_qp41_q7c', 'topic_id': 'PHYS_T4'},

    # absolute zero -> PHYS_T2
    {'id': '0625_s23_qp42_q4b_i', 'topic_id': 'PHYS_T2'},

    # charge flowing through point (current) -> PHYS_T4
    {'id': '0625_w23_qp41_q8a_i', 'topic_id': 'PHYS_T4'},

    # distance travelled by car (motion) -> PHYS_T1
    {'id': '0625_w23_qp42_q1b_ii', 'topic_id': 'PHYS_T1'},
    {'id': '0625_w23_qp42_q1d',    'topic_id': 'PHYS_T1'},

    # evaporation of water (tumble dryer) -> PHYS_T2
    {'id': '0625_w23_qp42_q2a_i', 'topic_id': 'PHYS_T2'},

    # road junction, reflection using mirrors -> PHYS_T3
    {'id': '0625_w23_qp42_q5a', 'topic_id': 'PHYS_T3'},

    # sphere discharged via wire (charge flow) -> PHYS_T4
    {'id': '0625_s24_qp41_q6b_i', 'topic_id': 'PHYS_T4'},

    # seesaw rotates clockwise (moments) -> PHYS_T1
    {'id': '0625_s24_qp43_q3a_i', 'topic_id': 'PHYS_T1'},

    # define impulse -> PHYS_T1
    {'id': '0625_s24_qp43_q3b_i', 'topic_id': 'PHYS_T1'},

    # distance/deceleration from speed-time graph -> PHYS_T1
    {'id': '0625_w24_qp41_q2a_ii',  'topic_id': 'PHYS_T1'},
    {'id': '0625_w24_qp41_q2a_iii', 'topic_id': 'PHYS_T1'},
    {'id': '0625_w24_qp41_q2b_i',   'topic_id': 'PHYS_T1'},
    {'id': '0625_w24_qp41_q2b_ii',  'topic_id': 'PHYS_T1'},

    # suitable material for bar (permanent magnet) -> PHYS_T4
    {'id': '0625_w24_qp41_q7a', 'topic_id': 'PHYS_T4'},

    # spring constant experiment, Hooke's law -> PHYS_T1
    {'id': '0625_w24_qp43_q2a',     'topic_id': 'PHYS_T1'},
    {'id': '0625_w24_qp43_q2b_i',   'topic_id': 'PHYS_T1'},
    {'id': '0625_w24_qp43_q2b_iii', 'topic_id': 'PHYS_T1'},

    # electric field -> PHYS_T4
    {'id': '0625_s25_qp43_q8a_i', 'topic_id': 'PHYS_T4'},

    # evaporation of puddle (weather change) -> PHYS_T2
    {'id': '0625_w25_qp42_q5a_ii', 'topic_id': 'PHYS_T2'},
]

# Deduplicate: keep first occurrence of each id
seen_ids = set()
deduped = []
for item in classifications:
    if item['id'] not in seen_ids:
        seen_ids.add(item['id'])
        deduped.append(item)

print(f'Total classified: {len(classifications)}')
print(f'After dedup: {len(deduped)}')

# Verify against source data
with open('C:/Users/sarma/OneDrive/Ambiente de Trabalho/tutor final/data/extracted/unclassified_batch.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

physics = [r for r in data if r.get('code') == '0625']
source_ids = set(r['id'] for r in physics)
classified_ids = set(item['id'] for item in deduped)

missing = source_ids - classified_ids
extra = classified_ids - source_ids

print(f'Source physics questions: {len(source_ids)}')
print(f'Missing from classification: {sorted(missing)}')
print(f'Extra in classification (not in source): {sorted(extra)}')

# Topic distribution
from collections import Counter
topic_counts = Counter(item['topic_id'] for item in deduped)
print('Topic distribution:', dict(sorted(topic_counts.items())))
