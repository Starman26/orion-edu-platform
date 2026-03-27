// src/context/ThinkingContext.tsx
import { createContext, useContext, useState, ReactNode } from "react";

interface ThinkingContextType {
  isThinking: boolean;
  setIsThinking: (value: boolean) => void;
}

const ThinkingContext = createContext<ThinkingContextType | undefined>(undefined);

export function ThinkingProvider({ children }: { children: ReactNode }) {
  const [isThinking, setIsThinking] = useState(false);

  return (
    <ThinkingContext.Provider value={{ isThinking, setIsThinking }}>
      {children}
    </ThinkingContext.Provider>
  );
}

// Safe hook that doesn't crash if provider is missing
export function useThinking(): ThinkingContextType {
  const context = useContext(ThinkingContext);
  
  // Return a default/no-op implementation if provider is missing
  if (context === undefined) {
    return {
      isThinking: false,
      setIsThinking: () => {
        console.warn("useThinking: ThinkingProvider not found, state changes will be ignored");
      },
    };
  }
  
  return context;
}