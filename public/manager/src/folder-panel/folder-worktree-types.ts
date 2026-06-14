export type GitWorktreeEntry = {
    path: string;
    head: string | null;
    branch: string | null;
    bare: boolean;
    detached: boolean;
    prunable: boolean;
    locked: boolean;
    reason: string | null;
    current: boolean;
};
