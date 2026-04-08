import NavBar from "./_components/nav-bar";
import Hero from "./_components/hero";
import Intro from "./_components/intro";
import Features from "./_components/features";
import School from "./_components/school";
import AuthForm from "./_components/auth-form";
import GrainOverlay from "./_components/grain-overlay";

export default function AuthPage() {
  return (
    <div className="relative">
      <GrainOverlay />
      <NavBar />
      <main>
        <Hero />
        <Intro />
        <Features />
        <School />
        <AuthForm />
        <footer className="py-12 text-center text-xs text-stone-500 tracking-wider">
          For CLIP Porto · Cambridge IGCSE June 2026
        </footer>
      </main>
    </div>
  );
}
