import { useState, useEffect } from "react";

/**
 * useCountdown
 * Returns a live countdown string from now until `targetDate`
 */
const useCountdown = (targetDate) => {
  const calc = () => {
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return { str: "Expired", expired: true };
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return {
      str: `${h > 0 ? `${h}h ` : ""}${m}m ${s}s`,
      expired: false,
      diff,
    };
  };

  const [state, setState] = useState(calc);

  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setState(calc()), 1000);
    return () => clearInterval(id);
  }, [targetDate]); // eslint-disable-line

  return state;
};

export default useCountdown;
