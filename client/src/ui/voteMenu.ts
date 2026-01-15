import $ from "jquery";
import type { SubmitVoteRes, VoteOption, VoteStateRes } from "../../../shared/types/vote";
import { api } from "../api";
import type { Localization } from "./localization";
import { MenuModal } from "./menuModal";

export class VoteMenu {
    modal: MenuModal;
    voteState: VoteStateRes | null = null;
    pollInterval: number | null = null;
    selectedTeamMode: number | null = null;

    container = $("#modal-vote");
    optionsContainer = $("#vote-options-container");
    statusText = $("#vote-status-text");
    closeBtn = $("#vote-close-btn");
    filterContainer: JQuery<HTMLElement> | null = null;

    constructor(public localization: Localization) {
        this.modal = new MenuModal(this.container);

        this.closeBtn.on("click", () => {
            this.hide();
        });

        this.container.on("click", (e) => {
            if ($(e.target).is(this.container)) {
                this.hide();
            }
        });
    }

    async show(): Promise<void> {
        await this.fetchVoteState();
        this.renderOptions();
        this.modal.show(true);
        this.startPolling();
    }

    hide(): void {
        this.modal.hide();
        this.stopPolling();
    }

    async fetchVoteState(): Promise<void> {
        const url = api.resolveUrl("/api/vote/state");
        const response = await fetch(url, {
            credentials: "include",
        });

        if (response.ok) {
            this.voteState = await response.json();
        }
    }

    async submitVote(mapName: string, teamMode: number): Promise<boolean> {
        const url = api.resolveUrl("/api/vote/submit");
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({ mapName, teamMode }),
        });

        if (response.ok) {
            const result: SubmitVoteRes = await response.json();
            if (result.success) {
                if (this.voteState) {
                    this.voteState.hasVoted = true;
                    this.voteState.votedFor = { mapName, teamMode };

                    const option = this.voteState.options.find(
                        (o) => o.mapName === mapName && o.teamMode === teamMode,
                    );
                    if (option && result.newVoteCount !== undefined) {
                        option.voteCount = result.newVoteCount;
                    }
                }
                this.renderOptions();
                return true;
            }
        }
        return false;
    }

    renderOptions(): void {
        this.optionsContainer.empty();

        if (!this.voteState) {
            this.statusText.text(this.localization.translate("vote-loading"));
            return;
        }

        if (!this.voteState.votingOpen) {
            this.statusText.text(this.localization.translate("vote-closed"));
            return;
        }

        if (this.voteState.hasVoted) {
            this.statusText.text(this.localization.translate("vote-submitted"));
        } else {
            this.statusText.text(this.localization.translate("vote-choose"));
        }

        this.renderTeamModeFilter();

        const filteredOptions = this.selectedTeamMode
            ? this.voteState.options.filter((o) => o.teamMode === this.selectedTeamMode)
            : this.voteState.options;

        for (const option of filteredOptions) {
            const card = this.createOptionCard(option);
            this.optionsContainer.append(card);
        }
    }

    renderTeamModeFilter(): void {
        if (!this.voteState) return;

        const availableModes = this.voteState.availableTeamModes || [];
        if (availableModes.length <= 1) {
            if (this.filterContainer) {
                this.filterContainer.remove();
                this.filterContainer = null;
            }
            return;
        }

        if (!this.filterContainer) {
            this.filterContainer = $("<div/>", { class: "vote-filter-container" });
            this.statusText.after(this.filterContainer);
        }

        this.filterContainer.empty();

        if (!this.selectedTeamMode) {
            this.selectedTeamMode = availableModes[0];
        }

        const label = $("<span/>", {
            class: "vote-filter-label",
            text: "Team Mode",
        });

        const select = $("<select/>", {
            class: "vote-filter-select",
        });

        for (const mode of availableModes) {
            const option = $("<option/>", {
                value: mode.toString(),
                text: this.getTeamModeText(mode),
            });
            if (mode === this.selectedTeamMode) {
                option.prop("selected", true);
            }
            select.append(option);
        }

        select.on("change", () => {
            this.selectedTeamMode = parseInt(select.val() as string, 10);
            this.renderOptions();
        });

        this.filterContainer.append(label, select);
    }

    createOptionCard(option: VoteOption): JQuery<HTMLElement> {
        const isVotedFor =
            this.voteState?.votedFor?.mapName === option.mapName &&
            this.voteState?.votedFor?.teamMode === option.teamMode;

        const card = $("<div/>", {
            class: `vote-option-card ${isVotedFor ? "vote-option-selected" : ""}`,
        });

        const bgImage = $("<div/>", {
            class: "vote-option-bg",
        }).css({
            "background-image": `url(${option.backgroundImg})`,
        });

        const iconOverlay = $("<div/>", {
            class: "vote-option-icon",
        }).css({
            "background-image": `url(${option.icon})`,
        });

        const info = $("<div/>", {
            class: "vote-option-info",
        });

        const name = $("<div/>", {
            class: "vote-option-name",
            text: option.displayName,
        });

        const teamModeText = this.getTeamModeText(option.teamMode);
        const modeLabel = $("<div/>", {
            class: "vote-option-mode",
            text: teamModeText,
        });

        const voteCount = $("<div/>", {
            class: "vote-option-count",
            text: `${option.voteCount} ${this.localization.translate("vote-votes")}`,
        });

        info.append(name, modeLabel, voteCount);

        const hasVoted = this.voteState?.hasVoted || false;
        const voteBtn = $("<button/>", {
            class: `vote-option-btn btn-green btn-darken ${hasVoted ? "btn-disabled" : ""}`,
            text: isVotedFor
                ? this.localization.translate("vote-voted")
                : this.localization.translate("vote-vote"),
            disabled: hasVoted,
        });

        if (!hasVoted) {
            voteBtn.on("click", (e) => {
                e.stopPropagation();
                this.submitVote(option.mapName, option.teamMode);
            });
        }

        card.append(bgImage, iconOverlay, info, voteBtn);

        return card;
    }

    getTeamModeText(teamMode: number): string {
        switch (teamMode) {
            case 1:
                return this.localization.translate("index-solo");
            case 2:
                return this.localization.translate("index-duo");
            case 4:
                return this.localization.translate("index-squad");
            default:
                return `${teamMode}P`;
        }
    }

    startPolling(): void {
        this.stopPolling();
        this.pollInterval = window.setInterval(async () => {
            await this.fetchVoteState();
            this.renderOptions();
        }, 5000);
    }

    stopPolling(): void {
        if (this.pollInterval !== null) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}
