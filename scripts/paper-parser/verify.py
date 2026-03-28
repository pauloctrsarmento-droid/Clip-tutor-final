"""
verify.py — Verifies extracted past paper data and classifies questions by topic.

Parts:
1. Mark scheme integrity (deterministic)
2. Diagram integrity (deterministic)
3. Topic classification (keyword matching)
4. Atomic fact linking (keyword matching)

Usage:
    python verify.py <subject_code> [--all]
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

# ── Canonical topics from Luísa's study notes ────────────────────────
TOPICS = {
    "0620": [
        ("CHEM_T1", "States of matter", 1, ["states of matter", "solid liquid gas", "melting point", "boiling point", "evaporat", "diffusion of", "particle model", "kinetic theory"]),
        ("CHEM_T2", "Atoms, electrons and compounds", 2.5, ["isotope", "ionic bond", "covalent bond", "electron shell", "dot.and.cross", "electronic configuration", "proton number", "nucleon number", "metallic bonding", "giant structure"]),
        ("CHEM_T3", "Stoichiometry", 3.5, ["mole", "mol ", "relative atomic mass", "relative formula mass", "avogadro", "stoichiom", "concentration", "dm3", "calculate the mass", "calculate the volume"]),
        ("CHEM_T4", "Electrochemistry", 2, ["electrolysis", "electrolyte", "electrode", "cathode", "anode", "electrochemical", "fuel cell", "electrolysed"]),
        ("CHEM_T5", "Chemical energetics", 1, ["exothermic", "endothermic", "enthalpy", "energy change", "bond energy", "ΔH", "energy level diagram", "reaction pathway"]),
        ("CHEM_T6", "Chemical reactions", 2, ["rate of reaction", "catalyst", "equilibrium", "reversible reaction", "collision theory", "redox", "oxidation number", "reducing agent", "oxidising agent"]),
        ("CHEM_T7", "Acids, bases and salts", 2, ["acid", "base", "alkali", "salt", "pH", "neutralis", "titrat", "indicator", "sulfuric acid", "hydrochloric acid", "nitric acid"]),
        ("CHEM_T8", "The periodic table", 1, ["periodic table", "group I", "group VII", "noble gas", "halogen", "alkali metal", "transition metal", "group II"]),
        ("CHEM_T9", "Metals", 1.5, ["reactivity series", "extraction of metal", "alloy", "corrosion", "rust", "ore", "blast furnace"]),
        ("CHEM_T10", "Chemistry of the environment", 1.5, ["water purification", "air pollution", "fertiliser", "carbon cycle", "global warming", "greenhouse", "ozone", "acid rain"]),
        ("CHEM_T11", "Organic chemistry", 2.5, ["alkane", "alkene", "alcohol", "carboxylic acid", "polymer", "ethanol", "ethene", "methane", "hydrocarbon", "crude oil", "fraction", "cracking", "ferment", "ester", "addition reaction"]),
        ("CHEM_T12", "Experimental techniques and chemical analysis", 2, ["chromatography", "filtration", "distillation", "crystallis", "separating funnel", "test for", "flame test", "precipitate test"]),
    ],
    "0625": [
        ("PHYS_T1", "Motion, forces, and energy", 5, ["speed", "velocity", "acceleration", "force", "newton", "mass", "weight", "density", "pressure", "momentum", "energy", "work", "power", "kinetic", "potential"]),
        ("PHYS_T2", "Thermal physics", 3, ["thermal", "heat", "temperature", "specific heat", "latent", "conduction", "convection", "radiation", "expansion", "gas law"]),
        ("PHYS_T3", "Waves", 3, ["wave", "frequency", "wavelength", "amplitude", "reflection", "refraction", "diffraction", "sound", "light", "lens", "mirror", "electromagnetic", "spectrum"]),
        ("PHYS_T4", "Electricity and magnetism", 4, ["current", "voltage", "resistance", "circuit", "ohm", "series", "parallel", "magnet", "motor", "generator", "transformer", "electromagnetic induction", "relay"]),
        ("PHYS_T5", "Nuclear physics", 3.5, ["radioactiv", "alpha", "beta", "gamma", "half-life", "decay", "nuclear", "isotope", "atom", "fission", "fusion"]),
        ("PHYS_T6", "Space physics", 5, ["orbit", "solar system", "star", "galaxy", "universe", "redshift", "big bang", "comet", "planet", "sun", "moon", "satellite"]),
    ],
    "0610": [
        ("BIO_T1", "Characteristics and classification of living organisms", 1, ["classif", "kingdom", "vertebrate", "invertebrate", "characteristic", "MRS GREN"]),
        ("BIO_T2", "Organisation of the organism", 1, ["cell", "tissue", "organ", "organelle", "nucleus", "mitochondri", "chloroplast", "membrane"]),
        ("BIO_T3", "Movement into and out of the cells", 1.5, ["diffusion", "osmosis", "active transport", "concentration", "gradient", "permeable"]),
        ("BIO_T4", "Biological molecules", 1, ["carbohydrate", "protein", "lipid", "starch", "glucose", "amino acid", "fatty acid", "benedict", "biuret", "iodine"]),
        ("BIO_T5", "Enzymes", 1, ["enzyme", "substrate", "active site", "denature", "optimum", "amylase", "protease", "lipase"]),
        ("BIO_T6", "Plant nutrition", 1.5, ["photosynthe", "chlorophyll", "leaf", "stomata", "carbon dioxide", "light intensity", "limiting factor"]),
        ("BIO_T7", "Human nutrition", 2, ["diet", "nutrient", "vitamin", "mineral", "digestion", "alimentary", "stomach", "intestine", "enzyme", "absorption", "villi"]),
        ("BIO_T8", "Transport in plants", 1.5, ["xylem", "phloem", "transpiration", "translocation", "root hair", "water uptake"]),
        ("BIO_T9", "Transport in humans", 2, ["heart", "blood", "artery", "vein", "capillary", "plasma", "red blood", "white blood", "platelet", "circulat"]),
        ("BIO_T10", "Diseases and immunity", 1, ["disease", "pathogen", "immune", "antibody", "antigen", "vaccination", "transmiss"]),
        ("BIO_T11", "Gas exchange in humans", 1, ["lung", "alveol", "bronch", "trachea", "diaphragm", "intercostal", "gas exchange", "breathing"]),
        ("BIO_T12", "Respiration", 1, ["respiration", "aerobic", "anaerobic", "ATP", "lactic acid", "oxygen debt"]),
        ("BIO_T13", "Excretion in humans", 1, ["excretion", "kidney", "nephron", "urea", "urine", "dialysis"]),
        ("BIO_T14", "Coordination and response", 1.5, ["nerve", "neuron", "synapse", "reflex", "hormone", "insulin", "adrenaline", "eye", "homeostasis", "thermoregulat"]),
        ("BIO_T15", "Drugs", 1, ["drug", "antibiotic", "addiction", "depressant", "stimulant"]),
        ("BIO_T16", "Reproduction", 2.5, ["reproduct", "gamete", "fertilisation", "menstrual", "placenta", "embryo", "fetus", "puberty", "pollination", "seed", "germination"]),
        ("BIO_T17", "Inheritance", 3, ["gene", "allele", "dominant", "recessive", "genotype", "phenotype", "chromosome", "DNA", "mitosis", "meiosis", "Punnett", "monohybrid"]),
        ("BIO_T18", "Variation and selection", 1.5, ["variation", "mutation", "natural selection", "evolution", "adaptation", "selective breeding"]),
        ("BIO_T19", "Organisms and their environment", 1.5, ["ecosystem", "habitat", "population", "community", "food chain", "food web", "pyramid", "carbon cycle", "nitrogen cycle"]),
        ("BIO_T20", "Human influence on ecosystems", 1.5, ["deforestation", "pollution", "endangered", "conservation", "eutrophication", "acid rain", "greenhouse"]),
        ("BIO_T21", "Biotechnology and genetic modification", 1, ["biotechnology", "genetic engineering", "genetic modification", "GM", "cloning", "ferment"]),
    ],
    "0478": [
        ("CS_T1", "Data representation", 1.5, ["binary", "denary", "hexadecimal", "ASCII", "Unicode", "bitmap", "sample", "compression", "lossy", "lossless"]),
        ("CS_T2", "Data transmission", 2, ["serial", "parallel", "simplex", "duplex", "parity", "checksum", "check digit", "ARQ", "encryption"]),
        ("CS_T3", "Hardware", 1.5, ["CPU", "ALU", "processor", "RAM", "ROM", "cache", "register", "bus", "input", "output", "SSD", "HDD", "optical"]),
        ("CS_T4", "Software", 1.5, ["operating system", "interrupt", "compiler", "interpreter", "assembler", "IDE", "translator"]),
        ("CS_T5", "Internet", 2, ["internet", "WWW", "URL", "browser", "IP address", "MAC", "cookie", "firewall", "cyber", "phishing", "malware", "virus"]),
        ("CS_T6", "Automated systems and emerging technologies", 1.5, ["automat", "robot", "artificial intelligence", "sensor", "actuator", "embedded"]),
        ("CS_T7", "Algorithm design and problem solving", 1, ["algorithm", "flowchart", "pseudocode", "trace table", "decomposition", "abstraction"]),
        ("CS_T8", "Programming", 3, ["variable", "array", "loop", "if ", "while", "for ", "function", "procedure", "file handling", "string", "data type", "assignment"]),
        ("CS_T9", "Databases", 1.5, ["database", "record", "field", "primary key", "SQL", "query", "table", "SELECT", "WHERE"]),
        ("CS_T10", "Boolean logic", 1, ["AND gate", "OR gate", "NOT gate", "NAND", "NOR", "truth table", "logic gate", "boolean"]),
    ],
    "0500": [
        ("ENGLANG_READING", "Reading comprehension", 0, ["read", "passage", "text", "extract", "comprehension", "writer", "language"]),
        ("ENGLANG_WRITING", "Directed writing and composition", 0, ["write", "composition", "direct", "narrative", "descriptive", "argue"]),
    ],
    "0475": [
        ("ENGLIT_POETRY", "Poetry", 0, ["poem", "poet", "stanza", "verse", "imagery", "rhyme", "rhythm", "Chingonyi", "Duffy"]),
        ("ENGLIT_PROSE", "Prose", 0, ["novel", "narrator", "character", "chapter", "Mockingbird", "TKAM", "Atticus", "Scout", "Dickens"]),
        ("ENGLIT_DRAMA", "Drama", 0, ["play", "stage", "act", "scene", "dialogue", "Taste of Honey", "Jo ", "Helen", "Miller", "Crucible"]),
    ],
    "0520": [
        ("FR_LISTENING", "Listening", 0, ["listen", "écoute"]),
        ("FR_READING", "Reading", 0, ["read", "texte", "lisez", "passage", "article"]),
        ("FR_WRITING", "Writing", 0, ["write", "écri", "lettre", "email", "article", "blog"]),
    ],
    "0504": [
        ("PORT_P1", "Reading and directed writing", 0, ["leitura", "texto", "compreensão", "leia", "excerto"]),
        ("PORT_P2", "Writing", 0, ["escrita", "redação", "composição", "texto argumentativo", "narrativo", "descritivo"]),
    ],
}

EXAM_DATES = {
    "0520_writing": "2026-04-24", "0620_theory": "2026-04-28", "0610_theory": "2026-04-30",
    "0520_reading": "2026-05-05", "0625_theory": "2026-05-08", "0610_atp": "2026-05-12",
    "0478_p1": "2026-05-13", "0620_atp": "2026-05-19", "0625_atp": "2026-05-19",
    "0478_p2": "2026-05-20", "0504_p1": "2026-05-25", "0504_p2": "2026-05-28",
    "0520_listening": "2026-06-04", "0610_mcq": "2026-06-08",
    "0620_mcq": "2026-06-09", "0625_mcq": "2026-06-09",
}


def classify_topic(question_text, parent_context, subject_code):
    """Classify a question into a canonical topic using keyword matching.

    Multi-word keywords score higher (more specific).
    Confidence penalised when multiple topics match similarly.
    """
    if subject_code not in TOPICS:
        return None, 0.0

    text = ((question_text or "") + " " + (parent_context or "")).lower()
    topics = TOPICS[subject_code]

    scores = []
    for topic_id, topic_name, hours, keywords in topics:
        score = 0
        for kw in keywords:
            if kw.lower() in text:
                # Multi-word keywords are more specific → weight higher
                word_count = len(kw.split())
                score += word_count
        scores.append((topic_id, topic_name, score, len(keywords)))

    if not scores:
        return None, 0.0

    scores.sort(key=lambda x: -x[2])
    best = scores[0]
    if best[2] == 0:
        return None, 0.0

    # Confidence: ratio of best score to max possible, with gap penalty
    max_possible = sum(len(kw.split()) for kw in TOPICS[subject_code][0][3])  # rough max
    confidence = min(1.0, best[2] / max(3, max_possible * 0.3))

    if len(scores) > 1 and scores[1][2] > 0:
        gap_ratio = (best[2] - scores[1][2]) / max(best[2], 1)
        if gap_ratio < 0.3:
            confidence *= 0.5  # Very close competition
        elif gap_ratio < 0.5:
            confidence *= 0.7

    return best[0], round(min(confidence, 1.0), 2)


def link_atomic_facts(question_text, parent_context, subject_code, facts):
    """Link a question to related atomic facts by keyword overlap."""
    text = ((question_text or "") + " " + (parent_context or "")).lower()
    words = set(re.findall(r'[a-z]{3,}', text))

    linked = []
    for fact in facts:
        fact_words = set(re.findall(r'[a-z]{3,}', fact["fact_text"].lower()))
        overlap = words & fact_words
        # Remove common words
        overlap -= {"the", "and", "for", "are", "that", "this", "with", "from", "which", "have", "has", "not", "can", "will", "its", "was", "were", "been", "being", "does"}
        if len(overlap) >= 3:
            score = len(overlap) / max(len(fact_words), 1)
            linked.append({"fact_id": fact["id"], "score": round(score, 2), "overlap": len(overlap)})

    linked.sort(key=lambda x: -x["score"])
    return linked[:5]  # Top 5 matches


def verify_subject(subject_code, data_path, facts):
    """Run all 4 verification parts on a subject."""
    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)

    questions = data["questions"]
    leaves = [q for q in questions if not q.get("is_stem")]

    # ── Part 1: Mark scheme integrity ──
    p1 = {"total": len(leaves), "has_answer": 0, "has_ms": 0, "marks_zero": 0, "marks_mismatch": 0, "issues": []}
    for q in leaves:
        ca = q.get("correct_answer") or ""
        ms = q.get("mark_scheme") or ""
        marks = q.get("marks", 0)
        mp = q.get("mark_points") or []

        if ca:
            p1["has_answer"] += 1
        if ms:
            p1["has_ms"] += 1
        if marks == 0:
            p1["marks_zero"] += 1
        if mp and marks > 0:
            if abs(len(mp) - marks) > 1:
                p1["marks_mismatch"] += 1
                p1["issues"].append({"id": q["id"], "issue": f"marks={marks} but {len(mp)} mark_points"})

    # ── Part 2: Diagram integrity ──
    p2 = {"total": len(leaves), "has_diagram": 0, "refs_no_diagram": 0, "file_missing": 0, "issues": []}
    fig_re = re.compile(r'(?i)(fig\.\s*\d|table\s+\d)')
    for q in leaves:
        if q.get("has_diagram"):
            p2["has_diagram"] += 1
            dp = q.get("diagram_path")
            if dp and not os.path.exists(dp):
                p2["file_missing"] += 1
                p2["issues"].append({"id": q["id"], "issue": f"diagram_path missing: {dp}"})
        qt = (q.get("question_text") or "") + " " + (q.get("parent_context") or "")
        if fig_re.search(qt) and not q.get("has_diagram"):
            p2["refs_no_diagram"] += 1

    # ── Part 4: Atomic fact linking (run BEFORE topic classification) ──
    subject_facts = [f for f in facts if f.get("subject_code") == subject_code]
    # Build topic lookup from facts
    fact_topic_map = {}  # fact_id → parent topic (e.g., CHEM_T7)
    for fact in subject_facts:
        tid = fact.get("topic_id", "")
        parts = tid.split("_")
        if len(parts) >= 2:
            parent = parts[0] + "_" + parts[1]  # CHEM_T7, PHYS_T1, etc.
        else:
            parent = tid
        fact_topic_map[fact["id"]] = parent

    p4 = {"total": len(leaves), "linked": 0, "avg_facts": 0, "no_facts": 0}
    total_links = 0
    for q in leaves:
        links = link_atomic_facts(q.get("question_text"), q.get("parent_context"), subject_code, subject_facts)
        q["related_facts"] = links
        if links:
            p4["linked"] += 1
            total_links += len(links)
        else:
            p4["no_facts"] += 1
    p4["avg_facts"] = round(total_links / max(p4["linked"], 1), 1)
    p4["coverage"] = f"{p4['linked'] * 100 // max(len(leaves), 1)}%"

    # ── Part 3: Topic classification (3-tier: fact-inferred → keyword → unclassified) ──
    p3 = {"total": len(leaves), "classified": 0, "high": 0, "medium": 0, "low": 0, "unclassified": 0,
          "method_fact": 0, "method_keyword": 0, "distribution": Counter()}

    for q in leaves:
        topic_id = None
        conf = 0.0

        # Tier 1: Infer topic from linked atomic facts (most reliable)
        if q.get("related_facts"):
            topic_votes = Counter()
            for link in q["related_facts"]:
                fid = link["fact_id"]
                parent_topic = fact_topic_map.get(fid)
                if parent_topic:
                    topic_votes[parent_topic] += link["score"]
            if topic_votes:
                best_topic, best_score = topic_votes.most_common(1)[0]
                # Verify this topic is in our canonical list
                canonical_ids = [t[0] for t in TOPICS.get(subject_code, [])]
                if best_topic in canonical_ids:
                    topic_id = best_topic
                    # Confidence based on vote margin
                    total_votes = sum(topic_votes.values())
                    conf = min(1.0, best_score / max(total_votes * 0.5, 0.1))
                    if len(topic_votes) > 1:
                        second_score = topic_votes.most_common(2)[1][1]
                        gap = (best_score - second_score) / max(best_score, 0.01)
                        if gap < 0.3:
                            conf *= 0.6
                    conf = round(min(conf, 1.0), 2)
                    p3["method_fact"] += 1

        # Tier 2: Keyword matching (fallback)
        if not topic_id or conf < 0.4:
            kw_topic, kw_conf = classify_topic(q.get("question_text"), q.get("parent_context"), subject_code)
            if kw_topic and (not topic_id or kw_conf > conf):
                topic_id = kw_topic
                conf = kw_conf
                p3["method_keyword"] += 1

        q["syllabus_topic_id"] = topic_id
        q["topic_confidence"] = conf
        if topic_id:
            p3["classified"] += 1
            p3["distribution"][topic_id] += 1
            if conf >= 0.7:
                p3["high"] += 1
            elif conf >= 0.4:
                p3["medium"] += 1
            else:
                p3["low"] += 1
        else:
            p3["unclassified"] += 1
    p3["distribution"] = dict(p3["distribution"].most_common())

    return {
        "subject_code": subject_code,
        "total_papers": data["total_papers"],
        "total_leaves": len(leaves),
        "mark_scheme": p1,
        "diagrams": p2,
        "topics": p3,
        "atomic_facts": p4,
    }, questions


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    outdir = r"c:\Users\sarma\OneDrive\Ambiente de Trabalho\tutor final\data\extracted"

    # Load atomic facts from Supabase cache or API
    facts_path = os.path.join(outdir, "atomic_facts_cache.json")
    if os.path.exists(facts_path):
        with open(facts_path, encoding="utf-8") as f:
            facts = json.load(f)
    else:
        import subprocess
        url = "https://vzdubaxzcjhwbpnybkqr.supabase.co"
        key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZHViYXh6Y2pod2Jwbnlia3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjUyODEzMywiZXhwIjoyMDg4MTA0MTMzfQ.dmPvf8Swvrhsc0SKsxumeou5wEwc2iL_5kThlFUp_Xg"
        # Fetch all facts (paginate if needed)
        facts = []
        for offset in range(0, 3000, 1000):
            r = subprocess.run([
                "curl", "-s", f"{url}/rest/v1/atomic_facts?select=id,subject_code,topic_id,topic_name,fact_text&limit=1000&offset={offset}",
                "-H", f"apikey: {key}", "-H", f"Authorization: Bearer {key}"
            ], capture_output=True, text=True, encoding="utf-8")
            batch = json.loads(r.stdout)
            facts.extend(batch)
            if len(batch) < 1000:
                break
        with open(facts_path, "w", encoding="utf-8") as f:
            json.dump(facts, f, ensure_ascii=False)
        print(f"Cached {len(facts)} atomic facts")

    subjects = [
        ("0620", "chemistry_all.json"),
        ("0625", "physics_all.json"),
        ("0610", "biology_all.json"),
        ("0478", "cs_all.json"),
        ("0500", "english_lang_all.json"),
        ("0475", "english_lit_all.json"),
        ("0520", "french_all.json"),
        ("0504", "portuguese_all.json"),
    ]

    # Filter to specific subject if given
    if len(sys.argv) > 1 and sys.argv[1] != "--all":
        subjects = [(c, f) for c, f in subjects if c == sys.argv[1]]

    all_reports = []
    for code, fname in subjects:
        data_path = os.path.join(outdir, code, fname)
        if not os.path.exists(data_path):
            print(f"{code}: file not found")
            continue

        report, verified_questions = verify_subject(code, data_path, facts)
        all_reports.append(report)

        # Save verified JSON
        verified_path = os.path.join(outdir, code, fname.replace("_all.", "_verified."))
        with open(verified_path, "w", encoding="utf-8") as f:
            json.dump({"report": report, "questions": verified_questions}, f, indent=2, ensure_ascii=False)

        # Print summary
        r = report
        print(f"\n{'='*60}")
        print(f"  {code} — {r['total_leaves']} leaves across {r['total_papers']} papers")
        print(f"{'='*60}")
        print(f"  MS:     {r['mark_scheme']['has_answer']}/{r['total_leaves']} answers | {r['mark_scheme']['has_ms']}/{r['total_leaves']} mark schemes | {r['mark_scheme']['marks_mismatch']} mismatches")
        print(f"  Diag:   {r['diagrams']['has_diagram']} with diagram | {r['diagrams']['refs_no_diagram']} refs without | {r['diagrams']['file_missing']} files missing")
        print(f"  Topics: {r['topics']['high']} high + {r['topics']['medium']} med + {r['topics']['low']} low conf | {r['topics']['unclassified']} unclassified")
        print(f"  Facts:  {r['atomic_facts']['linked']}/{r['total_leaves']} linked ({r['atomic_facts']['coverage']}) | avg {r['atomic_facts']['avg_facts']} facts/q")
        if r["topics"]["distribution"]:
            print(f"  Topic distribution: {r['topics']['distribution']}")


if __name__ == "__main__":
    main()
