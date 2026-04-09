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
  const [booted, setBooted] = useState(
    () => localStorage.getItem(BOOT_KEY) !== null
  );

  const handleBootComplete = () => {
    localStorage.setItem(BOOT_KEY, "true");
    setBooted(true);
  };

  return (
    <>
      <AnimatePresence>
        {!booted && <BootScreen onComplete={handleBootComplete} />}
      </AnimatePresence>
      {booted && <Desktop />}
    </>
  );
};

export default Index;
