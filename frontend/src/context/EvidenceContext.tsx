import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type EvidenceItem = {
    id: string;
    type: "event" | "hit" | "match";
    title: string;
    content: string;
    timestamp: string;
    metadata: Record<string, any>;
    pinnedAt: string;
};

interface EvidenceContextType {
    pinnedItems: EvidenceItem[];
    pinItem: (item: Omit<EvidenceItem, "pinnedAt">) => void;
    unpinItem: (id: string) => void;
    clearWorkspace: () => void;
}

const EvidenceContext = createContext<EvidenceContextType | undefined>(undefined);

export function EvidenceProvider({ children }: { children: ReactNode }) {
    const [pinnedItems, setPinnedItems] = useState<EvidenceItem[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem("dfir_pinned_evidence");
        if (stored) {
            try {
                setPinnedItems(JSON.parse(stored));
            } catch (err) {
                console.error("Failed to parse pinned evidence", err);
            }
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        localStorage.setItem("dfir_pinned_evidence", JSON.stringify(pinnedItems));
    }, [pinnedItems]);

    const pinItem = (item: Omit<EvidenceItem, "pinnedAt">) => {
        setPinnedItems((prev) => {
            if (prev.some((i) => i.id === item.id)) return prev;
            return [{ ...item, pinnedAt: new Date().toISOString() }, ...prev];
        });
    };

    const unpinItem = (id: string) => {
        setPinnedItems((prev) => prev.filter((i) => i.id !== id));
    };

    const clearWorkspace = () => {
        if (window.confirm("ARE YOU SURE YOU WANT TO CLEAR ALL PINNED EVIDENCE?")) {
            setPinnedItems([]);
        }
    };

    return (
        <EvidenceContext.Provider value={{ pinnedItems, pinItem, unpinItem, clearWorkspace }}>
            {children}
        </EvidenceContext.Provider>
    );
}

export function useEvidence() {
    const context = useContext(EvidenceContext);
    if (context === undefined) {
        throw new Error("useEvidence must be used within an EvidenceProvider");
    }
    return context;
}
