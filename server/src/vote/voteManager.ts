import { type MapDef, MapDefs } from "../../../shared/defs/mapDefs";
import type { TeamMode } from "../../../shared/gameConfig";
import type {
    SubmitVoteBody,
    SubmitVoteRes,
    VoteOption,
    VoteRecord,
    VoteStateRes,
} from "../../../shared/types/vote";
import { Config } from "../config";

export class VoteManager {
    private voteCounts = new Map<string, number>();
    private voterRecords = new Map<string, VoteRecord>();
    private activeMapName: string = "";
    private activeTeamMode: TeamMode = 1;
    private currentGameMapName: string = "";
    private currentGameTeamMode: TeamMode = 1;
    private votingOpen: boolean = true;

    constructor() {
        const firstMode = Config.modes[0];
        if (firstMode) {
            this.activeMapName = firstMode.mapName;
            this.activeTeamMode = firstMode.teamMode;
            this.currentGameMapName = firstMode.mapName;
            this.currentGameTeamMode = firstMode.teamMode;
        }
    }

    getActiveMode(): { mapName: string; teamMode: TeamMode } {
        return {
            mapName: this.activeMapName,
            teamMode: this.activeTeamMode,
        };
    }

    getVotingOptions(): VoteOption[] {
        const options: VoteOption[] = [];
        const seenMaps = new Set<string>();

        const allowedMaps = Config.allowedVoteMaps && Config.allowedVoteMaps.length > 0
            ? Config.allowedVoteMaps
            : Config.modes.map(m => m.mapName);

        for (const mapName of allowedMaps) {
            if (seenMaps.has(mapName)) continue;
            seenMaps.add(mapName);

            const mapDef = MapDefs[mapName as keyof typeof MapDefs] as MapDef;
            if (!mapDef) continue;

            const key = this.getVoteKey(mapName, 1);
            const voteCount = this.voteCounts.get(key) || 0;

            options.push({
                mapName: mapName as keyof typeof MapDefs,
                teamMode: 1,
                displayName: mapDef.desc.name || mapName,
                icon: mapDef.desc.icon,
                backgroundImg: mapDef.desc.backgroundImg,
                voteCount,
            });
        }

        return options;
    }

    getVoteState(ip: string): VoteStateRes {
        const voterRecord = this.voterRecords.get(ip);

        return {
            votingOpen: this.votingOpen,
            currentGameMapName: this.currentGameMapName,
            currentGameTeamMode: this.currentGameTeamMode,
            options: this.getVotingOptions(),
            hasVoted: !!voterRecord,
            votedFor: voterRecord
                ? {
                      mapName: voterRecord.mapName,
                      teamMode: voterRecord.teamMode,
                  }
                : undefined,
        };
    }

    submitVote(ip: string, body: SubmitVoteBody): SubmitVoteRes {
        if (!ip) {
            return { success: false, error: "invalid_ip" };
        }

        if (!this.votingOpen) {
            return { success: false, error: "voting_closed" };
        }

        const existingVote = this.voterRecords.get(ip);
        if (existingVote) {
            return { success: false, error: "already_voted" };
        }

        const allowedMaps = Config.allowedVoteMaps && Config.allowedVoteMaps.length > 0
            ? Config.allowedVoteMaps
            : Config.modes.map(m => m.mapName);

        const isValidOption = allowedMaps.includes(body.mapName as keyof typeof MapDefs);

        if (!isValidOption) {
            return { success: false, error: "invalid_option" };
        }

        const voteKey = this.getVoteKey(body.mapName, 1);
        const currentCount = this.voteCounts.get(voteKey) || 0;
        const newCount = currentCount + 1;
        this.voteCounts.set(voteKey, newCount);

        this.voterRecords.set(ip, {
            ip,
            mapName: body.mapName,
            teamMode: 1,
            timestamp: Date.now(),
        });

        return { success: true, newVoteCount: newCount };
    }

    getWinner(): { mapName: string; teamMode: TeamMode } | null {
        const options = this.getVotingOptions();
        if (options.length === 0) return null;

        const maxVotes = Math.max(...options.map((o) => o.voteCount));

        if (maxVotes === 0) {
            return null;
        }

        const winners = options.filter((o) => o.voteCount === maxVotes);
        const winner = winners[Math.floor(Math.random() * winners.length)];

        return {
            mapName: winner.mapName,
            teamMode: winner.teamMode,
        };
    }

    rotateToVotedMode(): { mapName: string; teamMode: TeamMode } {
        const winner = this.getWinner();
        
        if (winner) {
            this.activeMapName = winner.mapName;
            this.activeTeamMode = winner.teamMode;
        }
        
        this.voteCounts.clear();
        this.voterRecords.clear();
        this.currentGameMapName = this.activeMapName;
        this.currentGameTeamMode = this.activeTeamMode;
        this.votingOpen = true;
        
        return this.getActiveMode();
    }

    hasVotes(): boolean {
        for (const count of this.voteCounts.values()) {
            if (count > 0) return true;
        }
        return false;
    }

    onNewRound(mapName: string, teamMode: TeamMode): void {
        this.currentGameMapName = mapName;
        this.currentGameTeamMode = teamMode;
        this.votingOpen = true;
    }

    closeVoting(): void {
        this.votingOpen = false;
    }

    openVoting(): void {
        this.votingOpen = true;
    }

    getStats(): {
        totalVotes: number;
        uniqueVoters: number;
        votingOpen: boolean;
    } {
        let totalVotes = 0;
        for (const count of this.voteCounts.values()) {
            totalVotes += count;
        }

        return {
            totalVotes,
            uniqueVoters: this.voterRecords.size,
            votingOpen: this.votingOpen,
        };
    }

    private getVoteKey(mapName: string, teamMode: TeamMode): string {
        return `${mapName}-${teamMode}`;
    }
}

export const voteManager = new VoteManager();
