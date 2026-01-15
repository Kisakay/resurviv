import { z } from "zod";
import type { MapDefs } from "../defs/mapDefs";
import type { TeamMode } from "../gameConfig";

export const zSubmitVoteBody = z.object({
    mapName: z.string(),
    teamMode: z.number(),
});

export type SubmitVoteBody = z.infer<typeof zSubmitVoteBody>;

export interface VoteOption {
    mapName: keyof typeof MapDefs;
    teamMode: TeamMode;
    displayName: string;
    icon: string;
    backgroundImg: string;
    voteCount: number;
}

export interface VoteStateRes {
    votingOpen: boolean;
    currentGameMapName: string;
    currentGameTeamMode: TeamMode;
    availableTeamModes: TeamMode[];
    options: VoteOption[];
    hasVoted: boolean;
    votedFor?: {
        mapName: string;
        teamMode: TeamMode;
    };
}

export interface SubmitVoteRes {
    success: boolean;
    error?: "already_voted" | "voting_closed" | "invalid_option" | "invalid_ip";
    newVoteCount?: number;
}

export interface VoteRecord {
    ip: string;
    mapName: string;
    teamMode: TeamMode;
    timestamp: number;
}
