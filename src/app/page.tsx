import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import AppScreens from "@/components/AppScreens";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Security from "@/components/Security";
import FAQ from "@/components/FAQ";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="mesh-gradient relative overflow-hidden">
      <Nav />
      <Hero />
      <AppScreens />
      <Features />
      <HowItWorks />
      <Security />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
