// One set of save/load functions for the whole app. They go to the signed-in person's Supabase account
// ("cloud"), or to this browser's IndexedDB ("local") when accounts are not set up.
// AuthProvider decides the mode before any screen asks for data.
import type { SaveResult, SetSummary, StudySet } from "./types";
import * as local from "./store-local";
import * as cloud from "./store-cloud";

export type StoreMode = "local" | "cloud";
let mode: StoreMode = "local";

export const setStoreMode = (m: StoreMode) => { mode = m; };
export const storeMode = (): StoreMode => mode;

const impl = () => (mode === "cloud" ? cloud : local);

export const listSummaries = (): Promise<SetSummary[]> => impl().listSummaries();
export const loadSet = (id: string): Promise<StudySet | null> => impl().loadSet(id);
export const saveSet = (set: StudySet): Promise<SaveResult> => impl().saveSet(set);
export const deleteSet = (id: string): Promise<void> => impl().deleteSet(id);
export const renameSet = (id: string, title: string): Promise<SaveResult> => impl().renameSet(id, title);

export { newId, storageEstimate, requestPersistence } from "./store-local";
