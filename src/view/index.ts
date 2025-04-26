/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ItemView, MarkdownView, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import { GitHobsSettings } from 'settings';
import { MarkdownFile } from 'types';
import * as PropertiesHelper from '../helper/properties';
import { changeIssueId, createNewIssueNote, fetchIssue, pullIssue, pushIssue } from 'view/actions';

export const GithubIssueControlsViewType = 'github-issue-controls-view';

export enum GitHubIssueStatus {
	CanPush = 'can-push',
	CanPull = 'can-pull'
}
export class GithubIssueControlsView extends ItemView {
	readonly settings: GitHobsSettings;
	fetchDate: string | undefined;
	status: GitHubIssueStatus | undefined;
	issueId: string | undefined;

	constructor(leaf: WorkspaceLeaf, settings: GitHobsSettings) {
		super(leaf);
		this.settings = settings;
	}

	public getViewType(): string {
		return GithubIssueControlsViewType;
	}

	public getDisplayText(): string {
		return 'Github Issue Controls';
	}

	public getIcon(): string {
		return 'github';
	}

	public load(): void {
		super.load();
		this.fetchDate = undefined;
		this.status = undefined;
		this.issueId = undefined;
		this.draw();
	}

	public setFetchDate(fetchDate: string) {
		this.fetchDate = fetchDate;
	}

	public setIssueId(issueId: string | undefined) {
		this.issueId = issueId;
	}

	public reload(editor: MarkdownView | null) {
		editor?.editor.focus();
		this.draw();
	}

	private readonly draw = (): void => {
		const obContainer = this.containerEl.children[1];
		const fileOpened = this.leaf.view.app.workspace.activeEditor as MarkdownFile | null;
		const editor = this.leaf.view.app.workspace.getActiveViewOfType(MarkdownView);

		if (!fileOpened) {
			obContainer.empty();
			return;
		}

		const rootElement = document.createElement('div');
		this.setIssueId(PropertiesHelper.readIssueId(fileOpened.data));

		const viewContainer = createContainer(rootElement);

		if (!this.settings.repo || !this.settings.owner || !this.settings.token) {
			obContainer.empty();

			createInfoSection(
				viewContainer,
				{
					info: 'Missing settings! 🚨',
					description: `Please setup settings first`
				},
				true
			);

			createInfoSection(viewContainer, {
				info: 'Reload',
				button: {
					icon: 'refresh-ccw',
					action: async () => {
						this.reload(editor);
					}
				}
			});

			obContainer.appendChild(viewContainer);
			return;
		}

		const repoOverride = PropertiesHelper.readRepo(fileOpened.data);
		const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(fileOpened.data, this.settings);

		createInfoSection(
			viewContainer,
			{
				info: 'Issue Editor 🦤',
				description: 'Working with: ',
				descriptionBold: `${effectiveSettings.owner}/${effectiveSettings.repo}`
			},
			true
		);

		createInfoSection(viewContainer, {
			info: 'Issue number:',
			description: 'Track existing or pull to new file',
			buttons: [
				{
					icon: 'crosshair',
					tooltip: 'Fetch issue by ID',
					action: async () => {
						if (!this.issueId) {
							new Notice('Select an issue ID');
							return;
						}
						return await changeIssueId(this.issueId, fileOpened, this.settings);
					}
				},
				{
					icon: 'file-plus',
					tooltip: 'Pull issue to new file',
					action: async () => {
						if (!this.issueId) {
							new Notice('Please enter an issue number first');
							return;
						}
						await createNewIssueNote(fileOpened, this.settings, this.issueId);
						this.reload(editor);
					}
				}
			],
			input: {
				value: this.issueId?.trim() ?? '',
				type: 'number',
				onChange: async (val) => this.setIssueId(val)
			}
		});

		createInfoSection(
			viewContainer,
			{
				info: 'Repository Override:',
				description: repoOverride 
					? `Using: ${effectiveSettings.owner}/${effectiveSettings.repo}` 
					: `Default: ${this.settings.owner}/${this.settings.repo}`,
				input: {
					type: 'text',
					value: repoOverride || '',
					onChange: async (val) => {
						if (fileOpened.file) {
							// Use the new helper that preserves all GitHub properties
							const issueId = PropertiesHelper.readIssueId(fileOpened.data);
							const updatedData = PropertiesHelper.writeAllGithubProperties(fileOpened.data, {
								issueId: issueId, 
								repo: val
							});
							
							await this.app.vault.modify(fileOpened.file, updatedData);
							this.reload(editor);
							new Notice(`Repository override ${val ? 'set to: ' + val : 'cleared'}`);
						} else {
							new Notice('No file is currently open.');
						}
					}
				}
			}
		);

		createInfoSection(viewContainer, {
			info: '',
			description: 'Format: "owner/repo" or just "repo"'
		});

		// Update the fetch button action
		createInfoSection(viewContainer, {
			info: 'Fetch',
			description: this.issueId ? this.fetchDate : 'First push',
			button: {
				icon: 'refresh-ccw',
				action: async () => {
					// Use the issue ID from properties if it exists, or from the input field
					const issueIdToUse = this.issueId || PropertiesHelper.readIssueId(fileOpened.data);
					
					if (!issueIdToUse || !fileOpened.file) {
						new Notice('Cannot fetch: No issue ID found in properties or input field');
						return;
					}

					try {
						// Show a notice about which repo we're using
						const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(fileOpened.data, this.settings);
						new Notice(`Fetching from ${effectiveSettings.owner}/${effectiveSettings.repo}...`);
						
						const fetchedIssue = await fetchIssue(
							issueIdToUse,
							this.settings,
							fileOpened.file
						);
						this.setFetchDate(fetchedIssue.date);
						this.status = fetchedIssue.status;
						this.reload(editor);
						
						// Show feedback on status
						if (fetchedIssue.status === GitHubIssueStatus.CanPull) {
							new Notice(`Issue #${issueIdToUse} has updates available to pull`);
						} else if (fetchedIssue.status === GitHubIssueStatus.CanPush) {
							new Notice(`Your local changes to issue #${issueIdToUse} can be pushed`);
						} else {
							new Notice(`Issue #${issueIdToUse} is up-to-date`);
						}
					} catch (error) {
						console.error("Error fetching:", error);
						new Notice(`Fetch failed: ${error.message || 'Unknown error'}`);
					}
				}
			}
		});

		createInfoSection(viewContainer, {
			info: 'Push',
			description:
				this.status === GitHubIssueStatus.CanPush ? '🟢 Changes can be pushed' : '',
			button: {
				icon: 'upload',
				action: async () => {
					// Use the issue ID from properties if it exists, or from the input field
					const issueIdToUse = this.issueId || PropertiesHelper.readIssueId(fileOpened.data);
					
					if (!issueIdToUse && !fileOpened.file) {
						new Notice('Cannot push: No issue ID found in properties or input field');
						return;
					}
					
					try {
						await pushIssue(issueIdToUse, fileOpened, this.settings);
						this.status = undefined;
						// Update the display to show the new issue ID if one was assigned
						this.setIssueId(PropertiesHelper.readIssueId(fileOpened.data));
						this.reload(editor);
						
						// Show feedback about which issue was updated
						const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(fileOpened.data, this.settings);
						new Notice(`Issue ${issueIdToUse ? 'updated' : 'created'} in ${effectiveSettings.owner}/${effectiveSettings.repo}`);
					} catch (error) {
						console.error("Error pushing issue:", error);
						new Notice(`Push failed: ${error.message || 'Unknown error'}`);
					}
				}
			}
		});

		// Update the conditional rendering of the Pull button to always show when there's an issue ID
		// either in the input or properties
		const issueIdToUse = this.issueId || PropertiesHelper.readIssueId(fileOpened.data);

		if (issueIdToUse) {
			createInfoSection(viewContainer, {
				info: 'Pull',
				description:
					this.status === GitHubIssueStatus.CanPull
						? '🔴 New version available'
						: undefined,
				button: {
					icon: 'download',
					action: async () => {
						try {
							// Show a notice about which repo we're using
							const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(fileOpened.data, this.settings);
							new Notice(`Pulling from ${effectiveSettings.owner}/${effectiveSettings.repo}...`);
							
							await pullIssue(issueIdToUse, fileOpened, this.settings);
							this.status = undefined;
							this.reload(editor);
							
							new Notice(`Successfully pulled issue #${issueIdToUse}`);
						} catch (error) {
							console.error("Error pulling issue:", error);
							new Notice(`Pull failed: ${error.message || 'Unknown error'}`);
						}
					}
				}
			});
		}

		obContainer.empty();
		obContainer.appendChild(viewContainer);
	};
}

function createContainer(rootEl: HTMLDivElement) {
	const c = rootEl.createDiv({ cls: 'vertical-tab-content-container' });
	return c;
}

function createInfoSection(
	containerToAppend: HTMLDivElement,
	{
		info,
		description,
		descriptionBold,
		button,
		buttons,
		dropdown,
		input
	}: {
		info: string;
		description?: string;
		descriptionBold?: string;
		button?: { icon: string; action: () => Promise<void> };
		buttons?: { icon: string; tooltip: string; action: () => Promise<void> }[];
		dropdown?: { items: { text: string; value: string }[] };
		input?: { type: string; value: string; onChange: (val: string) => Promise<void> };
	},
	headerInfo = false
) {
	let i: HTMLDivElement;

	if (!headerInfo) {
		i = containerToAppend.createDiv({ cls: 'setting-item' });
	} else {
		i = containerToAppend.createDiv({ cls: 'setting-item setting-item-heading' });
	}

	const infoElement = i.createDiv({ cls: 'setting-item-info' });
	infoElement.createDiv({ cls: 'setting-item-name', text: info });

	if (description) {
		const descEl = infoElement.createDiv({
			cls: 'setting-item-description',
			text: description
		});

		if (descriptionBold) {
			descEl.createEl('strong', { text: descriptionBold });
		}
	}

	let settingControl: HTMLDivElement;

	if (button || buttons || dropdown || input) {
		settingControl = i.createDiv({ cls: 'setting-item-control' });

		if (input) {
			const inputEl = settingControl.createEl('input', { cls: 'githobs-input' });
			inputEl.setAttribute('type', input.type);
			inputEl.setAttribute('value', input.value);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			inputEl.onchange = (val: any) => {
				input.onChange(val.target.value);
			};
		}

		if (dropdown) {
			const select = settingControl.createEl('select');
			select.className = 'dropdown';
			dropdown.items.forEach((i) => {
				const o = select.createEl('option', { text: i.text });
				o.setAttribute('value', i.value);
			});
		}

		if (button) {
			const btn = settingControl.createEl('button');
			setIcon(btn, button.icon);

			btn.onclick = async () => {
				setIcon(btn, 'hourglass');
				btn.setAttr('disabled', '');
				await button.action();
				setIcon(btn, button.icon);
				btn.removeAttribute('disabled');
			};
		}

		if (buttons) {
			buttons.forEach((btnConfig) => {
				const btn = settingControl.createEl('button');
				setIcon(btn, btnConfig.icon);
				btn.setAttribute('aria-label', btnConfig.tooltip);

				btn.onclick = async () => {
					setIcon(btn, 'hourglass');
					btn.setAttr('disabled', '');
					await btnConfig.action();
					setIcon(btn, btnConfig.icon);
					btn.removeAttribute('disabled');
				};
			});
		}
	}

	return i;
}
