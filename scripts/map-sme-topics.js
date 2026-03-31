const {createClient}=require('@supabase/supabase-js');
const fs=require('fs');
const path=require('path');

const env=fs.readFileSync(path.join(__dirname,'..','web','.env.local'),'utf-8');
const get=k=>env.match(new RegExp(k+'=(.+)'))?.[1]?.trim();
const sb=createClient(get('NEXT_PUBLIC_SUPABASE_URL'),get('SUPABASE_SERVICE_ROLE_KEY'));

// SME topic → our topic_code mapping
const PHYSICS_MAP = {
  'Physical Quantities & Measurement Techniques': 'PHYS_T1',
  'Motion': 'PHYS_T1', 'Mass, Weight & Density': 'PHYS_T1',
  'Effects of Forces': 'PHYS_T1', 'Moments': 'PHYS_T1',
  'Momentum': 'PHYS_T1', 'Energy, Work & Power': 'PHYS_T1',
  'Energy Sources': 'PHYS_T1', 'Pressure': 'PHYS_T1',
  'Kinetic Particle Model of Matter': 'PHYS_T2',
  'Thermal Properties & Temperature': 'PHYS_T2',
  'Transfer of Thermal Energy': 'PHYS_T2',
  'General Properties of Waves': 'PHYS_T3', 'Light': 'PHYS_T3',
  'Electromagnetic Spectrum': 'PHYS_T3', 'Sound': 'PHYS_T3',
  'Simple Phenomena of Magnetism': 'PHYS_T4',
  'Electrical Quantities': 'PHYS_T4',
  'Electric Circuits & Electrical Safety': 'PHYS_T4',
  'Electromagnetic Effects': 'PHYS_T4',
  'The Nuclear Model of the Atom': 'PHYS_T5', 'Radioactivity': 'PHYS_T5',
  'Earth & The Solar System': 'PHYS_T6', 'Stars & The Universe': 'PHYS_T6',
};

const CHEMISTRY_MAP = {
  'Solids liquids and gases': 'CHEM_T1',
  'Atomic structure and the periodic table': 'CHEM_T2',
  'Ions and ionic bonds': 'CHEM_T2',
  'Simple molecules and covalent bonds': 'CHEM_T2',
  'Giant structures': 'CHEM_T2',
  'Formulae and relative masses': 'CHEM_T3',
  'The mole and the avogadro constant': 'CHEM_T3',
  'Electrolysis': 'CHEM_T4', 'Applications of electrolysis': 'CHEM_T4',
  'Exothermic and endothermic reactions': 'CHEM_T5',
  'Chemical change and rate of reaction': 'CHEM_T6',
  'Reversible reactions and equilibrium': 'CHEM_T6', 'Redox': 'CHEM_T6',
  'The characteristic properties of acids and bases': 'CHEM_T7',
  'Preparation of salts': 'CHEM_T7',
  'The periodic table and trends': 'CHEM_T8',
  'Group properties and trends': 'CHEM_T8',
  'Properties uses and alloys of metals': 'CHEM_T9',
  'Reactivity series and corrosion of metals': 'CHEM_T9',
  'Extraction of metals': 'CHEM_T9',
  'Water and water pollution': 'CHEM_T10', 'Air quality and climate': 'CHEM_T10',
  'Formulae functional groups and terminology': 'CHEM_T11',
  'Organic families': 'CHEM_T11', 'Polymers': 'CHEM_T11',
  'Experimental techniques': 'CHEM_T12',
  'Separation and purification': 'CHEM_T12',
  'Identification of ions and gases': 'CHEM_T12',
};

const BIOLOGY_MAP = {
  '1-1-characteristics-classification-and-features-of-organisms': 'BIO_T1',
  '2-1-cell-structure-and-size-of-specimens': 'BIO_T2',
  '3-1-diffusion-osmosis-and-active-transport': 'BIO_T3',
  '4-1-biological-molecules': 'BIO_T4', '5-1-enzymes': 'BIO_T5',
  '6-1-photosynthesis-and-leaf-structure': 'BIO_T6',
  '7-1-human-diet-and-digestion': 'BIO_T7',
  '8-1-transport-in-plants': 'BIO_T8',
  '9-1-circulatory-systems-heart-and-blood-vessels': 'BIO_T9',
  '10-1-diseases-and-immunity': 'BIO_T10',
  '11-1-gas-exchange-in-humans': 'BIO_T11', '12-1-respiration': 'BIO_T12',
  '13-1-excretion-in-humans': 'BIO_T13',
  '14-1-coordination-response-and-homeostasis': 'BIO_T14',
  '15-1-drugs-in-medicine': 'BIO_T15',
  '16-1-reproduction-in-plants-and-humans': 'BIO_T16',
  '17-1-inheritance-genes-and-cell-division': 'BIO_T17',
  '18-1-variation-and-natural-selection': 'BIO_T18',
  '19-1-energy-and-feeding-relationships': 'BIO_T19',
  '20-1-human-impact-biodiversity-pollution-and-conservation': 'BIO_T20',
  '21-1-biotechnology-and-genetic-modification': 'BIO_T21',
};

const CS_MAP = {
  'number-systems': 'CS_T1', 'text-sound-and-images': 'CS_T1', 'data-storage-and-compression': 'CS_T1',
  'types-and-methods-of-data-transmission': 'CS_T2', 'methods-of-error-detection': 'CS_T2', 'encryption': 'CS_T2',
  'computer-architecture': 'CS_T3', 'input-and-output-devices': 'CS_T3', 'data-storage': 'CS_T3', 'network-hardware': 'CS_T3',
  'types-of-software-and-interrupts': 'CS_T4', 'types-of-programming-language-translators-and-ides': 'CS_T4',
  'the-internet-and-the-world-wide-web': 'CS_T5', 'digital-currency': 'CS_T5', 'cyber-security': 'CS_T5',
  'automated-systems': 'CS_T6', 'robotics': 'CS_T6', 'artificial-intelligence': 'CS_T6',
  'development-life-cycle': 'CS_T7', 'computer-sub-systems': 'CS_T7', 'algorithms': 'CS_T7',
  'standard-methods-of-a-solution': 'CS_T7', 'validation-and-verification': 'CS_T7', 'identifying-errors': 'CS_T7',
  'programming-concepts': 'CS_T8', 'arrays': 'CS_T8', 'file-handling': 'CS_T8',
  'databases': 'CS_T9', 'sql': 'CS_T9',
  'boolean-logic': 'CS_T10',
};

const ROOT = path.join(__dirname, '..');

async function run() {
  // Load topic_code → UUID
  const {data: topics} = await sb.from('syllabus_topics').select('id,topic_code');
  const codeToUuid = {};
  for (const t of topics || []) codeToUuid[t.topic_code] = t.id;

  const smeFiles = {
    '0625': {fp: path.join(ROOT, 'data/savemyexams/physics/sme_physics.json'), map: PHYSICS_MAP, key: 'topic'},
    '0620': {fp: path.join(ROOT, 'data/savemyexams/chemistry_sme.json'), map: CHEMISTRY_MAP, key: 'topic'},
    '0610': {fp: path.join(ROOT, 'data/savemyexams/biology_sme.json'), map: BIOLOGY_MAP, key: 'topic'},
    '0478': {fp: path.join(ROOT, 'data/savemyexams/cs_sme.json'), map: CS_MAP, key: 'slug'},
  };

  let grandTotal = 0;

  for (const [code, {fp, map, key}] of Object.entries(smeFiles)) {
    console.log(`\n${code}:`);
    const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));

    // Group question IDs by target topic UUID
    const groups = {};
    let unmapped = 0;
    for (const q of data.questions) {
      const smeTopic = q[key] || '';
      const topicCode = map[smeTopic];
      if (!topicCode) { unmapped++; continue; }
      const uuid = codeToUuid[topicCode];
      if (!uuid) { unmapped++; continue; }
      if (!groups[uuid]) groups[uuid] = [];
      groups[uuid].push(q.id);
    }

    console.log(`  ${Object.keys(groups).length} topic groups, ${unmapped} unmapped`);

    let updated = 0;
    for (const [uuid, ids] of Object.entries(groups)) {
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200);
        const {error} = await sb.from('exam_questions')
          .update({syllabus_topic_id: uuid})
          .in('id', batch);
        if (error) console.log(`  Error: ${error.message?.substring(0, 80)}`);
        else updated += batch.length;
      }
    }
    console.log(`  Updated: ${updated}/${data.questions.length}`);
    grandTotal += updated;
  }

  // English Lit
  console.log('\n0475 (English Lit):');
  const engLit = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/savemyexams/eng_lit_sme.json'), 'utf-8'));
  const poetryId = codeToUuid['ENGLIT_T5']; // Prose — Character, Setting and Theme
  const dramaId = codeToUuid['ENGLIT_T6'];  // Drama — Form and Conventions
  const poetryIds = [], dramaIds = [];
  for (const q of engLit.questions) {
    if ((q.chapter || '').includes('drama')) dramaIds.push(q.id);
    else poetryIds.push(q.id);
  }
  if (poetryId && poetryIds.length) {
    await sb.from('exam_questions').update({syllabus_topic_id: poetryId}).in('id', poetryIds);
    console.log(`  Poetry/Prose: ${poetryIds.length}`);
  }
  if (dramaId && dramaIds.length) {
    await sb.from('exam_questions').update({syllabus_topic_id: dramaId}).in('id', dramaIds);
    console.log(`  Drama: ${dramaIds.length}`);
  }
  grandTotal += poetryIds.length + dramaIds.length;

  console.log(`\n=== TOTAL UPDATED: ${grandTotal} ===`);

  // Verify
  console.log('\nVerification:');
  for (const code of ['0625', '0620', '0610', '0478', '0475']) {
    const {count: total} = await sb.from('exam_questions').select('id', {count: 'exact', head: true}).eq('subject_code', code).eq('evaluation_ready', true);
    const {count: linked} = await sb.from('exam_questions').select('id', {count: 'exact', head: true}).eq('subject_code', code).eq('evaluation_ready', true).not('syllabus_topic_id', 'is', null);
    console.log(`  ${code}: ${linked}/${total} linked (${(100 * linked / total).toFixed(0)}%)`);
  }
}

run().catch(console.error);
