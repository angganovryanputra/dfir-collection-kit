import React, { useState, useEffect } from "react";

interface TypewriterTextProps {
    text: string;
    speed?: number;
    delay?: number;
    className?: string;
}

export function TypewriterText({ text, speed = 40, delay = 0, className }: TypewriterTextProps) {
    const [displayedText, setDisplayedText] = useState("");
    const [started, setStarted] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => setStarted(true), delay);
        return () => clearTimeout(timeout);
    }, [delay]);

    useEffect(() => {
        if (!started) return;
        
        if (displayedText.length < text.length) {
            const timeout = setTimeout(() => {
                setDisplayedText(text.slice(0, displayedText.length + 1));
            }, speed);
            return () => clearTimeout(timeout);
        }
    }, [displayedText, text, started, speed]);

    return (
        <span className={className}>
            {displayedText}
            {displayedText.length < text.length && started && (
                <span className="w-1.5 h-3.5 bg-primary inline-block ml-0.5 animate-pulse" />
            )}
        </span>
    );
}
