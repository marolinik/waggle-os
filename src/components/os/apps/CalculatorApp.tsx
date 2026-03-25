import { useState } from "react";

const buttons = [
  ["C", "±", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ".", "="],
];

const CalculatorApp = () => {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);

  const handlePress = (btn: string) => {
    if (btn >= "0" && btn <= "9" || btn === ".") {
      setDisplay(fresh ? btn : display + btn);
      setFresh(false);
    } else if (btn === "C") {
      setDisplay("0"); setPrev(null); setOp(null); setFresh(true);
    } else if (["+", "−", "×", "÷"].includes(btn)) {
      setPrev(parseFloat(display)); setOp(btn); setFresh(true);
    } else if (btn === "=") {
      if (prev !== null && op) {
        const curr = parseFloat(display);
        let result = 0;
        if (op === "+") result = prev + curr;
        if (op === "−") result = prev - curr;
        if (op === "×") result = prev * curr;
        if (op === "÷") result = curr !== 0 ? prev / curr : 0;
        setDisplay(String(result));
        setPrev(null); setOp(null); setFresh(true);
      }
    } else if (btn === "±") {
      setDisplay(String(-parseFloat(display)));
    } else if (btn === "%") {
      setDisplay(String(parseFloat(display) / 100));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 text-right">
        <div className="text-3xl font-display font-light text-foreground">{display}</div>
      </div>
      <div className="flex-1 grid grid-cols-4 gap-px p-2">
        {buttons.flat().map((btn, i) => (
          <button
            key={i}
            onClick={() => handlePress(btn)}
            className={`rounded-lg text-sm font-medium py-3 transition-colors ${
              btn === "0" ? "col-span-2" : ""
            } ${
              ["+", "−", "×", "÷", "="].includes(btn)
                ? "bg-primary text-primary-foreground hover:bg-primary/80"
                : ["C", "±", "%"].includes(btn)
                ? "bg-muted text-foreground hover:bg-muted/70"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            }`}
          >
            {btn}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CalculatorApp;
