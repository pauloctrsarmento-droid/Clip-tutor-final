"""Run full extraction pipeline for all subjects."""
import os, json, sys, re, fitz
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(__file__))
from merge import merge
from parse_questions import parse_qp

KB = r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\TUTOR FILHA\clip-tutor-kb\past-papers"
OUTDIR = r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\tutor final\data\extracted"
DIAG = r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\tutor final\data\igcse-diagrams"

def run_standard(code, name, variants, diag_sub):
    subj_dir = os.path.join(KB, code)
    diag_dir = os.path.join(DIAG, diag_sub) if diag_sub else None
    out = os.path.join(OUTDIR, code)
    os.makedirs(out, exist_ok=True)
    papers = []
    for year in range(2019, 2026):
        for session in ['m','s','w']:
            for variant in variants:
                qp = os.path.join(subj_dir, str(year), f'{code}_{session}{str(year)[2:]}_qp_{variant}.pdf')
                ms = os.path.join(subj_dir, str(year), f'{code}_{session}{str(year)[2:]}_ms_{variant}.pdf')
                if os.path.exists(qp) and os.path.exists(ms):
                    papers.append((f'{session}{str(year)[2:]}_{variant}', year, qp, ms))
    if not papers: return
    stats_all = []; qs_all = []
    for label, year, qp_path, ms_path in papers:
        try:
            merged, stats = merge(qp_path, ms_path, diag_dir)
            stats['label'] = label; stats['year'] = year
            stats_all.append(stats); qs_all.extend(merged)
        except: pass
    tl = sum(s['total_questions']-s['stems'] for s in stats_all)
    tm = sum(s['matched_ms'] for s in stats_all)
    td = sum(s['matched_diagrams'] for s in stats_all)
    to = sum(len(s['unmatched_questions']) for s in stats_all)
    leaves = [q for q in qs_all if not q.get('is_stem')]
    dupes = sum(1 for v in Counter(q['id'] for q in leaves).values() if v > 1)
    output = {'total_papers':len(stats_all),'total_questions':len(qs_all),'paper_stats':stats_all,'questions':qs_all}
    with open(os.path.join(out, f'{name.lower()}_all.json'), 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    pct = tm*100//max(tl,1)
    print(f'{code} {name:<15} {len(stats_all):>3} papers | {tl:>5} leaves | {pct:>3}% | {td:>4} diag | {to} orphans | {dupes} dupes')

def run_band_descriptor(code, name, variants, band_ms_path):
    band_text = ''
    if os.path.exists(band_ms_path):
        doc = fitz.open(band_ms_path)
        for page in doc:
            text = page.get_text()
            if 'Level 8' in text or 'Banda' in text:
                lines = [l.strip() for l in text.split('\n') if l.strip() and code not in l and 'Cambridge' not in l and 'PUBLISHED' not in l and '©' not in l and 'Page ' not in l]
                band_text = '\n'.join(lines); break
        doc.close()
    stats_all = []; qs_all = []
    for year in range(2019, 2026):
        for session in ['m','s','w']:
            for variant in variants:
                qp = os.path.join(KB, f'{code}/{year}/{code}_{session}{str(year)[2:]}_qp_{variant}.pdf')
                if not os.path.exists(qp): continue
                try:
                    qs = parse_qp(qp)
                    gc = {}
                    for q in qs: gc.setdefault(q['group_id'], []).append(q)
                    for q in qs:
                        siblings = gc[q['group_id']]
                        is_s = len(siblings) > 1 and q['part_label'] is None
                        q['is_stem'] = is_s; q['subject_code'] = code; q['paper_id'] = q['id'].rsplit('_q',1)[0]
                        q['marks'] = 25 if not is_s else 0
                        q['correct_answer'] = '(Evaluated against band descriptors)' if not is_s else None
                        q['mark_scheme'] = band_text if not is_s else None
                        q['mark_points'] = []; q['evaluation_ready'] = not is_s
                        q['diagram_path'] = None; q['parent_context'] = None
                        if not is_s:
                            for s2 in siblings:
                                if s2.get('is_stem') and s2 is not q:
                                    q['parent_context'] = s2['question_text']; break
                    ll = [q for q in qs if not q.get('is_stem')]
                    stat = {'label':f'{session}{str(year)[2:]}_{variant}','year':year,
                        'total_questions':len(qs),'stems':sum(1 for q in qs if q.get('is_stem')),
                        'matched_ms':len(ll),'total_ms_entries':len(ll),'matched_diagrams':0,
                        'evaluation_ready':len(ll),'unmatched_questions':[]}
                    stats_all.append(stat); qs_all.extend(qs)
                except: pass
    out = os.path.join(OUTDIR, code)
    os.makedirs(out, exist_ok=True)
    output = {'total_papers':len(stats_all),'total_questions':len(qs_all),'paper_stats':stats_all,'questions':qs_all}
    with open(os.path.join(out, f'{name.lower()}_all.json'), 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    tl = sum(s['total_questions']-s['stems'] for s in stats_all)
    leaves = [q for q in qs_all if not q.get('is_stem')]
    dupes = sum(1 for v in Counter(q['id'] for q in leaves).values() if v > 1)
    print(f'{code} {name:<15} {len(stats_all):>3} papers | {tl:>5} leaves | 100% |    0 diag | 0 orphans | {dupes} dupes')

def run_portuguese():
    stats_all = []; qs_all = []
    for year in range(2019, 2026):
        yr = str(year)[2:]
        for paper_qp, paper_ms in [('01','1'),('1','1')]:
            qp = os.path.join(KB, f'0504/{year}/0504_s{yr}_qp_{paper_qp}.pdf')
            ms = os.path.join(KB, f'0504/{year}/0504_s{yr}_ms_{paper_ms}.pdf')
            if not os.path.exists(ms): ms = os.path.join(KB, f'0504/{year}/0504_s{yr}_ms_{paper_qp}.pdf')
            if not os.path.exists(qp) or not os.path.exists(ms): continue
            label = f's{yr}_p1'
            if any(s['label']==label for s in stats_all): continue
            try:
                merged, stats = merge(qp, ms, None)
                stats['label'] = label; stats['year'] = year
                stats_all.append(stats); qs_all.extend(merged)
            except: pass
        # Paper 02 band descriptors
        for paper_qp in ['02','2']:
            qp = os.path.join(KB, f'0504/{year}/0504_s{yr}_qp_{paper_qp}.pdf')
            if not os.path.exists(qp): continue
            label = f's{yr}_p2'
            if any(s['label']==label for s in stats_all): continue
            try:
                qs = parse_qp(qp)
                for q in qs:
                    q['is_stem'] = q.get('marks',0)==0 and q.get('part_label') is None
                    q['subject_code'] = '0504'; q['paper_id'] = q['id'].rsplit('_q',1)[0]
                    q['marks'] = 25 if not q.get('is_stem') else 0
                    q['correct_answer'] = '(Avaliado com critérios de banda)' if not q.get('is_stem') else None
                    q['mark_scheme'] = 'Band descriptors' if not q.get('is_stem') else None
                    q['mark_points'] = []; q['evaluation_ready'] = not q.get('is_stem')
                    q['diagram_path'] = None; q['parent_context'] = None
                ll = [q for q in qs if not q.get('is_stem')]
                stat = {'label':label,'year':year,'total_questions':len(qs),'stems':sum(1 for q in qs if q.get('is_stem')),
                    'matched_ms':len(ll),'total_ms_entries':len(ll),'matched_diagrams':0,
                    'evaluation_ready':len(ll),'unmatched_questions':[]}
                stats_all.append(stat); qs_all.extend(qs)
            except: pass
    out = os.path.join(OUTDIR, '0504')
    os.makedirs(out, exist_ok=True)
    output = {'total_papers':len(stats_all),'total_questions':len(qs_all),'paper_stats':stats_all,'questions':qs_all}
    with open(os.path.join(out, 'portuguese_all.json'), 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    tl = sum(s['total_questions']-s['stems'] for s in stats_all)
    leaves = [q for q in qs_all if not q.get('is_stem')]
    dupes = sum(1 for v in Counter(q['id'] for q in leaves).values() if v > 1)
    print(f'0504 Portuguese       {len(stats_all):>3} papers | {tl:>5} leaves | 100% |    0 diag | 0 orphans | {dupes} dupes')

# Run everything
run_standard('0620', 'Chemistry', ['41','42','43'], 'chemistry')
run_standard('0625', 'Physics', ['41','42','43'], 'physics')
run_standard('0610', 'Biology', ['41','42','43'], 'biology')
run_standard('0478', 'CS', ['11','21'], 'cs')
run_standard('0500', 'English_Lang', ['11','21'], None)
run_standard('0520', 'French', ['21','41','11'], None)
run_band_descriptor('0475', 'English_Lit', ['12','32'], os.path.join(KB, '0475/2024/0475_s24_ms_12.pdf'))
run_portuguese()
