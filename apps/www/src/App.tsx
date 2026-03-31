import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import Pricing from './components/Pricing';
import Enterprise from './components/Enterprise';
import BetaSignup from './components/BetaSignup';
import Footer from './components/Footer';

const App = () => (
  <div className="min-h-screen" style={{ background: 'var(--hive-950)' }}>
    <Navbar />
    <Hero />
    <Features />
    <HowItWorks />
    <Pricing />
    <Enterprise />
    <BetaSignup />
    <Footer />
  </div>
);

export default App;
