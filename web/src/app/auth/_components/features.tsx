import FeatureRow from "./feature-row";

export default function Features() {
  return (
    <section className="py-20 sm:py-32 space-y-28 sm:space-y-40">
      <FeatureRow
        photo="/auth/feature-practice.jpg"
        alt="Hands writing equations in a leather notebook with a fountain pen"
        eyebrow="Smart Practice"
        title="Questions that know you."
        body="The tutor watches what you miss and brings it back at the right moment. No random question sets. No wasted hours. Just the right problem, at the right time, until it clicks."
      />
      <FeatureRow
        reverse
        photo="/auth/feature-repetition.jpg"
        alt="Handmade flashcards spread on cream linen"
        eyebrow="Spaced Repetition"
        title="Remember what matters."
        body="Flashcards that fade from view when you know them, and return when you don't. Built on the same science that trained chess grandmasters and medical students for decades."
      />
      <FeatureRow
        photo="/auth/feature-papers.jpg"
        alt="Cambridge exam papers stacked on a desk next to a cup of tea"
        eyebrow="Past Papers"
        title="287 papers. One place."
        body="Every Cambridge paper from 2019 to 2025, across all eight subjects, marked instantly with model answers and examiner notes. Real exam conditions, whenever you want them."
      />
    </section>
  );
}
