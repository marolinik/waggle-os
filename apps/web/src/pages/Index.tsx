import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import Desktop from "@/components/os/Desktop";
import BootScreen from "@/components/os/BootScreen";

const Index = () => {
  const [booted, setBooted] = useState(false);

  return (
    <>
      <AnimatePresence>
        {!booted && <BootScreen onComplete={() => setBooted(true)} />}
      </AnimatePresence>
      {booted && <Desktop />}
    </>
  );
};

export default Index;
