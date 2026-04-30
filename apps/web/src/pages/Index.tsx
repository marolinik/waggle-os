import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import Desktop from "@/components/os/Desktop";
import BootScreen from "@/components/os/BootScreen";

const BOOT_KEY = "waggle-booted";

// 9f: Restore saved theme on load
const savedTheme = localStorage.getItem('waggle-theme');
if (savedTheme === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}

const Index = () => {
  // FR #23: split the boot signal into "boot finished" (gates BootScreen exit
  // animation) and "show desktop" (gates Desktop + its overlays). On a fresh
  // tab where localStorage is empty, this guarantees the BootScreen's exit
  // transition finishes BEFORE Desktop mounts, eliminating the race where
  // LoginBriefing / OnboardingWizard fade in over a still-visible boot logo.
  const initialBooted = localStorage.getItem(BOOT_KEY) !== null;
  const [booted, setBooted] = useState(initialBooted);
  const [showDesktop, setShowDesktop] = useState(initialBooted);

  const handleBootComplete = () => {
    localStorage.setItem(BOOT_KEY, "true");
    setBooted(true);
  };

  return (
    <>
      <AnimatePresence onExitComplete={() => setShowDesktop(true)}>
        {!booted && <BootScreen onComplete={handleBootComplete} />}
      </AnimatePresence>
      {showDesktop && <Desktop />}
    </>
  );
};

export default Index;
