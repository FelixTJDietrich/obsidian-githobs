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
		// Get the original data and external data
		const originalData = file.data;
		const dataToUse = externalData ?? originalData;
		
		// IMPORTANT: Read the repository override from the original file data, NOT from the external data (GitHub content)
		// This ensures we always keep our local repo override even when pulling changes
		const repoOverride = PropertiesHelper.readRepo(originalData);
		
		console.log(`Preserving repository override: ${repoOverride || 'none'}`);
		
		// Use the new function that ensures both properties are preserved
		const updatedProperties = PropertiesHelper.writeAllGithubProperties(dataToUse, {
			issueId: res.json.number.toString(),
			repo: repoOverride  // Always use the override from original file
		});
		
		// Make sure file.file is not null before using it
		if (!file.file) {
			throw new Error('File reference is null');
		}
		
		// Handle renaming if needed, but only if title is provided
		if (title) {
			try {
				// Sanitize the title to remove characters that aren't allowed in filenames
				const sanitizedTitle = sanitizeFilename(title);
				
				// Only proceed with renaming if we have a valid sanitized title
				if (sanitizedTitle) {
					const newPath = file.file.parent?.path === '/'
						? `${sanitizedTitle}.md`
						: `${file.file.parent?.path}/${sanitizedTitle}.md`;
					
					console.log(`Renaming file to: ${newPath}`);
					await window.app.vault.rename(file.file, newPath);
				} else {
					console.log("Skipping rename: Title couldn't be sanitized properly");
				}
			} catch (renameError) {
				// If renaming fails, log it but continue with updating content
				console.error("Error renaming file:", renameError);
				new Notice(`Could not rename file, but content will be updated`);
			}
		}

		// Update the file content while preserving properties
		await window.app.vault.modify(
			file.file,
			`${updatedProperties}\n${PropertiesHelper.removeProperties(dataToUse)}`,
			{ mtime: new Date(res.json.updated_at).getTime() }
		);
		
		console.log("File updated successfully with preserved properties");
	} catch (error) {
		console.error("Error updating file:", error);
		throw new Error('Error updating file: ' + (error.message || 'This issue is already tracked'));
	}
}

// Helper function to sanitize filenames
function sanitizeFilename(filename: string): string {
	// Replace characters that aren't allowed in filenames
	let sanitized = filename
		.replace(/[\\/:*?"<>|]/g, '_') // Replace invalid chars with underscores
		.replace(/\s+/g, ' ')          // Normalize whitespace
		.trim();                       // Remove leading/trailing whitespace
	
	// If nothing remains after sanitizing, use a fallback name
	if (!sanitized) {
		sanitized = "Issue";
	}
	
	return sanitized;
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

export async function createNewIssueNote(
	file: MarkdownFile | null,
	settings: GitHobsSettings,
	issueIdToUse?: string
) {
	try {
		if (!file || !file.file) {
			throw new Error('No file context available');
		}

		if (!issueIdToUse) {
			throw new Error('No issue ID provided. Please enter an issue number first.');
		}

		// Get the effective repository settings
		const effectiveSettings = PropertiesHelper.getEffectiveRepoSettings(file.data, settings);
		
		// First, fetch the issue to get its title and content
		new Notice(`Fetching issue #${issueIdToUse} from ${effectiveSettings.owner}/${effectiveSettings.repo}...`);
		const res = await Api.getIssue(effectiveSettings, issueIdToUse);
		
		if (res.status !== 200) {
			throw new Error(`Failed to fetch issue #${issueIdToUse}: Status ${res.status}`);
		}
		
		// Determine the parent folder path for creating the new note
		const parentPath = file.file.parent?.path || '';
		
		// Sanitize the title to create a valid filename
		const sanitizedTitle = sanitizeFilename(res.json.title || `Issue-${issueIdToUse}`);
		const newFilename = `${sanitizedTitle}.md`;
		const fullPath = parentPath ? `${parentPath}/${newFilename}` : newFilename;
		
		// Create initial content with GitHub properties and the issue body
		const initialContent = PropertiesHelper.writeAllGithubProperties('', {
			issueId: issueIdToUse,
			repo: PropertiesHelper.readRepo(file.data)  // Keep the same repo override if any
		});
		
		// Create the new file with issue content
		const newFile = await window.app.vault.create(
			fullPath,
			`${initialContent}\n\n${res.json.body || 'No content'}`
		);
		
		 // IMPORTANT: Open the file in a way that preserves the sidebar
		// Instead of using activeLeaf (which could be the sidebar),
		// create or use a different leaf in the main editor area
		try {
			// Get the main workspace area and open the file there
			await window.app.workspace.getLeaf(false).openFile(newFile);
		} catch (openError) {
			console.error("Error opening new file:", openError);
			new Notice(`File created but couldn't be opened automatically`);
		}
		
		new Notice(`Successfully pulled issue #${issueIdToUse} to a new file`);
		return true;
	} catch (error) {
		console.error("Error pulling GitHub issue:", error);
		new Notice(`Failed to pull GitHub issue: ${error.message || "Unknown error"}`);
		return false;
	}
}
