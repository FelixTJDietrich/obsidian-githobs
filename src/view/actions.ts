import { MarkdownFile } from 'types';
import * as Api from '../api';
import * as PropertiesHelper from '../helper/properties';
import { GitHobsSettings } from 'settings';
import { Notice, RequestUrlResponse, TFile } from 'obsidian';
import { GitHubIssueStatus } from 'view';

async function updateFile(
	file: MarkdownFile,
	res: RequestUrlResponse,
	externalData?: string,
	title?: string
) {
	try {
		// First, read any existing repo override to ensure we preserve it
		const repoOverride = PropertiesHelper.readRepo(externalData ?? file.data);
		
		// Create properties with issue ID
		let updatedProperties = PropertiesHelper.writeIssueId(
			externalData ?? file.data,
			res.json.number
		);
		
		// If there was a repo override, make sure we keep it
		if (repoOverride) {
			updatedProperties = PropertiesHelper.writeRepo(updatedProperties, repoOverride);
		}
		
		 // Make sure file.file is not null before using it
		if (!file.file) {
			throw new Error('File reference is null');
		}
		
		// Handle renaming if needed
		if (title) {
			await window.app.vault.rename(
				file.file,
				file.file.parent?.path === '/'
					? `${title}.md`
					: `${file.file.parent?.path}/${title}.md`
			);
		}

		// Update the file content while preserving properties
		await window.app.vault.modify(
			file.file,
			`${updatedProperties}\n${PropertiesHelper.removeProperties(
				externalData ?? file.data
			)}`,
			{ mtime: new Date(res.json.updated_at).getTime() }
		);
	} catch (error) {
		console.error("Error updating file:", error);
		throw new Error('Error updating file: ' + (error.message || 'This issue is already tracked'));
	}
}

export async function pushIssue(
	issueId: string | undefined,
	file: MarkdownFile,
	settings: GitHobsSettings
) {
	// Use the effective settings that take into account any repository override
	const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(file.data, settings);
	
	if (issueId) {
		const res = await Api.updateIssue(effectiveSettings, issueId, {
			title: file.file?.basename ?? '',
			body: PropertiesHelper.removeProperties(file.data)
		});

		if (res.status === 200) {
			await updateFile(file, res);
		}
		return;
	}

	const res = await Api.createIssue(effectiveSettings, {
		title: file.file?.basename ?? '',
		body: PropertiesHelper.removeProperties(file.data)
	});

	if (res.status === 201) {
		await updateFile(file, res);
	}
}

export async function fetchIssue(issueId: string, settings: GitHobsSettings, file: TFile) {
	try {
		// Use app from global scope to read file content
		const app = window.app;
		const fileData = await app.vault.read(file);
		const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(fileData, settings);
		
		// Log for debugging
		console.log(`Fetching issue from: ${effectiveSettings.owner}/${effectiveSettings.repo}`);
		
		const res = await Api.getIssue(effectiveSettings, issueId);

		const fileRead = app.vault.getFiles().find((f: TFile) => f.path === file.path);
		// Check if fileRead is defined before accessing its properties
		let status: GitHubIssueStatus | undefined = undefined;

		if (fileRead && fileRead.stat) {
			const lastDate = fileRead.stat.mtime;

			if (lastDate && new Date(res.json.updated_at) > new Date(lastDate)) {
				status = GitHubIssueStatus.CanPull;
			}

			if (lastDate && new Date(res.json.updated_at) < new Date(lastDate)) {
				status = GitHubIssueStatus.CanPush;
			}
		}

		return { date: res.json.updated_at, status };
	} catch (error) {
		console.error("Error in fetchIssue:", error);
		new Notice(`Error fetching issue: ${error.message || "Unknown error"}`);
		return { date: "Error", status: undefined };
	}
}

export async function pullIssue(issueId: string, file: MarkdownFile, settings: GitHobsSettings) {
	// Use the effective settings that take into account any repository override
	const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(file.data, settings);
	
	const res = await Api.getIssue(effectiveSettings, issueId);
	await updateFile(file, res, res.json.body, res.json.title);
}

export async function changeIssueId(
	issueId: string,
	file: MarkdownFile,
	settings: GitHobsSettings
) {
	try {
		// Get effective settings from the file data
		const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(file.data, settings);
		
		// Log for debugging
		console.log(`Changing issue ID using repo: ${effectiveSettings.owner}/${effectiveSettings.repo}`);
		
		// Use effective settings when pulling the issue
		await pullIssue(issueId, file, effectiveSettings);
		new Notice(`Issue changed in ${effectiveSettings.owner}/${effectiveSettings.repo}!`);
	} catch (err) {
		console.error("Error changing issue ID:", err);
		new Notice(`Error changing issue: ${err.message || err}`);
	}
}
