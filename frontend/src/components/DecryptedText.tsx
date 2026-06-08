import React, { useState, useEffect } from "react";

interface DecryptedTextProps {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  animateOnMount?: boolean;
}

const GLYPHS = "ABCDEFGHIKLMNOPQRSTUVXYZ0123456789@#$%&*+-=";

export const DecryptedText: React.FC<DecryptedTextProps> = ({
  text,
  className,
  speed = 40,
  delay = 0,
  animateOnMount = true,
}) => {
  const [displayText, setDisplayText] = useState(animateOnMount ? "" : text);
  const [isAnimating, setIsAnimating] = useState(animateOnMount);

  useEffect(() => {
    if (!animateOnMount) return;

    let timeoutId: NodeJS.Timeout;
    let iteration = 0;
    
    const startAnimation = () => {
      const interval = setInterval(() => {
        setDisplayText((prev) =>
          text
            .split("")
            .map((char, index) => {
              if (index < iteration) {
                return text[index];
              }
              return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            })
            .join("")
        );

        if (iteration >= text.length) {
          clearInterval(interval);
          setIsAnimating(false);
        }

        iteration += 1 / 3;
      }, speed);
      
      return interval;
    };

    timeoutId = setTimeout(() => {
      const interval = startAnimation();
      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [text, speed, delay, animateOnMount]);

  return (
    <span className={className}>
      {displayText}
      {isAnimating && <span className="animate-pulse ml-0.5">_</span>}
    </span>
  );
};
