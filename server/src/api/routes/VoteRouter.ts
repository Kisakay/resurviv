import { Hono } from "hono";
import type { SubmitVoteRes, VoteStateRes } from "../../../../shared/types/vote";
import { zSubmitVoteBody } from "../../../../shared/types/vote";
import { Config } from "../../config";
import { getHonoIp, HTTPRateLimit } from "../../utils/serverHelpers";
import { voteManager } from "../../vote/voteManager";
import { validateParams } from "../auth/middleware";

export const VoteRouter = new Hono();

const voteRateLimit = new HTTPRateLimit(10, 10000);
VoteRouter.get("/state", (c) => {
    const ip = getHonoIp(c, Config.apiServer.proxyIPHeader);

    if (!ip) {
        return c.json<VoteStateRes>({
            votingOpen: false,
            currentGameMapName: "",
            currentGameTeamMode: 1,
            availableTeamModes: [],
            options: [],
            hasVoted: false,
        });
    }

    const state = voteManager.getVoteState(ip);
    return c.json<VoteStateRes>(state);
});

VoteRouter.post("/submit", validateParams(zSubmitVoteBody), async (c) => {
    const ip = getHonoIp(c, Config.apiServer.proxyIPHeader);

    if (!ip) {
        return c.json<SubmitVoteRes>({ success: false, error: "invalid_ip" });
    }

    if (voteRateLimit.isRateLimited(ip)) {
        return c.json<SubmitVoteRes>({ success: false, error: "already_voted" }, 429);
    }

    const body = c.req.valid("json");
    const result = voteManager.submitVote(ip, body);

    return c.json<SubmitVoteRes>(result);
});

VoteRouter.get("/stats", (c) => {
    const stats = voteManager.getStats();
    return c.json(stats);
});

VoteRouter.get("/active", (c) => {
    const enabledTeamModes = voteManager.getEnabledTeamModes();
    const activeModes: Record<number, { mapName: string; teamMode: number }> = {};
    for (const teamMode of enabledTeamModes) {
        activeModes[teamMode] = voteManager.getActiveMode(teamMode);
    }
    return c.json(activeModes);
});
