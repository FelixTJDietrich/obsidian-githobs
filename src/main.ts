import { Plugin } from 'obsidian';

import { DEFAULT_SETTINGS, GitHobsSettings, SettingTab } from 'settings';
import { GithubIssueControlsView, GithubIssueControlsViewType } from 'view';

export default class GitHobs extends Plugin {
	settings: GitHobsSettings;
	
	// Track whether the view is active
	private hasActiveView = false;

	private readonly toggleGitHubIssueControlsView = async (): Promise<void> => {
		const existing = this.app.workspace.getLeavesOfType(GithubIssueControlsViewType);
		if (existing.length) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: GithubIssueControlsViewType,
			active: true
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(GithubIssueControlsViewType)[0]
		);
	};

	// Helper method to safely reload all instances of our view
	private reloadViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(GithubIssueControlsViewType);
		if (leaves.length === 0) return;
		
		for (const leaf of leaves) {
			const view = leaf.view as GithubIssueControlsView;
			if (view && view.load) {
				view.load();
			}
		}
	}

	async onload() {
		await this.loadSettings();

		// Register the view without directly storing a reference
		this.registerView(
			GithubIssueControlsViewType,
			(leaf) => new GithubIssueControlsView(leaf, this.settings)
		);

		// Register for leaf changes to track when our view becomes active
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.hasActiveView = this.app.workspace.getLeavesOfType(GithubIssueControlsViewType).length > 0;
			})
		);

		// Handle file-open by reloading all instances of our view
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				if (this.hasActiveView) {
					this.reloadViews();
				}
			})
		);

		this.addRibbonIcon('github', 'Manage a github issue', async () => {
			this.toggleGitHubIssueControlsView();
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
