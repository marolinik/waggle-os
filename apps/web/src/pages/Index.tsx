import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import Desktop from "@/components/os/Desktop";
import BootScreen from "@/components/os/BootScreen";

const BOOT_KEY = "waggle-booted";

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
