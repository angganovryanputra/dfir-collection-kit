import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo, useRef } from "react";

export type EvidenceItem = {
    id: string;
    type: "event" | "hit" | "match";
    title: string;
    content: string;
    timestamp: string;
    metadata: Record<string, unknown>;
    pinnedAt: string;
    incidentId?: string;
};

export interface EvidenceContextType {
    pinnedItems: EvidenceItem[];
    pinItem: (item: Omit<EvidenceItem, "pinnedAt">) => void;
    unpinItem: (id: string) => void;
    clearWorkspace: () => void;
    activeIncidentId?: string;
}

export interface EvidenceProviderProps {
    children: ReactNode;
    incidentId?: string;
}

const EvidenceContext = createContext<EvidenceContextType | undefined>(undefined);

export function EvidenceProvider({ children, incidentId: explicitIncidentId }: EvidenceProviderProps) {
    const detectIncidentId = useCallback((): string | undefined => {
        if (explicitIncidentId) return explicitIncidentId;
        if (typeof window !== "undefined" && window.location?.pathname) {
            const match = window.location.pathname.match(/\/incidents\/([^/]+)/);
            if (match?.[1] && match[1] !== "create") {
                return match[1];
            }
        }
        return undefined;
    }, [explicitIncidentId]);

    const [activeIncidentId, setActiveIncidentId] = useState<string | undefined>(detectIncidentId);

    // Update active incident when explicit parameter changes or on navigation
    useEffect(() => {
        setActiveIncidentId(detectIncidentId());
    }, [detectIncidentId]);

    useEffect(() => {
        const handleLocationChange = () => {
            setActiveIncidentId(detectIncidentId());
        };
        window.addEventListener("popstate", handleLocationChange);
        return () => window.removeEventListener("popstate", handleLocationChange);
    }, [detectIncidentId]);

    const storageKey = `dfir_pinned_evidence_${activeIncidentId || "global"}`;
    const loadedKeyRef = useRef<string>(storageKey);

    // Initial load and reload on storageKey change
    const [pinnedItems, setPinnedItems] = useState<EvidenceItem[]>(() => {
        if (typeof window === "undefined") return [];
        try {
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (err) {
            console.error("Failed to parse pinned evidence", err);
            return [];
        }
    });

    // Sync state when storageKey changes (e.g. incident navigation)
    useEffect(() => {
        try {
            const stored = localStorage.getItem(storageKey);
            setPinnedItems(stored ? JSON.parse(stored) : []);
        } catch (err) {
            console.error("Failed to parse pinned evidence", err);
            setPinnedItems([]);
        }
        loadedKeyRef.current = storageKey;
    }, [storageKey]);

    // Save to localStorage when pinnedItems changes, guarded by loadedKeyRef
    useEffect(() => {
        if (loadedKeyRef.current !== storageKey) {
            return;
        }
        try {
            localStorage.setItem(storageKey, JSON.stringify(pinnedItems));
        } catch (err) {
            console.error("Failed to save pinned evidence", err);
        }
    }, [pinnedItems, storageKey]);

    const pinItem = useCallback((item: Omit<EvidenceItem, "pinnedAt">) => {
        setPinnedItems((prev) => {
            if (prev.some((i) => i.id === item.id)) return prev;
            const itemIncidentId = item.incidentId || activeIncidentId;
            const newItem: EvidenceItem = {
                ...item,
                ...(itemIncidentId ? { incidentId: itemIncidentId } : {}),
                pinnedAt: new Date().toISOString(),
            };
            return [newItem, ...prev];
        });
    }, [activeIncidentId]);

    const unpinItem = useCallback((id: string) => {
        setPinnedItems((prev) => prev.filter((i) => i.id !== id));
    }, []);

    const clearWorkspace = useCallback(() => {
        if (typeof window !== "undefined" && window.confirm("ARE YOU SURE YOU WANT TO CLEAR ALL PINNED EVIDENCE?")) {
            setPinnedItems([]);
            try {
                localStorage.removeItem(storageKey);
            } catch {
                // ignore
            }
        }
    }, [storageKey]);

    const contextValue = useMemo(() => ({
        pinnedItems,
        pinItem,
        unpinItem,
        clearWorkspace,
        activeIncidentId,
    }), [pinnedItems, pinItem, unpinItem, clearWorkspace, activeIncidentId]);

    return (
        <EvidenceContext.Provider value={contextValue}>
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
