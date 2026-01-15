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
    private activeMapByTeamMode = new Map<TeamMode, string>();
    private currentGameMapName: string = "";
    private currentGameTeamMode: TeamMode = 1;
    private votingOpen: boolean = true;

    constructor() {
        const enabledModes = this.getEnabledTeamModes();
        for (const teamMode of enabledModes) {
            const modeConfig = Config.modes.find(m => m.enabled && m.teamMode === teamMode);
            const mapName = modeConfig?.mapName || this.getEnabledMode().mapName;
            this.activeMapByTeamMode.set(teamMode, mapName);
        }
        const enabledMode = this.getEnabledMode();
        this.currentGameMapName = enabledMode.mapName;
        this.currentGameTeamMode = enabledMode.teamMode;
    }

    private getEnabledMode(): { mapName: string; teamMode: TeamMode } {
        const enabled = Config.modes.find((m) => m.enabled);
        if (enabled) {
            return { mapName: enabled.mapName, teamMode: enabled.teamMode };
        }
        const first = Config.modes[0];
        if (first) {
            return { mapName: first.mapName, teamMode: first.teamMode };
        }
        return { mapName: "main", teamMode: 2 };
    }

    getEnabledTeamModes(): TeamMode[] {
        const modes = new Set<TeamMode>();
        for (const mode of Config.modes) {
            if (mode.enabled) {
                modes.add(mode.teamMode as TeamMode);
            }
        }
        if (modes.size === 0) {
            modes.add(this.getEnabledMode().teamMode);
        }
        return Array.from(modes).sort((a, b) => a - b);
    }

    getActiveMode(teamMode?: TeamMode): { mapName: string; teamMode: TeamMode } {
        if (teamMode !== undefined) {
            const mapName = this.activeMapByTeamMode.get(teamMode);
            if (mapName) {
                return { mapName, teamMode };
            }
        }
        const firstTeamMode = this.getEnabledTeamModes()[0] || 1;
        return {
            mapName: this.activeMapByTeamMode.get(firstTeamMode) || this.getEnabledMode().mapName,
            teamMode: firstTeamMode,
        };
    }

    getVotingOptions(): VoteOption[] {
        const options: VoteOption[] = [];
        const enabledTeamModes = this.getEnabledTeamModes();

        const allowedMaps = Config.allowedVoteMaps && Config.allowedVoteMaps.length > 0
            ? Config.allowedVoteMaps
            : Config.modes.map(m => m.mapName);

        const seenMaps = new Set<string>();
        const uniqueMaps: string[] = [];
        for (const mapName of allowedMaps) {
            if (!seenMaps.has(mapName)) {
                seenMaps.add(mapName);
                uniqueMaps.push(mapName);
            }
        }

        for (const teamMode of enabledTeamModes) {
            for (const mapName of uniqueMaps) {
                const mapDef = MapDefs[mapName as keyof typeof MapDefs] as MapDef;
                if (!mapDef) continue;

                const key = this.getVoteKey(mapName, teamMode);
                const voteCount = this.voteCounts.get(key) || 0;

                options.push({
                    mapName: mapName as keyof typeof MapDefs,
                    teamMode,
                    displayName: mapDef.desc.name || mapName,
                    icon: mapDef.desc.icon,
                    backgroundImg: mapDef.desc.backgroundImg,
                    voteCount,
                });
            }
        }

        return options;
    }

    getVoteState(ip: string): VoteStateRes {
        const voterRecord = this.voterRecords.get(ip);

        return {
            votingOpen: this.votingOpen,
            currentGameMapName: this.currentGameMapName,
            currentGameTeamMode: this.currentGameTeamMode,
            availableTeamModes: this.getEnabledTeamModes(),
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
        const enabledTeamModes = this.getEnabledTeamModes();
        const isValidTeamMode = enabledTeamModes.includes(body.teamMode as TeamMode);

        if (!isValidOption || !isValidTeamMode) {
            return { success: false, error: "invalid_option" };
        }

        const voteKey = this.getVoteKey(body.mapName, body.teamMode as TeamMode);
        const currentCount = this.voteCounts.get(voteKey) || 0;
        const newCount = currentCount + 1;
        this.voteCounts.set(voteKey, newCount);

        this.voterRecords.set(ip, {
            ip,
            mapName: body.mapName,
            teamMode: body.teamMode as TeamMode,
            timestamp: Date.now(),
        });

        return { success: true, newVoteCount: newCount };
    }

    getWinnerForTeamMode(teamMode: TeamMode): string | null {
        const options = this.getVotingOptions().filter(o => o.teamMode === teamMode);
        if (options.length === 0) return null;

        const voteCounts = options.map((o) => o.voteCount);
        const maxVotes = Math.max(...voteCounts);

        if (maxVotes === 0) {
            return null;
        }

        const winners = options.filter((o) => o.voteCount === maxVotes);
        const winner = winners[Math.floor(Math.random() * winners.length)];

        return winner.mapName;
    }

    getWinner(): { mapName: string; teamMode: TeamMode } | null {
        const options = this.getVotingOptions();
        if (options.length === 0) return null;

        const voteCounts = options.map((o) => o.voteCount);
        const maxVotes = Math.max(...voteCounts);

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
        const enabledTeamModes = this.getEnabledTeamModes();
        
        for (const teamMode of enabledTeamModes) {
            const winnerMap = this.getWinnerForTeamMode(teamMode);
            if (winnerMap) {
                this.activeMapByTeamMode.set(teamMode, winnerMap);
            }
        }
        
        this.voteCounts.clear();
        this.voterRecords.clear();
        
        const firstTeamMode = enabledTeamModes[0] || 1;
        this.currentGameMapName = this.activeMapByTeamMode.get(firstTeamMode) || this.getEnabledMode().mapName;
        this.currentGameTeamMode = firstTeamMode;
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
